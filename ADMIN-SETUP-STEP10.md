# CampusSign administrator setup — Step 10

This guide applies to the release that introduces the administrator workspace, in-app notifications, attendance analytics and audit history.

## Before you start

- Confirm Supabase Steps 1–9 have already been applied.
- Take a backup of the live Supabase project before applying any new SQL to a production database.
- Keep the existing Cloudflare deployment active while testing.
- Use an email account that you control and that has already registered through the CampusSign lecturer registration flow.

## 1. Apply Step 10

1. Open the correct Supabase project.
2. Open **SQL Editor** and choose **New query**.
3. Open `supabase-step10-admin-notifications-analytics-audit.sql` from this project folder.
4. Paste the complete file into the SQL Editor.
5. Run it and inspect the result. It is designed to be re-runnable, but still back up production data first.

The migration adds:

- A `role` column on `public.lecturers`; every existing and future account defaults to `lecturer`.
- A private `public.app_notifications` table and read-state RPC functions.
- An `public.audit_events` table with triggers for attendance edits/deletions, whole attendance-list deletion, enrolment decisions and lecturer verification changes.
- Administrator-only RPCs for aggregate analytics, lecturer listing, lecturer verification and recent audit history.

It does not promote anyone automatically. This is intentional: a public sign-up must never be able to grant itself administrator privileges.

## 2. Promote your own account to administrator

Use an account that has already registered and confirmed its email. In Supabase SQL Editor, replace the email in the following command with the exact email of your own account:

```sql
update public.lecturers
set role = 'admin', is_verified = true
where lower(email) = lower('YOUR-ADMIN-EMAIL@YOUR-INSTITUTION.EDU');
```

Check the result:

```sql
select id, name, email, role, is_verified
from public.lecturers
where lower(email) = lower('YOUR-ADMIN-EMAIL@YOUR-INSTITUTION.EDU');
```

Confirm that exactly one row is returned and that `role` is `admin` and `is_verified` is `true`.

**Do not promote a shared account or an account that other people use.** Keep administrator access limited to trusted staff. Do not add an admin sign-up option to the public-facing application.

## 3. Sign in

1. Sign out of CampusSign if you are already signed in.
2. Sign back in with the promoted account.
3. Open the **Lecturer Portal** / staff login.
4. After successful login, the account's `role` routes it to the Administrator Workspace.

The administrator workspace provides:

- **Overview:** lecturer counts, pending verification, student-course roster entries, attendance records, sessions, courses, and last-30-day activity by course.
- **Lecturers:** search staff and verify or withdraw verification for lecturer accounts. Administrators are excluded from this list.
- **Audit history:** recent sensitive changes. Audit details intentionally exclude face descriptors, face photos and raw location coordinates.
- **Notifications:** new lecturer account requests and other in-app notices. Notices are currently in-app only; there is no email, SMS or push delivery in this release.

## 4. Important definitions and limitations

- “Student-course enrolments” counts roster rows. A student enrolled in three courses contributes three rows; it is not a unique-person count.
- Course activity counts check-in records created in the last 30 days. It is a volume indicator, not an attendance percentage.
- The “today” count uses the database server's date/time context; check the Supabase project timezone if it differs from the institution's local day.
- Audit events start only after Step 10 is installed. Historical actions are not reconstructed.
- If notification or audit queries fail, check that the migration completed successfully and that the signed-in user's profile has `role = 'admin'` and `is_verified = true` where applicable.
- The audit history is append-only through the application: normal authenticated users are not granted direct insert, update or delete privileges on the audit table.
- This step does not configure automatic database backups. Keep a separate, encrypted Supabase data backup and test restoration. Never put a `service_role` key or database password in frontend code, GitHub or the flash-drive package.

## 5. Rollback guidance

Do not delete the `role`, `app_notifications` or `audit_events` tables as a first response to a UI problem. First roll back the frontend deployment to the last known-good Git commit. The migration is additive and should not interfere with existing lecturer/student attendance flows. If a database rollback is genuinely required, take a fresh backup and have a database administrator review dependencies before dropping functions, triggers or tables.
