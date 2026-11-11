# CampusSign Step 12 — Security hardening and admin workspace

Run `supabase-step12-security-hardening.sql` in the Supabase SQL Editor after Steps 1–11.

This migration is transactional and safe to re-run. It does not delete existing student, attendance, session, or enrolment records.

## What it changes

- Restricts direct attendance updates for authenticated lecturers to `student_name`, `dept`, and `status`; the existing row-level policy still restricts them to their own rows.
- Adds an audit actor-email fallback for current Supabase JWT claim formats.
- Adds server-side enrolment throttling: at most 5 submissions per student ID per hour and, when a source IP header is available, 120 submissions per source IP per hour. The IP and student identifiers are stored as hashes. This is an interim anti-flood measure, not proof of identity.
- Adds administrator-only read views for student-course enrolments, recent attendance and recent sessions.
- Adds an administrator-only RPC to inspect existing lecturer course assignments, used by the new Manage courses action.

## QR clock-drift fix

The revised `supabase-step8-qr-lifetime-and-display.sql` accepts a valid signed QR slot from 30 seconds before its scheduled start until 30 seconds after its scheduled end. The signature is still checked using the session secret. Re-run the revised Step 8 SQL after earlier Step 8 versions have been applied.

## Admin workspace improvements

- Dashboard summary tiles now navigate to their relevant sections.
- Student-course enrolments, attendance records and sessions have dedicated read-only admin views.
- Administrators can manage the course assignments of existing lecturers as well as create departments and courses.
- Notification menus render in a top-level portal so they are not clipped by cards, sticky headers or overflow containers.
- Browser alert/confirm popups are replaced with in-app toast messages and a themed confirmation dialog.
- Live check-in count animation and a brief optional success vibration/pulse are included.

## Important deployment order

1. Confirm Steps 1–10 have already been applied.
2. Apply the corrected `supabase-step11-academic-catalog.sql` only if Step 11 has not already completed successfully. If it already completed, do not rerun it just for the UI changes.
3. Re-run the revised Step 8 SQL to replace the QR validation function.
4. Run `supabase-step12-security-hardening.sql` once.
5. Build and test the updated frontend, then deploy it.

Do not paste service-role keys into `.env`; the browser app must use the public publishable/anon key and rely on RLS and server-side functions.
