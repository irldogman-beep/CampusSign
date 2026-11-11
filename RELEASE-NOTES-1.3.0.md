# CampusSign 1.3.0 — Admin and security hardening

## Admin workspace
- Reworked dashboard navigation so summary tiles open relevant sections.
- Added dedicated read-only admin views for student-course enrolments, attendance and sessions.
- Added course-assignment management for existing lecturers.
- Moved notification menus to a document-level portal to prevent clipping and stacking issues.

## Reliability and security
- Corrected the missing character in `.env.example`'s public Supabase key.
- QR validation now tolerates 30 seconds of clock drift either side of a signed slot's validity window.
- Added Step 12 column-level attendance update privileges, audit actor-email fallback and interim per-student/IP enrolment throttling.
- Replaced browser alert/confirm dialogs with in-app toasts and a themed confirmation dialog.
- Added a live check-in counter animation and an optional short success vibration/pulse.

## Database
- Use the corrected Step 11 migration only if Step 11 has not already completed.
- Re-run revised Step 8 to replace QR validation.
- Apply Step 12 after Step 11.

## Verification status
- TypeScript/TSX transpilation syntax check passed.
- Full dependency install and production build could not be completed in this environment because `npm install` timed out.
- Supabase SQL has not been executed against the live project; apply the migrations in the documented order and verify the results before deploying.
