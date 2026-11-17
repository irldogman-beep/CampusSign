-- CampusSign Step 23: authenticated students can track their own course requests.
-- Additive only: preserves existing requests and biometric templates.
begin;

alter table public.student_enrollment_requests
  add column if not exists student_user_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'student_enrollment_requests_student_user_id_fkey'
      and conrelid = 'public.student_enrollment_requests'::regclass
  ) then
    alter table public.student_enrollment_requests
      add constraint student_enrollment_requests_student_user_id_fkey
      foreign key (student_user_id) references public.student_accounts(user_id)
      on delete set null;
  end if;
end $$;

-- Backfill only unambiguous matches from the approved account identity.
update public.student_enrollment_requests r
set student_user_id = (
  select sa.user_id
  from public.student_accounts sa
  where sa.status = 'approved'
    and upper(btrim(sa.student_id)) = upper(btrim(r.student_id))
    and lower(btrim(sa.full_name)) = lower(btrim(r.student_name))
    and lower(btrim(sa.department)) = lower(btrim(r.dept))
)
where r.student_user_id is null
  and (
    select count(*)
    from public.student_accounts sa
    where sa.status = 'approved'
      and upper(btrim(sa.student_id)) = upper(btrim(r.student_id))
      and lower(btrim(sa.full_name)) = lower(btrim(r.student_name))
      and lower(btrim(sa.department)) = lower(btrim(r.dept))
  ) = 1;

create index if not exists student_enrollment_requests_student_user_idx
  on public.student_enrollment_requests (student_user_id, created_at desc)
  where student_user_id is not null;

-- The existing submit_student_enrollment RPC already verifies the approved account.
-- This trigger binds each inserted request to the authenticated account without
-- changing the existing submission RPC or exposing biometric descriptors.
create or replace function public.bind_student_enrollment_request_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_account public.student_accounts;
begin
  if auth.uid() is null then
    raise exception 'student_account_required';
  end if;

  select * into v_account
  from public.student_accounts
  where user_id = auth.uid();

  if not found or v_account.status <> 'approved' then
    raise exception 'student_account_not_approved';
  end if;

  if upper(btrim(new.student_id)) <> upper(btrim(v_account.student_id))
     or lower(btrim(new.student_name)) <> lower(btrim(v_account.full_name))
     or lower(btrim(new.dept)) <> lower(btrim(v_account.department)) then
    raise exception 'student_account_details_mismatch';
  end if;

  new.student_user_id := auth.uid();
  return new;
end;
$$;

drop trigger if exists bind_student_enrollment_request_owner
  on public.student_enrollment_requests;
create trigger bind_student_enrollment_request_owner
  before insert on public.student_enrollment_requests
  for each row execute function public.bind_student_enrollment_request_owner();

revoke all on function public.bind_student_enrollment_request_owner() from public, anon, authenticated;

-- Return only non-biometric request metadata belonging to the signed-in student.
create or replace function public.student_list_enrollment_requests()
returns table (
  id uuid,
  course text,
  lecturer_name text,
  status text,
  created_at timestamptz,
  reviewed_at timestamptz,
  needs_identity_review boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  if not exists (
    select 1 from public.student_accounts sa
    where sa.user_id = auth.uid() and sa.status = 'approved'
  ) then
    raise exception 'student_account_not_approved';
  end if;

  return query
  select r.id,
         r.course,
         coalesce(l.name, 'Lecturer')::text,
         r.status,
         r.created_at,
         r.reviewed_at,
         (r.duplicate_flagged_at is not null)
  from public.student_enrollment_requests r
  left join public.lecturers l on l.id = r.lecturer_id
  where r.student_user_id = auth.uid()
  order by r.created_at desc;
end;
$$;

revoke all on function public.student_list_enrollment_requests() from public, anon;
grant execute on function public.student_list_enrollment_requests() to authenticated;

commit;
