# CampusSign — Step 11: Academic catalogue

## What this release changes

CampusSign now has a centrally managed academic structure. Administrators can create and edit departments and courses from the Admin Workspace. Existing free-text department/course values are backfilled into the new catalogue without deleting or rewriting legacy student, lecturer, session, attendance or biometric rows.

### Lecturer onboarding

The lecturer registration form now loads departments and courses from the catalogue. A lecturer chooses a department and can select one or more courses they teach. The first selected course remains the compatibility/default course for older parts of the data model; all selected courses are recorded in `lecturer_course_assignments`. A lecturer's tools remain blocked until administrator verification.

The lecturer dashboard includes an active-course selector when multiple courses have been assigned. The current selected course controls the existing course-specific attendance and roster views.

### Student self-enrolment

Students choose a department from active catalogue departments. Course choices are then limited to active courses in that department that have at least one verified lecturer assigned. Students may select only the courses they are actually registered for; they do not have to select every course in the department. The existing face-capture and lecturer approval workflow remains in place.

### Admin workspace

A new **Departments & courses** section provides forms and searchable lists for maintaining the catalogue. The existing overview, lecturer verification, notifications and audit-history sections remain available.

## Database migration

Run `supabase-step11-academic-catalog.sql` in Supabase SQL Editor **after Steps 1–10**. The migration is transactional and designed to be re-runnable. It creates:

- `academic_departments`
- `academic_courses`
- `lecturer_course_assignments`

It also creates catalogue/admin RPCs, backfills existing department/course names, updates the Auth profile trigger to record selected lecturer course assignments, and replaces `submit_student_enrollment` so student requests are routed through the normalized catalogue and verified lecturer assignments.

The migration does not intentionally delete existing records. As with any production schema change, inspect any SQL error and stop rather than retrying a partially modified script.

## Important compatibility note

The existing application data model still stores a course label on legacy student, session, attendance and lecturer rows. The catalogue's display label is `COURSECODE - Course title`, matching the existing convention. The lecturer profile's `course` field continues to represent the default course; the normalized assignment table is the source for the complete set of courses taught.

## Recommended rollout

1. Keep the current `main` branch unchanged; work on `campussign-admin-release`.
2. Apply Step 11 in Supabase.
3. Confirm `catalog_departments()` and `catalog_courses(null)` return expected rows while signed in as admin.
4. Check that existing departments/courses were backfilled correctly.
5. Register a test lecturer, selecting two catalogue courses. Confirm their account remains unverified until approved.
6. Verify the lecturer and confirm the active-course selector appears.
7. Test student self-enrolment with a department and a subset of courses. Confirm requests reach only verified lecturers assigned to those selected courses.
8. Test admin create/edit/deactivate for one test department/course before making real catalogue changes.
9. Build and test the Cloudflare preview before merging to production.

## Safety and operational notes

- Do not delete catalogue departments/courses that have dependent assignments; deactivate them instead.
- Do not expose face descriptors or biometric photos in catalogue/admin RPCs.
- The first administrator bootstrap from Step 10 remains unchanged.
- Step 11 does not change face-recognition thresholds or attendance QR settings.
