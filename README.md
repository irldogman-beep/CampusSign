# CampusSign

CampusSign is a browser-based university attendance application built with React, Vite, TypeScript, Supabase and browser camera APIs. The live Cloudflare address currently used for testing is:

- https://campussign.irldogman.workers.dev

## Main capabilities

- Lecturer registration, authentication and administrator verification gate.
- Student self-enrolment with profile details, course selection and face capture.
- Per-course lecturer enrolment-request inbox and approval workflow.
- Lecturer-created attendance sessions with QR check-in.
- Configurable signed QR lifetime: 30 seconds by default, 1, 2, 5 or 10 minutes, or static until the session closes.
- Face matching and optional classroom-location checks during attendance.
- Attendance review, individual record edits/deletion, and deletion of complete closed session lists.
- CSV export and a separate QR-only projector display window.

## Local development

Requirements: Node.js 20 or newer and npm.

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

Vite writes the production site to `dist/`.

## Supabase setup and migration order

Apply the SQL files in Supabase SQL Editor in order, after backing up production data:

1. `supabase-setup.sql`
2. `supabase-step2.sql`
3. `supabase-step3-facefix.sql`
4. `supabase-step4-location.sql`
5. `supabase-step5-sessions.sql`
6. `supabase-step6-self-enrollment.sql`
7. `supabase-step7-delete-session-lists.sql`
8. `supabase-step8-qr-lifetime-and-display.sql`
9. `supabase-step9-face-duplicate-review.sql`

Step 8 is required before the new UI can create sessions with a QR-lifetime selection. It adds `sessions.qr_interval_seconds` and updates the server-side `session_info` RPC to enforce that setting. Existing rows get the 30-second default.

Step 9 replaces automatic duplicate-face rejection with a possible-match review. It records the closest same-course roster entry, lets a verified lecturer approve only after an in-person identity check and a written reason, and records that override in `face_duplicate_review_audit`. It does not expose biometric descriptors to the lecturer UI.

## QR lifetime behaviour

The lecturer chooses the lifetime when creating an attendance session:

- 30 seconds (default)
- 1 minute
- 2 minutes
- 5 minutes
- 10 minutes
- Never rotate: a static QR remains valid until the session is ended, revoked or automatically expires

For rotating codes, the previous interval's signed code is accepted for an additional 10-second grace period to accommodate camera/network delay. Once a student scans a valid QR, Supabase issues the existing 10-minute check-in ticket; this is separate from how often the displayed QR rotates. Ending or revoking the session invalidates outstanding tickets.

Static mode is easier for students but makes a screenshot shareable for the entire time the session remains open. Use it only when that trade-off is acceptable and the other configured checks (face verification and/or location) are appropriate.

## Projector-only display

From a live lecturer session, click **Projector view** above the QR card. CampusSign opens a separate browser window at `?display=qr`. That window contains only:

- CampusSign branding;
- course/session title, lecturer and venue;
- the signed QR payload as a QR image;
- the selected QR rotation status and student scan instructions.

The projector window receives this display data through the same-origin `BroadcastChannel`. It does not receive the lecturer's session secret, dashboard, roster or attendance records. Use the operating system's display controls to move this window to the classroom projector/extended display, then use the display's fullscreen control or the browser's fullscreen shortcut.

If the browser blocks the popup, allow pop-ups for the CampusSign site and click **Projector view** again. The display window requires a modern browser with `BroadcastChannel` support.

## Deployment notes

The current deployment is on Cloudflare Workers and uses the `workers.dev` address above. It is not the old Netlify deployment and it is not a Pages `pages.dev` project. Check the Worker in Cloudflare Dashboard → Workers & Pages → `campussign` → Settings → Builds to confirm whether Git-based automatic deployments are enabled.

The application connects directly to Supabase. The Supabase URL and publishable key in `src/supabase.ts` are client-side configuration; never place a Supabase `service_role` key in frontend code or browser environment variables. Keep RLS policies and security-definer RPC checks enabled.

## Important security and privacy notes

- QR signatures are generated with the per-session secret in the lecturer client and validated by the Supabase `session_info` function. The secret is not placed in the QR payload.
- The projector display receives only a signed QR URL and non-sensitive display labels.
- The student-facing flow uses HTTPS because camera APIs require a secure context.
- Face descriptors are sensitive biometric data. Restrict access, set retention rules, obtain appropriate consent, and review applicable institutional and local privacy requirements before wider deployment.
- Duplicate-face screening is a warning, not a proof of identity. Step 9 keeps the score server-side and requires a verified lecturer to check institutional identity in person before an override; every override is audited.
- Face enrolment now checks that exactly one face is visible at capture time and that the five samples are mutually consistent. If the samples appear mixed or unstable, the capture is rejected and the student is asked to retry.
- A QR code, even when rotating, does not independently prove physical presence. Face verification, location checks, class supervision and sensible session duration remain separate controls.

## Validation record

The new and changed TypeScript/TSX files were syntax-transpiled with TypeScript. A full `npm run build` could not be completed in the authoring environment because npm dependency installation timed out. Apply the Step 8 and Step 9 migrations in Supabase and run a production build/test in the connected project environment before treating this release as production-verified.
