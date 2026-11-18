# CampusSign Step 30 — Attendance as an optional CA component

Step 30 connects attendance sessions to the academic catalogue and uses verified check-ins when a lecturer enables attendance weighting for a course and term.

## Starting a linked attendance session

When the lecturer's assigned course matches the central catalogue, the session form asks for:
- The academic term / semester
- An optional teaching group, or the whole-course / combined class

The session stores its academic course, term and optional teaching-group scope. Existing legacy sessions remain available and are backfilled only where their course label and date range identify exactly one catalogue course and term.

## Attendance calculation

Attendance score = verified sessions attended / linked sessions held × 100

For each student on the relevant course or teaching-group roster, only linked sessions in the selected course, term and teaching-group scope count. A verified, present or late attendance record counts as attended. Sessions with no check-ins still count as held sessions, so a student who missed the whole class receives zero for those sessions.

## Weighting

The existing CA and examination weights still add up to 100%. Attendance is optional and takes a portion of the CA allocation.

For example, if CA is 40%, examination is 60%, and attendance takes 10 percentage points from CA:
- Assessment CA contributes 30 percentage points
- Attendance contributes 10 percentage points
- Examination contributes 60 percentage points

The lecturer's CA assessment components still add up to 100% within the remaining CA portion.

If attendance weighting is enabled but no linked sessions exist for the course, term and group, result submission is blocked with a clear message. The lecturer can link and record sessions or turn attendance weighting off.

## Student and administrator views

Published results now include the attendance percentage when it was used. The admin review preview shows the same breakdown. If attendance was not part of the course result, the attendance row is omitted.

## Data safety

- The migration adds nullable academic scope columns to sessions and an optional attendance score to result entries.
- Existing attendance rows and published result sheets are preserved.
- Existing sessions are backfilled only when the catalogue course and academic term match unambiguously.
- Sessions without an academic catalogue match can still be used for attendance, but are not counted in academic result calculations.