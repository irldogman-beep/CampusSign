-- CampusSign Step 15: expanded admin announcements and student account management
-- Applied to Supabase project fmfvuljxmtijtgvflojg.
-- Adds staff/student audience targeting and a separate student sign-in account deletion action.
-- Account deletion preserves approved course-roster rows, attendance face templates and historical attendance.
-- Pending/reviewed enrolment requests for the deleted account (including submitted descriptors) are removed.

alter table public.admin_announcements
  add column if not exists student_user_id uuid references auth.users(id) on delete set null;

alter table public.admin_announcements
  drop constraint if exists admin_announcements_audience_target_check,
  drop constraint if exists admin_announcements_audience_type_check;

alter table public.admin_announcements
  add constraint admin_announcements_audience_type_check
  check (audience_type = any (array[
    'all_lecturers','all_staff','all_students','department',
    'department_students','course','individual_student'
  ]::text[]));

alter table public.admin_announcements
  add constraint admin_announcements_audience_target_check
  check (
    (audience_type in ('all_lecturers','all_staff','all_students')
      and department_id is null and course_id is null and student_user_id is null)
    or (audience_type in ('department','department_students')
      and department_id is not null and course_id is null and student_user_id is null)
    or (audience_type='course'
      and course_id is not null and department_id is null and student_user_id is null)
    or (audience_type='individual_student'
      and department_id is null and course_id is null)
  );

drop function if exists public.admin_list_announcements();
create function public.admin_list_announcements()
returns table(
  id uuid, title text, body text, audience_type text, department_id uuid,
  course_id uuid, student_user_id uuid, status text, published_at timestamptz,
  created_at timestamptz, updated_at timestamptz, recipient_count bigint, read_count bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin_required';
  end if;
  return query
  select a.id, a.title, a.body, a.audience_type, a.department_id,
         a.course_id, a.student_user_id, a.status, a.published_at,
         a.created_at, a.updated_at,
         count(ar.recipient_id)::bigint,
         count(ar.recipient_id) filter (where n.read_at is not null)::bigint
  from public.admin_announcements a
  left join public.announcement_recipients ar on ar.announcement_id = a.id
  left join public.app_notifications n
    on n.entity_type='announcement' and n.entity_id=a.id::text
   and n.recipient_id=ar.recipient_id and n.notification_type='announcement'
  group by a.id
  order by a.updated_at desc;
end;
$function$;

revoke all on function public.admin_list_announcements() from public, anon;
grant execute on function public.admin_list_announcements() to authenticated;

-- New overload: p_student_user allows an announcement to target one active (pending or approved) student account.
create or replace function public.admin_save_announcement(
  p_id uuid, p_title text, p_body text, p_audience_type text,
  p_department uuid, p_course uuid, p_student_user uuid, p_publish boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_id uuid;
  v_count integer := 0;
  v_title text := btrim(coalesce(p_title,''));
  v_body text := btrim(coalesce(p_body,''));
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin_required'; end if;
  if length(v_title)<3 or length(v_title)>120 then raise exception 'announcement_title_invalid'; end if;
  if length(v_body)<3 or length(v_body)>5000 then raise exception 'announcement_body_invalid'; end if;
  if p_audience_type not in ('all_staff','all_lecturers','all_students','department','department_students','course','individual_student') then
    raise exception 'announcement_audience_invalid';
  end if;
  if p_audience_type in ('department','department_students')
     and (p_department is null or p_course is not null or p_student_user is not null) then
    raise exception 'announcement_department_required';
  end if;
  if p_audience_type='course'
     and (p_course is null or p_department is not null or p_student_user is not null) then
    raise exception 'announcement_course_required';
  end if;
  if p_audience_type='individual_student'
     and (p_student_user is null or p_department is not null or p_course is not null) then
    raise exception 'announcement_student_required';
  end if;
  if p_audience_type in ('all_staff','all_lecturers','all_students')
     and (p_department is not null or p_course is not null or p_student_user is not null) then
    raise exception 'announcement_audience_invalid';
  end if;
  if p_department is not null and not exists(
    select 1 from public.academic_departments where id=p_department and is_active
  ) then raise exception 'department_not_found'; end if;
  if p_course is not null and not exists(
    select 1 from public.academic_courses where id=p_course and is_active
  ) then raise exception 'course_not_found'; end if;
  if p_student_user is not null and not exists(
    select 1 from public.student_accounts where user_id=p_student_user and status in ('pending','approved')
  ) then raise exception 'announcement_student_required'; end if;

  if p_id is null then
    insert into public.admin_announcements(
      title,body,audience_type,department_id,course_id,student_user_id,
      status,created_by,updated_by,published_at
    ) values(
      v_title,v_body,p_audience_type,p_department,p_course,p_student_user,
      case when p_publish then 'published' else 'draft' end,
      auth.uid(),auth.uid(),case when p_publish then now() else null end
    ) returning id into v_id;
  else
    update public.admin_announcements
       set title=v_title, body=v_body, audience_type=p_audience_type,
           department_id=p_department, course_id=p_course, student_user_id=p_student_user,
           status=case when p_publish then 'published' else 'draft' end,
           published_at=case when p_publish then coalesce(published_at,now()) else null end,
           updated_by=auth.uid(), updated_at=now()
     where id=p_id returning id into v_id;
    if v_id is null then raise exception 'announcement_not_found'; end if;
  end if;

  if not p_publish then
    delete from public.app_notifications
     where notification_type='announcement' and entity_type='announcement' and entity_id=v_id::text;
    delete from public.announcement_recipients where announcement_id=v_id;
    return jsonb_build_object('id',v_id,'status','draft','recipient_count',0);
  end if;

  create temporary table if not exists _announcement_target_users(user_id uuid primary key) on commit drop;
  truncate table _announcement_target_users;

  if p_audience_type='all_staff' then
    insert into _announcement_target_users
    select id from public.lecturers where role in ('admin','lecturer');
  elsif p_audience_type='all_lecturers' then
    insert into _announcement_target_users
    select id from public.lecturers where role='lecturer' and is_verified;
  elsif p_audience_type='department' then
    insert into _announcement_target_users
    select distinct l.id from public.lecturers l
    join public.lecturer_course_assignments lca on lca.lecturer_id=l.id
    join public.academic_courses c on c.id=lca.course_id
    where l.role='lecturer' and l.is_verified and c.is_active and c.department_id=p_department;
  elsif p_audience_type='course' then
    insert into _announcement_target_users
    select distinct l.id from public.lecturers l
    join public.lecturer_course_assignments lca on lca.lecturer_id=l.id
    where l.role='lecturer' and l.is_verified and lca.course_id=p_course;
  elsif p_audience_type='all_students' then
    insert into _announcement_target_users
    select user_id from public.student_accounts where status in ('pending','approved');
  elsif p_audience_type='department_students' then
    insert into _announcement_target_users
    select sa.user_id
    from public.student_accounts sa
    join public.academic_departments d on lower(btrim(d.name))=lower(btrim(sa.department))
    where sa.status in ('pending','approved') and d.id=p_department and d.is_active;
  elsif p_audience_type='individual_student' then
    insert into _announcement_target_users
    select user_id from public.student_accounts
    where user_id=p_student_user and status in ('pending','approved');
  end if;

  delete from public.app_notifications n
   where n.notification_type='announcement' and n.entity_type='announcement' and n.entity_id=v_id::text
     and not exists(select 1 from _announcement_target_users t where t.user_id=n.recipient_id);
  delete from public.announcement_recipients ar
   where ar.announcement_id=v_id
     and not exists(select 1 from _announcement_target_users t where t.user_id=ar.recipient_id);

  insert into public.announcement_recipients(announcement_id,recipient_id)
  select v_id,user_id from _announcement_target_users
  on conflict(announcement_id,recipient_id) do nothing;

  update public.app_notifications n set title=v_title,message=v_body
   where n.notification_type='announcement' and n.entity_type='announcement'
     and n.entity_id=v_id::text
     and exists(select 1 from _announcement_target_users t where t.user_id=n.recipient_id);

  -- User-targeted notifications must set recipient_role to NULL. The existing
  -- one-recipient check constraint rejects rows with both recipient_id and recipient_role.
  insert into public.app_notifications(recipient_id,notification_type,title,message,entity_type,entity_id)
  select t.user_id,'announcement',v_title,v_body,'announcement',v_id::text
  from _announcement_target_users t
  where not exists(
    select 1 from public.app_notifications n
    where n.recipient_id=t.user_id and n.notification_type='announcement'
      and n.entity_type='announcement' and n.entity_id=v_id::text
  );

  select count(*) into v_count from _announcement_target_users;
  insert into public.audit_events(actor_id,actor_email,action,entity_type,entity_id,details)
  values(auth.uid(),auth.jwt()->>'email',
    case when p_id is null then 'announcement.published' else 'announcement.updated' end,
    'announcement',v_id::text,
    jsonb_build_object('audience_type',p_audience_type,'recipient_count',v_count));
  return jsonb_build_object('id',v_id,'status','published','recipient_count',v_count);
end;
$function$;

revoke all on function public.admin_save_announcement(uuid,text,text,text,uuid,uuid,uuid,boolean) from public, anon;
grant execute on function public.admin_save_announcement(uuid,text,text,text,uuid,uuid,uuid,boolean) to authenticated;

-- Patch the original seven-argument overload for older deployed clients.
do $compat$
declare
  v text;
  old_block text;
  new_block text;
begin
  v := pg_get_functiondef('public.admin_save_announcement(uuid,text,text,text,uuid,uuid,boolean)'::regprocedure);
  v := replace(v,
    'select user_id from public.student_accounts where status=''approved'';',
    'select user_id from public.student_accounts where status in (''pending'',''approved'');');
  old_block := $old$  insert into public.app_notifications(recipient_id,recipient_role,notification_type,title,message,entity_type,entity_id)
  select t.user_id,case when p_audience_type='all_students' then 'student' else 'lecturer' end,
         'announcement',v_title,v_body,'announcement',v_id::text$old$;
  new_block := $new$  insert into public.app_notifications(recipient_id,notification_type,title,message,entity_type,entity_id)
  select t.user_id,'announcement',v_title,v_body,'announcement',v_id::text$new$;
  if position(old_block in v)>0 then
    v := replace(v,old_block,new_block);
    execute v;
  end if;
end
$compat$;

create or replace function public.admin_delete_student_account(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_account public.student_accounts;
  v_requests integer := 0;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin_required'; end if;
  if p_user_id is null or p_user_id=auth.uid() then raise exception 'student_account_not_found'; end if;
  select * into v_account from public.student_accounts where user_id=p_user_id for update;
  if not found then raise exception 'student_account_not_found'; end if;
  if exists(select 1 from public.lecturers where id=p_user_id) then
    raise exception 'student_account_not_found';
  end if;

  delete from public.app_notifications n
   using public.student_enrollment_requests r
   where n.notification_type='enrollment_request'
     and n.entity_type='enrollment_request' and n.entity_id=r.id::text
     and upper(btrim(r.student_id))=upper(btrim(v_account.student_id))
     and lower(btrim(r.student_name))=lower(btrim(v_account.full_name))
     and lower(btrim(r.dept))=lower(btrim(v_account.department));

  delete from public.student_enrollment_requests
   where upper(btrim(student_id))=upper(btrim(v_account.student_id))
     and lower(btrim(student_name))=lower(btrim(v_account.full_name))
     and lower(btrim(dept))=lower(btrim(v_account.department));
  get diagnostics v_requests = row_count;

  insert into public.audit_events(actor_id,actor_email,action,entity_type,entity_id,details)
  values(auth.uid(),auth.jwt()->>'email','admin.student_account_deleted',
         'student_account',p_user_id::text,
         jsonb_build_object('student_id',v_account.student_id,
           'student_name',v_account.full_name,'enrollment_requests_deleted',v_requests,
           'course_roster_and_attendance_preserved',true));

  -- Auth deletion cascades to student_accounts, notifications, announcement recipients
  -- and sessions. It invalidates refresh tokens; already-issued access tokens expire normally.
  delete from auth.users where id=p_user_id;
  if not found then raise exception 'student_account_not_found'; end if;

  return jsonb_build_object(
    'deleted',true,'enrollment_requests_deleted',v_requests,
    'course_roster_and_attendance_preserved',true
  );
end;
$function$;

revoke all on function public.admin_delete_student_account(uuid) from public, anon;
grant execute on function public.admin_delete_student_account(uuid) to authenticated;

notify pgrst, 'reload schema';
