# CampusSign

CampusSign is a browser-based university attendance application built with React, Vite, TypeScript, Supabase and browser camera APIs.

**Current Cloudflare test deployment:** https://campussign.irldogman.workers.dev  
**Previous Netlify address:** https://campussign.netlify.app (keep the Netlify project until the team confirms it is no longer needed).

## Current functionality

- Lecturer registration and Supabase authentication, with an administrator verification gate.
- Student self-enrolment: profile details, course selection, face capture and separate course-lecturer approval requests.
- Lecturer review inbox for approving/rejecting enrolment requests.
- Attendance sessions with signed QR check-in.
- Lecturer-selectable QR lifetime: 30 seconds by default; 1, 2, 5 or 10 minutes; or static until the session closes.
- Server validation of QR freshness/signature and a 10-second previous-slot grace period for rotating QR codes.
- A QR-only projector window so the lecturer's dashboard and student roster are not projected.
- Face verification with liveness prompts, optional location checks and duplicate-face review workflow.
- Attendance record editing/deletion and whole closed-session deletion.
- CSV export, dark/light theme, responsive layouts and reduced-motion support.

## Quick start on Windows

Requirements: Windows 10/11, Node.js 20 LTS or newer, npm, and an internet connection for installing dependencies.

1. Extract the `CampusSign` folder to a writable location (do not run it from inside the ZIP preview).
2. Install Node.js from https://nodejs.org/ if it is not already installed.
3. Double-click `START-LOCAL-WINDOWS.bat`.
4. The first run copies `.env.example` to `.env` and installs dependencies. Then Vite prints a local address, normally `http://localhost:5173`.
5. Keep the terminal window open while using the local app. Press `Ctrl+C` to stop it.

The project currently does not include a committed npm lockfile. After the first successful `npm install`, npm will create `package-lock.json`; keep it and commit it to your private repository so future installs use a reproducible dependency tree.

Alternatively, open Command Prompt in the project folder and run:

```bash
npm install
npm run dev
```

Build the production files:

```bash
npm run build
npm run preview
```

The production output is written to `dist/`. `BUILD-WINDOWS.bat` runs the production build for you.

## Supabase configuration

The current public Supabase URL and publishable key are provided as safe defaults in `src/supabase.ts` and `.env.example` so the existing CampusSign project can be run without configuration changes. For another Supabase project, edit `.env` (never commit `.env`) and set:

```env
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR-PUBLISHABLE-KEY
```

A legacy `VITE_SUPABASE_ANON_KEY` is also accepted. **Never put a Supabase `service_role` key in frontend code, `.env`, GitHub or Cloudflare frontend build variables.** Browser keys are public; Row Level Security (RLS), database policies and server-side RPC checks must protect the data.

## Database migration order

Before running migrations against a database that contains real students or attendance records, take a database backup. Apply the SQL files in Supabase SQL Editor in this exact order:

1. `supabase-setup.sql`
2. `supabase-step2.sql`
3. `supabase-step3-facefix.sql`
4. `supabase-step4-location.sql`
5. `supabase-step5-sessions.sql`
6. `supabase-step6-self-enrollment.sql`
7. `supabase-step7-delete-session-lists.sql`
8. `supabase-step8-qr-lifetime-and-display.sql`
9. `supabase-step9-face-duplicate-review.sql`

Run each file once, in order, and inspect the SQL Editor result before continuing. Do not run Step 6–9 on a brand-new database without first running Steps 1–5. The migration scripts describe database structure and functions; **they are not a backup of actual student, biometric or attendance data.** For Supabase backup coverage and plan-specific details, see https://supabase.com/docs/guides/platform/backups. Supabase notes that a default CLI schema dump omits data and managed `auth`/`storage` schemas; plan a full backup deliberately and separately back up Storage objects if used: https://supabase.com/docs/reference/cli/supabase-db-dump.

After migrations, create/verify a lecturer account and confirm an administrator sets the account's `is_verified` field through the approved admin procedure before using lecturer tools. Do not manually mark unknown accounts verified.

## Cloudflare deployment

The current observed production URL is a Cloudflare Worker under `workers.dev`, not a Pages `pages.dev` site. If Git integration is enabled, push commits to the configured production branch (currently expected to be `main`) and check Cloudflare Dashboard → Workers & Pages → `campussign` → Deployments. The latest deployment should show **Ready** before testing.

For a new Cloudflare Worker deployment using this Vite project, check the current Worker build integration/settings in the Cloudflare dashboard rather than blindly creating a Pages project. The frontend build command is `npm run build`; the output directory is `dist`. Configure the same `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` values in Cloudflare's build environment if you use environment overrides.

Do not delete the previous Netlify project until Cloudflare has been tested end-to-end and the intended official address has been shared with lecturers and students.

## Projector window

From a live lecturer attendance session, use **Projector view**. It opens a separate QR-only browser window. Move that window to the classroom projector using Windows display settings (`Win + P` → Extend), then maximise/fullscreen it. The lecturer keeps the private portal on the laptop. The projector display uses a same-browser `BroadcastChannel` and is not a remote public display link.

## Security and privacy reminders

- Face descriptors are sensitive biometric data. Limit access, define retention/deletion rules, get appropriate consent, and check applicable university and local privacy obligations before wider deployment.
- Duplicate-face detection is a warning, not proof of identity. The review workflow requires a verified lecturer to check identity and provide a reason; review overrides are recorded in the audit table.
- Static QR mode is less resistant to screenshot sharing than rotation. A QR by itself cannot prove physical presence.
- Camera access requires HTTPS (or localhost during local development) and browser/device permissions.
- Do not put real service credentials, passwords or database connection strings in this folder or share them on a flash drive.

## Validation status

The interface has received a UI polish pass: theme preference persistence, tab transition replay, responsive interaction feedback, modal entrance motion, improved keyboard focus and reduced-motion support. A full clean dependency install and production build must still be run in the target environment before treating this release as production-verified.
