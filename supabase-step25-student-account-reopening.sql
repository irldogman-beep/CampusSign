-- CampusSign Step 25: safely reopen rejected student-account reviews.
-- This does not approve accounts or alter student roster/attendance records.
create or replace function public.admin_reopen_student_account(
  p_user_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.student_accounts;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if (select auth.uid()) is null or not public.is_admin() then
    raise exception 'admin_required';
  end if;
  if length(v_reason) < 10 or length(v_reason) > 500 then
    raise exception 'reopen_reason_required';
  end if;

  select * into v_account
  from public.student_accounts
  where user_id = p_user_id
  for update;
  if not found then raise exception 'student_account_not_found'; end if;
  if v_account.status <> 'rejected' then raise exception 'student_account_not_rejected'; end if;

  update public.student_accounts
  set status = 'pending', reviewed_at = null, reviewed_by = null
  where user_id = p_user_id;

  insert into public.audit_events (
    actor_id, actor_email, action, entity_type, entity_id, details
  ) values (
    (select auth.uid()),
    (select auth.jwt() ->> 'email'),
    'student_account.reopened',
    'student_account',
    p_user_id::text,
    jsonb_build_object('student_id', v_account.student_id, 'name', v_account.full_name, 'reason', v_reason)
  );

  insert into public.app_notifications (
    recipient_id, notification_type, title, message, entity_type, entity_id
  ) values (
    p_user_id, 'student_account_reopened', 'Student account review reopened',
    'An administrator has reopened your account for another review. Your Student workspace remains locked until the account is approved.',
    'student_account', p_user_id::text
  );

  return jsonb_build_object('status', 'pending', 'user_id', p_user_id);
end;
$$;

revoke all on function public.admin_reopen_student_account(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_reopen_student_account(uuid, text) to authenticated;

comment on function public.admin_reopen_student_account(uuid, text) is
  'Allows an authenticated administrator to return a rejected student account to pending review. Requires a reason, records an audit event and notifies the student. Does not grant access or modify academic/attendance data.';
