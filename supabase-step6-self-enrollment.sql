-- CampusSign step 6: student self-enrolment, lecturer requests, and attendance log maintenance.
-- Run after steps 1-5. Safe to run more than once.

-- Student requests are private: the biometric descriptor is never readable directly by a client.
create table if not exists public.student_enrollment_requests (
  id uuid primary key default gen_random_uuid(),
  lecturer_id uuid not null references public.lecturers(id) on delete cascade,
  course text not null,
  student_id text not null,
  student_name text not null,
  dept text not null default '',
  level text not null default '',
  face_descriptors jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (lecturer_id, course, student_id)
);

alter table public.student_enrollment_requests enable row level security;
create index if not exists enrollment_requests_lecturer_pending_idx
  on public.student_enrollment_requests (lecturer_id, status, created_at);
revoke all on public.student_enrollment_requests from anon, authenticated;

-- Keep attendance editable only by its owning, verified lecturer.
drop policy if exists "own attendance update" on public.attendance;
create policy "own attendance update" on public.attendance for update to authenticated
  using (lecturer_id = auth.uid() and public.is_verified())
  with check (lecturer_id = auth.uid() and public.is_verified());

-- Students can see only courses currently offered by verified lecturers.
create or replace function public.list_available_courses()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(course order by course), array[]::text[])
  from (select distinct trim(course) as course from public.lecturers
        where is_verified and nullif(trim(course), '') is not null) available
$$;
revoke execute on function public.list_available_courses() from public;
grant execute on function public.list_available_courses() to anon, authenticated;

-- One submission creates a separate inbox item for every verified lecturer teaching
-- each selected course. This is an in-app delivery to each lecturer's review queue.
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
  if length(trim(coalesce(p_dept, ''))) < 2 then raise exception 'invalid_department'; end if;
  if coalesce(array_length(p_courses, 1), 0) < 1 or array_length(p_courses, 1) > 20 then
    raise exception 'select_at_least_one_course';
  end if;
  if p_descriptors is null or jsonb_typeof(p_descriptors) <> 'array' then
    raise exception 'bad_descriptor';
  end if;
  if jsonb_array_length(p_descriptors) not between 1 and 10 then
    raise exception 'bad_descriptor';
  end if;
  for descriptor in select jsonb_array_elements(p_descriptors) loop
    if jsonb_typeof(descriptor) <> 'array' then raise exception 'bad_descriptor'; end if;
    if jsonb_array_length(descriptor) <> 128 then raise exception 'bad_descriptor'; end if;
    if exists (select 1 from jsonb_array_elements(descriptor) as parts(value)
               where jsonb_typeof(parts.value) <> 'number') then
      raise exception 'bad_descriptor';
    end if;
  end loop;

  if exists (select 1 from unnest(p_courses) c group by c having count(*) > 1) then
    raise exception 'duplicate_course';
  end if;

  foreach cr in array p_courses loop
    if not exists (select 1 from public.lecturers l where l.is_verified and l.course = cr) then
      raise exception 'course_unavailable';
    end if;
    for lect in select id, course from public.lecturers where is_verified and course = cr loop
      if exists (select 1 from public.students st
                 where st.lecturer_id = lect.id and st.course = cr and upper(st.student_id) = sid) then
        continue;
      end if;
      request_id := null;
      insert into public.student_enrollment_requests
        (lecturer_id, course, student_id, student_name, dept, level, face_descriptors)
      values (lect.id, cr, sid, nm, trim(p_dept), trim(coalesce(p_level, '')), p_descriptors)
      on conflict (lecturer_id, course, student_id) do update
        set student_name = excluded.student_name,
            dept = excluded.dept,
            level = excluded.level,
            face_descriptors = excluded.face_descriptors,
            status = 'pending',
            created_at = now(),
            reviewed_at = null
        where public.student_enrollment_requests.status in ('rejected', 'approved')
      returning id into request_id;
      if request_id is null then
        select id into request_id from public.student_enrollment_requests
          where lecturer_id = lect.id and course = cr and student_id = sid and status = 'pending';
      end if;
      if request_id is null then raise exception 'enrollment_request_exists'; end if;
      sent := sent + 1;
      recipients := recipients + 1;
    end loop;
  end loop;

  if sent = 0 then raise exception 'already_enrolled'; end if;
  return jsonb_build_object('requests_sent', sent, 'lecturers_notified', recipients);
exception when unique_violation then
  raise exception 'enrollment_request_exists';
end $$;
revoke execute on function public.submit_student_enrollment(text, text, text, text, text[], jsonb) from public;
grant execute on function public.submit_student_enrollment(text, text, text, text, text[], jsonb) to anon, authenticated;

-- Only the matching lecturer can see their own requests; face data is excluded.
create or replace function public.list_my_enrollment_requests()
returns table (
  id uuid, course text, student_id text, student_name text, dept text,
  level text, status text, created_at timestamptz
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_verified() then raise exception 'not_verified'; end if;
  return query
    select r.id, r.course, r.student_id, r.student_name, r.dept, r.level, r.status, r.created_at
    from public.student_enrollment_requests r
    where r.lecturer_id = auth.uid() and r.status = 'pending'
    order by r.created_at asc;
end $$;
revoke execute on function public.list_my_enrollment_requests() from public;
grant execute on function public.list_my_enrollment_requests() to authenticated;

-- Approve or reject a request. Approval creates the lecturer-specific student roster row
-- and moves the submitted face descriptor into the protected face_templates table.
create or replace function public.review_student_enrollment(p_request uuid, p_decision text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  req public.student_enrollment_requests;
  st_id uuid;
  other_face record;
begin
  if not public.is_verified() then raise exception 'not_verified'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'invalid_decision'; end if;

  select * into req from public.student_enrollment_requests
    where id = p_request and lecturer_id = auth.uid() for update;
  if not found then raise exception 'request_not_found'; end if;
  if req.status <> 'pending' then raise exception 'request_already_reviewed'; end if;

  if p_decision = 'reject' then
    update public.student_enrollment_requests
      set status = 'rejected', reviewed_at = now(), face_descriptors = null where id = req.id;
    return jsonb_build_object('status', 'rejected');
  end if;

  if req.face_descriptors is null then raise exception 'missing_face_template'; end if;
  for other_face in
    select t.descriptors from public.face_templates t
      join public.students s on s.id = t.student_pk
      where s.lecturer_id = auth.uid() and s.course = req.course
  loop
    if public._face_distance(req.face_descriptors, other_face.descriptors) < 0.45 then
      raise exception 'duplicate_face';
    end if;
  end loop;

  insert into public.students (lecturer_id, course, student_id, name, dept, level, face_enrolled)
    values (auth.uid(), req.course, req.student_id, req.student_name, req.dept, req.level, true)
    returning id into st_id;
  insert into public.face_templates (student_pk, descriptors)
    values (st_id, req.face_descriptors);
  update public.student_enrollment_requests
    set status = 'approved', reviewed_at = now(), face_descriptors = null where id = req.id;

  return jsonb_build_object('status', 'approved', 'student_row_id', st_id);
exception when unique_violation then
  raise exception 'already_enrolled';
end $$;
revoke execute on function public.review_student_enrollment(uuid, text) from public;
grant execute on function public.review_student_enrollment(uuid, text) to authenticated;
