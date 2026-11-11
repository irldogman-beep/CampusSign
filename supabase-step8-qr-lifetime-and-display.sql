-- CampusSign step 8: configurable QR lifetime and server-side expiry enforcement.
-- Run this in Supabase SQL Editor AFTER steps 1–7. Safe to run more than once.
-- Options: 30s (default), 60s, 2m, 5m, 10m, or 0 (static until session closes).

alter table public.sessions
  add column if not exists qr_interval_seconds integer not null default 30;

-- Restrict values to the options exposed by the lecturer's session form.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sessions_qr_interval_seconds_check'
      and conrelid = 'public.sessions'::regclass
  ) then
    alter table public.sessions
      add constraint sessions_qr_interval_seconds_check
      check (qr_interval_seconds in (0, 30, 60, 120, 300, 600));
  end if;
end $$;

-- Validate the signed QR with the interval saved on that particular session.
-- Accept a signed slot within 30 seconds of its scheduled validity window to tolerate
-- small client/server clock differences. The HMAC check above still prevents forgery.
-- For interval 0, slot 0 is a static signed code; revoking/ending the session
-- still invalidates it immediately.
create or replace function public.session_info(p_session text, p_slot bigint, p_k text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s public.sessions;
  l public.lecturers;
  e bigint;
  v_now bigint;
  v_slot_start bigint;
begin
  select * into s from public.sessions where id = p_session;
  if not found then raise exception 'invalid_code'; end if;
  if p_slot is null or p_k is null or length(p_k) <> 12 then
    raise exception 'invalid_code';
  end if;

  if left(public._hmac_hex(s.secret, s.id || ':' || p_slot::text), 12) <> p_k then
    raise exception 'invalid_code';
  end if;

  if s.qr_interval_seconds = 0 then
    if p_slot <> 0 then raise exception 'expired_code'; end if;
  else
    v_now := floor(extract(epoch from now()))::bigint;
    v_slot_start := p_slot * s.qr_interval_seconds;

    -- A QR slot is valid from 30 seconds before its start until 30 seconds
    -- after its end. This accepts only the current or immediately adjacent
    -- slot for the configured intervals, while retaining HMAC authenticity.
    if v_now < (v_slot_start - 30)
      or v_now > (v_slot_start + s.qr_interval_seconds + 30) then
      raise exception 'expired_code';
    end if;
  end if;

  if s.revoked or (s.ends_at is not null and now() > s.ends_at) then
    raise exception 'revoked';
  end if;

  select * into l from public.lecturers where id = s.lecturer_id;
  e := floor(extract(epoch from now()))::bigint + 600;

  return jsonb_build_object(
    'course', s.course,
    'title', s.title,
    'teacher', l.name,
    'face_required', s.face_required,
    'location_mode', s.location_mode,
    'radius_m', s.radius_m,
    'qr_interval_seconds', s.qr_interval_seconds,
    'exp', e,
    'ticket', public._hmac_hex(s.secret, s.id || ':ticket:' || e::text)
  );
end;
$$;

-- Preserve the intended public check-in flow while preventing arbitrary callers.
revoke all on function public.session_info(text, bigint, text) from public;
grant execute on function public.session_info(text, bigint, text) to anon, authenticated;

comment on column public.sessions.qr_interval_seconds is
  'Signed QR rotation interval in seconds. 0 means static until the session is ended or revoked.';
