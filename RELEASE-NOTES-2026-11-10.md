# CampusSign UI polish and portable release notes

Release date: 10 November 2026

## User experience changes in this package

- Portal changes replay a short, eased page transition rather than switching abruptly.
- Modals and overlays use a restrained entrance animation.
- Buttons, links and form controls now have consistent hover, press and keyboard-focus feedback.
- Main dashboard cards use subtle hover/border feedback on pointer devices.
- The page has a subtle forest-green/academic-gold ambient background treatment.
- Dark/light mode uses Sun/Moon icons, is labelled for assistive technology, and remembers the user's preference between visits. First use follows the device colour preference.
- Reduced-motion preferences are respected so users who disable animations receive near-instant transitions.
- Updated page metadata gives the browser a descriptive title and theme colour.
- Removed an unsupported ISO-27001 compliance statement from the footer; the application must not imply external certification that has not been independently verified.

## Portability changes

- Supabase frontend values can be overridden with `.env` values while retaining safe defaults for the existing public project configuration.
- Added `.env.example`, environment variable typing, Windows start/build scripts, flash-drive instructions, and a Cloudflare Workers-specific deployment note.
- Added `npm run check` for a TypeScript check after dependencies are installed.
- Removed the stale Pages-only deployment note to reduce confusion with the current `workers.dev` deployment.

## Validation

- TypeScript syntax transpilation: 10 application source files passed.
- ZIP archive integrity: verify after packaging.
- Full dependency installation and Vite production build: not completed in the authoring environment; npm install timed out and `node_modules` is not included. Run `npm install`, `npm run check` and `npm run build` on the target computer before deployment.
- No Supabase migrations were executed during this UI/packaging pass. The package contains the existing migrations 1–9.

## Not included

- Live Supabase records, user accounts, biometric face descriptors, QR/session history, or attendance records.
- Supabase database password, service-role key, Cloudflare API token, or GitHub credentials.
- `node_modules/` and `dist/`; they are generated locally by npm/Vite.
