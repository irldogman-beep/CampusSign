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
