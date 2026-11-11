-- CampusSign Step 11: centrally managed departments and course catalogue.
-- Run AFTER Steps 1-10. Idempotent and non-destructive: existing lecturer,
-- student, attendance and face-template rows are retained.
begin;

create table if not exists public.academic_departments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_departments_code_format check (code ~ '^[A-Z0-9_-]{2,12}$'),
  constraint academic_departments_name_length check (length(trim(name)) between 2 and 120)
);

create table if not exists public.academic_courses (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.academic_departments(id) on delete restrict,
  code text not null,
  title text not null,
  level text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (department_id, code),
  constraint academic_courses_code_format check (code ~ '^[A-Z0-9_-]{2,20}$'),
  constraint academic_courses_title_length check (length(trim(title)) between 2 and 160)
);

create table if not exists public.lecturer_course_assignments (
  lecturer_id uuid not null references public.lecturers(id) on delete cascade,
  course_id uuid not null references public.academic_courses(id) on delete restrict,
  is_primary boolean not null default false,
  assigned_at timestamptz not null default now(),
  primary key (lecturer_id, course_id)
);

create index if not exists academic_courses_department_active_idx on public.academic_courses(department_id, is_active, code);
create index if not exists lecturer_course_assignments_course_idx on public.lecturer_course_assignments(course_id);

-- Backfill existing free-text department and course values without deleting or
-- rewriting the legacy values used by existing attendance/session records.
insert into public.academic_departments(code, name)
select
  'D_' || upper(substr(md5(lower(trim(d))), 1, 10)),
  min(trim(d))
from (
  select dept as d
  from public.lecturers
  where nullif(trim(dept), '') is not null

  union all

  select dept as d
  from public.students
  where nullif(trim(dept), '') is not null
) x
group by lower(trim(d))
on conflict do nothing;

insert into public.academic_courses(department_id, code, title)
select distinct d.id,
  upper(regexp_replace(left(trim(split_part(coalesce(c.course, ''), ' - ', 1)), 20), '[^A-Za-z0-9_-]', '_', 'g')),
  case when position(' - ' in c.course) > 0 then trim(substring(c.course from position(' - ' in c.course) + 3)) else trim(c.course) end
from (
  select dept, course from public.lecturers where nullif(trim(dept), '') is not null and nullif(trim(course), '') is not null
  union select dept, course from public.students where nullif(trim(dept), '') is not null and nullif(trim(course), '') is not null
) c
join public.academic_departments d on lower(d.name) = lower(trim(c.dept))
where nullif(trim(split_part(c.course, ' - ', 1)), '') is not null
on conflict (department_id, code) do nothing;

-- Link existing lecturers to their existing course where the catalogue can be
-- matched. This does not change their legacy profile/course values.
insert into public.lecturer_course_assignments(lecturer_id, course_id, is_primary)
select l.id, c.id, true
from public.lecturers l
join public.academic_departments d on lower(d.name) = lower(trim(l.dept))
join public.academic_courses c on c.department_id = d.id
 and c.code = upper(regexp_replace(left(trim(split_part(l.course, ' - ', 1)), 20), '[^A-Za-z0-9_-]', '_', 'g'))
where nullif(trim(l.course), '') is not null
on conflict do nothing;

alter table public.academic_departments enable row level security;
alter table public.academic_courses enable row level security;
alter table public.lecturer_course_assignments enable row level security;
revoke all on public.academic_departments, public.academic_courses, public.lecturer_course_assignments from anon, authenticated;
grant select on public.academic_departments, public.academic_courses to anon, authenticated;
grant select on public.lecturer_course_assignments to authenticated;

drop policy if exists academic_departments_read_active on public.academic_departments;
create policy academic_departments_read_active on public.academic_departments for select to anon, authenticated using (is_active or public.is_admin());
drop policy if exists academic_courses_read_active on public.academic_courses;
create policy academic_courses_read_active on public.academic_courses for select to anon, authenticated using (is_active or public.is_admin());
drop policy if exists lecturer_assignments_read_self_admin on public.lecturer_course_assignments;
create policy lecturer_assignments_read_self_admin on public.lecturer_course_assignments for select to authenticated using (lecturer_id = auth.uid() or public.is_admin());

create or replace function public.catalog_departments()
returns table(id uuid, code text, name text, is_active boolean)
language sql stable security definer set search_path = public as $$
  select d.id, d.code, d.name, d.is_active from public.academic_departments d
  where d.is_active or public.is_admin() order by d.name
$$;

create or replace function public.catalog_courses(p_department uuid default null)
returns table(id uuid, department_id uuid, department_name text, code text, title text, level text, is_active boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.department_id, d.name, c.code, c.title, c.level, c.is_active
  from public.academic_courses c join public.academic_departments d on d.id = c.department_id
  where (p_department is null or c.department_id = p_department)
    and ((c.is_active and d.is_active) or public.is_admin())
  order by d.name, c.code
$$;

create or replace function public.admin_save_department(p_id uuid, p_code text, p_name text, p_active boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare result_id uuid; old_name text;
begin
  if not public.is_admin() then raise exception 'admin_required'; end if;
  if length(trim(coalesce(p_name,''))) < 2 or length(trim(coalesce(p_code,''))) < 2 then raise exception 'invalid_department'; end if;
  if p_id is null then
    insert into public.academic_departments(code,name,is_active) values (upper(trim(p_code)),trim(p_name),p_active) returning id into result_id;
  else
    select name into old_name from public.academic_departments where id=p_id;
    update public.academic_departments set code=upper(trim(p_code)), name=trim(p_name), is_active=p_active, updated_at=now() where id=p_id returning id into result_id;
    if result_id is null then raise exception 'department_not_found'; end if;
    if old_name is distinct from trim(p_name) then
      update public.lecturers set dept=trim(p_name) where lower(dept)=lower(old_name);
      update public.students set dept=trim(p_name) where lower(dept)=lower(old_name);
      update public.student_enrollment_requests set dept=trim(p_name) where lower(dept)=lower(old_name);
      update public.attendance set dept=trim(p_name) where lower(dept)=lower(old_name);
    end if;
  end if;
  perform public._campussign_write_audit('academic.department_saved','department',result_id::text,null,jsonb_build_object('code',upper(trim(p_code)),'name',trim(p_name),'active',p_active));
  return result_id;
end $$;

create or replace function public.admin_save_course(p_id uuid, p_department uuid, p_code text, p_title text, p_level text default null, p_active boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare result_id uuid; old_label text; new_label text;
begin
  if not public.is_admin() then raise exception 'admin_required'; end if;
  if not exists(select 1 from public.academic_departments where id=p_department) then raise exception 'department_not_found'; end if;
  if length(trim(coalesce(p_code,''))) < 2 or length(trim(coalesce(p_title,''))) < 2 then raise exception 'invalid_course'; end if;
  if p_id is null then
    insert into public.academic_courses(department_id,code,title,level,is_active) values(p_department,upper(trim(p_code)),trim(p_title),nullif(trim(coalesce(p_level,'')),''),p_active) returning id into result_id;
  else
    select c.code || ' - ' || c.title into old_label from public.academic_courses c where c.id=p_id;
    update public.academic_courses set department_id=p_department,code=upper(trim(p_code)),title=trim(p_title),level=nullif(trim(coalesce(p_level,'')),''),is_active=p_active,updated_at=now() where id=p_id returning id into result_id;
    if result_id is null then raise exception 'course_not_found'; end if;
    new_label := upper(trim(p_code)) || ' - ' || trim(p_title);
    if old_label is distinct from new_label then
      update public.lecturers set course=new_label where course=old_label;
      update public.students set course=new_label where course=old_label;
      update public.sessions set course=new_label where course=old_label;
      update public.attendance set course=new_label where course=old_label;
      update public.student_enrollment_requests set course=new_label where course=old_label;
      update public.audit_events set course=new_label where course=old_label;
    end if;
  end if;
  perform public._campussign_write_audit('academic.course_saved','course',result_id::text,null,jsonb_build_object('department_id',p_department,'code',upper(trim(p_code)),'title',trim(p_title),'level',p_level,'active',p_active));
  return result_id;
end $$;

create or replace function public.admin_assign_lecturer_course(p_lecturer uuid, p_course uuid, p_assigned boolean default true, p_primary boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_required'; end if;
  if p_assigned then
    insert into public.lecturer_course_assignments(lecturer_id,course_id,is_primary) values(p_lecturer,p_course,p_primary)
    on conflict(lecturer_id,course_id) do update set is_primary=excluded.is_primary, assigned_at=now();
  else
    delete from public.lecturer_course_assignments where lecturer_id=p_lecturer and course_id=p_course;
  end if;
  perform public._campussign_write_audit('academic.lecturer_course_assignment','lecturer',p_lecturer::text,null,jsonb_build_object('course_id',p_course,'assigned',p_assigned,'primary',p_primary));
end $$;

-- Students see only active courses in the department they selected. The old
-- list_available_courses RPC remains available for older app versions.
create or replace function public.list_department_courses(p_department_name text)
returns table(course text, course_code text, course_title text, level text)
language sql stable security definer set search_path = public as $$
  select c.code || ' - ' || c.title, c.code, c.title, c.level
  from public.academic_courses c join public.academic_departments d on d.id=c.department_id
  where d.is_active and c.is_active and lower(d.name)=lower(trim(p_department_name))
    and exists (select 1 from public.lecturer_course_assignments a join public.lecturers l on l.id=a.lecturer_id where a.course_id=c.id and l.is_verified and l.role='lecturer')
  order by c.code
$$;

revoke all on function public.catalog_departments() from public;
revoke all on function public.catalog_courses(uuid) from public;
revoke all on function public.admin_save_department(uuid,text,text,boolean) from public, anon;
revoke all on function public.admin_save_course(uuid,uuid,text,text,text,boolean) from public, anon;
revoke all on function public.admin_assign_lecturer_course(uuid,uuid,boolean,boolean) from public, anon;
revoke all on function public.list_department_courses(text) from public;
grant execute on function public.catalog_departments() to anon, authenticated;
grant execute on function public.catalog_courses(uuid) to authenticated;
grant execute on function public.admin_save_department(uuid,text,text,boolean) to authenticated;
grant execute on function public.admin_save_course(uuid,uuid,text,text,text,boolean) to authenticated;
grant execute on function public.admin_assign_lecturer_course(uuid,uuid,boolean,boolean) to authenticated;
grant execute on function public.list_department_courses(text) to anon, authenticated;

-- Route self-enrolment through the centrally managed catalogue and lecturer
-- assignments. The request table and approval workflow remain unchanged.
create or replace function public.submit_student_enrollment(
  p_student_id text, p_name text, p_dept text, p_level text,
  p_courses text[], p_descriptors jsonb
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  sid text := upper(trim(coalesce(p_student_id, '')));
  nm text := trim(coalesce(p_name, ''));
  cr text;
  lect record;
  descriptor jsonb;
  sent int := 0;
  recipients int := 0;
  request_id uuid;
begin
  if length(sid) < 3 or length(sid) > 40 then raise exception 'invalid_student_id'; end if;
  if length(nm) < 3 or length(nm) > 120 then raise exception 'invalid_student_name'; end if;
  if not exists(select 1 from public.academic_departments d where d.is_active and lower(d.name)=lower(trim(coalesce(p_dept,'')))) then raise exception 'invalid_department'; end if;
  if coalesce(array_length(p_courses, 1), 0) < 1 or array_length(p_courses, 1) > 20 then raise exception 'select_at_least_one_course'; end if;
  if p_descriptors is null or jsonb_typeof(p_descriptors) <> 'array' or jsonb_array_length(p_descriptors) not between 1 and 10 then raise exception 'bad_descriptor'; end if;
  for descriptor in select jsonb_array_elements(p_descriptors) loop
    if jsonb_typeof(descriptor) <> 'array' or jsonb_array_length(descriptor) <> 128 then raise exception 'bad_descriptor'; end if;
    if exists (select 1 from jsonb_array_elements(descriptor) as parts(value) where jsonb_typeof(parts.value) <> 'number') then raise exception 'bad_descriptor'; end if;
  end loop;
  if exists (select 1 from unnest(p_courses) c group by c having count(*) > 1) then raise exception 'duplicate_course'; end if;

  foreach cr in array p_courses loop
    if not exists (
      select 1 from public.academic_courses c join public.academic_departments d on d.id=c.department_id
      where c.is_active and d.is_active and lower(d.name)=lower(trim(p_dept))
        and (c.code || ' - ' || c.title)=cr
    ) then raise exception 'course_unavailable'; end if;
    for lect in
      select distinct l.id, l.course
      from public.lecturers l
      join public.lecturer_course_assignments a on a.lecturer_id=l.id
      join public.academic_courses c on c.id=a.course_id
      join public.academic_departments d on d.id=c.department_id
      where l.is_verified and l.role='lecturer' and c.is_active and d.is_active
        and (c.code || ' - ' || c.title)=cr and lower(d.name)=lower(trim(p_dept))
    loop
      if exists (select 1 from public.students st where st.lecturer_id=lect.id and st.course=cr and upper(st.student_id)=sid) then continue; end if;
      request_id := null;
      insert into public.student_enrollment_requests(lecturer_id,course,student_id,student_name,dept,level,face_descriptors)
      values(lect.id,cr,sid,nm,trim(p_dept),trim(coalesce(p_level,'')),p_descriptors)
      on conflict(lecturer_id,course,student_id) do update
        set student_name=excluded.student_name,dept=excluded.dept,level=excluded.level,
            face_descriptors=excluded.face_descriptors,status='pending',created_at=now(),reviewed_at=null
        where public.student_enrollment_requests.status in ('rejected','approved')
      returning id into request_id;
      if request_id is null then
        select id into request_id from public.student_enrollment_requests where lecturer_id=lect.id and course=cr and student_id=sid and status='pending';
      end if;
      if request_id is null then raise exception 'enrollment_request_exists'; end if;
      sent := sent+1; recipients := recipients+1;
    end loop;
  end loop;
  if sent=0 then raise exception 'course_unavailable'; end if;
  return jsonb_build_object('requests_sent',sent,'lecturers_notified',recipients);
exception when unique_violation then raise exception 'enrollment_request_exists';
end $$;
revoke execute on function public.submit_student_enrollment(text,text,text,text,text[],jsonb) from public;
grant execute on function public.submit_student_enrollment(text,text,text,text,text[],jsonb) to anon, authenticated;


-- New lecturer registrations select from the catalogue. Keep the first selected
-- course in the legacy profile column for compatibility while recording every
-- selected course in the normalized assignment table.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare selected_course text;
begin
  insert into public.lecturers (id, email, name, dept, course)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'dept', ''),
    coalesce(new.raw_user_meta_data->>'course', '')
  );

  for selected_course in
    select jsonb_array_elements_text(
      case when jsonb_typeof(new.raw_user_meta_data->'courses')='array'
        then new.raw_user_meta_data->'courses'
        else jsonb_build_array(coalesce(new.raw_user_meta_data->>'course','')) end
    )
  loop
    insert into public.lecturer_course_assignments(lecturer_id,course_id,is_primary)
    select new.id,c.id, selected_course = coalesce(new.raw_user_meta_data->>'course','')
    from public.academic_courses c
    join public.academic_departments d on d.id=c.department_id
    where lower(d.name)=lower(coalesce(new.raw_user_meta_data->>'dept',''))
      and (c.code || ' - ' || c.title)=selected_course and c.is_active and d.is_active
    on conflict(lecturer_id,course_id) do nothing;
  end loop;
  return new;
end $$;


create or replace function public.my_assigned_courses()
returns table(course text, department_name text, is_primary boolean)
language sql stable security definer set search_path = public as $$
  select c.code || ' - ' || c.title, d.name, a.is_primary
  from public.lecturer_course_assignments a
  join public.academic_courses c on c.id=a.course_id
  join public.academic_departments d on d.id=c.department_id
  where a.lecturer_id=auth.uid() and c.is_active and d.is_active
  order by a.is_primary desc, d.name, c.code
$$;
revoke execute on function public.my_assigned_courses() from public, anon;
grant execute on function public.my_assigned_courses() to authenticated;

commit;
