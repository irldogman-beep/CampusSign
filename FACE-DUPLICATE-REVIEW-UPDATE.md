# CampusSign — Face duplicate review update

## What was found

The previous student self-enrolment approval function compared the submitted five-frame face descriptor set against face templates already enrolled on the same lecturer's exact course. If its calculated distance was below `0.45`, it raised `duplicate_face` immediately. The lecturer received only a generic error; no candidate roster entry was shown and there was no reviewed exception path.

The threshold must not be changed casually. The face-api library's `FaceMatcher` documents a default distance threshold of `0.6`; CampusSign's `0.45` duplicate-screening threshold is stricter. Simply increasing it would widen the range of faces treated as possible matches and could increase false positives. The actual descriptor values in the live Supabase project were not available during this review, so the exact roster entry that triggered the earlier report cannot be established from source inspection alone.

## New behaviour

1. The server still checks only the verified lecturer's own roster for the exact course on the enrolment request.
2. A distance below `0.45` now returns `possible_duplicate` rather than rejecting the student.
3. The server stores the closest candidate's name and student ID on the pending request. These details are returned only through the verified lecturer's own request-inbox RPC; biometric descriptors are never returned.
4. The lecturer must compare the student's official university identity in person. If they establish that the two people are different, they can select **Confirm different person & approve** and enter a short reason.
5. The server recomputes the match during the final approval and records the override in `face_duplicate_review_audit`. The audit stores the distance, candidate/student references, lecturer, course and reason, but no biometric descriptors or photos.
6. If the lecturer cannot verify identity confidently, they should reject the request and ask the student to submit a fresh face capture. Rejected requests have their face descriptors cleared.

## Capture-quality protection

Face capture now uses `detectAllFaces` when collecting final samples. It refuses the capture if more than one face is visible. For student enrolment, it also checks that each of the five descriptors has a close neighbour among the other samples from the same capture. An inconsistent capture is rejected with a retry instruction rather than saved as a potentially mixed template.

## Database migration

Apply `supabase-step9-face-duplicate-review.sql` in Supabase SQL Editor **after steps 1–8**. Take a database backup first. The migration:

- adds candidate-match metadata to `student_enrollment_requests`;
- creates a restricted `face_duplicate_review_audit` table;
- updates the verified lecturer's request-inbox RPC to return the possible-match identity fields;
- replaces `review_student_enrollment` with the two-stage review/approval flow;
- keeps face descriptors private and clears them after approval or rejection.

Do not rerun steps 1–8 just to apply this change. Apply Step 9 once; it is written to be safely re-runnable.

## Deployment and retest

1. Apply Step 9 in Supabase.
2. Commit the updated `src/App.tsx`, `src/CameraParts.tsx`, `src/db.ts`, `src/face.ts`, README, and Step 9 migration to the connected GitHub `main` branch (or replace the project with this updated ZIP).
3. Wait for Cloudflare to report **Ready**.
4. Have the previously affected student submit a fresh request if their earlier request was rejected. A rejected request's old descriptors were deliberately cleared.
5. Approve the request. If a possible match is returned, check the student's official university ID in person and verify that the person differs from the named roster candidate. Use the override only after that check and enter a reason.
6. Confirm the student is added to the correct course roster and can complete normal face-verified attendance.
7. Test a new student whose face is not on the roster; they should proceed without a duplicate warning.
8. Test a true duplicate using an already-enrolled face and ensure that the lecturer gets a warning and the override is recorded only if they explicitly confirm a different identity.
9. Test face capture with two people visible; it should ask the student to clear the frame and retry.

## Security and limitations

- A descriptor score is a screening signal, not proof of identity.
- The override is limited to a verified lecturer and the lecturer's own exact course.
- The server recalculates the closest match when the lecturer confirms; it does not rely solely on client-provided match details.
- The override reason is audited. Lecturers should describe the verification method without entering full identity numbers or other unnecessary sensitive data.
- If unrelated students repeatedly flag against the same roster entry, pause further overrides and ask an administrator to investigate that stored template.
- A measured false-accept / false-reject evaluation on representative, consented data is still needed before setting a final production threshold. Do not treat the `0.45` threshold as universally calibrated.
- This workspace could syntax-transpile the TypeScript/TSX sources and test the descriptor-consistency helper, but it could not execute the SQL against the live Supabase database or complete a full Vite production build. Validate both before production release.

## Reviewing logged overrides

A database administrator can inspect reviewed exceptions from the Supabase SQL Editor:

```sql
select
  reviewed_at,
  course,
  enrolling_student_name,
  enrolling_student_id,
  candidate_student_name,
  candidate_student_id,
  descriptor_distance,
  override_reason
from public.face_duplicate_review_audit
order by reviewed_at desc
limit 100;
```

This log should be reviewed periodically. Repeated overrides against the same candidate roster entry are a signal to investigate that existing face template rather than continuing to override.
