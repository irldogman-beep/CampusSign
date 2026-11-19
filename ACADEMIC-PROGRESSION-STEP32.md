# CampusSign Step 32 — Academic progression and eligibility

## What this adds

Step 32 builds on the existing academic levels, admission cohorts, student academic profiles, course attempts, carryovers and progression history.

Administrators can configure progression rules using the institution's own policy:
- Minimum CGPA (optional)
- Maximum outstanding carryovers (optional)
- Minimum cumulative earned credits (optional)
- Optional probation CGPA and carryover limits for conditional promotion

At least one normal eligibility rule must be configured before a review can be generated. No institutional thresholds are seeded or assumed.

## How a review works

1. Configure academic levels and the institution's official grading scale.
2. Assign credit units to catalogue courses.
3. Create an academic period and its terms.
4. Publish graded course results for the period.
5. Set progression rules and generate the review for that period.
6. CampusSign calculates each approved student's CGPA using the institution's configured repeat policy, earned credits, and current outstanding carryovers.
7. An administrator reviews the recommendation and explicitly promotes, promotes on probation, repeats, holds, declines, or marks a final-level student as graduated.

Refreshing a review recalculates pending decisions only. Decisions already made are preserved.

## Safety and history

- Promotion is never automatic.
- Promotion is blocked for students marked ineligible or missing required academic data.
- Probation promotion is recorded as a distinct event and leaves the student workspace accessible.
- Repeating a level keeps the current level and records a progression event.
- Graduation is available only after a final-level completion review.
- Every promotion, probation promotion, repeat and graduation decision is recorded in `student_progression_events`.
- Existing course attempts, results, attendance, admission cohorts and progression history are retained.
- Progression policy and review tables have RLS enabled and direct client table access revoked. Admin-only RPCs enforce `auth.uid()` and `is_admin()`.

## Eligibility calculations

- CGPA follows the existing grading scale and repeat policy (`latest_attempt`, `highest_grade` or `all_attempts`).
- Cumulative earned credits are counted once per passed course.
- Outstanding carryovers count the latest failed attempt per course.
- A student needs at least one recorded attempt in the selected period and a calculable CGPA before eligibility can be assessed.
- Students without a current academic level need their academic profile completed first.
- A student at the highest configured level is sent to completion review rather than being promoted to a non-existent level.

## Current institution setup

At the time Step 32 was prepared, the live project had 7 active courses, 1 active academic level, and no academic periods, terms, student academic profiles, progression events or course attempts. Therefore no live eligibility decisions can be generated until the institution's academic calendar, grading scale, course credits, student profiles and published results are configured.
