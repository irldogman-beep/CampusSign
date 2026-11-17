-- CampusSign Step 24: notify students when lecturers review course requests.
-- Additive only. Uses the existing private app_notifications inbox.
begin;

create or replace function public.notify_student_enrollment_request_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_message text;
  v_type text;
begin
  -- A newly submitted request that needs an additional identity check.
  if tg_op = 'INSERT' then
    if new.student_user_id is not null
       and new.status = 'pending'
       and new.duplicate_flagged_at is not null then
      insert into public.app_notifications (
        recipient_id, notification_type, title, message, entity_type, entity_id
      ) values (
        new.student_user_id,
        'student_enrollment_identity_review',
        'Identity check required',
        'Your request to enrol in ' || new.course ||
          ' needs an additional identity check. It is still awaiting lecturer review.',
        'enrollment_request',
        new.id::text
      );
    end if;
    return new;
  end if;

  -- A possible duplicate is flagged after initial submission.
  if old.duplicate_flagged_at is null
     and new.duplicate_flagged_at is not null
     and new.status = 'pending'
     and new.student_user_id is not null then
    insert into public.app_notifications (
      recipient_id, notification_type, title, message, entity_type, entity_id
    ) values (
      new.student_user_id,
      'student_enrollment_identity_review',
      'Identity check required',
      'Your request to enrol in ' || new.course ||
        ' needs an additional identity check. It is still awaiting lecturer review.',
      'enrollment_request',
      new.id::text
    );
  end if;

  -- Notify only on the first final decision for a pending request.
  if old.status = 'pending'
     and new.status in ('approved', 'rejected')
     and new.student_user_id is not null then
    if new.status = 'approved' then
      v_title := 'Course request approved';
      v_message := 'Your request to enrol in ' || new.course ||
        ' has been approved by the lecturer.';
      v_type := 'student_enrollment_approved';
    else
      v_title := 'Course request not approved';
      v_message := 'Your request to enrol in ' || new.course ||
        ' was not approved. Contact the lecturer or your institution if you need clarification.';
      v_type := 'student_enrollment_rejected';
    end if;

    insert into public.app_notifications (
      recipient_id, notification_type, title, message, entity_type, entity_id
    ) values (
      new.student_user_id, v_type, v_title, v_message,
      'enrollment_request', new.id::text
    );
  end if;

  return new;
end;
$$;

revoke all on function public.notify_student_enrollment_request_update()
  from public, anon, authenticated;

drop trigger if exists notify_student_enrollment_request_update
  on public.student_enrollment_requests;

create trigger notify_student_enrollment_request_update
  after insert or update of status, duplicate_flagged_at
  on public.student_enrollment_requests
  for each row
  execute function public.notify_student_enrollment_request_update();

comment on function public.notify_student_enrollment_request_update() is
  'Creates private inbox notifications for the owning student when a course request needs identity review or receives a lecturer decision.';

commit;
