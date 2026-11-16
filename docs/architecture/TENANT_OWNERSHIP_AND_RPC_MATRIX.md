# Tenant ownership and RPC authorization matrix

**Source:** live Supabase `public` schema, `pg_policies`, `pg_proc`, and effective EXECUTE privileges, audited 2026-11-16.  
**Purpose:** implementation checklist for converting the single-institution application to tenant isolation.  
**Important:** This is a design/control matrix, not an executable migration.

## 1. Table ownership matrix

| Existing table | Current owner/link | Target tenant owner | Required tenant enforcement |
|---|---|---|---|
| `lecturers` | Auth user ID is also profile PK | Institution-scoped lecturer profile | Add `institution_id` and separate Auth `user_id`; composite uniqueness/FKs; membership role check |
| `student_accounts` | Auth user ID is profile PK | Institution-scoped student profile | Add profile ID, `institution_id`, Auth `user_id`; unique student ID per institution; membership role check |
| `academic_departments` | Global catalogue | Institution | Unique code/name within institution; RLS and catalogue RPC scope |
| `academic_courses` | Department FK, global catalogue | Institution + same-institution department | Composite FK `(institution_id, department_id)`; unique course code within department/institution |
| `lecturer_course_assignments` | Lecturer + course | Same institution as lecturer and course | `institution_id`; composite FKs to lecturer/course; assignment RPC scope |
| `students` | Lecturer/course roster row | Institution + lecturer + course | `institution_id`; composite FK to lecturer; add stable course ID; student ID uniqueness scoped to institution/course policy |
| `face_templates` | Face descriptor keyed by roster row | Same institution as roster row | Explicit `institution_id` plus composite FK to `students`; strict SELECT/INSERT/UPDATE policy; never public |
| `student_enrollment_requests` | Lecturer/course/student text; pending descriptors | Institution + lecturer + course | `institution_id`, stable course ID, composite FKs; student/lecturer membership validation; descriptor access restricted |
| `face_duplicate_review_audit` | Lecturer, request and candidate roster row | Institution | `institution_id`; composite FKs to request/lecturer/candidate; institution admin audit access only |
| `sessions` | Lecturer-owned session | Institution + lecturer + course | `institution_id`; composite FK to lecturer/course; QR RPC derives tenant from session |
| `attendance` | Session + lecturer + text student/course fields | Institution + session + roster identity | `institution_id`; composite FKs to session/lecturer/course; immutable tenant assignment after insert |
| `checkin_attempts` | Session + student ID | Institution via session | Add `institution_id`; composite FK to session; rate/lock key scoped to session and tenant |
| `app_notifications` | Auth recipient, admin-role marker | Institution + recipient | Add nullable `institution_id` for platform notifications; institution notifications require active membership; recipients only read own |
| `admin_announcements` | Creator, audience and optional catalogue references | Institution | `institution_id`; creator membership check; composite FKs to department/course/student profile |
| `announcement_recipients` | Announcement + Auth recipient | Same institution as announcement and recipient membership | Add `institution_id`; composite FK to announcement; verify recipient membership |
| `audit_events` | Actor + action/entity text | Institution or explicit platform scope | Nullable `institution_id` only for platform events; tenant audit rows immutable and institution-scoped |
| `student_department_reroll_requests` | Student Auth user ID | Institution + student profile | Add `institution_id` and student profile ID; request and approval must stay in same tenant |
| `campussign_enrollment_rate_limits` | Global hashed bucket | Platform-wide or tenant-aware operational bucket | Preserve platform abuse limits; optionally add tenant dimension; keep table inaccessible to client roles |

### New platform tables

| New table | Scope | Key controls |
|---|---|---|
| `institutions` | Platform-owned tenant root | Unique normalized slug/short code; lifecycle status; no public direct INSERT/UPDATE |
| `institution_registration_requests` | Platform-level pending request | Public submit only; status and decision fields writable only by platform operator |
| `platform_operators` | Platform-level | Explicit allowlist tied to Auth user; no user self-service grant |
| `institution_memberships` | Institution | Unique active user/role membership per institution; invited/active/suspended/revoked states |
| `institution_branding` | Institution | Validated colour tokens and institution-scoped storage object keys |
| `institution_academic_sessions` | Institution | Institution-scoped calendar and timezone |

## 2. Profile and identity migration notes

Current primary keys are coupled to Auth identity:

- `lecturers.id = auth.users.id`
- `student_accounts.user_id = auth.users.id`

That is convenient for one school but awkward for one person who may be a lecturer at one school and a student at another. Target design:

- Keep Supabase Auth as the global identity.
- Give each institution-specific lecturer/student profile its own profile UUID.
- Add `user_id` as a foreign key to `auth.users`.
- Create one or more explicit `institution_memberships` rows.
- Keep existing Auth user IDs and credentials unchanged.
- Migrate the existing lecturer/student profile rows to the initial institution; do not merge accounts based on matching names or email domains.

A user with two institution memberships must select or resolve an active workspace. The selected institution is not trusted merely because the client sends an ID: every request verifies the caller's membership and role.

## 3. RPC and function authorization matrix

The current RPCs below are security-definer or otherwise privileged functions. The tenant predicate column describes the required future check; it is not a statement that the current function already has that check.

### Public/anonymous execution surface

The following security-definer functions were executable by `anon` and `authenticated` at audit time:

| Function | Current purpose / guard | Required tenant boundary |
|---|---|---|
| `catalog_departments()` | Public active catalogue; admin sees inactive entries | Public discovery may expose only institution-published active catalogue; add institution selection and rate limiting |
| `catalog_courses(p_department)` | Public active catalogue; admin sees inactive entries | Department and course must belong to the requested/published institution |
| `list_available_courses()` | Public course discovery | Return only courses for an explicitly selected active institution |
| `list_department_courses(p_department_name)` | Public courses for department with verified lecturer assignment | Scope department, course and lecturer assignment to one institution |
| `session_info(p_session,p_slot,p_k)` | Public QR authenticity/slot/expiry/revocation check | Derive institution from session; return only public session metadata for that session |
| `lookup_student(p_session,p_exp,p_ticket,p_student_id)` | Validates signed ticket then looks up roster for session lecturer/course | Join only roster/face state belonging to the session institution and course; avoid leaking cross-tenant identity |
| `check_in(...)` | Validates ticket, roster, face and location then records attendance | All session, roster, face-template, attempt and attendance operations must use the same institution and course |
| `is_verified()` | Returns current user's lecturer verification state | Consider removing anon EXECUTE; authenticated only, and verification must be membership/institution-specific |

These grants are intentional candidates for review, not automatic revocation targets. QR check-in must continue to work for students who are not logged into the staff portal. Public functions must never accept a tenant ID and then trust it without tying it to a validated session or published institution.

### Platform and institution administration

All current `admin_*` functions are gated by `is_admin()` in the inspected definitions. That helper currently checks the caller's verified `lecturers.role = 'admin'` row. In the target design, every function must check the exact institution and an institution-scoped admin role; platform-wide operations must instead check `is_platform_operator()`.

| Function(s) | Required future scope |
|---|---|
| `admin_overview()`, `admin_attendance_trends(p_days)`, `admin_course_activity(p_days)` | Aggregate only the caller's institution |
| `admin_recent_attendance(p_limit)`, `admin_recent_sessions(p_limit)`, `admin_recent_audit(p_limit)` | Filter every returned row by institution; never return cross-tenant audit |
| `admin_list_lecturers()`, `admin_list_student_accounts()`, `admin_list_student_enrolments(p_limit)` | Institution-specific account and enrolment lists |
| `admin_lecturer_courses(p_lecturer)`, `admin_assign_lecturer_course(p_lecturer,p_course,p_assigned,p_primary)` | Validate lecturer and course belong to same authorized institution |
| `admin_set_lecturer_verification(p_lecturer,p_verified)` | Verify institution admin role and target lecturer institution |
| `admin_save_department(...)`, `admin_delete_department(p_department)` | Create/update/deactivate/delete only within caller's institution |
| `admin_save_course(...)`, `admin_delete_course(p_course)` | Department and course must share institution; cascade/update only within tenant |
| `admin_delete_lecturer(p_lecturer)`, `admin_delete_student(p_student)`, `admin_delete_student_account(p_user_id)` | Target profile and all affected dependent rows must belong to caller's institution; preserve platform/global Auth identity if another membership exists |
| `admin_delete_session(p_session)`, `admin_delete_attendance(p_attendance)` | Resolve target institution before mutation; preserve existing audit/history rules |
| `admin_list_announcements()`, `admin_save_announcement(...)`, `admin_delete_announcement(p_id)` | Institution-scoped audience, department, course, student and recipients |
| `admin_list_department_rerolls()`, `admin_review_department_reroll(...)`, `admin_review_student_account(...)` | Target student and request must belong to institution |

### Student and lecturer workflows

| Function(s) | Current guard observed | Required future scope |
|---|---|---|
| `submit_student_enrollment(...)` | Requires `auth.uid()`, approved `student_accounts` row and matching submitted profile details | Resolve student's institution; validate all selected courses and verified lecturer assignments in that same institution |
| `review_student_enrollment(...)` | Requires verified lecturer; request is tied to `lecturer_id = auth.uid()`; student account must be approved | Resolve lecturer profile's institution; validate request, course, student account, duplicate candidate and face template all in that institution |
| `list_my_enrollment_requests()` | Requires verified lecturer | Return only the caller's institution and assigned courses |
| `my_assigned_courses()` | Filters assignments by `auth.uid()` | Resolve institution-specific lecturer profile and return only its memberships/assignments |
| `enroll_face(p_student,p_descriptors)` | Requires verified lecturer | Verify roster row is owned by caller's institution and assigned course; never accept cross-tenant student row |
| `student_get_dashboard()` | Requires authenticated student account | Resolve selected membership and query roster/attendance/notifications only for that institution |
| `student_request_department_reroll(p_department,p_reason)` | Requires approved student account | Requested department must be active in the student's institution |
| `student_get_department_reroll_status()` | Requires authenticated student | Return only the current user's request for the selected institution |
| `student_apply_department_reroll()` | Requires approved account and approved reroll request | Mutate only same-tenant requests, enrolments and roster; preserve historical attendance under original institution |
| `delete_notification(p_notification)`, `mark_notification_read(p_notification)`, `mark_notification_unread(p_notification)`, `mark_all_notifications_read()` | Authenticated user/notification ownership checks | Include institution context and verify recipient membership; platform notices handled separately |

### Internal helpers and triggers

| Function(s) | Current role | Required future control |
|---|---|---|
| `handle_new_user()` | Auth insert trigger creates profile using Auth user metadata | Rework: metadata is not authoritative; create only a neutral identity or pending onboarding record; membership/profile creation must follow trusted invite/approval |
| `is_admin()`, `is_verified()` | Current single-tenant role/verification helpers | Replace/retire in favour of institution-scoped membership helpers; never use them as platform-operator checks |
| `_check_ticket(p_session,p_exp,p_ticket)` | Validates signed ticket, expiry and active session | Keep internal; ensure all callers derive tenant from session and cannot pass unrelated records |
| `_campussign_audit_*` triggers | Append audit events on protected mutations | Carry tenant ID from changed row; reject attempts to rewrite tenant ownership |
| `_campussign_notify_*` triggers | Create notification records | Derive tenant from source record and validate recipient membership |
| `_campussign_write_audit(...)` | Internal audit insert helper | Accept/derive tenant safely; no client EXECUTE |
| `_campussign_consume_enrollment_limit(...)` | Internal rate limiter | Keep inaccessible to client roles; use a deliberate platform + tenant bucket strategy |
| `_hmac_hex(...)`, `_face_distance(...)`, `_vec(...)` | Cryptographic/descriptor helpers | Keep internal to required RPCs; no direct client grants; do not return raw descriptors |

## 4. Required implementation checks for every RPC

For every security-definer function, reviewers must record:

1. Is EXECUTE granted to `anon`, `authenticated`, service role, or only the owner?
2. Is a fixed safe `search_path` set?
3. Does the function identify the caller using `auth.uid()` where authentication is required?
4. Does it verify the exact institution membership and role?
5. Is the tenant derived from a trusted parent record or validated parameter?
6. Do all joins, selects, updates, deletes and inserts include tenant ownership?
7. Are foreign keys/composite constraints preventing cross-tenant references?
8. Does the function expose sensitive data (face descriptors, student IDs, emails, attendance)?
9. Are error messages safe and non-enumerating?
10. Is the behavior covered by a positive and negative test for each relevant role?

A text search for `auth.uid()` or `is_admin()` is not sufficient proof of safety. Review the full function body and all called helpers.

## 5. Test matrix

| Actor | Attempt | Expected result |
|---|---|---|
| Anonymous visitor | Submit institution request | Pending request only; no institution or membership created |
| Anonymous visitor | Call admin RPC | Denied |
| Anonymous visitor | Call QR lookup with invalid/expired/revoked ticket | Denied |
| Anonymous visitor | Call QR lookup with valid Institution A ticket and Institution B student ID | Not found; no Institution B data revealed |
| Institution A student | List Institution B courses | No rows / denied |
| Institution A student | Submit enrolment for Institution B course | Denied |
| Institution A lecturer | Review Institution B request UUID | Denied / not found |
| Institution A lecturer | Enrol face against Institution B roster UUID | Denied |
| Institution A lecturer | Read Institution B attendance/session | No rows / denied |
| Institution A admin | Approve Institution B lecturer/student | Denied |
| Institution A admin | Delete Institution B account or course | Denied |
| Institution A admin | Read Institution B audit/announcements | No rows / denied |
| Platform operator | Approve an institution request | Allowed and audited |
| Platform operator | Read raw face descriptors through normal admin API | Denied |
| User with A+B memberships | Switch active institution | Only selected tenant data returned; every request revalidates membership |

## 6. Release blockers

- No table may become tenant-active until its ownership source is defined.
- No RPC may be considered tenant-safe based solely on frontend filtering.
- No anonymous RPC grant is retained without a documented product requirement and negative tests.
- No Auth role is trusted from `raw_user_meta_data`.
- No second institution is activated until all cross-tenant negative tests pass.
- No production cutover until backup restoration and migration rehearsal succeed.
