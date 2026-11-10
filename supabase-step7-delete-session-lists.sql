-- CampusSign step 7: delete complete, closed attendance lists.
-- Run in Supabase SQL Editor after steps 1-6. Safe to run more than once.
--
-- A session owns its attendance rows and check-in attempt counters through
-- ON DELETE CASCADE foreign keys (created in step 2). Deleting a session therefore
-- removes the whole saved attendance list, not just one student's row.
--
-- Only verified lecturers may delete their own sessions, and live sessions are
-- protected at the database level. A session must be revoked/ended or past ends_at.

grant delete on public.sessions to authenticated;

drop policy if exists "own sessions delete" on public.sessions;
create policy "own sessions delete" on public.sessions
  for delete to authenticated
  using (
    lecturer_id = auth.uid()
    and public.is_verified()
    and (
      revoked = true
      or (ends_at is not null and ends_at <= now())
    )
  );
