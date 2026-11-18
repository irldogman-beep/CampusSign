# CampusSign Step 28 — Course result submission and publication

This migration adds a controlled course-result workflow on top of the existing lecturer-managed assessment components.

## Workflow

1. A verified lecturer records every CA and examination component mark for the selected course, academic term and teaching group.
2. Component weights within each category must total 100% for every category with a non-zero course allocation.
3. The lecturer submits the complete result sheet. CampusSign snapshots each student's CA category score, examination category score and final weighted score.
4. An administrator reviews the submitted sheet and either approves or rejects it with an optional note.
5. Only an approved sheet can be published.
6. Students see final course results only after publication. Raw component marks remain available in the lecturer workspace for academic work.

## Calculation

Each component contributes `(raw score / maximum score) × component weight` to its category score. The final score is:

`CA category score × CA course weight / 100 + examination category score × examination course weight / 100`

The course policy must retain its configured 100% CA/examination split.

## Safety and limitations

- The migration is additive; it does not delete or rewrite existing assessment marks.
- Result sheets are unique per course, term and teaching group (including the course-wide roster).
- Submission is blocked when any required component mark is missing.
- Approved and published sheets cannot be silently resubmitted.
- Attendance weighting is intentionally blocked at result submission until an attendance-to-assessment scoring source is implemented. This avoids publishing an incomplete or misleading total when attendance has been enabled in the policy.
- Grade bands, GPA/CGPA, progression, carryover/repeat registration and transcript history are not part of Step 28; they are follow-on work.
- Result tables have RLS enabled and no direct authenticated table grants. Access is through authenticated RPCs that enforce lecturer/admin/student scope.

## Apply

Apply `supabase-step28-course-results-publication.sql` to the CampusSign Supabase project after reviewing the SQL. Then deploy the matching frontend build.
