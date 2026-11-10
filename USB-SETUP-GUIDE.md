# CampusSign — Flash-drive setup and recovery guide

This folder is a portable **source-code handover**. It lets you keep a complete copy of the frontend, SQL migration scripts and setup instructions for use on another Windows computer later.

## 1. What to copy to the flash drive

Copy the entire `CampusSign-USB-Release` folder to your flash drive. Rename the copied folder to `CampusSign` if you prefer. Keep the folder structure intact.

Important files:

- `src/` — application source code, camera/face components and UI.
- `public/` — public static assets and response headers.
- `supabase-*.sql` — database schema, policies and function migrations.
- `.env.example` — configuration template. It contains only public frontend settings.
- `START-LOCAL-WINDOWS.bat` — installs dependencies and starts a local development server.
- `BUILD-WINDOWS.bat` — builds the production frontend.
- `README.md` — project overview and deployment notes.

The folder intentionally does not include `node_modules/` or `dist/`. Dependencies can be reinstalled from `package.json`; this keeps the handover much smaller. An internet connection is required for the first `npm install` unless you separately prepare an npm cache/offline package mirror.

## 2. Set it up later on a Windows computer

1. Copy the `CampusSign` folder from the flash drive onto the computer (for example, `C:\Projects\CampusSign`). Running projects directly from a flash drive is possible but not recommended because removable drives can be slow or disconnect.
2. Install Node.js 20 LTS or newer from https://nodejs.org/.
3. Open the copied folder and double-click `START-LOCAL-WINDOWS.bat`.
4. On first run, it creates `.env` from `.env.example` and runs `npm install`.
5. When Vite starts, open the local address it prints (usually `http://localhost:5173`).
6. The project currently has no committed npm lockfile. After `npm install` succeeds, retain the generated `package-lock.json` and commit it to the private repository to make later installs more reproducible.
6. Leave the command window open while the site is running. Press `Ctrl+C` to stop it.

To create a production build, double-click `BUILD-WINDOWS.bat`. The build is written to `dist/`.

## 3. If you set it up on a different Supabase project

The app currently points to the existing CampusSign Supabase project by default. If you want to use a different Supabase project:

1. Create the Supabase project.
2. Open Project Settings → API (or the project's API keys area) and copy the Project URL and publishable key.
3. In the CampusSign folder, edit `.env` (create it by copying `.env.example` if it does not exist).
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the new project's public values.
5. Do not use or paste a `service_role` secret into the frontend.
6. Apply the nine SQL migrations in order as listed in `README.md`.
7. Configure Supabase Auth settings and redirect URLs for the local and production site addresses.
8. Create/verify administrator and lecturer accounts using the documented secure admin process.

Changing the Supabase project creates a separate database. It does **not** copy existing student profiles, attendance history or face templates.

## 4. Preserve the live database separately

The SQL migration files only create/modify schema, policies and functions. They do not contain the current live data. For a complete disaster-recovery backup, keep a separate, access-controlled database backup from Supabase using the backup/export process supported by your plan.

Supabase currently documents daily automatic database backups for Pro, Team and Enterprise projects; its Free-tier guidance is to regularly export data with the Supabase CLI and keep an off-site copy. See https://supabase.com/docs/guides/platform/backups. Important: a default `supabase db dump` is not a complete data backup; the CLI documentation says its default dump omits data and excludes managed schemas such as `auth` and `storage`. It must be planned with the correct data/role options, plus separate Storage object backup when those are used. See https://supabase.com/docs/reference/cli/supabase-db-dump.

Biometric descriptors, student identity details, login identities and attendance records are sensitive. Encrypt the backup, restrict who can access it, record the date it was created, and test restoration to a separate project before relying on it. Do not place production database passwords or service-role secrets in this flash-drive folder. The ZIP I prepared does not contain a database backup.

## 5. Restore the live Cloudflare deployment

The current live address recorded for the project is:

`https://campussign.irldogman.workers.dev`

To restore deployment from a new computer:

1. Install Git and Node.js 20+.
2. Copy the source to a private GitHub repository (or clone the existing private repository).
3. Confirm the correct production branch and build settings in Cloudflare Workers & Pages.
4. Configure public Supabase frontend values as build variables only if the source has been changed to rely on environment overrides; never add a service-role secret.
5. Push the project and wait for the Cloudflare deployment to report **Ready**.
6. Test lecturer login, student enrolment, camera permissions, QR scan, face verification, attendance persistence, session deletion and projector display.

Keep the old Netlify project or another known-good copy until the restored Cloudflare deployment is proven to work.

## 6. Flash-drive safety checklist

- [ ] Copy the complete `CampusSign` folder, not only the `src` folder.
- [ ] Keep a second copy on another drive or secure cloud storage.
- [ ] Keep the private GitHub repository as the primary version-control copy.
- [ ] Keep a separate protected Supabase data backup (source code ZIP is not enough).
- [ ] Never store passwords, service-role keys or database connection passwords in the source folder.
- [ ] Test the flash-drive copy by extracting it to a different folder and running the setup script.
- [ ] Label the backup with a date/version, e.g. `CampusSign-Backup-2026-11-10`.

## 7. Known limitations of this handover

- `npm install` requires internet access unless an npm cache/offline mirror has been prepared.
- This package contains the frontend source and SQL migration scripts, not a Supabase database dump or production biometric data.
- The package can be run locally, but camera access on phones requires HTTPS; localhost is treated as a secure context for local development.
- Before a major production release, run a clean `npm install`, `npm run build`, migration verification and end-to-end tests in the target environment.
