-- CampusSign step 4: classroom location check (students must be within 15 m of the lecturer).
-- Paste into Supabase > SQL Editor > New query > Run.
--
-- Only the DISTANCE and a pass/flag are stored for each student, never their coordinates.

alter table public.sessions
  add column if not exists anchor_lat double precision,
  add column if not exists anchor_lng double precision,
  add column if not exists anchor_acc double precision,
  add column if not exists anchor_set_at timestamptz,
  add column if not exists radius_m int not null default 15;

alter table public.attendance
  add column if not exists location_status text,
  add column if not exists distance_m int,
  add column if not exists location_acc int;

-- Remove the old version so nobody can call it to skip the location check.
drop function if exists public.check_in(text, bigint, text, text, jsonb, text);

create or replace function public.check_in(p_session text, p_exp bigint, p_ticket text,
  p_student_id text, p_descriptor jsonb, p_photo text,
  p_lat double precision default null, p_lng double precision default null, p_acc double precision default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  s public.sessions; st public.students; tpl jsonb; samp jsonb; probes jsonb; pr jsonb;
  best double precision := 1e9; d double precision; i int; f int; rec text; photo text;
  threshold constant double precision := 0.6;
  loc text; flag text; dist double precision; a double precision;
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
    -- ---- classroom location check ----
    if s.anchor_lat is null then
      loc := 'not_checked';                       -- lecturer did not set the classroom location
    elsif p_lat is null or p_lng is null or p_acc is null
          or p_lat not between -90 and 90 or p_lng not between -180 and 180 or p_acc < 0 then
      loc := 'unavailable';                       -- student denied / device gave no location
    else
      a := power(sin(radians(p_lat - s.anchor_lat) / 2), 2)
         + cos(radians(s.anchor_lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - s.anchor_lng) / 2), 2);
      dist := 2 * 6371000 * asin(least(1, sqrt(a)));
      if dist <= s.radius_m and p_acc <= 50 and coalesce(s.anchor_acc, 999) <= 50 then
        loc := 'in_class';
      elsif dist - p_acc - coalesce(s.anchor_acc, 0) > s.radius_m then
        loc := 'outside';                         -- confidently outside, even allowing for GPS error
      else
        loc := 'uncertain';                       -- too inaccurate to say either way
      end if;
    end if;
    flag := case when loc in ('in_class', 'not_checked') then 'Verified' else 'Flagged' end;

    delete from public.checkin_attempts where session_id = s.id and student_id = st.student_id;
    rec := 'REC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 7));
    photo := case when p_photo like 'data:image/jpeg;base64,%' and length(p_photo) < 200000 then p_photo else null end;
    begin
      insert into public.attendance (session_id, lecturer_id, course, student_id, student_name, dept,
                                     face_photo, receipt_no, status, location_status, distance_m, location_acc)
      values (s.id, s.lecturer_id, s.course, st.student_id, st.name, st.dept,
              photo, rec, flag, loc, round(dist)::int, round(p_acc)::int);
    exception when unique_violation then
      return jsonb_build_object('status', 'already');
    end;
    return jsonb_build_object('status', 'ok', 'receipt_no', rec, 'student_id', st.student_id,
      'name', st.name, 'dept', st.dept, 'created_at', now(),
      'flag', flag, 'location', loc, 'distance_m', round(dist)::int);
  end if;

  insert into public.checkin_attempts (session_id, student_id, failures) values (s.id, st.student_id, 1)
    on conflict (session_id, student_id) do update set failures = public.checkin_attempts.failures + 1
    returning failures into f;
  if f >= 3 then return jsonb_build_object('status', 'locked'); end if;
  return jsonb_build_object('status', 'mismatch', 'remaining', 3 - f, 'distance', round(best::numeric, 2));
end $$;

revoke execute on function public.check_in(text, bigint, text, text, jsonb, text, double precision, double precision, double precision) from public;
grant execute on function public.check_in(text, bigint, text, text, jsonb, text, double precision, double precision, double precision) to anon, authenticated;
