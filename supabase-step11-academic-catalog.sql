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
