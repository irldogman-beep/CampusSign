# CampusSign Android app

## Current approach

CampusSign already has a responsive React/Vite web application and an installable PWA. The Android app will use **Capacitor** to package the same application, authentication and Supabase backend. This avoids maintaining a second attendance implementation.

- Android application ID: `com.campussign.app`
- Display name: `CampusSign`
- Web build output: `dist/`
- Native wrapper: Capacitor Android
- Backend: the existing Supabase project; no database migration is required for the wrapper foundation.

## Build a test APK

The repository includes an on-demand GitHub Actions workflow:

1. Open the CampusSign repository on GitHub.
2. Select **Actions** → **CampusSign Android (debug APK)**.
3. Select **Run workflow** on the branch you want to test.
4. Wait for the workflow to finish, then open its run and download the `campussign-android-debug` artifact.
5. Extract the artifact and install the APK on an Android test device. Android may ask you to allow installation from the browser/file manager used to open it.

This is a **debug/test APK**, not a Play Store release. It is signed with the standard debug key and is not suitable for publishing or production updates.

The workflow creates the Android project during the run, builds the APK and uploads it as an artifact. It does not commit generated Android project files to the repository, change the Cloudflare deployment, or modify Supabase.

## Required device testing before release

The first APK is a packaging smoke test. Before calling the app production-ready, test on real Android devices:

- Sign-in, sign-out, session restoration and password recovery.
- Front and rear camera permission prompts, camera startup, camera switching and cleanup.
- Face model download, liveness prompts, enrolment, verification and interrupted network recovery.
- QR scanning, QR display, expiry and attendance submission.
- External links, file exports, notifications and Android back navigation.
- Screen sizes, keyboard behaviour, status/navigation bars and app resume after backgrounding.

Camera access is particularly important. The web app uses live browser video (getUserMedia) for face capture and QR scanning. A successful APK build does **not** prove those flows work inside Android WebView. If device tests show a WebView permission limitation, implement and test the required native permission bridge before release; do not weaken face or attendance verification to work around it.

## Release path

1. Complete the debug APK smoke test and device camera tests.
2. Commit and maintain the generated Android project in the repository when native configuration/customization is introduced.
3. Add app icon, splash screen, status/navigation bar styling, versioning and privacy disclosures.
4. Configure a protected Android release-signing key using GitHub encrypted secrets. Never commit keystores or passwords.
5. Build a signed Android App Bundle (AAB), test an internal release, then prepare Play Store publication.

## Safety boundaries

- This wrapper uses the existing single-institution CampusSign backend.
- No multi-institution schema or permission changes are part of this work.
- No production database writes or Cloudflare deployment are triggered by the Android workflow.
- Do not store face descriptors, QR secrets, Supabase service-role credentials or attendance records in Android local storage for offline check-in. Attendance remains server-validated.
