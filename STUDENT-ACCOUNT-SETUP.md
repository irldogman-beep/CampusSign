# Student accounts and dashboard (Steps 13–14)

## Approval order

CampusSign now uses a strict two-stage approval sequence for student self-registration:

1. A student creates an account with their student ID, registered name, department, level, email and password.
2. An administrator reviews the identity details first. Existing roster matches are shown as supporting information, but a new student does not need a lecturer-created roster row before administrator approval.
3. Only after administrator approval can the student submit course selections and face registration.
4. The database creates lecturer enrolment requests and notifications only for an approved student account.
5. The relevant lecturer reviews each course request. The request is also checked against the approved student account inside the lecturer list and review RPCs.
6. Once lecturers approve courses, they appear in the student's dashboard and can be used for the existing attendance workflow.

## What is enforced

- `submit_student_enrollment` requires an authenticated student account with status `approved`, and verifies the submitted student ID, full name, department and level against that account.
- `list_my_enrollment_requests` only returns requests that match an approved student account.
- `review_student_enrollment` independently checks the same approval and identity match, so a lecturer cannot approve a hidden or legacy request by calling the RPC directly.
- `admin_review_student_account` no longer waits for a lecturer-approved roster row. This removes the circular dependency and makes administrator approval the first gate.
- Existing student roster, face-template and attendance rows are not modified by this migration.
- Existing pending requests without an approved matching student account remain hidden from lecturer queues until the account is approved.

## Existing students

An existing student can create an account using the same student ID, full registered name, department and level already held by the institution. The administrator can check the existing roster matches and approve the account first. Once approved, the dashboard can show the existing courses and attendance history without requiring duplicate course requests.

## Student accounts and dashboard

- Student sign-up and sign-in use Supabase Auth email/password.
- The Auth trigger creates a separate `student_accounts` row. Student metadata does not grant lecturer privileges.
- Student account rows are not directly exposed through the Data API. Student and admin data is returned through authenticated, role-checked database functions.
- Pending and rejected accounts do not receive course or attendance dashboard data.
- Administrators can publish announcements to approved student accounts.
- The existing QR check-in process remains available as a separate attendance workflow.
- Face matching accuracy remains a separate future improvement.

## Rollout

The Step 14 migration has been applied to the connected CampusSign Supabase project. It changes approval gates only; it does not create accounts or alter existing attendance and roster data.
