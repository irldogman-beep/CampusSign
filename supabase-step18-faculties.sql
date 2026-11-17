-- CampusSign Step 18: faculties and department hierarchy.
-- Applied to production on 2026-11-17. Additive only: existing department,
-- course, lecturer, student, attendance and biometric records are preserved.
begin;

create table if not exists public.academic_faculties (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_faculties_code_format check (code ~ '^[A-Z0-9_-]{2,12}$'),
  constraint academic_faculties_name_length check (length(trim(name)) between 2 and 120)
);

alter table public.academic_departments
  add column if not exists faculty_id uuid references public.academic_faculties(id) on delete restrict;

create index if not exists academic_departments_faculty_active_idx
  on public.academic_departments(faculty_id, is_active, name);

alter table public.academic_faculties enable row level security;
revoke all on public.academic_faculties from anon, authenticated;
grant select on public.academic_faculties to anon, authenticated;
grant insert, update, delete on public.academic_faculties to authenticated;

drop policy if exists academic_faculties_read_active on public.academic_faculties;
create policy academic_faculties_read_active on public.academic_faculties
for select to anon, authenticated using (is_active or public.is_admin());
drop policy if exists academic_faculties_admin_insert on public.academic_faculties;
create policy academic_faculties_admin_insert on public.academic_faculties
for insert to authenticated with check (public.is_admin());
drop policy if exists academic_faculties_admin_update on public.academic_faculties;
create policy academic_faculties_admin_update on public.academic_faculties
for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists academic_faculties_admin_delete on public.academic_faculties;
create policy academic_faculties_admin_delete on public.academic_faculties
for delete to authenticated using (public.is_admin());

grant update (faculty_id) on public.academic_departments to authenticated;
drop policy if exists academic_departments_admin_assign_faculty on public.academic_departments;
create policy academic_departments_admin_assign_faculty on public.academic_departments
for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop function if exists public.catalog_departments();
create function public.catalog_departments()
returns table(id uuid, code text, name text, is_active boolean, faculty_id uuid, faculty_name text)
language sql stable security definer set search_path = public as $$
  select d.id, d.code, d.name, d.is_active, d.faculty_id, f.name
  from public.academic_departments d
  left join public.academic_faculties f on f.id = d.faculty_id
  where d.is_active or public.is_admin()
  order by f.name nulls last, d.name
$$;

create or replace function public.catalog_faculties()
returns table(id uuid, code text, name text, is_active boolean)
language sql stable security invoker set search_path = public as $$
  select f.id, f.code, f.name, f.is_active
  from public.academic_faculties f
  where f.is_active or public.is_admin()
  order by f.name
$$;

grant execute on function public.catalog_departments() to anon, authenticated;
grant execute on function public.catalog_faculties() to anon, authenticated;

commit;
