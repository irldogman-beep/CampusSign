# CampusSign Step 29 — Published results and carryover synchronization

Step 29 connects the approved result workflow to the existing university course-attempt history.

## What happens when results are published

- The institution's configured pass mark (default 40%) determines whether each published course attempt is recorded as passed or failed.
- CampusSign writes the published final score and result-sheet reference into the student's course-attempt history.
- A failed attempt is recorded as a carryover.
- When the student retakes the course in a later term, the next attempt number is generated from that student's previous attempts for the same course.
- A later passing attempt remains a new historical attempt; earlier failed attempts are not deleted.
- Student dashboard attempt history now includes the final score from the published result.

## Administration

The pass mark is configured in Admin → Academic structure. It is not a grade-point scale and does not calculate GPA/CGPA. Grade bands, credit-unit weighting, GPA/CGPA and transcript generation remain a separate phase because institutions use different grading systems.

## Safety

- Existing manually recorded course attempts are retained. If an attempt already exists for the same student, course and term, publication updates that record rather than creating a duplicate for the same term.
- Published result sheets remain immutable through the current workflow.
- A student cannot receive two different published result sheets for the same course and term through the same attempt record.
- The migration is additive and does not delete academic history.
