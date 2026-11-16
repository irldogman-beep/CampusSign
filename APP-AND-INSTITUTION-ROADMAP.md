# CampusSign — Institution Platform & App Roadmap

## Product direction

CampusSign should evolve from a single-campus attendance website into a multi-institution platform. Each university, polytechnic, college or training institution gets a separate workspace and its own administrator, academic catalogue, staff, students, attendance sessions and reports.

The first mobile deliverable should be an installable Progressive Web App (PWA), not an immediate rewrite as a native Android/iOS application. The current React/Vite application already uses browser camera, QR and location APIs. A PWA can be installed from a supported browser and can share the same release and account system as the web portal. A native wrapper (for example, Capacitor) can be evaluated later if app-store distribution or native-only capabilities become necessary.

## Proposed institution operating model

### 1. Platform operator
A CampusSign platform operator creates and manages institution workspaces. This is a platform-level role and must not be granted to ordinary institution administrators.

### 2. Institution onboarding
An institution is created with:
- Official institution name and short code
- Institution type and country
- Primary institution administrator
- Optional logo, colours and official email domains
- Academic session/calendar settings and timezone

The first institution administrator is invited or promoted through a controlled setup flow. There is no public self-service route that lets someone claim an existing institution or become its administrator.

### 3. Institution administrator
Each institution administrator manages only their institution:
- Departments, programmes and course catalogue
- Academic sessions/semesters and course offerings
- Lecturer invitations, verification and course assignments
- Student records/enrolment approvals
- Attendance policy defaults, reports and audit history

The institution admin should be able to delegate limited roles (for example, department admin or faculty officer) without granting platform-wide access.

### 4. Lecturers
Lecturers join through an institution invitation or a controlled registration request. Their account is linked to one institution and one or more course offerings. An institution administrator verifies the lecturer before attendance and roster tools become available.

### 5. Students
Students join through an institution-controlled process. Their profile belongs to one institution and can be associated with a programme/department, level and course offerings. Self-enrolment requests go only to the verified lecturers responsible for the selected offerings.

### 6. Taking attendance
A lecturer selects an active course offering and starts a session. Students use the installed CampusSign app or browser to scan the lecturer's QR code and complete configured checks. The institution retains ownership of its attendance records and can export them according to its retention policy.

## Data isolation — required before onboarding a second institution

The current database was designed around one institution. Do not onboard a second institution until tenant isolation has been designed, implemented and tested.

The intended data model needs an institution identifier on every institution-owned record, including (at minimum):
- Lecturer and student profiles
- Departments, courses and lecturer-course assignments
- Student-course enrolments and enrolment requests
- Attendance sessions, attendance records and check-in attempts
- Notifications and audit events
- Institution-specific settings and branding

Every tenant-owned query and mutation must be constrained by the authenticated user's institution membership. Row Level Security must enforce this in the database; filtering only in React is not security. Platform-operator functions must be separately protected and audited. Unique constraints such as course codes, student IDs and lecturer assignments must be scoped to the institution where appropriate.

Before migration, prepare a mapping from the existing single-campus data to one initial institution. Back up the database and test the migration on a disposable copy or development branch. Never infer an institution from a user's email domain alone.

## Mobile app delivery stages

### Stage A — Stabilise the current product
- Repair the admin workspace and catalogue workflows.
- Add automated type-check and production-build validation to every pull request.
- Improve user-facing errors, loading states, empty states and retry behaviour.
- Confirm all roles and permissions using separate test accounts.
- Keep face-recognition threshold tuning in its own later workstream.

### Stage B — Installable PWA
- Add a web app manifest, application icons and install metadata.
- Add a service worker for safe static-asset caching and update prompts.
- Keep authentication, QR freshness/signature validation, attendance submission and biometric decisions online-first.
- Do not cache face descriptors, student records, attendance responses or private admin data in a public/offline cache.
- Test installation, camera permissions, QR scanning, location permissions, update flow and sign-out on Android Chrome and desktop browsers.
- Treat offline attendance as unavailable until a separate secure design is approved; a cached QR screen must never imply that a check-in was accepted.

### Stage C — Institution tenancy
- Introduce the institution and membership model.
- Migrate the current deployment into one initial institution.
- Add tenant-scoped RLS policies and institution-aware RPC validation.
- Add platform operator and institution admin onboarding flows.
- Test cross-tenant access attempts for every major table and RPC before any second institution is added.

### Stage D — Native distribution (only if justified)
- Evaluate wrapping the PWA with Capacitor for Android/iOS.
- Add native push notifications only with explicit permission and institution configuration.
- Consider native device integrity or managed-device support only if institutions require it.
- Preserve one shared backend and authorization model; a native app must not bypass database security.

## Rollout and acceptance gates

1. No production schema changes without a tested backup/restore plan.
2. Admin sections must fail independently; a notifications failure must not hide the course catalogue.
3. A lecturer from Institution A must never read or modify Institution B data, even by calling an RPC directly.
4. A student must only see their own institution's active courses and relevant lecturer enrolment routes.
5. A PWA install must not change the existing web attendance flow.
6. A check-in is successful only after the server confirms it.
7. The face-verification model remains a known follow-up item and is not a blocker for the admin reliability work.

## Immediate next work

1. Finish the admin workspace reliability fixes and review every admin RPC against the live schema.
2. Add build/type-check automation and run a clean production build.
3. Improve admin course and lecturer assignment management, with safe deactivate rather than destructive deletion.
4. Prepare the PWA shell and test installability.
5. Design and test institution tenancy before onboarding any additional campus.
