# CampusSign Academic Management Redesign

## Release scope
- Reworked the Admin Workspace navigation to include an Academic Catalogue area.
- Added department create/edit and active/inactive management.
- Added course create/edit, department association, level metadata and active/inactive management.
- Added Step 11 database migration with normalized department/course tables and lecturer-course assignments.
- Backfilled legacy department/course values without deleting legacy records.
- Lecturer sign-up now selects catalogue departments and multiple offered courses.
- Lecturer course assignments are created by the Supabase Auth profile trigger; lecturer tools remain gated by verification.
- Lecturer portal can switch its active course when multiple assignments exist.
- Student self-enrolment now selects a catalogue department and only sees available assigned courses for that department; course selection remains optional per course (at least one required).
- Student enrolment submission validates the selected department/course against the catalogue and routes each request to verified assigned lecturers.

## Not included / follow-up
- Bulk import of departments and courses from CSV.
- Academic session/semester and programme/year-level curriculum mapping.
- Lecturer assignment approval workflow for adding/removing courses after account creation.
- Student course add/drop after initial approval.
- Comprehensive automated end-to-end tests against a staging Supabase project.

## Code Review & Bug Fixes (Completed)
- **Resolved anonymous access block on catalogue courses**: Fixed `supabase-step11-academic-catalog.sql` where `catalog_courses` was only granted to `authenticated`. Now granted to `anon, authenticated`, allowing unauthenticated prospective lecturers to load departments and courses on the registration form without crashing.
- **Fixed false `course_unavailable` error during student enrolment**: In `submit_student_enrollment`, when a student is already enrolled on all requested courses, the system now properly throws `already_enrolled` instead of misleading students with `course_unavailable`.
- **Strengthened backfill SQL against check constraint failures**: Added defensive fallback padding (`rpad`) in `supabase-step11-academic-catalog.sql` so legacy course codes with < 2 characters will not fail the `academic_courses_code_format` constraint during backfill.
- **Enhanced Admin Workspace editing UX**: Added explicit "Cancel edit" state management for both Department and Course forms so admins are not locked into edit mode. Dynamic button labels now distinguish between "Save/Create" and "Update".
- **Added Active/Inactive visibility**: Department and Course lists in Admin Workspace now display clear color-coded status badges (`Active` / `Inactive`).
- **Enhanced lecturer multi-course view in Admin table**: Updated `admin_list_lecturers()` to aggregate all assigned courses for each lecturer instead of only showing their single legacy primary course.
- **Course-filtered session dropdown**: Filtered attendance session dropdown in lecturer view to only display sessions for their currently selected course.
- **Manual student enrolment multi-course support**: In the manual "Add Student" modal, course selection now dynamically pulls from the lecturer's full set of assigned courses (`assignedCourses`).
- **Comprehensive error mapping**: Added user-friendly explanations in `src/db.ts` for catalogue validation constraints (code formatting, duplicate department/course names).
- **Documentation & repo hygiene**: Updated `README.md` and `FLASH-DRIVE-CONTENTS.txt` to include Step 11 in the migration sequence, and removed orphan `.tmp` files.

## Validation
- Syntax and bracket balance validation passed for `App.tsx`, `AdminWorkspace.tsx`, `db.ts`, `CameraParts.tsx`, `QRDisplayWindow.tsx`, `main.tsx`, `geo.ts`, `auth.ts`, `face.ts`, `checkin.ts`, and `supabase.ts`.
- TypeScript syntax verified cleanly using Node.js strip-types.
- Step 11 SQL reviewed for idempotency, constraint safety, and permissions.
