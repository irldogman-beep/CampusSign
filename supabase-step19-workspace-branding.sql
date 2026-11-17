-- CampusSign: independent Student and Staff workspace branding.
-- Additive only. Existing shared branding fields remain as institution-wide fallbacks.
begin;
alter table public.campus_branding_settings
  add column if not exists student_primary_color text not null default '#064E3B',
  add column if not exists student_accent_color text not null default '#F59E0B',
  add column if not exists student_background_color text not null default '#F8FAFC',
  add column if not exists student_logo_url text,
  add column if not exists staff_primary_color text not null default '#064E3B',
  add column if not exists staff_accent_color text not null default '#F59E0B',
  add column if not exists staff_background_color text not null default '#F8FAFC',
  add column if not exists staff_logo_url text;
alter table public.campus_branding_settings
  drop constraint if exists campus_branding_settings_student_primary_color_check,
  drop constraint if exists campus_branding_settings_student_accent_color_check,
  drop constraint if exists campus_branding_settings_student_background_color_check,
  drop constraint if exists campus_branding_settings_staff_primary_color_check,
  drop constraint if exists campus_branding_settings_staff_accent_color_check,
  drop constraint if exists campus_branding_settings_staff_background_color_check;
alter table public.campus_branding_settings
  add constraint campus_branding_settings_student_primary_color_check check (student_primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint campus_branding_settings_student_accent_color_check check (student_accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint campus_branding_settings_student_background_color_check check (student_background_color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint campus_branding_settings_staff_primary_color_check check (staff_primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint campus_branding_settings_staff_accent_color_check check (staff_accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint campus_branding_settings_staff_background_color_check check (staff_background_color ~ '^#[0-9A-Fa-f]{6}$');
grant update (student_primary_color, student_accent_color, student_background_color, student_logo_url,
              staff_primary_color, staff_accent_color, staff_background_color, staff_logo_url)
on public.campus_branding_settings to authenticated;
commit;
