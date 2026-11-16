-- CampusSign Step 13: student accounts, protected dashboard and student announcements
-- Idempotent schema/function update. Existing roster and attendance rows are preserved.

create table if not exists public.student_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  student_id text not null check (length(btrim(student_id)) between 3 and 40),
  full_name text not null check (length(btrim(full_name)) between 3 and 120),
  department text not null check (length(btrim(department)) between 2 and 120),
  level text not null check (level in ('100','200','300','400','500','600')),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);
create unique index if not exists student_accounts_identity_active_idx
  on public.student_accounts (upper(btrim(student_id)), lower(btrim(full_name)), lower(btrim(department)))
  where status <> 'rejected';
create index if not exists student_accounts_status_created_idx
  on public.student_accounts(status, created_at desc);
create index if not exists student_accounts_reviewed_by_idx
  on public.student_accounts(reviewed_by);
alter table public.student_accounts enable row level security;
revoke all on public.student_accounts from anon, authenticated;

-- Student metadata is used only to route account creation to student_accounts.
-- It is never used as an authorization claim.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare selected_course text;
begin
  if new.raw_user_meta_data->>'account_type' = 'student' then
    insert into public.student_accounts(user_id, student_id, full_name, department, level)
    values (
      new.id,
      upper(trim(coalesce(new.raw_user_meta_data->>'student_id',''))),
      trim(coalesce(new.raw_user_meta_data->>'name','')),
      trim(coalesce(new.raw_user_meta_data->>'dept','')),
      coalesce(new.raw_user_meta_data->>'level','100')
    );
    return new;
  end if;
  insert into public.lecturers (id, email, name, dept, course)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name',''),
          coalesce(new.raw_user_meta_data->>'dept',''), coalesce(new.raw_user_meta_data->>'course',''));
  for selected_course in
    select jsonb_array_elements_text(
      case when jsonb_typeof(new.raw_user_meta_data->'courses')='array'
        then new.raw_user_meta_data->'courses'
        else jsonb_build_array(coalesce(new.raw_user_meta_data->>'course','')) end
    )
  loop
    insert into public.lecturer_course_assignments(lecturer_id,course_id,is_primary)
    select new.id,c.id, selected_course=coalesce(new.raw_user_meta_data->>'course','')
    from public.academic_courses c
    join public.academic_departments d on d.id=c.department_id
    where lower(d.name)=lower(coalesce(new.raw_user_meta_data->>'dept',''))
      and (c.code || ' - ' || c.title)=selected_course and c.is_active and d.is_active
    on conflict(lecturer_id,course_id) do nothing;
  end loop;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create or replace function public.admin_list_student_accounts()
returns table (
  user_id uuid, student_id text, full_name text, department text, level text,
  email text, status text, created_at timestamptz, reviewed_at timestamptz,
  matching_roster_count bigint, matching_courses text[]
)
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin_required'; end if;
  return query
  select sa.user_id,sa.student_id,sa.full_name,sa.department,sa.level,u.email::text,
         sa.status,sa.created_at,sa.reviewed_at,count(st.id)::bigint,
         coalesce(array_agg(distinct st.course) filter(where st.id is not null),array[]::text[])
  from public.student_accounts sa
  join auth.users u on u.id=sa.user_id
  left join public.students st
    on upper(btrim(st.student_id))=upper(btrim(sa.student_id))
   and lower(btrim(st.name))=lower(btrim(sa.full_name))
   and lower(btrim(st.dept))=lower(btrim(sa.department))
  group by sa.user_id,u.email
  order by case sa.status when 'pending' then 0 when 'approved' then 1 else 2 end,sa.created_at desc;
end;
$$;

create or replace function public.admin_review_student_account(p_user_id uuid,p_decision text)
returns jsonb language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare v_account public.student_accounts;
declare v_count integer;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin_required'; end if;
  if p_decision is null or p_decision not in ('approve','reject') then raise exception 'invalid_decision'; end if;
  select * into v_account from public.student_accounts where user_id=p_user_id for update;
  if not found then raise exception 'student_account_not_found'; end if;
  if v_account.status<>'pending' then raise exception 'student_account_already_reviewed'; end if;
  if p_decision='approve' then
    select count(*) into v_count from public.students st
     where upper(btrim(st.student_id))=upper(btrim(v_account.student_id))
       and lower(btrim(st.name))=lower(btrim(v_account.full_name))
       and lower(btrim(st.dept))=lower(btrim(v_account.department));
    if v_count=0 then raise exception 'student_roster_match_required'; end if;
  end if;
  update public.student_accounts set status=case when p_decision='approve' then 'approved' else 'rejected' end,
    reviewed_at=now(),reviewed_by=auth.uid() where user_id=p_user_id;
  insert into public.audit_events(actor_id,actor_email,action,entity_type,entity_id,details)
  values(auth.uid(),auth.jwt()->>'email','student_account.'||p_decision,'student_account',p_user_id::text,
    jsonb_build_object('student_id',v_account.student_id,'name',v_account.full_name));
  return jsonb_build_object('status',case when p_decision='approve' then 'approved' else 'rejected' end);
end;
$$;

create or replace function public.student_get_dashboard()
returns jsonb language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare v_account public.student_accounts;
declare v_courses jsonb;
declare v_attendance jsonb;
declare v_unread integer;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select * into v_account from public.student_accounts where user_id=auth.uid();
  if not found then raise exception 'student_account_not_found'; end if;
  if v_account.status<>'approved' then
    return jsonb_build_object('profile',jsonb_build_object('student_id',v_account.student_id,
      'full_name',v_account.full_name,'department',v_account.department,'level',v_account.level,'status',v_account.status),
      'courses','[]'::jsonb,'attendance','[]'::jsonb,'unread_notifications',0);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('course',s.course,'lecturer',coalesce(l.name,'Lecturer'),
    'face_enrolled',s.face_enrolled) order by s.course),'[]'::jsonb)
  into v_courses from public.students s left join public.lecturers l on l.id=s.lecturer_id
  where upper(btrim(s.student_id))=upper(btrim(v_account.student_id))
    and lower(btrim(s.name))=lower(btrim(v_account.full_name))
    and lower(btrim(s.dept))=lower(btrim(v_account.department));
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'course',a.course,'session_id',a.session_id,
    'status',a.status,'created_at',a.created_at,'receipt_no',a.receipt_no,'location_status',a.location_status)
    order by a.created_at desc),'[]'::jsonb)
  into v_attendance from public.students s join public.attendance a
    on a.lecturer_id=s.lecturer_id and a.course=s.course
   and upper(btrim(a.student_id))=upper(btrim(s.student_id))
  where upper(btrim(s.student_id))=upper(btrim(v_account.student_id))
    and lower(btrim(s.name))=lower(btrim(v_account.full_name))
    and lower(btrim(s.dept))=lower(btrim(v_account.department));
  select count(*) into v_unread from public.app_notifications where recipient_id=auth.uid() and read_at is null;
  return jsonb_build_object('profile',jsonb_build_object('student_id',v_account.student_id,
    'full_name',v_account.full_name,'department',v_account.department,'level',v_account.level,'status',v_account.status),
    'courses',v_courses,'attendance',v_attendance,'unread_notifications',v_unread);
end;
$$;

revoke all on function public.admin_list_student_accounts() from public,anon;
revoke all on function public.admin_review_student_account(uuid,text) from public,anon;
revoke all on function public.student_get_dashboard() from public,anon;
grant execute on function public.admin_list_student_accounts() to authenticated;
grant execute on function public.admin_review_student_account(uuid,text) to authenticated;
grant execute on function public.student_get_dashboard() to authenticated;

-- Add all-approved-students as an announcement audience.
alter table public.admin_announcements drop constraint if exists admin_announcements_audience_type_check;
alter table public.admin_announcements add constraint admin_announcements_audience_type_check
  check(audience_type in ('all_lecturers','department','course','all_students'));
alter table public.admin_announcements drop constraint if exists admin_announcements_audience_target_check;
alter table public.admin_announcements add constraint admin_announcements_audience_target_check check(
  (audience_type in ('all_lecturers','all_students') and department_id is null and course_id is null)
  or (audience_type='department' and department_id is not null and course_id is null)
  or (audience_type='course' and course_id is not null and department_id is null)
);

create or replace function public.admin_save_announcement(
  p_id uuid,p_title text,p_body text,p_audience_type text,p_department uuid,p_course uuid,p_publish boolean
)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_count integer:=0; v_title text:=btrim(coalesce(p_title,'')); v_body text:=btrim(coalesce(p_body,''));
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin_required'; end if;
  if length(v_title)<3 or length(v_title)>120 then raise exception 'announcement_title_invalid'; end if;
  if length(v_body)<3 or length(v_body)>5000 then raise exception 'announcement_body_invalid'; end if;
  if p_audience_type not in ('all_lecturers','department','course','all_students') then raise exception 'announcement_audience_invalid'; end if;
  if p_audience_type='department' and (p_department is null or p_course is not null) then raise exception 'announcement_department_required'; end if;
  if p_audience_type='course' and (p_course is null or p_department is not null) then raise exception 'announcement_course_required'; end if;
  if p_audience_type in ('all_lecturers','all_students') and (p_department is not null or p_course is not null) then raise exception 'announcement_audience_invalid'; end if;
  if p_department is not null and not exists(select 1 from public.academic_departments where id=p_department and is_active) then raise exception 'department_not_found'; end if;
  if p_course is not null and not exists(select 1 from public.academic_courses where id=p_course and is_active) then raise exception 'course_not_found'; end if;
  if p_id is null then
    insert into public.admin_announcements(title,body,audience_type,department_id,course_id,status,created_by,updated_by,published_at)
    values(v_title,v_body,p_audience_type,p_department,p_course,case when p_publish then 'published' else 'draft' end,
      auth.uid(),auth.uid(),case when p_publish then now() else null end) returning id into v_id;
  else
    update public.admin_announcements set title=v_title,body=v_body,audience_type=p_audience_type,
      department_id=p_department,course_id=p_course,status=case when p_publish then 'published' else 'draft' end,
      published_at=case when p_publish then coalesce(published_at,now()) else null end,
      updated_by=auth.uid(),updated_at=now() where id=p_id returning id into v_id;
    if v_id is null then raise exception 'announcement_not_found'; end if;
  end if;
  if not p_publish then
    delete from public.app_notifications where notification_type='announcement' and entity_type='announcement' and entity_id=v_id::text;
    delete from public.announcement_recipients where announcement_id=v_id;
    return jsonb_build_object('id',v_id,'status','draft','recipient_count',0);
  end if;
  create temporary table if not exists _announcement_target_users(user_id uuid primary key) on commit drop;
  truncate table _announcement_target_users;
  if p_audience_type='all_lecturers' then
    insert into _announcement_target_users select id from public.lecturers where role='lecturer' and is_verified;
  elsif p_audience_type='department' then
    insert into _announcement_target_users select distinct l.id from public.lecturers l
      join public.lecturer_course_assignments lca on lca.lecturer_id=l.id
      join public.academic_courses c on c.id=lca.course_id
      where l.role='lecturer' and l.is_verified and c.is_active and c.department_id=p_department;
  elsif p_audience_type='course' then
    insert into _announcement_target_users select distinct l.id from public.lecturers l
      join public.lecturer_course_assignments lca on lca.lecturer_id=l.id
      where l.role='lecturer' and l.is_verified and lca.course_id=p_course;
  else
    insert into _announcement_target_users select user_id from public.student_accounts where status='approved';
  end if;
  delete from public.app_notifications n where n.notification_type='announcement' and n.entity_type='announcement'
    and n.entity_id=v_id::text and not exists(select 1 from _announcement_target_users t where t.user_id=n.recipient_id);
  delete from public.announcement_recipients ar where ar.announcement_id=v_id
    and not exists(select 1 from _announcement_target_users t where t.user_id=ar.recipient_id);
  insert into public.announcement_recipients(announcement_id,recipient_id)
    select v_id,user_id from _announcement_target_users on conflict(announcement_id,recipient_id) do nothing;
  update public.app_notifications n set title=v_title,message=v_body
    where n.notification_type='announcement' and n.entity_type='announcement' and n.entity_id=v_id::text
      and exists(select 1 from _announcement_target_users t where t.user_id=n.recipient_id);
  insert into public.app_notifications(recipient_id,recipient_role,notification_type,title,message,entity_type,entity_id)
    select t.user_id,case when p_audience_type='all_students' then 'student' else 'lecturer' end,
      'announcement',v_title,v_body,'announcement',v_id::text from _announcement_target_users t
    where not exists(select 1 from public.app_notifications n where n.recipient_id=t.user_id
      and n.notification_type='announcement' and n.entity_type='announcement' and n.entity_id=v_id::text);
  select count(*) into v_count from _announcement_target_users;
  insert into public.audit_events(actor_id,actor_email,action,entity_type,entity_id,details)
    values(auth.uid(),auth.jwt()->>'email',case when p_id is null then 'announcement.published' else 'announcement.updated' end,
      'announcement',v_id::text,jsonb_build_object('audience_type',p_audience_type,'recipient_count',v_count));
  return jsonb_build_object('id',v_id,'status','published','recipient_count',v_count);
end;
$$;
revoke all on function public.admin_save_announcement(uuid,text,text,text,uuid,uuid,boolean) from public,anon;
grant execute on function public.admin_save_announcement(uuid,text,text,text,uuid,uuid,boolean) to authenticated;
