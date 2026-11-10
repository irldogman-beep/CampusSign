-- CampusSign step 2: students, faces, sessions, attendance (+ server-side QR and face checks)
-- Paste ALL of this into Supabase > SQL Editor > New query > Run. Safe to run twice.

create extension if not exists pgcrypto with schema extensions;

-- Is the signed-in user an administrator-approved lecturer?
create or replace function public.is_verified() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_verified from public.lecturers where id = auth.uid()), false)
$$;

-- ---------- tables ----------
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  lecturer_id uuid not null default auth.uid() references public.lecturers(id) on delete cascade,
  course text not null,
  student_id text not null,
  name text not null,
  dept text not null default '',
  level text not null default '',
  face_enrolled boolean not null default false,
  created_at timestamptz not null default now(),
  unique (lecturer_id, course, student_id)
);

create table if not exists public.face_templates (
  student_pk uuid primary key references public.students(id) on delete cascade,
  descriptors jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id text primary key default ('SESS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  lecturer_id uuid not null default auth.uid() references public.lecturers(id) on delete cascade,
  course text not null,
  title text not null default '',
  venue text not null default '',
  secret text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references public.sessions(id) on delete cascade,
  lecturer_id uuid not null references public.lecturers(id) on delete cascade,
  course text not null,
  student_id text not null,
  student_name text not null,
  dept text not null default '',
  face_photo text,
  receipt_no text not null,
  status text not null default 'Verified',
  created_at timestamptz not null default now(),
  unique (session_id, student_id)
);

create table if not exists public.checkin_attempts (
  session_id text not null references public.sessions(id) on delete cascade,
  student_id text not null,
  failures int not null default 0,
  primary key (session_id, student_id)
);

-- ---------- row level security ----------
alter table public.students enable row level security;
alter table public.face_templates enable row level security;
alter table public.sessions enable row level security;
alter table public.attendance enable row level security;
alter table public.checkin_attempts enable row level security;

-- Face templates and attempt counters: NO policies = nobody can touch them
-- directly from the website. Only the functions below can.
revoke all on public.face_templates, public.checkin_attempts from anon, authenticated;
revoke all on public.students, public.sessions, public.attendance from anon;

drop policy if exists "own students read" on public.students;
drop policy if exists "own students add" on public.students;
drop policy if exists "own students delete" on public.students;
create policy "own students read" on public.students for select to authenticated
  using (lecturer_id = auth.uid() and public.is_verified());
create policy "own students add" on public.students for insert to authenticated
  with check (lecturer_id = auth.uid() and public.is_verified() and face_enrolled = false);
create policy "own students delete" on public.students for delete to authenticated
  using (lecturer_id = auth.uid() and public.is_verified());

drop policy if exists "own sessions read" on public.sessions;
drop policy if exists "own sessions add" on public.sessions;
drop policy if exists "own sessions update" on public.sessions;
create policy "own sessions read" on public.sessions for select to authenticated
  using (lecturer_id = auth.uid() and public.is_verified());
create policy "own sessions add" on public.sessions for insert to authenticated
  with check (lecturer_id = auth.uid() and public.is_verified());
create policy "own sessions update" on public.sessions for update to authenticated
  using (lecturer_id = auth.uid() and public.is_verified())
  with check (lecturer_id = auth.uid() and public.is_verified());

drop policy if exists "own attendance read" on public.attendance;
drop policy if exists "own attendance delete" on public.attendance;
create policy "own attendance read" on public.attendance for select to authenticated
  using (lecturer_id = auth.uid() and public.is_verified());
create policy "own attendance delete" on public.attendance for delete to authenticated
  using (lecturer_id = auth.uid() and public.is_verified());
-- (No insert policy: attendance can only be created by check_in() below.)

-- ---------- internal helpers (not callable from the website) ----------
create or replace function public._hmac_hex(k text, m text) returns text
language sql immutable set search_path = public, extensions as $$
  select encode(extensions.hmac(convert_to(m, 'utf8'), convert_to(k, 'utf8'), 'sha256'), 'hex')
$$;

create or replace function public._check_ticket(p_session text, p_exp bigint, p_ticket text)
returns public.sessions language plpgsql security definer set search_path = public, extensions as $$
declare s public.sessions;
begin
  select * into s from public.sessions where id = p_session;
  if not found or public._hmac_hex(s.secret, s.id || ':ticket:' || p_exp::text) <> p_ticket then
    raise exception 'invalid_code';
  end if;
  if p_exp < floor(extract(epoch from now()))::bigint then raise exception 'expired_code'; end if;
  if s.revoked then raise exception 'revoked'; end if;
  return s;
end $$;

revoke execute on function public._hmac_hex(text, text) from public, anon, authenticated;
revoke execute on function public._check_ticket(text, bigint, text) from public, anon, authenticated;

-- ---------- functions the website calls ----------

-- 1) Student scans the rotating QR: server checks the signature + freshness,
--    and hands back a 10-minute ticket for the rest of the check-in.
create or replace function public.session_info(p_session text, p_slot bigint, p_k text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare s public.sessions; l public.lecturers; e bigint;
begin
  select * into s from public.sessions where id = p_session;
  if not found then raise exception 'invalid_code'; end if;
  if left(public._hmac_hex(s.secret, s.id || ':' || p_slot::text), 12) <> p_k then raise exception 'invalid_code'; end if;
  if abs(floor(extract(epoch from now()) / 30)::bigint - p_slot) > 2 then raise exception 'expired_code'; end if;
  if s.revoked then raise exception 'revoked'; end if;
  select * into l from public.lecturers where id = s.lecturer_id;
  e := floor(extract(epoch from now()))::bigint + 600;
  return jsonb_build_object('course', s.course, 'title', s.title, 'teacher', l.name,
    'exp', e, 'ticket', public._hmac_hex(s.secret, s.id || ':ticket:' || e::text));
end $$;

-- 2) Student types their ID: must be on this course's roster.
create or replace function public.lookup_student(p_session text, p_exp bigint, p_ticket text, p_student_id text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare s public.sessions; st public.students; f int;
begin
  s := public._check_ticket(p_session, p_exp, p_ticket);
  select * into st from public.students
    where lecturer_id = s.lecturer_id and course = s.course and upper(student_id) = upper(trim(p_student_id));
  if not found then raise exception 'not_found'; end if;
  if exists (select 1 from public.attendance where session_id = s.id and student_id = st.student_id) then
    raise exception 'already';
  end if;
  select failures into f from public.checkin_attempts where session_id = s.id and student_id = st.student_id;
  if coalesce(f, 0) >= 3 then raise exception 'locked'; end if;
  return jsonb_build_object('student_id', st.student_id, 'name', st.name, 'dept', st.dept,
    'level', st.level, 'face_enrolled', st.face_enrolled);
end $$;

-- 3) Face check happens HERE, so the stored face template never leaves the database.
create or replace function public.check_in(p_session text, p_exp bigint, p_ticket text,
  p_student_id text, p_descriptor jsonb, p_photo text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  s public.sessions; st public.students; tpl jsonb; samp jsonb;
  best double precision := 1e9; d double precision; i int; f int; rec text; photo text;
  threshold constant double precision := 0.55;
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

  if jsonb_typeof(p_descriptor) <> 'array' or jsonb_array_length(p_descriptor) <> 128 then
    raise exception 'bad_descriptor';
  end if;
  select descriptors into tpl from public.face_templates where student_pk = st.id;
  if tpl is null then return jsonb_build_object('status', 'not_enrolled'); end if;

  for samp in select jsonb_array_elements(tpl) loop
    d := 0;
    for i in 0..127 loop
      d := d + power((samp->>i)::double precision - (p_descriptor->>i)::double precision, 2);
    end loop;
    d := sqrt(d);
    if d < best then best := d; end if;
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
  return jsonb_build_object('status', 'mismatch', 'remaining', 3 - f);
end $$;

-- 4) Lecturer enrolls a student's face (stored only in face_templates).
create or replace function public.enroll_face(p_student uuid, p_descriptors jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare st public.students; el jsonb;
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
  insert into public.face_templates (student_pk, descriptors) values (p_student, p_descriptors)
    on conflict (student_pk) do update set descriptors = excluded.descriptors, updated_at = now();
  update public.students set face_enrolled = true where id = p_student;
end $$;

revoke execute on function public.session_info(text, bigint, text) from public;
revoke execute on function public.lookup_student(text, bigint, text, text) from public;
revoke execute on function public.check_in(text, bigint, text, text, jsonb, text) from public;
revoke execute on function public.enroll_face(uuid, jsonb) from public, anon;
grant execute on function public.session_info(text, bigint, text) to anon, authenticated;
grant execute on function public.lookup_student(text, bigint, text, text) to anon, authenticated;
grant execute on function public.check_in(text, bigint, text, text, jsonb, text) to anon, authenticated;
grant execute on function public.enroll_face(uuid, jsonb) to authenticated;
