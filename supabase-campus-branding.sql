-- CampusSign branding settings and logo storage
-- Additive migration. Does not touch attendance, enrolment, account or biometric data.

create table if not exists public.campus_branding_settings (
  id smallint primary key default 1 check (id = 1),
  brand_name text not null default 'CampusSign' check (char_length(brand_name) between 2 and 48),
  tagline text not null default 'Attendance, clearly verified.' check (char_length(tagline) between 2 and 100),
  logo_url text,
  primary_color text not null default '#064E3B' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color text not null default '#F59E0B' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  background_color text not null default '#F8FAFC' check (background_color ~ '^#[0-9A-Fa-f]{6}$'),
  student_app_name text not null default 'CampusSign Student' check (char_length(student_app_name) between 2 and 48),
  staff_app_name text not null default 'CampusSign Staff Workspace' check (char_length(staff_app_name) between 2 and 64),
  student_welcome text not null default 'Your classes, attendance and student services in one place.' check (char_length(student_welcome) between 2 and 180),
  staff_welcome text not null default 'Attendance, academic records and campus operations in one workspace.' check (char_length(staff_welcome) between 2 and 180),
  support_email text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.campus_branding_settings (id) values (1) on conflict (id) do nothing;
alter table public.campus_branding_settings enable row level security;
revoke all on public.campus_branding_settings from anon, authenticated;
grant select on public.campus_branding_settings to anon, authenticated;
grant update (brand_name, tagline, logo_url, primary_color, accent_color, background_color, student_app_name, staff_app_name, student_welcome, staff_welcome, support_email, updated_at, updated_by)
on public.campus_branding_settings to authenticated;

drop policy if exists "Campus branding is publicly readable" on public.campus_branding_settings;
create policy "Campus branding is publicly readable" on public.campus_branding_settings
for select to anon, authenticated using (true);

drop policy if exists "Only administrators can update campus branding" on public.campus_branding_settings;
create policy "Only administrators can update campus branding" on public.campus_branding_settings
for update to authenticated using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campus-branding', 'campus-branding', true, 2097152, array['image/png','image/jpeg','image/webp']::text[])
on conflict (id) do update set public=true, file_size_limit=2097152, allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Campus branding assets are publicly readable" on storage.objects;
create policy "Campus branding assets are publicly readable" on storage.objects
for select to anon, authenticated using (bucket_id='campus-branding');

drop policy if exists "Administrators can upload campus branding assets" on storage.objects;
create policy "Administrators can upload campus branding assets" on storage.objects
for insert to authenticated with check (bucket_id='campus-branding' and public.is_admin());

drop policy if exists "Administrators can update campus branding assets" on storage.objects;
create policy "Administrators can update campus branding assets" on storage.objects
for update to authenticated using (bucket_id='campus-branding' and public.is_admin())
with check (bucket_id='campus-branding' and public.is_admin());

drop policy if exists "Administrators can delete campus branding assets" on storage.objects;
create policy "Administrators can delete campus branding assets" on storage.objects
for delete to authenticated using (bucket_id='campus-branding' and public.is_admin());

comment on table public.campus_branding_settings is
'Singleton public CampusSign visual branding and app identity configuration; updates are restricted to verified administrators.';
