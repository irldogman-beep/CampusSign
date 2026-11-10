-- CampusSign, step 1: lecturer accounts.
-- Paste into Supabase > SQL Editor > New query > Run.

create table if not exists public.lecturers (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null,
  dept text not null default '',
  course text not null default '',
  is_verified boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.lecturers enable row level security;

-- A signed-in lecturer can read ONLY their own profile.
-- There are deliberately no insert/update/delete policies, so nobody can
-- verify themselves or edit their profile from the website. Only you can,
-- from the Supabase dashboard.
drop policy if exists "read own profile" on public.lecturers;
create policy "read own profile" on public.lecturers
  for select to authenticated using (id = auth.uid());

-- Automatically create the profile when someone registers.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.lecturers (id, email, name, dept, course)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'dept', ''),
    coalesce(new.raw_user_meta_data->>'course', '')
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
