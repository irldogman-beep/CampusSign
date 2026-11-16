# CampusSign institution tenancy — architecture audit

**Audit date:** 2026-11-16  
**Scope:** Live Supabase schema and application authentication/onboarding paths  
**Status:** Read-only audit. No production data, schema, users, or permissions were changed.

## Product decisions

- **Access model:** One shared CampusSign website and application, with institution-scoped workspaces.
- **Institution registration:** A school submits a request; a CampusSign platform operator reviews and approves it.
- **Branding:** Full institution branding (name, abbreviation, logo, colours, welcome presentation and contact details).
- **First tenant:** The existing CampusSign installation becomes the first institution. Existing records must be retained.

## Executive finding

CampusSign is currently a **single-institution application**. It already has useful building blocks—Supabase Auth, lecturer and student account records, a central academic catalogue, course assignments, approval workflows, RLS, and security-definer RPCs—but tenant ownership is not represented in the database.

A second institution must not be onboarded until institution ownership is enforced in both relational constraints and authorization paths. UI filtering is not a security boundary.

## Current database inventory

The live `public` schema contains these application tables:

| Area | Current tables |
|---|---|
| Identity | `lecturers`, `student_accounts` |
| Academic catalogue | `academic_departments`, `academic_courses`, `lecturer_course_assignments` |
| Student roster and biometrics | `students`, `face_templates`, `student_enrollment_requests`, `face_duplicate_review_audit` |
| Attendance | `sessions`, `attendance`, `checkin_attempts` |
| Communications | `app_notifications`, `admin_announcements`, `announcement_recipients` |
| Governance and workflow | `audit_events`, `student_department_reroll_requests` |
| Operational support | `campussign_enrollment_rate_limits` |

The live snapshot contained 2 lecturer profiles, 1 student account, 4 departments, 7 courses, 2 lecturer-course assignments, 1 roster row, 1 face-template row, 8 enrolment requests, 2 sessions, 2 attendance rows and 63 audit events. Counts are a point-in-time inventory, not a migration script or a promise that counts will remain unchanged.

### Existing ownership relationships

- `lecturers.id` is also the Supabase Auth user ID.
- `student_accounts.user_id` is the Supabase Auth user ID and is the table's primary key.
- Roster rows in `students` are lecturer/course-specific and reference `lecturers.id`.
- `face_templates.student_pk` references a roster row, not the student portal account.
- `sessions` reference a lecturer; attendance rows reference both a session and lecturer.
- Departments and courses are global catalogue records today. Course-to-department relationships are relational, but there is no institution owner.
- Several other workflows identify a student by student ID, name, department or course text. These comparisons are currently safe only under the single-institution assumption.

These constraints make a simple `institution_id` column addition insufficient. The account/profile relationship and important composite relationships need to be redesigned so that two institutions can have users and student IDs with the same values without colliding.

## Authorization and RLS observations

### Direct table policies

The following tables had RLS enabled but no direct policy rows in the live `pg_policies` snapshot:

- `face_templates`
- `checkin_attempts`
- `student_enrollment_requests`
- `face_duplicate_review_audit`
- `audit_events`
- `campussign_enrollment_rate_limits`
- `student_accounts`
- `student_department_reroll_requests)

This does not by itself mean these tables are publicly readable. RLS with no applicable policy denies ordinary direct access; current application access is largely mediated by security-definer functions. During tenancy work, every such function must be reviewed and explicitly constrained to the caller's institution.

Existing direct policies on tables such as `lecturers`, `students`, `sessions`, `attendance`, `academic_departments`, `academic_courses`, notifications and announcement recipients are also single-institution policies today. They are not sufficient for multi-tenant authorization.

### Security-definer RPCs

The live schema contains numerous security-definer functions. Many administrator functions check `is_admin()`, and lecturer workflows commonly check `is_verified()` or bind a request to `auth.uid()`. However:

- `is_admin()` currently derives authority from a verified `lecturers.role = 'admin'` row. There is no separate platform-operator identity.
- `is_verified()` derives authority from a lecturer row.
- These helpers do not accept or verify an institution, because none exists in the current model.
- Administrator list, delete, update, catalogue and analytics functions must all become institution-scoped; checking only “is admin” will be too broad once multiple institutions exist.
- Student dashboard and enrolment functions compare student identifiers and course labels without an institution key.
- Some RPCs are intentionally callable by `anon` for public catalogue discovery or QR attendance. Their grants and exact inputs must remain narrowly controlled; they must not become a general anonymous data-access path.

The following eight security-definer RPCs were executable by the `anon` role in the privilege snapshot: `catalog_courses`, `catalog_departments`, `check_in`, `is_verified`, `list_available_courses`, `list_department_courses`, `lookup_student`, and `session_info`. Several are part of existing public QR/check-in or public catalogue flows. This is a review list, not a claim that all eight are vulnerabilities. The implementation must explicitly document and test the intended public surface, and revoke unnecessary grants.

### QR and biometric paths

The current QR flow uses session secrets, HMAC-derived QR/ticket values, expiry checks, revocation checks and a session-scoped roster lookup. This is a valuable foundation. In a multi-institution model, every step must resolve the session's institution and keep all roster, face-template, attempt and attendance reads/writes inside that institution. A valid QR ticket must never grant access outside its own session and tenant.

Face templates and pending enrolment descriptors are sensitive biometric data. They must never be exposed through branding/public registration endpoints, general institution discovery, or broad platform dashboards. Platform operators should see operational metadata by default, not raw biometric descriptors.

## Critical architecture gaps to address

1. **No tenant root:** There is no `institutions` table or tenant foreign key.
2. **Role conflation:** The current admin role is stored on `lecturers`; platform administration and institution administration must be separate authorities.
3. **Auth/profile coupling:** Lecturer and student account primary keys are tied directly to `auth.users`. This prevents a clean model where one login can have institution-specific memberships or more than one institution role.
4. **Global catalogue:** Department/course uniqueness and catalogue queries are global, not institution-scoped.
5. **Text-based relationships:** Course labels and student IDs are used in multiple workflows. These must be resolved within a tenant and progressively replaced by stable IDs.
6. **RPC authorization:** Security-definer functions can bypass RLS. Each must enforce membership and tenant scope internally; relying on caller-side filtering is unsafe.
7. **Public check-in boundary:** Anonymous QR endpoints need to remain narrowly scoped to a valid, active session, with all data joins constrained to that session's institution.
8. **Notifications, announcements and audit:** These records need institution ownership, with a separate explicit model for platform-level audit events.
9. **Storage and branding:** Storage buckets/policies must prevent an institution from writing or replacing another institution's assets.

## Target architecture

### Identity and roles

Use Supabase Auth as the single login identity. Add a server-controlled membership model:

- `platform_operators`: explicit, tightly controlled CampusSign platform operators.
- `institution_memberships`: user, institution, role and membership status.
- Roles are scoped to an institution (initially `institution_admin`, `lecturer`, `student`; finer roles can follow).
- A user may have memberships in more than one institution. Institution-specific profile rows are separate from the global Auth identity.
- Never grant a role or institution membership based solely on user-editable Auth metadata.
- Existing `lecturers` and `student_accounts` records are migrated to institution-scoped profiles while preserving their current Auth user IDs.

### Tenant-owned data

Every tenant-owned record must either carry `institution_id` directly or be connected through a composite foreign key that proves the same institution. For sensitive or high-volume tables, prefer a direct `institution_id` plus composite constraints so tenant scope is explicit and indexable.

The minimum tenant-owned set is:

- Lecturer profiles and student portal profiles
- Departments, courses and lecturer-course assignments
- Roster rows, face templates and enrolment requests
- Face duplicate review audit
- Sessions, attendance and check-in attempts
- Notifications, announcements and announcement recipients
- Student department-change requests
- Institution-level audit events and settings

Rate-limit buckets should be reviewed separately: abuse limits may need a platform-wide component as well as an institution-scoped key.

### Tenant-safe relationships

Use unique constraints such as:

- `UNIQUE (institution_id, department_code)`
- `UNIQUE (institution_id, normalized_department_name)`
- `UNIQUE (institution_id, department_id, course_code)`
- `UNIQUE (institution_id, student_id)` for portal student identity
- `UNIQUE (institution_id, user_id, role)` for membership
- Composite foreign keys such as `(institution_id, department_id)` and `(institution_id, lecturer_id)` to prevent cross-tenant references.

Where practical, introduce stable `course_id` / `course_offering_id` references rather than treating a formatted course label as a key. Historical text fields should be retained for audit/report continuity during transition.

### Authorization design

- Implement a small set of audited helper functions such as `is_platform_operator()` and `has_institution_role(institution_id, allowed_roles)`.
- Helpers must derive the user from `auth.uid()`, use a fixed safe `search_path`, and have minimal EXECUTE grants.
- Every security-definer RPC must check the caller's membership for the exact target institution and validate that all related records belong to it.
- RLS must enforce tenant scope for direct table access. RPC checks are an additional layer, not a replacement for RLS.
- Do not trust a client-supplied `institution_id` without verifying membership. Where possible derive it from the target record; where it is an explicit parameter, validate it before doing work.
- Platform-level functions must be separate from institution-level functions and must not return raw biometric data by default.

## Registration and activation

1. A public form may create only a `pending` institution registration request.
2. It cannot create an institution, membership, or administrator role.
3. A platform operator reviews the request and approves/rejects it.
4. Approval creates the institution and an expiring, single-use invitation for its first administrator.
5. The invitee accepts using their authenticated identity; the server creates the institution membership and profile.
6. All later institution staff/student onboarding is tenant-scoped and uses the institution's own invitation/approval policy.

Registration request uploads must be quarantined or validated. Public uploads must not write directly into an institution's trusted branding namespace.

## Migration approach

Use an **expand → backfill → validate → enforce → switch → observe** migration, not a one-shot rewrite.

1. **Prepare:** create and verify a restorable database backup; capture schema, policies, grants, functions and table counts.
2. **Expand:** add tenant tables and nullable tenant keys, new membership/profile identifiers and tenant-aware indexes/constraints without removing old columns or routes.
3. **Create first institution:** create one institution representing the current CampusSign deployment.
4. **Backfill:** assign every existing academic, identity, roster, biometric, attendance, workflow, communication and audit row to that institution. Preserve original Auth IDs and historical timestamps.
5. **Validate:** assert zero orphan rows, zero cross-tenant relationships, unchanged row counts, unchanged foreign-key cardinality and successful mapping of every current account.
6. **Enforce:** add NOT NULL and composite constraints only after validation; install tenant RLS and tenant-aware RPCs.
7. **Switch:** update application reads/writes and signup/invite flows to use membership and institution context.
8. **Observe:** run cross-tenant tests and monitor logs before allowing a second institution.
9. **Retire legacy paths:** only after a successful observation window, remove old global helpers/columns in a separate migration.

Do not perform destructive cleanup as part of the first tenant migration. Do not reset or recreate the current institution's records.

## Required acceptance tests

- An Institution A lecturer cannot read, create, update or delete Institution B's roster, sessions, attendance or course assignments, including by calling RPCs directly.
- An Institution A student cannot list or enrol in Institution B courses or submit an enrolment request to Institution B lecturers.
- An institution administrator cannot approve, suspend, delete or export records belonging to another institution.
- A QR ticket from Institution A cannot look up a student, face template, attempt or attendance record in Institution B.
- Duplicate student IDs, course codes and department names are allowed across institutions but rejected within the same institution where uniqueness is required.
- A user with memberships in two institutions sees only the workspace selected for the current request.
- An unapproved registration request cannot create an active institution or administrator.
- A user cannot promote themselves by editing Auth metadata or calling an RPC with a forged role.
- Face templates and pending descriptors cannot be read by another tenant or a platform operator through ordinary admin endpoints.
- Existing single-institution student, lecturer, course, QR, attendance, reroll and notification workflows still work after migration.

## Explicitly out of scope for this audit

- No SQL migration was applied.
- No RLS policy, grant, trigger, function, Auth user, face template, attendance row or existing profile was changed.
- No frontend tenant switcher or institution registration UI was implemented.
- No production deployment was attempted.

## Next engineering gate

Before writing the first production migration, produce a reviewed table-by-table ownership matrix and an RPC/grant inventory with explicit tenant predicates. Build the migration against a restorable development copy and run the acceptance tests above. Production remains single-institution until all gates pass.
