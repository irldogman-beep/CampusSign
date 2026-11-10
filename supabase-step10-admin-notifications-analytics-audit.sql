-- CampusSign Step 10: administrator workspace, in-app notifications, analytics and audit trail.
-- Run AFTER Steps 1-9 in Supabase SQL Editor. Safe to re-run.
-- This migration does NOT create an administrator automatically. See the bootstrap note at the end.

begin;

-- 1) Privileged role. New sign-ups always remain lecturers unless an existing admin
-- explicitly promotes an account in the Supabase SQL editor.
alter table public.lecturers
  add column if not exists role text not null default 'lecturer';

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'lecturers_role_check'
      and conrelid = 'public.lecturers'::regclass
  ) then
    alter table public.lecturers
      add constraint lecturers_role_check check (role in ('lecturer', 'admin'));
  end if;
end $$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select l.role = 'admin' and l.is_verified
    from public.lecturers l
    where l.id = auth.uid()
  ), false)
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- 2) Private in-app notifications. Recipients can read their own notices;
-- admin-role notices are visible only to verified administrators.
create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references auth.users(id) on delete cascade,
  recipient_role text check (recipient_role in ('admin')),
  notification_type text not null,
  title text not null,
  message text not null default '',
  entity_type text,
  entity_id text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint app_notifications_one_recipient check (
    (recipient_id is not null and recipient_role is null)
    or (recipient_id is null and recipient_role = 'admin')
  )
);

alter table public.app_notifications enable row level security;
revoke all on public.app_notifications from anon, authenticated;
grant select on public.app_notifications to authenticated;
drop policy if exists "read own notifications" on public.app_notifications;
create policy "read own notifications" on public.app_notifications
  for select to authenticated
  using (recipient_id = auth.uid() or (recipient_role = 'admin' and public.is_admin()));

create index if not exists app_notifications_user_created_idx
  on public.app_notifications (recipient_id, created_at desc);
create index if not exists app_notifications_role_created_idx
  on public.app_notifications (recipient_role, created_at desc);

create or replace function public.mark_notification_read(p_notification uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.app_notifications
    set read_at = coalesce(read_at, now())
  where id = p_notification
    and (recipient_id = auth.uid() or (recipient_role = 'admin' and public.is_admin()));
  if not found then raise exception 'notification_not_found'; end if;
end $$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql security definer set search_path = public as $$
declare changed integer;
begin
  update public.app_notifications
    set read_at = now()
  where read_at is null
    and (recipient_id = auth.uid() or (recipient_role = 'admin' and public.is_admin()));
  get diagnostics changed = row_count;
  return changed;
end $$;
revoke all on function public.mark_notification_read(uuid) from public, anon;
revoke all on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- 3) Audit events. Deliberately excludes face descriptors, face photos and coordinates.
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id text,
  course text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_events enable row level security;
revoke all on public.audit_events from anon, authenticated;
create index if not exists audit_events_created_idx on public.audit_events (created_at desc);
create index if not exists audit_events_course_created_idx on public.audit_events (course, created_at desc);

create or replace function public._campussign_write_audit(
  p_action text, p_entity_type text, p_entity_id text, p_course text, p_details jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_events (actor_id, actor_email, action, entity_type, entity_id, course, details)
  values (
    auth.uid(),
    nullif(current_setting('request.jwt.claim.email', true), ''),
    p_action, p_entity_type, p_entity_id, p_course, coalesce(p_details, '{}'::jsonb)
  );
end $$;
revoke all on function public._campussign_write_audit(text, text, text, text, jsonb) from public, anon, authenticated;

create or replace function public._campussign_audit_attendance()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if row(old.student_name, old.dept, old.status)
       is distinct from row(new.student_name, new.dept, new.status) then
      perform public._campussign_write_audit(
        'attendance.updated', 'attendance', old.id::text, old.course,
        jsonb_build_object(
          'student_id', old.student_id,
          'receipt_no', old.receipt_no,
          'before', jsonb_build_object('name', old.student_name, 'department', old.dept, 'status', old.status),
          'after', jsonb_build_object('name', new.student_name, 'department', new.dept, 'status', new.status)
        )
      );
    end if;
    return new;
  end if;

  -- Session deletion cascades to attendance. The session-level event records the
  -- whole-list deletion, so do not create one audit row per cascaded check-in.
  if pg_trigger_depth() <= 1 then
    perform public._campussign_write_audit(
      'attendance.deleted', 'attendance', old.id::text, old.course,
      jsonb_build_object('student_id', old.student_id, 'student_name', old.student_name,
                         'receipt_no', old.receipt_no, 'status', old.status)
    );
  end if;
  return old;
end $$;

drop trigger if exists campussign_audit_attendance on public.attendance;
create trigger campussign_audit_attendance
  after update or delete on public.attendance
  for each row execute function public._campussign_audit_attendance();

create or replace function public._campussign_audit_session_delete()
returns trigger language plpgsql security definer set search_path = public as $$
declare checkin_count integer;
begin
  select count(*) into checkin_count from public.attendance where session_id = old.id;
  perform public._campussign_write_audit(
    'attendance_list.deleted', 'session', old.id, old.course,
    jsonb_build_object('session_title', old.title, 'venue', old.venue,
                       'checkins_deleted', checkin_count, 'session_created_at', old.created_at)
  );
  return old;
end $$;

drop trigger if exists campussign_audit_session_delete on public.sessions;
create trigger campussign_audit_session_delete
  before delete on public.sessions
  for each row execute function public._campussign_audit_session_delete();

create or replace function public._campussign_audit_enrollment_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status is distinct from new.status then
    perform public._campussign_write_audit(
      'enrollment.' || new.status, 'enrollment_request', new.id::text, new.course,
      jsonb_build_object('student_id', new.student_id, 'student_name', new.student_name,
                         'from_status', old.status, 'to_status', new.status)
    );
  end if;
  return new;
end $$;

drop trigger if exists campussign_audit_enrollment_review on public.student_enrollment_requests;
create trigger campussign_audit_enrollment_review
  after update of status on public.student_enrollment_requests
  for each row execute function public._campussign_audit_enrollment_review();

create or replace function public._campussign_audit_face_duplicate_override()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._campussign_write_audit(
    'face_duplicate.overridden', 'face_duplicate_review', new.id::text, new.course,
    jsonb_build_object(
      'enrolling_student_id', new.enrolling_student_id,
      'enrolling_student_name', new.enrolling_student_name,
      'candidate_student_id', new.candidate_student_id,
      'candidate_student_name', new.candidate_student_name,
      'descriptor_distance', new.descriptor_distance,
      'override_reason', new.override_reason
    )
  );
  return new;
end $$;

drop trigger if exists campussign_audit_face_duplicate_override on public.face_duplicate_review_audit;
create trigger campussign_audit_face_duplicate_override
  after insert on public.face_duplicate_review_audit
  for each row execute function public._campussign_audit_face_duplicate_override();

create or replace function public._campussign_audit_lecturer_verification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.is_verified is distinct from new.is_verified then
    perform public._campussign_write_audit(
      case when new.is_verified then 'lecturer.verified' else 'lecturer.unverified' end,
      'lecturer', new.id::text, new.course,
      jsonb_build_object('lecturer_name', new.name, 'lecturer_email', new.email,
                         'from_verified', old.is_verified, 'to_verified', new.is_verified)
    );
  end if;
  return new;
end $$;

drop trigger if exists campussign_audit_lecturer_verification on public.lecturers;
create trigger campussign_audit_lecturer_verification
  after update of is_verified on public.lecturers
  for each row execute function public._campussign_audit_lecturer_verification();

-- 4) Notification producers.
create or replace function public._campussign_notify_new_lecturer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.app_notifications (recipient_role, notification_type, title, message, entity_type, entity_id)
  values ('admin', 'lecturer_review', 'New lecturer awaiting review',
          new.name || ' (' || new.email || ') created a lecturer account.', 'lecturer', new.id::text);
  perform public._campussign_write_audit(
    'lecturer.registered', 'lecturer', new.id::text, new.course,
    jsonb_build_object('lecturer_name', new.name, 'lecturer_email', new.email, 'department', new.dept)
  );
  return new;
end $$;

drop trigger if exists campussign_notify_new_lecturer on public.lecturers;
create trigger campussign_notify_new_lecturer
  after insert on public.lecturers
  for each row execute function public._campussign_notify_new_lecturer();

create or replace function public._campussign_notify_lecturer_verification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.is_verified is distinct from new.is_verified then
    insert into public.app_notifications (recipient_id, notification_type, title, message, entity_type, entity_id)
    values (new.id, 'lecturer_verification',
      case when new.is_verified then 'Lecturer account approved' else 'Lecturer access changed' end,
      case when new.is_verified
        then 'Your lecturer profile has been verified. You can now access CampusSign lecturer tools.'
        else 'Your lecturer verification has been withdrawn. Contact the system administrator if you believe this is an error.'
      end,
      'lecturer', new.id::text);
  end if;
  return new;
end $$;

drop trigger if exists campussign_notify_lecturer_verification on public.lecturers;
create trigger campussign_notify_lecturer_verification
  after update of is_verified on public.lecturers
  for each row execute function public._campussign_notify_lecturer_verification();

create or replace function public._campussign_notify_enrollment_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      insert into public.app_notifications (recipient_id, notification_type, title, message, entity_type, entity_id)
      values (new.lecturer_id, 'enrollment_request', 'New student enrolment request',
        new.student_name || ' (' || new.student_id || ') requested enrolment in ' || new.course || '.',
        'enrollment_request', new.id::text);
    end if;
  elsif old.status is distinct from new.status and new.status = 'pending' then
    insert into public.app_notifications (recipient_id, notification_type, title, message, entity_type, entity_id)
    values (new.lecturer_id, 'enrollment_request', 'New student enrolment request',
      new.student_name || ' (' || new.student_id || ') requested enrolment in ' || new.course || '.',
      'enrollment_request', new.id::text);
  end if;
  return new;
end $$;

drop trigger if exists campussign_notify_enrollment_request on public.student_enrollment_requests;
create trigger campussign_notify_enrollment_request
  after insert or update of status on public.student_enrollment_requests
  for each row execute function public._campussign_notify_enrollment_request();

-- 5) Administrator-only RPCs. Functions deliberately return aggregate / profile
-- information only; they never return face descriptors or attendance face photos.
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception 'admin_required'; end if;

  select jsonb_build_object(
    'lecturers_total', (select count(*) from public.lecturers where role = 'lecturer'),
    'lecturers_verified', (select count(*) from public.lecturers where role = 'lecturer' and is_verified),
    'lecturers_pending', (select count(*) from public.lecturers where role = 'lecturer' and not is_verified),
    'student_course_enrolments', (select count(*) from public.students),
    'sessions_total', (select count(*) from public.sessions),
    'sessions_active', (select count(*) from public.sessions s where not s.revoked and (s.ends_at is null or s.ends_at > now())),
    'attendance_total', (select count(*) from public.attendance),
    'attendance_today', (select count(*) from public.attendance a where a.created_at::date = current_date),
    'courses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'course', c.course,
        'lecturers', (select count(*) from public.lecturers l where l.role = 'lecturer' and l.course = c.course),
        'students', (select count(*) from public.students st where st.course = c.course),
        'sessions', (select count(*) from public.sessions s where s.course = c.course),
        'attendance_30d', (select count(*) from public.attendance a where a.course = c.course and a.created_at >= now() - interval '30 days')
      ) order by c.course)
      from (
        select distinct course from public.lecturers where role = 'lecturer' and nullif(trim(course), '') is not null
        union select distinct course from public.students where nullif(trim(course), '') is not null
        union select distinct course from public.sessions where nullif(trim(course), '') is not null
        union select distinct course from public.attendance where nullif(trim(course), '') is not null
      ) c
    ), '[]'::jsonb)
  ) into result;
  return result;
end $$;

create or replace function public.admin_list_lecturers()
returns table (
  lecturer_id uuid, name text, email text, dept text, course text,
  is_verified boolean, created_at timestamptz
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_required'; end if;
  return query
    select l.id, l.name, l.email, l.dept, l.course, l.is_verified, l.created_at
    from public.lecturers l
    where l.role = 'lecturer'
    order by l.is_verified asc, l.created_at desc;
end $$;

create or replace function public.admin_set_lecturer_verification(p_lecturer uuid, p_verified boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare updated_id uuid;
begin
  if not public.is_admin() then raise exception 'admin_required'; end if;
  update public.lecturers
    set is_verified = p_verified
  where id = p_lecturer and role = 'lecturer'
  returning id into updated_id;
  if updated_id is null then raise exception 'lecturer_not_found'; end if;
  return jsonb_build_object('lecturer_id', updated_id, 'is_verified', p_verified);
end $$;

create or replace function public.admin_recent_audit(p_limit integer default 50)
returns table (
  id uuid, action text, entity_type text, entity_id text,
  actor_email text, course text, details jsonb, created_at timestamptz
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_required'; end if;
  return query
    select a.id, a.action, a.entity_type, a.entity_id,
           a.actor_email, a.course, a.details, a.created_at
    from public.audit_events a
    order by a.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 100));
end $$;

revoke all on function public.admin_overview() from public, anon;
revoke all on function public.admin_list_lecturers() from public, anon;
revoke all on function public.admin_set_lecturer_verification(uuid, boolean) from public, anon;
revoke all on function public.admin_recent_audit(integer) from public, anon;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_list_lecturers() to authenticated;
grant execute on function public.admin_set_lecturer_verification(uuid, boolean) to authenticated;
grant execute on function public.admin_recent_audit(integer) to authenticated;

comment on table public.audit_events is
  'Immutable application audit history for lecturer verification, attendance edits/deletions, session-list deletion and enrolment decisions. Contains no biometric descriptors, photographs or raw coordinates.';
comment on table public.app_notifications is
  'Private in-app notifications for lecturers and administrator accounts.';

commit;

-- ADMIN BOOTSTRAP (run separately, replacing the email with your own verified
-- staff account email). This is intentionally NOT executed by the migration:
-- update public.lecturers
--   set role = 'admin', is_verified = true
-- where lower(email) = lower('YOUR_ADMIN_EMAIL');
--
-- Verify that exactly one account was promoted:
-- select id, name, email, role, is_verified from public.lecturers
-- where lower(email) = lower('YOUR_ADMIN_EMAIL');
