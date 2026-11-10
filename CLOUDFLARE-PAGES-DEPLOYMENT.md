# CampusSign — Cloudflare deployment note

## Current production target

The current live test deployment is a **Cloudflare Worker**, not a Cloudflare Pages project:

- `https://campussign.irldogman.workers.dev`

The earlier Pages instructions below are retained only as a reference for a future move to Pages. Do not create a second deployment just because the URL ends in `workers.dev`.

## Updating the current Worker

1. Commit the changed project files to the connected GitHub repository.
2. In Cloudflare Dashboard, open **Workers & Pages → campussign → Settings → Builds**.
3. Confirm the repository and production branch are the intended GitHub source and `main` (or the actual production branch in use).
4. Confirm the build uses `npm run build` and the deployment configuration serves the Vite output from `dist` as Worker static assets.
5. Watch the new deployment until it reports **Ready**.
6. Test the live Worker URL before retiring or deleting the old Netlify project.

If Git-based builds are not connected, a Git push alone will not deploy the app; use the Worker deployment method currently configured in the dashboard or finish connecting the repository first.

## Legacy Pages reference (not the current deployment)

If CampusSign is deliberately moved to Cloudflare Pages in the future, the Vite settings are:

- Framework preset: Vite
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `/` when the repository root contains `package.json`; otherwise set it to the folder containing the app.

The application uses Supabase directly and does not require Netlify Functions. Keep Supabase RLS and RPC checks enabled. Never put a Supabase `service_role` secret in frontend code.
