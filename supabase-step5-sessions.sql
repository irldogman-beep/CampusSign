-- CampusSign step 5: per-session settings, smarter face matching, session end times.
-- Paste ALL of this into Supabase > SQL Editor > New query > Run. Safe to run twice.

alter table public.sessions
  add column if not exists face_required boolean not null default true,
  add column if not exists face_threshold double precision not null default 0.5,
  add column if not exists location_mode text not null default 'flag',
  add column if not exists ends_at timestamptz;

alter table public.attendance add column if not exists face_score numeric;

-- ---------- internal helpers ----------
create or replace function public._vec(j jsonb) returns double precision[]
language sql immutable set search_path = public as $$
  select array_agg(x::double precision order by ord)
  from jsonb_array_elements_text(j) with ordinality as t(x, ord)
$$;

-- Average, across the captured frames, of the best distance to any enrolled sample.
create or replace function public._face_distance(probes jsonb, tpl jsonb) returns double precision
language plpgsql immutable set search_path = public as $$
declare
  pr jsonb; samp jsonb; pv double precision[]; tv double precision[];
  best double precision; d double precision; i int; total double precision := 0; n int := 0;
begin
  for pr in select jsonb_array_elements(probes) loop
    pv := public._vec(pr);
    best := 1e9;
    for samp in select jsonb_array_elements(tpl) loop
      tv := public._vec(samp);
      d := 0;
      for i in 1..128 loop
        d := d + power(pv[i] - tv[i], 2);
      end loop;
      d := sqrt(d);
      if d < best then best := d; end if;
    end loop;
    total := total + best;
    n := n + 1;
  end loop;
  return total / greatest(n, 1);
end $$;

revoke execute on function public._vec(jsonb) from public, anon, authenticated;
revoke execute on function public._face_distance(jsonb, jsonb) from public, anon, authenticated;

-- ---------- sessions: honour the automatic end time ----------
create or replace function public._check_ticket(p_session text, p_exp bigint, p_ticket text)
returns public.sessions language plpgsql security definer set search_path = public, extensions as $$
declare s public.sessions;
begin
  select * into s from public.sessions where id = p_session;
  if not found or public._hmac_hex(s.secret, s.id || ':ticket:' || p_exp::text) <> p_ticket then
    raise exception 'invalid_code';
  end if;
  if p_exp < floor(extract(epoch from now()))::bigint then raise exception 'expired_code'; end if;
  if s.revoked or (s.ends_at is not null and now() > s.ends_at) then raise exception 'revoked'; end if;
  return s;
end $$;

create or replace function public.session_info(p_session text, p_slot bigint, p_k text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare s public.sessions; l public.lecturers; e bigint;
begin
  select * into s from public.sessions where id = p_session;
  if not found then raise exception 'invalid_code'; end if;
  if left(public._hmac_hex(s.secret, s.id || ':' || p_slot::text), 12) <> p_k then raise exception 'invalid_code'; end if;
  if abs(floor(extract(epoch from now()) / 30)::bigint - p_slot) > 2 then raise exception 'expired_code'; end if;
  if s.revoked or (s.ends_at is not null and now() > s.ends_at) then raise exception 'revoked'; end if;
  select * into l from public.lecturers where id = s.lecturer_id;
  e := floor(extract(epoch from now()))::bigint + 600;
  return jsonb_build_object('course', s.course, 'title', s.title, 'teacher', l.name,
    'face_required', s.face_required, 'location_mode', s.location_mode, 'radius_m', s.radius_m,
    'exp', e, 'ticket', public._hmac_hex(s.secret, s.id || ':ticket:' || e::text));
end $$;

-- ---------- check-in: smarter face match + per-session rules ----------
-- Remove the old version first (Postgres will not replace it in place).
drop function if exists public.check_in(text, bigint, text, text, jsonb, text, double precision, double precision, double precision);

create or replace function public.check_in(p_session text, p_exp bigint, p_ticket text,
  p_student_id text, p_descriptor jsonb, p_photo text,
  p_lat double precision default null, p_lng double precision default null, p_acc double precision default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  s public.sessions; st public.students; tpl jsonb; probes jsonb; pr jsonb; ot record;
  dclaim double precision; dother double precision := 1e9; dd double precision;
  f int; rec text; photo text; loc text; flag text; dist double precision; a double precision;
  score numeric;
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

  -- ---- face check (only when this session requires it) ----
  if s.face_required then
    if p_descriptor is null or jsonb_typeof(p_descriptor) <> 'array' or jsonb_array_length(p_descriptor) = 0 then
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

    dclaim := public._face_distance(probes, tpl);

    -- Is this face CLOSER to a different enrolled student on this course? Then it is not who they claim.
    for ot in
      select t.descriptors from public.face_templates t
      join public.students o on o.id = t.student_pk
      where o.lecturer_id = s.lecturer_id and o.course = s.course and o.id <> st.id
    loop
      dd := public._face_distance(probes, ot.descriptors);
      if dd < dother then dother := dd; end if;
    end loop;

    if dclaim > s.face_threshold or dother <= dclaim then
      insert into public.checkin_attempts (session_id, student_id, failures) values (s.id, st.student_id, 1)
        on conflict (session_id, student_id) do update set failures = public.checkin_attempts.failures + 1
        returning failures into f;
      if f >= 3 then return jsonb_build_object('status', 'locked'); end if;
      return jsonb_build_object('status', 'mismatch', 'remaining', 3 - f, 'distance', round(dclaim::numeric, 2));
    end if;
    score := round(dclaim::numeric, 3);
  end if;

  -- ---- classroom location ----
  if s.location_mode = 'off' or s.anchor_lat is null then
    loc := 'not_checked';
  elsif p_lat is null or p_lng is null or p_acc is null
        or p_lat not between -90 and 90 or p_lng not between -180 and 180 or p_acc < 0 then
    loc := 'unavailable';
  else
    a := power(sin(radians(p_lat - s.anchor_lat) / 2), 2)
       + cos(radians(s.anchor_lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - s.anchor_lng) / 2), 2);
    dist := 2 * 6371000 * asin(least(1, sqrt(a)));
    if dist <= s.radius_m and p_acc <= 50 and coalesce(s.anchor_acc, 999) <= 50 then
      loc := 'in_class';
    elsif dist - p_acc - coalesce(s.anchor_acc, 0) > s.radius_m then
      loc := 'outside';
    else
      loc := 'uncertain';
    end if;
  end if;

  if s.location_mode = 'block' and loc in ('outside', 'unavailable') then
    return jsonb_build_object('status', 'blocked_location', 'location', loc, 'distance_m', round(dist)::int);
  end if;
  flag := case when loc in ('in_class', 'not_checked') then 'Verified' else 'Flagged' end;

  delete from public.checkin_attempts where session_id = s.id and student_id = st.student_id;
  rec := 'REC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 7));
  photo := case when p_photo like 'data:image/jpeg;base64,%' and length(p_photo) < 200000 then p_photo else null end;
  begin
    insert into public.attendance (session_id, lecturer_id, course, student_id, student_name, dept,
                                   face_photo, receipt_no, status, location_status, distance_m, location_acc, face_score)
    values (s.id, s.lecturer_id, s.course, st.student_id, st.name, st.dept,
            photo, rec, flag, loc, round(dist)::int, round(p_acc)::int, score);
  exception when unique_violation then
    return jsonb_build_object('status', 'already');
  end;
  return jsonb_build_object('status', 'ok', 'receipt_no', rec, 'student_id', st.student_id,
    'name', st.name, 'dept', st.dept, 'created_at', now(),
    'flag', flag, 'location', loc, 'distance_m', round(dist)::int);
end $$;

revoke execute on function public.check_in(text, bigint, text, text, jsonb, text, double precision, double precision, double precision) from public;
grant execute on function public.check_in(text, bigint, text, text, jsonb, text, double precision, double precision, double precision) to anon, authenticated;

-- ---------- enrollment: refuse a face that is already enrolled for someone else ----------
create or replace function public.enroll_face(p_student uuid, p_descriptors jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare st public.students; el jsonb; ot record;
begin
  if not public.is_verified() then raise exception 'not_verified'; end if;
  select * into st from public.students where id = p_student and lecturer_id = auth.uid();
  if not found then raise exception 'not_found'; end if;
  if jsonb_typeof(p_descriptors) <> 'array' or jsonb_array_length(p_descriptors) not between 1 and 10 then
    raise exception 'bad_descriptor';
  end if;
  for el in select jsonb_array_elements(p_descriptors) loop
    if jsonb_typeof(el) <> 'array' or jsonb_array_length(el) <> 128 then raise exception 'bad_descriptor'; end if;
  end loop;

  for ot in
    select t.descriptors from public.face_templates t
    join public.students o on o.id = t.student_pk
    where o.lecturer_id = auth.uid() and o.course = st.course and o.id <> st.id
  loop
    if public._face_distance(p_descriptors, ot.descriptors) < 0.45 then
      raise exception 'duplicate_face';
    end if;
  end loop;

  insert into public.face_templates (student_pk, descriptors) values (p_student, p_descriptors)
    on conflict (student_pk) do update set descriptors = excluded.descriptors, updated_at = now();
  update public.students set face_enrolled = true where id = p_student;
end $$;
