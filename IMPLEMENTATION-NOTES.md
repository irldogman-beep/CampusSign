# CampusSign — implementation notes

## What's new in this build

- Students can create their profile from the Student Portal, choose multiple available courses, and enrol a face template on their own device.
- Every selected course creates a request for each verified lecturer assigned to that exact course. If multiple verified lecturers teach the same course, each gets their own request.
- Requests are delivered to the lecturer's in-app **Requests** inbox. The inbox refreshes automatically. This is an in-app queue, not an email notification service.
- A lecturer must approve each request before the student is added to that lecturer's course roster. Approval transfers the biometric template into the protected face-template table; the face data is never returned in the request-list API.
- Pending lecturer accounts are held at a restricted approval screen. Existing database row-level security continues to block lecturer features until `lecturers.is_verified = true`.
- Lecturers can edit attendance name, department, and status, or delete an individual attendance record. They can also delete an entire saved attendance list/session; this permanently cascades to every check-in and related check-in-attempt row in that session. Live sessions must be ended or expire before deletion. Student ID, course, receipt reference, and original check-in time remain fixed when editing an individual record.
- Added lightweight page transitions, reduced-motion support, clearer enrolment progress, an enrolment inbox, and dashboard summary cards.

## Supabase migration

Run `supabase-step6-self-enrollment.sql` in Supabase SQL Editor **after** steps 1–5. This migration creates the private request table and secure RPCs, and adds a verified-lecturer-only attendance update policy. Then run `supabase-step7-delete-session-lists.sql` to enable secure deletion of complete, closed attendance lists.

Students only see courses listed on verified lecturer profiles. The current data model assigns one course string to each lecturer profile; the migration handles multiple lecturers with the same course string by creating a separate request for each lecturer.

## Lecturer verification

An administrator verifies a lecturer from Supabase by setting their row in `public.lecturers` to `is_verified = true`. For example:

```sql
update public.lecturers
set is_verified = true
where email = 'lecturer@university.edu';
```

Do not expose an unrestricted verification control in the public lecturer portal.

## Deployment / smoke test

1. Apply steps 1–5 if the project has not already been configured, then apply step 6.
2. Verify at least one lecturer and make sure the lecturer's `course` value is the exact course label students should select.
3. Deploy the updated Vite app.
4. Open the Student Portal, create a student profile, select one or more courses, and complete face capture.
5. Sign in as each relevant verified lecturer, open **Requests**, and approve the new request.
6. Confirm the student appears in that lecturer's roster and can complete the normal QR check-in flow.
7. In a session attendance log, test editing and deleting one record. Then select a closed session and test **Delete entire list**; confirm all its student check-ins disappear while other sessions remain untouched. Verify the delete button is disabled for the currently live session.
8. Create a lecturer account that is not verified and confirm it sees only the pending-verification screen. Confirm the same account cannot read/write lecturer data directly through Supabase because the existing RLS policies reject it.

## Build verification note

The source files were syntax-transpiled successfully with the TypeScript compiler. A complete `vite build` could not be run in this environment because project dependencies were not installed and the package installation attempt timed out. Run `npm install` and `npm run build` in the project environment before deploying.
