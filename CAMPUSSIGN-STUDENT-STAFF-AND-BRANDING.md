# CampusSign Student / Staff apps and branding

## App entrypoints

CampusSign is presented as two separate products over the same backend:

- Student web app: `/?app=student`
- Staff web app: `/?app=staff`

The default installable PWA manifest opens the Student app. The Staff route selects a dedicated manifest, app label and staff-only login view.

Native Android builds use the `CAMPUSSIGN_APP` environment variable:
- `student` → package `com.campussign.student`
- `staff` → package `com.campussign.staff`

The Android workflow builds both APKs as separate artifacts. Both packages intentionally use the existing Supabase project, Auth users, academic catalogue, attendance records, sessions and permissions. They are two client experiences, not two databases.

## Student entry and QR fallback

The Student app opens the student account portal in **login** mode by default. New students can switch to registration. If a student cannot sign in, the login screen offers **Continue with QR without signing in**. This opens the QR check-in flow only; it does not create or authenticate an account.

The Staff app opens the existing lecturer/admin login. Staff features continue to rely on the existing server-side verification and administrator role checks.

## Administrator branding studio

Open **Admin → Branding studio** to configure:
- Brand name and tagline
- Logo image (PNG, JPG or WebP; max 2 MB)
- Primary, accent and background colours
- Student and Staff app display names
- Student and Staff welcome text
- Support email

Settings are stored in the singleton `public.campus_branding_settings` row. Public clients can read branding, but only a verified administrator can update it. Uploaded logo files live in the public-read `campus-branding` bucket; upload, replacement and deletion policies require `public.is_admin()`.

The migration is additive. It does not modify attendance, student, lecturer, session, course, biometric or authentication records. If branding cannot load, the apps fall back to the built-in CampusSign identity.

## Deployment and testing

The code changes are on `feature/student-staff-spaces-and-branding`. Merge only after CI and both Android builds pass. Cloudflare's production deployment should follow the normal merge-to-main workflow.

Before installing APKs, check that the two package IDs differ and both artifacts were produced. On a physical Android device, separately test:
1. Student login and registration.
2. QR bypass from the unauthenticated login screen.
3. Staff login and administrator branding controls.
4. Logo upload and theme update in both app spaces.
5. Camera, face verification and location permissions.

A successful compile does not prove camera, face or GPS behavior on a real device.
