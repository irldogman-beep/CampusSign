# Zero-cost local testing plan for institution tenancy

**Purpose:** develop and test CampusSign's institution-scoped schema without creating a paid Supabase branch or touching the live project.

## Cost and safety boundary

- Use a local Supabase stack backed by Docker. This does not create a hosted Supabase project or incur Supabase branch-hour charges.
- Use synthetic users, institutions, courses, students and attendance records only.
- Do not copy production database dumps, Auth users, student records, face descriptors, face images, access tokens or secrets into local fixtures.
- Do not point local migration or test commands at the production Supabase URL.
- Never place a service-role key or database password in frontend environment variables or Git.
- Production remains unchanged until a separately approved, backed-up and rehearsed cutover.

Local testing still uses the developer's computer resources and internet bandwidth for initial image/dependency downloads. Docker must be installed and running.

## Repository state discovered

The current repository has legacy SQL scripts at its root (supabase-setup.sql and later numbered steps), but it does not yet have a committed Supabase CLI config.toml or a canonical supabase/migrations/ directory. The README's migration list also predates some later SQL steps. Therefore, **do not run a guessed sequence of root-level SQL files against either production or a new local database**.

The first engineering task is to reconcile the exact schema represented by the live database with the numbered SQL files, identify replacement/fixed scripts and one-off manual steps, and create a canonical, ordered migration history. Only then can the local database be reset and built deterministically.

## Local environment setup

1. Install Docker Desktop and the Supabase CLI using the current official installation instructions: https://supabase.com/docs/guides/local-development/cli/getting-started
2. Clone the CampusSign repository and check out the branch containing the canonical local setup.
3. Initialize the Supabase local project once the team has reviewed and committed its configuration:
   ```powershell
   supabase init
   ```
4. Start the local stack:
   ```powershell
   supabase start
   supabase status
   ```
5. Confirm the displayed API URL, database URL and Studio URL are local loopback addresses. Do not substitute the hosted production URL.
6. Apply only the reviewed, ordered local migrations. After migration reconciliation, the intended repeatable commands are:
   ```powershell
   supabase db reset
   supabase test db
   ```
   These commands are not ready to run until the migration directory and test suite are committed.
7. Stop the local stack when finished:
   ```powershell
   supabase stop
   ```

## Synthetic tenant fixture design

The fixture set must contain at least:

- Institution A and Institution B, both active, with deliberately overlapping department names, course codes and student ID values.
- One institution administrator, one lecturer and two students per institution.
- A shared Auth identity with separate memberships in both institutions, to verify workspace switching without profile leakage.
- Separate courses, lecturer assignments, enrolment requests, roster rows, sessions, attendance rows, notifications and audit events.
- Synthetic face-template placeholders only where schema tests require a row. Never use a real person's face descriptor or image.

Fixture IDs and credentials must be local-only and clearly labelled as test data.

## Required local test gates

1. **Schema:** all tenant-owned records have an institution owner or a composite relationship that proves the parent's institution.
2. **Uniqueness:** duplicate student IDs/course codes are accepted across institutions but rejected within the same institution where required.
3. **RLS:** Institution A users cannot select, insert, update or delete Institution B records.
4. **RPCs:** direct calls to security-definer functions enforce the same tenant checks as direct table access.
5. **Role escalation:** changing user-editable Auth metadata or sending a forged institution/role does not grant privileges.
6. **QR:** a valid QR/session from Institution A cannot resolve Institution B roster, face, attempt or attendance records.
7. **Biometrics:** institution users cannot access another tenant's templates; platform-level operations do not expose raw descriptors.
8. **Workflow regression:** student onboarding, lecturer verification, course enrolment, attendance, QR check-in, reroll, notifications and audit behaviour remain functional.
9. **Negative tests:** every denial is asserted explicitly; a test that merely returns no UI result is insufficient.
10. **Repeatability:** a clean local reset and test run succeeds from documented commands.

## Implementation sequence

- Reconcile root SQL files against the current schema and migration history.
- Add the Supabase CLI configuration and canonical migrations without changing the live database.
- Add synthetic seed fixtures and database tests for tenant isolation.
- Implement tenant schema and authorization in local migrations.
- Run local tests and code review; create a GitHub PR.
- Only after all gates pass, prepare a separate production backup/restore and cutover plan.

## Current status

This document is a plan, not evidence that the local stack or migration suite has already been run. No Supabase branch was created, no local schema was applied, and no production database changes were made.
