# CampusSign backup and recovery plan

This release adds audit history, but it does not create automated production backups. Database backups must remain a separate, privileged operation; never run a full database export from the public browser application.

## The three copies to maintain

1. **Private GitHub repository** — current source code and version history.
2. **Encrypted offline source backup** — the complete CampusSign release ZIP on a USB drive, plus a second copy on another trusted device.
3. **Supabase data backup** — the actual live database contents, including lecturer profiles, student rosters, attendance records, face-template rows and enrollment requests. SQL migrations alone are not data backups.

## Before every production database migration

- Confirm the target Supabase project name and project reference.
- Create a current backup using the backup/export facility supported by the project's Supabase plan and the current Supabase CLI guidance.
- Include the required application schemas and data. A schema-only dump is not sufficient.
- Keep authentication identities and any storage objects in the recovery plan; a normal application-table export may not include managed Auth data or Storage objects.
- Encrypt the backup at rest, restrict access and store it away from the production account.
- Record the date, project reference, migration version and operator.

Official guidance: https://supabase.com/docs/guides/platform/backups and https://supabase.com/docs/reference/cli/supabase-db-dump.

## Restore drill

At least once before a real production handover:

1. Create a separate, temporary Supabase project.
2. Restore the backup into that project using the supported Supabase procedure.
3. Configure a local CampusSign copy to use the temporary project's URL and publishable key.
4. Verify lecturer authentication, course/roster visibility, QR session retrieval, attendance history and enrolment request history.
5. Confirm the restored project has the correct RLS policies and SQL functions.
6. Delete the temporary project only after the drill is documented.

Never test a restore by overwriting the live production database.

## Secrets

- Never store a Supabase `service_role` key, database password or access token in GitHub, the application bundle, `.env.example` or an unencrypted USB drive.
- The frontend publishable/anon key is not a secret, but it must be protected by correct RLS and server-side RPC checks.
- Any future scheduled backup service must run in a trusted server-side environment (for example, a protected scheduled Worker or managed backup facility) and store credentials as encrypted server-side secrets. It must write backups to a private destination, not a public bucket.

## Automation status

Automated scheduled exports to an independent private backup destination are **not configured in this release**. This is intentionally not simulated in the browser: a secure backup job requires a server-side credential, a protected storage destination, retention rules, monitoring and a tested restore procedure. Use the Supabase plan's managed backups or a separately reviewed server-side backup job until that work is designed and tested.
