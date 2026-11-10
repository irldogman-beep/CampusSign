-- CampusSign step 3: more forgiving, more accurate face check.
-- Paste into Supabase > SQL Editor > New query > Run.
--  * accepts several frames per check-in and uses the best match
--  * match threshold 0.6 (the standard for this face model)
--  * TEMPORARY: a failed check also returns its "distance" score so we can tune it.
--    (We will remove the score once the numbers look right.)

create or replace function public.check_in(p_session text, p_exp bigint, p_ticket text,
  p_student_id text, p_descriptor jsonb, p_photo text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  s public.sessions; st public.students; tpl jsonb; samp jsonb; probes jsonb; pr jsonb;
  best double precision := 1e9; d double precision; i int; f int; rec text; photo text;
  threshold constant double precision := 0.6;
begin
  s := public._check_ticket(p_session, p_exp, p_ticket);
  select * into st from public.students
    where lecturer_id = s.lecturer_id and course = s.course and upper(student_id) = upper(trim(p_student_id));
  if not found then raise exception 'not_found'; end if;

  if exists (select 1 from public.attendance where session_id = s.id and student_id = st.student_id) then
    return jsonb_build_object('status', 'already');
  end if;
  select failures into f from public.checkin_attempts where session_id = s.id and student_id = st.student_id;
  if coalesce(f, 0) >= 3 then return jsonb_build_object('status', 'locked'); end if;

  -- accept one descriptor (128 numbers) or up to 5 descriptors (array of arrays)
  if jsonb_typeof(p_descriptor) <> 'array' or jsonb_array_length(p_descriptor) = 0 then
    raise exception 'bad_descriptor';
  end if;
  if jsonb_typeof(p_descriptor -> 0) = 'array' then probes := p_descriptor;
  else probes := jsonb_build_array(p_descriptor);
  end if;
  if jsonb_array_length(probes) > 5 then raise exception 'bad_descriptor'; end if;
  for pr in select jsonb_array_elements(probes) loop
    if jsonb_typeof(pr) <> 'array' or jsonb_array_length(pr) <> 128 then raise exception 'bad_descriptor'; end if;
  end loop;

  select descriptors into tpl from public.face_templates where student_pk = st.id;
  if tpl is null then return jsonb_build_object('status', 'not_enrolled'); end if;

  for pr in select jsonb_array_elements(probes) loop
    for samp in select jsonb_array_elements(tpl) loop
      d := 0;
      for i in 0..127 loop
        d := d + power((samp->>i)::double precision - (pr->>i)::double precision, 2);
      end loop;
      d := sqrt(d);
      if d < best then best := d; end if;
    end loop;
  end loop;

  if best <= threshold then
    delete from public.checkin_attempts where session_id = s.id and student_id = st.student_id;
    rec := 'REC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 7));
    photo := case when p_photo like 'data:image/jpeg;base64,%' and length(p_photo) < 200000 then p_photo else null end;
    begin
      insert into public.attendance (session_id, lecturer_id, course, student_id, student_name, dept, face_photo, receipt_no)
      values (s.id, s.lecturer_id, s.course, st.student_id, st.name, st.dept, photo, rec);
    exception when unique_violation then
      return jsonb_build_object('status', 'already');
    end;
    return jsonb_build_object('status', 'ok', 'receipt_no', rec, 'student_id', st.student_id,
      'name', st.name, 'dept', st.dept, 'created_at', now());
  end if;

  insert into public.checkin_attempts (session_id, student_id, failures) values (s.id, st.student_id, 1)
    on conflict (session_id, student_id) do update set failures = public.checkin_attempts.failures + 1
    returning failures into f;
  if f >= 3 then return jsonb_build_object('status', 'locked'); end if;
  return jsonb_build_object('status', 'mismatch', 'remaining', 3 - f, 'distance', round(best::numeric, 2));
end $$;

-- Clear any lock-outs from your earlier failed tests:
delete from public.checkin_attempts;
