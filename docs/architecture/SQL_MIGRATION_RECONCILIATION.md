# CampusSign SQL migration reconciliation inventory

**Review date:** 2026-11-16  
**Scope:** repository SQL artifacts, README migration instructions and the connected Supabase migration-history table.  
**Mode:** read-only review. No database writes or schema changes were made.

## Findings at a glance

- The repository root contains 18 SQL files: the original setup, numbered Steps 2–17, and a separate `CampusSign-Step11-FIXED.sql`.
- There is no `supabase/config.toml` and no canonical `supabase/migrations/` directory in the default branch.
- The README migration instructions list Steps 1–11 only. They do not include Steps 12–17, even though those scripts exist and later features depend on them.
- The connected Supabase project reports 20 entries in its migration history. The recorded history starts with later admin/student-account changes and does not provide a complete, one-to-one record of the original root-level Steps 1–9.
- Therefore, the root SQL files are not currently a safe, self-contained, reproducible database bootstrap sequence. Do not use them as a local reset sequence or replay them against production.

The migration-history gap does **not** prove that the corresponding schema objects are missing. Earlier scripts may have been applied manually through SQL Editor, and later migrations may have been applied through Supabase tooling. It means the repository and hosted migration ledger do not yet form a single authoritative history.

## Repository SQL inventory

| Artifact | Intended area | Reconciliation note |
|---|---|---|
| `supabase-setup.sql` | Step 1 lecturer identity/profile and Auth trigger | Found at repository root; initial schema script. |
| `supabase-step2.sql` | Step 2 roster, face templates, sessions, attendance, QR helpers | Found; foundational dependencies for later steps. |
| `supabase-step3-facefix.sql` | Step 3 face matching/check-in replacement | Replaces the earlier check-in implementation. |
| `supabase-step4-location.sql` | Step 4 location checks and check-in replacement | Drops/replaces the prior check-in function signature. |
| `supabase-step5-sessions.sql` | Step 5 session settings and face matching helpers | Alters sessions/attendance and defines helper functions. |
| `supabase-step6-self-enrollment.sql` | Step 6 student enrolment requests and attendance maintenance | Adds sensitive pending face descriptors and RPC workflows. |
| `supabase-step7-delete-session-lists.sql` | Step 7 closed-session deletion | Adds delete grant/policy for owned closed sessions. |
| `supabase-step8-qr-lifetime-and-display.sql` | Step 8 QR lifetime options | Adds session QR interval and replaces session validation logic. |
| `supabase-step9-face-duplicate-review.sql` | Step 9 duplicate-face review | Adds duplicate candidate metadata and review audit. |
| `supabase-step10-admin-notifications-analytics-audit.sql` | Step 10 admin, notifications, analytics, audit | Contains a transaction and admin role/functions. |
| `supabase-step11-academic-catalog.sql` | Step 11 central departments/courses catalogue | Original Step 11 file; previously encountered a duplicate department-code issue in a live migration attempt. |
| `CampusSign-Step11-FIXED.sql` | Step 11 corrected variant | Separate root file with the same Step 11 purpose. Must compare full contents and provenance before selecting the canonical version. Do not apply both. |
| `supabase-step12-security-hardening.sql` | Step 12 grants, audit helper and public enrolment throttling | Includes privilege changes; must be reviewed in order with Step 6 and Step 10. |
| `supabase-step13-student-accounts.sql` | Step 13 student sign-in accounts/dashboard | Replaces the Auth user trigger path and introduces student account workflow. |
| `supabase-step14-admin-first-student-approval.sql` | Step 14 admin-first student approval | Uses `pg_get_functiondef` and anchored text replacement; depends on an exact existing function body and is not a generic bootstrap migration. |
| `supabase-step15-admin-announcements-and-student-account-management.sql` | Step 15 expanded announcements and student-account management | Alters constraints and adds student audience targeting. |
| `supabase-step16-student-account-roster-cleanup.sql` | Step 16 account deletion/roster cleanup | Replaces an admin RPC; depends on existing table and function definitions. |
| `supabase-step17-student-department-reroll.sql` | Step 17 department reroll | Adds request workflow and admin/student RPCs; depends on student accounts and central catalogue. |

## Connected Supabase migration ledger

The connected project reports these 20 recorded migration entries:

| Version | Recorded migration name |
|---|---|
| 20261116140433 | `admin_management_actions_and_analytics` |
| 20261116140636 | `guard_legacy_course_references_on_delete` |
| 20261116143808 | `notification_read_state_and_dismiss_actions` |
| 20261116144754 | `admin_announcement_centre` |
| 20261116144912 | `index_admin_announcement_foreign_keys` |
| 20261116145725 | `student_accounts_and_dashboard` |
| 20261116145933 | `harden_student_account_review` |
| 20261116150030 | `index_student_account_review_fk` |
| 20261116152404 | `admin_first_student_approval_gate` |
| 20261116152541 | `clean_admin_first_student_review` |
| 20261116152626 | `restrict_student_enrollment_submission_to_signed_in_users` |
| 20261116154424 | `expand_admin_notifications_and_student_account_deletion` |
| 20261116154521 | `fix_announcement_recipient_constraint_compatibility` |
| 20261116154616 | `allow_expanded_announcement_audiences` |
| 20261116155040 | `include_pending_students_and_all_staff_in_announcements` |
| 20261116160816 | `student_account_roster_cleanup` |
| 20261116161049 | `student_account_roster_cleanup_by_student_id` |
| 20261116162104 | `student_department_reroll_workflow` |
| 20261116162603 | `index_department_reroll_reviewer` |
| 20261116163019 | `validate_department_reroll_admin_decision` |

These entries provide useful evidence for the later admin, student-account, announcement, roster-cleanup and reroll work. They do not directly identify the exact root SQL file content used for every recorded change. The ledger does not contain a simple mapping to every numbered script.

## Material risks before local bootstrap

1. **Missing canonical migration directory.** Supabase CLI cannot reproduce the database from a clean local reset using the repository as it stands.
2. **README is stale.** It tells users to stop at Step 11, while later app functionality and SQL scripts rely on Steps 12–17.
3. **Step 11 has two variants.** The fixed version must be diffed against the original and the actual deployed schema before choosing a canonical source. The duplicate-key incident must be understood, not hidden by blindly choosing a file.
4. **Function-body patching is order-sensitive.** Step 14 uses exact source-code anchors against an existing RPC. It must be converted into a deterministic migration only after verifying the expected function definition.
5. **Privilege changes are order-sensitive.** Step 12 changes grants and Step 6 defines policies/RPCs. Their combined effective permissions must be tested, not inferred from each file alone.
6. **Later migration entries may contain fixes not present in the root scripts.** The live migration ledger has multiple follow-up changes for admin notifications, account review and reroll. A migration baseline must preserve those fixes.
7. **No live DDL should be used to discover migration order.** Read-only schema inspection and SQL source review must precede any local migration reconstruction.

## Safe reconciliation procedure

### A. Preserve evidence

- Keep the current root SQL files unchanged.
- Export the live schema definitions, policies, triggers, functions, grants and constraints using a documented read-only procedure.
- Record the exact migration ledger output and database project identifier in a private operational record; do not commit secrets, user data or biometric data.
- Do not export production rows into the local fixture environment.

### B. Compare source to live schema

For each SQL artifact:
- Extract created/altered tables, columns, constraints, indexes, triggers, policies, functions and grants.
- Compare definitions with the live database catalog.
- Identify later replacements or overrides of the same function/policy.
- Record whether the change was applied by a root script, a timestamped migration, a manual SQL Editor operation, or remains uncertain.
- Resolve the Step 11 original/fixed difference explicitly.

### C. Build the canonical baseline

- Create a Supabase CLI project configuration.
- Create ordered timestamped migrations from verified source, not by copying the entire current database dump into one opaque migration.
- Where original history cannot be reconstructed exactly, create a clearly labelled baseline migration representing the verified schema state, followed by forward-only migrations for subsequent changes.
- Include a separate local-only seed containing synthetic institutions and users.
- Add database tests for RLS, RPC execution grants, role escalation, QR tenant scoping and cross-tenant foreign-key rejection.
- Ensure a clean local reset reproduces the expected schema and passes tests before using the baseline for any further implementation.

### D. Production safety

- No migration reconstruction command should target the hosted production database.
- No `db reset`, `db push`, migration apply, schema alteration, grant change or data update should be run on production as part of this work.
- A production cutover remains blocked until a restorable backup is demonstrated and a development copy passes all acceptance tests.
- The paid Supabase branch was not created. Local Docker/Supabase remains the proposed zero-cost route.

## Current conclusion

The next safe engineering action is a **schema-to-source comparison**, starting with the Step 11 variants and the Step 12–17 changes, because those are the later root-level scripts that correspond most closely to the recorded migration ledger and the current application features. A canonical local migration history should be created only after this comparison is complete.

This document records findings and a procedure; it does not claim that a local database has been initialized or that migrations have been tested.
