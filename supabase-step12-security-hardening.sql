-- CampusSign Step 12: security hardening and public enrolment throttling.
-- Run AFTER Steps 1-11. Safe to re-run. Does not delete existing attendance or enrolment data.
begin;

-- 1) A verified lecturer may edit only the fields exposed by the attendance editor.
-- Revoking table-level UPDATE is essential: a column grant cannot restrict a broader
-- table-level grant. The existing RLS policy from Step 6 still limits row ownership.
revoke update on public.attendance from public, anon, authenticated;
grant update (student_name, dept, status) on public.attendance to authenticated;

-- 2) Keep audit actor email populated across Supabase JWT claim formats.
create or replace function public._campussign_write_audit(
  p_action text, p_entity_type text, p_entity_id text, p_course text, p_details jsonb
) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  insert into public.audit_events (actor_id, actor_email, action, entity_type, entity_id, course, details)
  values (
    auth.uid(),
    coalesce(
      nullif(current_setting('request.jwt.claim.email', true), ''),
      nullif(auth.jwt() ->> 'email', ''),
      (select nullif(u.email, '') from auth.users u where u.id = auth.uid())
    ),
    p_action, p_entity_type, p_entity_id, p_course, coalesce(p_details, '{}'::jsonb)
  );
end $$;
revoke all on function public._campussign_write_audit(text, text, text, text, jsonb) from public, anon, authenticated;

-- 3) Small server-side rate-limit table. Only hashed identifiers are stored.
create table if not exists public.campussign_enrollment_rate_limits (
  bucket_key text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.campussign_enrollment_rate_limits enable row level security;
revoke all on public.campussign_enrollment_rate_limits from public, anon, authenticated;

create or replace function public._campussign_consume_enrollment_limit(p_bucket text, p_max integer)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_bucket, 0));
  insert into public.campussign_enrollment_rate_limits(bucket_key, window_started_at, request_count, updated_at)
  values (p_bucket, now(), 1, now())
  on conflict (bucket_key) do update
    set window_started_at = case
          when public.campussign_enrollment_rate_limits.window_started_at <= now() - interval '1 hour' then now()
          else public.campussign_enrollment_rate_limits.window_started_at end,
        request_count = case
          when public.campussign_enrollment_rate_limits.window_started_at <= now() - interval '1 hour' then 1
          else public.campussign_enrollment_rate_limits.request_count + 1 end,
        updated_at = now()
  returning request_count into v_count;
  return v_count <= greatest(1, p_max);
end $$;
revoke all on function public._campussign_consume_enrollment_limit(text, integer) from public, anon, authenticated;

-- 4) Re-apply the catalogue-backed public enrolment RPC with basic per-student
-- and per-source-IP caps. These are abuse-friction limits, not identity proof.
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
  headers jsonb;
  source_ip text;
  ip_bucket text;
begin
  if length(sid) < 3 or length(sid) > 40 then raise exception 'invalid_student_id'; end if;
  if length(nm) < 3 or length(nm) > 120 then raise exception 'invalid_student_name'; end if;

  -- request.headers is supplied by PostgREST/Supabase. If no client IP header
  -- is available, the per-student limit still applies.
  begin
    headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    headers := null;
  end;
  source_ip := coalesce(headers ->> 'cf-connecting-ip', headers ->> 'x-real-ip', split_part(coalesce(headers ->> 'x-forwarded-for', ''), ',', 1));
  if nullif(trim(source_ip), '') is not null then
    ip_bucket := 'ip:' || md5(trim(source_ip));
    if not public._campussign_consume_enrollment_limit(ip_bucket, 120) then
      raise exception 'enrollment_rate_limited';
    end if;
  end if;
  if not public._campussign_consume_enrollment_limit('student:' || md5(sid), 5) then
    raise exception 'enrollment_rate_limited';
  end if;

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



-- Keep exactly one primary course per lecturer when assignments are edited.
create or replace function public.admin_assign_lecturer_course(p_lecturer uuid, p_course uuid, p_assigned boolean default true, p_primary boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_required'; end if;
  if p_assigned then
    if p_primary then
      update public.lecturer_course_assignments set is_primary = false where lecturer_id = p_lecturer;
    end if;
    insert into public.lecturer_course_assignments(lecturer_id,course_id,is_primary)
    values(p_lecturer,p_course,p_primary)
    on conflict(lecturer_id,course_id) do update set is_primary=excluded.is_primary, assigned_at=now();
  else
    delete from public.lecturer_course_assignments where lecturer_id=p_lecturer and course_id=p_course;
  end if;
  perform public._campussign_write_audit('academic.lecturer_course_assignment','lecturer',p_lecturer::text,null,jsonb_build_object('course_id',p_course,'assigned',p_assigned,'primary',p_primary));
end $$;
revoke all on function public.admin_assign_lecturer_course(uuid,uuid,boolean,boolean) from public, anon;
grant execute on function public.admin_assign_lecturer_course(uuid,uuid,boolean,boolean) to authenticated;

-- 5) Let administrators inspect the normalized course assignments for an existing lecturer.
create or replace function public.admin_lecturer_courses(p_lecturer uuid)
returns table(course_id uuid, is_primary boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_required'; end if;
  return query
    select a.course_id, a.is_primary
    from public.lecturer_course_assignments a
    where a.lecturer_id = p_lecturer
    order by a.is_primary desc, a.assigned_at asc;
end $$;
revoke all on function public.admin_lecturer_courses(uuid) from public, anon;
grant execute on function public.admin_lecturer_courses(uuid) to authenticated;


-- 6) Read-only administrator views for the dashboard's enrolment and activity tiles.
create or replace function public.admin_list_student_enrolments(p_limit integer default 100)
returns table(enrolment_id uuid, student_id text, student_name text, department text, level text,
              course text, lecturer_name text, face_enrolled boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_required'; end if;
  return query
    select st.id, st.student_id, st.name, st.dept, st.level, st.course, l.name,
           st.face_enrolled, st.created_at
    from public.students st
    join public.lecturers l on l.id = st.lecturer_id
    order by st.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 250));
end $$;
revoke all on function public.admin_list_student_enrolments(integer) from public, anon;
grant execute on function public.admin_list_student_enrolments(integer) to authenticated;

create or replace function public.admin_recent_attendance(p_limit integer default 100)
returns table(attendance_id uuid, student_id text, student_name text, department text, course text,
              status text, receipt_no text, session_id text, session_title text,
              lecturer_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_required'; end if;
  return query
    select a.id, a.student_id, a.student_name, a.dept, a.course, a.status, a.receipt_no,
           a.session_id, s.title, l.name, a.created_at
    from public.attendance a
    left join public.sessions s on s.id = a.session_id
    left join public.lecturers l on l.id = a.lecturer_id
    order by a.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 250));
end $$;
revoke all on function public.admin_recent_attendance(integer) from public, anon;
grant execute on function public.admin_recent_attendance(integer) to authenticated;

create or replace function public.admin_recent_sessions(p_limit integer default 50)
returns table(session_id text, title text, course text, venue text, lecturer_name text,
              revoked boolean, created_at timestamptz, ends_at timestamptz, attendance_count bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_required'; end if;
  return query
    select s.id, s.title, s.course, s.venue, l.name, s.revoked, s.created_at, s.ends_at,
           (select count(*) from public.attendance a where a.session_id = s.id)
    from public.sessions s
    left join public.lecturers l on l.id = s.lecturer_id
    order by s.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 150));
end $$;
revoke all on function public.admin_recent_sessions(integer) from public, anon;
grant execute on function public.admin_recent_sessions(integer) to authenticated;

commit;
