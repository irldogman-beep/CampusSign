# CampusSign institution tenancy — implementation plan

**Product decisions:** shared application; institution registration by request and platform approval; full institution branding.  
**First institution:** the existing CampusSign installation.  
**Delivery strategy:** incremental pull requests, additive database migrations, no production tenant cutover until test gates pass.

## Guiding principles

1. Preserve all current users, academic data, face templates, attendance and audit history.
2. Use one shared app and one Supabase Auth identity per person; model institution roles through explicit memberships.
3. Enforce tenant boundaries in PostgreSQL constraints, RLS and RPC authorization—not only in React.
4. Keep public registration and QR check-in narrowly scoped.
5. Do not expose biometric data to platform-level views by default.
6. Make institution onboarding reversible before the second institution is admitted.

## Work packages

### Work package 0 — Baseline and recovery readiness

**Deliverables**
- Verified schema, migration, table-count, RLS-policy, function-grant and trigger inventory.
- Restorable backup/export and tested restore procedure.
- Separate development project or disposable database copy.
- Automated baseline assertions for row counts, foreign keys and key workflows.

**Exit criteria**
- Restore is demonstrated, not merely assumed.
- Baseline counts and schema snapshot are retained with the release.
- No production writes are required for the audit.

### Work package 1 — Identity and authorization design

**Deliverables**
- Final ER diagram and table-by-table tenant ownership matrix.
- Explicit roles: platform operator vs institution admin vs lecturer vs student.
- Membership lifecycle: invited, active, suspended, removed.
- Security-definer RPC inventory with caller, grants, target data, role check and institution predicate.
- Signup/trigger redesign so Auth metadata is descriptive only, never authoritative.

**Design decisions**
- `platform_operators` is separate from institution membership.
- `institution_memberships` is the source of institution-scoped roles.
- Lecturer and student profiles become institution-scoped profile rows with their own IDs and an Auth `user_id` foreign key.
- One Auth user can hold more than one institution membership without sharing institution-specific profile data.

**Exit criteria**
- Every protected action has an identified role and tenant check.
- Anonymous endpoints have documented, minimal grants and inputs.
- No role can be acquired by changing user-editable metadata.

### Work package 2 — Additive tenant schema

**Proposed core tables**
- `institutions`: canonical tenant record, lifecycle status, country, timezone, contact details and settings.
- `institution_registration_requests`: public request intake, review state, decision metadata and no direct activation authority.
- `platform_operators`: explicit platform-level operator allowlist.
- `institution_memberships`: Auth user, institution, role, status, invitation/activation metadata.
- `institution_branding`: validated logo asset key, colour tokens, welcome copy and public contact presentation.
- `institution_academic_sessions`: institution-specific academic year/semester periods.

**Tenant keys and relationships**
- Add `institution_id` to every institution-owned table.
- Add stable course IDs to roster/request/session/attendance paths where required; retain legacy course text for historical display during transition.
- Add composite unique keys and foreign keys so child rows cannot point to another institution's parent.
- Add supporting indexes on `(institution_id, ...)` columns used by RLS, list queries and joins.
- Keep platform audit events distinguishable from institution audit events.

**Exit criteria**
- Schema can represent two tenants with overlapping student IDs, course codes and department names.
- Composite constraints reject a deliberately cross-tenant relationship.
- Existing data is still readable through legacy paths in the development copy.

### Work package 3 — Tenant-aware authorization

**Deliverables**
- Safe helpers: `is_platform_operator()`, `has_institution_role(...)` and narrowly scoped membership lookup.
- Tenant-aware RLS policies on all tenant-owned tables.
- Tenant-aware versions of every application RPC, including admin CRUD/list/analytics, enrolment, lecturer verification, student dashboard/reroll, notifications, announcements, QR lookup and check-in.
- Minimal EXECUTE grants; revoke public/anon access where not required.
- Storage policies for public institution logos and private uploads.

**Exit criteria**
- Direct table access and direct RPC calls both reject cross-tenant access.
- Anonymous QR access is limited to a valid active session and never broadens into tenant discovery.
- Tests run under anon, authenticated student, lecturer, institution admin and platform operator roles.

### Work package 4 — First-institution migration

**Sequence**
1. Restore production backup into development.
2. Apply additive schema migration.
3. Create the initial institution record for current CampusSign.
4. Backfill all existing rows to that institution.
5. Create membership rows from trusted existing lecturer/student records and a separately verified platform operator.
6. Preserve existing Auth user IDs; map profile rows without changing login credentials.
7. Validate counts, relationships, descriptors, sessions, attendance, notifications and audit history.
8. Enable tenant RLS and tenant-aware RPCs.
9. Run end-to-end smoke tests and compare old/new results.
10. Prepare production cutover and rollback steps.

**Important:** Do not automatically promote the existing `lecturers.role = 'admin'` user to a platform operator. That account should become an institution administrator for the first institution. Platform operator authority must be granted separately and explicitly.

**Exit criteria**
- Zero missing or multiply-mapped records.
- Existing user logins work.
- Existing institution workflows pass.
- No production migration until backup/restore and development validation are signed off.

### Work package 5 — Registration and Super Admin workflow

**Public**
- Institution registration form.
- Validation and duplicate-request handling.
- Request status tracking using a secure reference or authenticated applicant account.
- No public endpoint creates an institution or administrator.

**Platform operator**
- Pending request queue.
- Review institution details and official contact evidence.
- Approve, reject or request more information.
- Create institution workspace only on approval.
- Send a single-use, expiring invitation to the first institution admin.
- Suspend/reactivate institutions with audit records and defined user messaging.

**Exit criteria**
- Registration cannot be self-approved.
- First admin invitation is single-use, expiring and bound to the intended institution.
- All decisions are audited.

### Work package 6 — Institution workspace and full branding

**Profile settings**
- Official name and short code
- Institution type and country
- Logo/crest and optional campus image
- Primary, secondary and accent colours
- Welcome heading and message
- Official email, phone, website and address
- Timezone and academic calendar

**Admin workspace**
- Institution profile and branding editor.
- Departments, courses and academic sessions.
- Lecturer invitations, verification and course assignment.
- Student approval and enrolment management.
- Attendance defaults, reports and audit history.

**Branding implementation**
- Validate colours and contrast; retain accessible fallback tokens.
- Store uploaded files under institution-specific storage paths.
- Resolve institution branding from the authenticated workspace context.
- Keep the platform-level Super Admin interface visually distinct from school workspaces.

**Exit criteria**
- Changing Institution A's branding has no effect on Institution B.
- Logo uploads and replacement are tenant-scoped.
- Mobile layouts remain responsive.

### Work package 7 — Second-institution readiness

Do not onboard a real second institution until all checks pass:

- Full cross-tenant negative test suite.
- RLS and RPC tests for every role.
- QR and face-flow isolation tests.
- Registration and invitation abuse tests.
- Backup/restore rehearsal.
- Load/performance review of tenant indexes and RLS helpers.
- Audit log review and incident response procedure.
- Production smoke test and rollback rehearsal.

## Suggested pull-request sequence

| PR | Scope | Database impact |
|---|---|---|
| 1 | Final ownership matrix, ERD and RPC security inventory | None |
| 2 | Add core institution/membership tables | Additive only |
| 3 | Add tenant keys and composite constraints in development | Additive/backfill |
| 4 | Tenant-aware helper functions and RLS policies | Security migration |
| 5 | Tenant-aware RPCs and grant cleanup | Function/grant migration |
| 6 | First-institution data backfill and validation | Development first |
| 7 | Institution registration + Super Admin interface | Additive |
| 8 | Institution profile and branding editor | Additive/storage policies |
| 9 | Tenant-aware staff/student onboarding and dashboards | Application + RPC |
| 10 | Cross-tenant test suite and production cutover | Controlled release |

PR sequence may be combined where safe, but authorization and data migration must not be rushed into a single unreviewed change.

## Rollback and operational safeguards

- Never drop or rename legacy columns in the first rollout.
- Keep old and new reads comparable during the transition.
- Use a migration marker/version and explicit backfill-complete assertions.
- Make backfills idempotent and batch large tables.
- Do not disable RLS to make migration easier.
- Use a short maintenance window only if a final consistency cutover requires it.
- Retain pre-cutover backup and restore instructions until after the observation window.
- Roll back by switching application code away from new tenant paths only if the old schema remains intact; otherwise restore the tested database backup. Do not promise that a reverse SQL script can undo arbitrary production writes.

## Immediate next task

Build the detailed table ownership matrix and RPC/grant review as the next engineering artifact. It must identify for every table and function: owner institution source, caller roles, public/anon status, RLS policy, security-definer behavior, and required tenant predicate. No production DDL should be applied until this is complete.
