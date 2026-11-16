# Student accounts and dashboard (Step 13)

## What this adds

- Student sign-up and sign-in using Supabase Auth email/password.
- A separate `student_accounts` profile, created by the Auth trigger. Student metadata never grants roles or database access.
- Pending / approved / rejected account verification.
- Admin review against the existing approved lecturer roster using student ID, full registered name, and department.
- A protected student dashboard showing approved courses, lecturer names, attendance history, unread notification count, and student-wide announcements.
- An administrator can publish announcements to all approved student accounts as well as the existing lecturer audiences.

## Student onboarding flow

1. A student creates an account with their student ID, registered name, department, level, email, and password.
2. If email confirmation is enabled, they confirm the email before signing in.
3. The student submits course enrolment and face registration through the existing Student Portal flow. The lecturer(s) approve the course requests as before.
4. An administrator opens **Student accounts** and verifies the account. Approval is enabled only when at least one lecturer-approved roster row matches the student's ID, name, and department.
5. The student signs in and sees their approved courses and attendance history.

Existing student roster and attendance records are not automatically assigned to accounts based on student ID alone. The admin approval check also compares the registered name and department. This is important because the existing roster contains a small number of repeated student IDs associated with different names.

## Important behaviour

- Student accounts are separate from lecturer profiles. The Auth trigger branches on the sign-up metadata account type; it does not give a student lecturer privileges.
- Student account rows are not directly exposed through the Data API. Student and admin data is returned through authenticated, role-checked database functions.
- A student cannot see dashboard records while the account is pending or rejected.
- An account cannot be approved until at least one course roster record has been approved by a lecturer.
- The existing QR check-in process remains available and does not require a student account.
- This first account release does not add password reset UI or institutional SSO. Use Supabase Auth email confirmation and password recovery settings.
- Face matching accuracy remains a separate future improvement.

## Rollout notes

The database migration has already been applied to the connected CampusSign Supabase project. It creates no student account rows and does not modify existing roster, face-template, or attendance records. New accounts are created only when students use the new sign-up screen.
