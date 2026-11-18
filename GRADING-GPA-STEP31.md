# CampusSign Step 31 — Configurable grading, credits and transcript GPA

Step 31 adds institution-controlled grade boundaries, course credit units and repeat-course GPA rules.

## Grading scale

Administrators define the scale name, maximum grade point and active score bands. Each band has a grade code, description, inclusive score range, grade point and optional classification. Active ranges cannot overlap.

CampusSign does not force a universal 5-point or 4-point grading system. The institution must configure its own grade bands. If a published score does not fit any active band, publication is blocked until the scale is corrected.

## Course credit units

Administrators assign credit units to each active catalogue course. A course left at zero units remains visible in the transcript but is excluded from GPA/CGPA until its credit units are configured.

Published results snapshot the grade code, grade point and credit units. Changing the grading scale or course credit units later does not silently rewrite past results.

Administrators can explicitly apply the current scale and course credits to previously published results using the regrade action. This changes only the grade/grade-point/credit snapshots; it does not change final scores or attendance records.

## GPA and CGPA

- Term GPA uses the latest graded attempt for each course within that term.
- CGPA follows the institution's configured repeated-course rule:
  - Latest attempt
  - Highest grade achieved
  - All attempts
- Failed graded attempts with a grade point of zero contribute to GPA according to the selected rule.
- Unpublished or ungraded attempts and courses with zero credit units do not contribute.

Progression and promotion remain separate explicit administrator decisions. GPA does not automatically promote, repeat or expel a student.

## Student transcript

The student workspace displays CGPA, term GPA, credits earned, credits counted, outstanding carryovers and a course-by-course attempt history. Historical failed attempts remain visible. Only the latest failed attempt for a course is marked as the active carryover.

## Data safety

- The migration is additive and preserves existing course records, published scores and attempts.
- Grade and credit values are snapshotted on publication.
- Historical published results can be regraded only through an explicit administrator action.
- No default institution-specific grade bands are inserted; the institution must configure its own grading rules.