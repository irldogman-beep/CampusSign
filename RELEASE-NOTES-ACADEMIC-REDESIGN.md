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

## Validation
- TypeScript/TSX syntax transpilation completed for App.tsx, AdminWorkspace.tsx and db.ts.
- Full dependency installation timed out in this environment; full Vite build and browser tests remain outstanding.
- Step 11 SQL has been reviewed structurally but has not been executed against the user's live Supabase project.
