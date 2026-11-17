-- CampusSign configurable academic structure
-- Non-destructive: adds institution-configurable academic calendars, levels,
-- admission cohorts, student progression profiles, and course-attempt history.
-- Existing attendance, enrolment, student and lecturer records are not rewritten.

create table if not exists public.academic_structure_settings (
  id smallint primary key default 1 check (id = 1),
  education_type text not null default 'university'
    check (education_type in ('secondary','college','university','custom')),
  level_label text not null default 'Level',
  period_label text not null default 'Academic year',
  term_label text not null default 'Semester',
  terms_per_period smallint not null default 2 check (terms_per_period between 1 and 4),
  progression_mode text not null default 'manual'
    check (progression_mode in ('manual','review_required')),
  updated_at timestamptz not null default now()
);

insert into public.academic_structure_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.academic_levels (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  sequence integer not null unique check (sequence > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(code)) between 1 and 24),
  check (length(trim(name)) between 1 and 80)
);

-- Preserve existing catalogue level labels as configurable levels.
insert into public.academic_levels (code, name, sequence)
select
  upper(regexp_replace(trim(level), '[^A-Za-z0-9]+', '_', 'g')),
  trim(level),
  row_number() over (order by trim(level))
from (
  select distinct level
  from public.academic_courses
  where level is not null and length(trim(level)) > 0
) existing_levels
where upper(regexp_replace(trim(level), '[^A-Za-z0-9]+', '_', 'g')) <> ''
on conflict (code) do nothing;

create table if not exists public.academic_periods (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  starts_on date,
  ends_on date,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on),
  check (length(trim(name)) between 1 and 80)
);

create unique index if not exists academic_periods_one_current_idx
  on public.academic_periods (is_current) where is_current = true;

create table if not exists public.academic_terms (
  id uuid primary key default gen_random_uuid(),
  academic_period_id uuid not null references public.academic_periods(id) on delete restrict,
  name text not null,
  sequence smallint not null check (sequence between 1 and 4),
  starts_on date,
  ends_on date,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academic_period_id, name),
  unique (academic_period_id, sequence),
  check (ends_on is null or starts_on is null or ends_on >= starts_on),
  check (length(trim(name)) between 1 and 80)
);

create unique index if not exists academic_terms_one_current_per_period_idx
  on public.academic_terms (academic_period_id) where is_current = true;

create table if not exists public.student_cohorts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  admission_year text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(name)) between 1 and 100),
  check (length(trim(admission_year)) between 4 and 20)
);

create table if not exists public.student_academic_profiles (
  student_user_id uuid primary key references public.student_accounts(user_id) on delete restrict,
  cohort_id uuid references public.student_cohorts(id) on delete restrict,
  current_level_id uuid references public.academic_levels(id) on delete restrict,
  academic_status text not null default 'active'
    check (academic_status in ('active','inactive','withdrawn','expelled','graduating','graduated')),
  status_reason text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.student_progression_events (
  id uuid primary key default gen_random_uuid(),
  student_user_id uuid not null references public.student_accounts(user_id) on delete restrict,
  from_level_id uuid references public.academic_levels(id) on delete restrict,
  to_level_id uuid references public.academic_levels(id) on delete restrict,
  event_type text not null check (event_type in ('promoted','repeated','transferred','returned','status_changed','initial_assignment')),
  effective_on date not null default current_date,
  note text,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.student_course_attempts (
  id uuid primary key default gen_random_uuid(),
  student_user_id uuid not null references public.student_accounts(user_id) on delete restrict,
  course_id uuid not null references public.academic_courses(id) on delete restrict,
  academic_term_id uuid not null references public.academic_terms(id) on delete restrict,
  attempt_number smallint not null default 1 check (attempt_number between 1 and 20),
  status text not null default 'registered'
    check (status in ('registered','in_progress','passed','failed','withdrawn')),
  grade text,
  result_note text,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_user_id, course_id, attempt_number)
);

create index if not exists student_academic_profiles_cohort_idx
  on public.student_academic_profiles (cohort_id);
create index if not exists student_academic_profiles_level_idx
  on public.student_academic_profiles (current_level_id);
create index if not exists student_progression_events_student_date_idx
  on public.student_progression_events (student_user_id, effective_on desc);
create index if not exists student_course_attempts_student_idx
  on public.student_course_attempts (student_user_id, created_at desc);
create index if not exists student_course_attempts_course_idx
  on public.student_course_attempts (course_id, status);

alter table public.academic_structure_settings enable row level security;
alter table public.academic_levels enable row level security;
alter table public.academic_periods enable row level security;
alter table public.academic_terms enable row level security;
alter table public.student_cohorts enable row level security;
alter table public.student_academic_profiles enable row level security;
alter table public.student_progression_events enable row level security;
alter table public.student_course_attempts enable row level security;

drop policy if exists academic_structure_settings_read on public.academic_structure_settings;
create policy academic_structure_settings_read on public.academic_structure_settings
  for select to anon, authenticated using (true);
drop policy if exists academic_structure_settings_admin_write on public.academic_structure_settings;
create policy academic_structure_settings_admin_write on public.academic_structure_settings
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists academic_levels_read_active on public.academic_levels;
create policy academic_levels_read_active on public.academic_levels
  for select to anon, authenticated using (is_active or (select public.is_admin()));
drop policy if exists academic_levels_admin_write on public.academic_levels;
create policy academic_levels_admin_write on public.academic_levels
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists academic_periods_read on public.academic_periods;
create policy academic_periods_read on public.academic_periods
  for select to anon, authenticated using (true);
drop policy if exists academic_periods_admin_write on public.academic_periods;
create policy academic_periods_admin_write on public.academic_periods
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists academic_terms_read on public.academic_terms;
create policy academic_terms_read on public.academic_terms
  for select to anon, authenticated using (true);
drop policy if exists academic_terms_admin_write on public.academic_terms;
create policy academic_terms_admin_write on public.academic_terms
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists student_cohorts_read_active on public.student_cohorts;
create policy student_cohorts_read_active on public.student_cohorts
  for select to anon, authenticated using (is_active or (select public.is_admin()));
drop policy if exists student_cohorts_admin_write on public.student_cohorts;
create policy student_cohorts_admin_write on public.student_cohorts
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists student_academic_profiles_admin_all on public.student_academic_profiles;
create policy student_academic_profiles_admin_all on public.student_academic_profiles
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists student_academic_profiles_student_read on public.student_academic_profiles;
create policy student_academic_profiles_student_read on public.student_academic_profiles
  for select to authenticated using (student_user_id = (select auth.uid()));

drop policy if exists student_progression_events_admin_all on public.student_progression_events;
create policy student_progression_events_admin_all on public.student_progression_events
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists student_progression_events_student_read on public.student_progression_events;
create policy student_progression_events_student_read on public.student_progression_events
  for select to authenticated using (student_user_id = (select auth.uid()));

drop policy if exists student_course_attempts_admin_all on public.student_course_attempts;
create policy student_course_attempts_admin_all on public.student_course_attempts
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists student_course_attempts_student_read on public.student_course_attempts;
create policy student_course_attempts_student_read on public.student_course_attempts
  for select to authenticated using (student_user_id = (select auth.uid()));

grant select on public.academic_structure_settings, public.academic_levels, public.academic_periods,
  public.academic_terms, public.student_cohorts to anon, authenticated;
grant insert, update, delete on public.academic_structure_settings, public.academic_levels,
  public.academic_periods, public.academic_terms, public.student_cohorts,
  public.student_academic_profiles, public.student_progression_events,
  public.student_course_attempts to authenticated;
grant select on public.student_academic_profiles, public.student_progression_events,
  public.student_course_attempts to authenticated;


-- Enforce academic lifecycle status at the student dashboard boundary.
-- Existing accounts without a progression profile remain unaffected.
create or replace function public.student_get_dashboard()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
declare
  v_account public.student_accounts;
  v_academic public.student_academic_profiles;
  v_courses jsonb;
  v_attendance jsonb;
  v_course_attempts jsonb;
  v_unread integer;
  v_cohort_name text;
  v_level_name text;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select * into v_account from public.student_accounts where user_id=auth.uid();
  if not found then raise exception 'student_account_not_found'; end if;

  select * into v_academic from public.student_academic_profiles where student_user_id=auth.uid();
  if found then
    if v_academic.academic_status in ('inactive','withdrawn','expelled','graduated') then
      raise exception 'student_account_inactive';
    end if;
    select name into v_cohort_name from public.student_cohorts where id=v_academic.cohort_id;
    select name into v_level_name from public.academic_levels where id=v_academic.current_level_id;
  end if;

  if v_account.status <> 'approved' then
    return jsonb_build_object(
      'profile',jsonb_build_object(
        'student_id',v_account.student_id,'full_name',v_account.full_name,
        'department',v_account.department,'level',v_account.level,'status',v_account.status,
        'academic_status',coalesce(v_academic.academic_status,'active'),
        'admission_set',v_cohort_name,'current_level',v_level_name
      ),
      'courses','[]'::jsonb,'attendance','[]'::jsonb,'course_attempts',coalesce(v_course_attempts,'[]'::jsonb),'unread_notifications',0
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'course',s.course,'lecturer',coalesce(l.name,'Lecturer'),
      'face_enrolled',s.face_enrolled
    ) order by s.course), '[]'::jsonb)
  into v_courses
  from public.students s
  left join public.lecturers l on l.id=s.lecturer_id
  where upper(btrim(s.student_id))=upper(btrim(v_account.student_id))
    and lower(btrim(s.name))=lower(btrim(v_account.full_name))
    and lower(btrim(s.dept))=lower(btrim(v_account.department));

  select coalesce(jsonb_agg(jsonb_build_object(
      'id',sca.id,'course_code',ac.code,'course_title',ac.title,
      'term',at.name,'academic_period',ap.name,'attempt_number',sca.attempt_number,
      'status',sca.status,'grade',sca.grade,'result_note',sca.result_note,
      'created_at',sca.created_at
    ) order by sca.created_at desc), '[]'::jsonb)
  into v_course_attempts
  from public.student_course_attempts sca
  join public.academic_courses ac on ac.id=sca.course_id
  join public.academic_terms at on at.id=sca.academic_term_id
  join public.academic_periods ap on ap.id=at.academic_period_id
  where sca.student_user_id=auth.uid();

  select coalesce(jsonb_agg(jsonb_build_object(
      'id',a.id,'course',a.course,'session_id',a.session_id,
      'status',a.status,'created_at',a.created_at,'receipt_no',a.receipt_no,
      'location_status',a.location_status
    ) order by a.created_at desc), '[]'::jsonb)
  into v_attendance
  from public.students s
  join public.attendance a
    on a.lecturer_id=s.lecturer_id
   and a.course=s.course
   and upper(btrim(a.student_id))=upper(btrim(s.student_id))
  where upper(btrim(s.student_id))=upper(btrim(v_account.student_id))
    and lower(btrim(s.name))=lower(btrim(v_account.full_name))
    and lower(btrim(s.dept))=lower(btrim(v_account.department));

  select count(*) into v_unread from public.app_notifications
   where recipient_id=auth.uid() and read_at is null;

  return jsonb_build_object(
    'profile',jsonb_build_object(
      'student_id',v_account.student_id,'full_name',v_account.full_name,
      'department',v_account.department,'level',v_account.level,'status',v_account.status,
      'academic_status',coalesce(v_academic.academic_status,'active'),
      'admission_set',v_cohort_name,'current_level',v_level_name
    ),
    'courses',v_courses,'attendance',v_attendance,'course_attempts',coalesce(v_course_attempts,'[]'::jsonb),'unread_notifications',v_unread
  );
end;
$function$;
