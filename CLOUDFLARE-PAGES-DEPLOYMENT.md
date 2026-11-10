# Deploy CampusSign to Cloudflare Pages

CampusSign is a Vite/React static frontend. Its authentication, database, and attendance RPCs are handled by Supabase; it does not use Netlify Functions. That makes Cloudflare Pages a good low-cost hosting fit.

## Deploy

1. Push the `campussign` folder to a GitHub repository (or use the folder as the project root if the repository contains other projects).
2. In Cloudflare Dashboard, open **Workers & Pages → Create → Pages → Connect to Git**.
3. Select the repository and set:
   - **Production branch:** your deployment branch (usually `main`)
   - **Framework preset:** Vite
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** `campussign` only if the repository contains the project inside that subfolder; otherwise `/`.
4. Save and deploy. Cloudflare Pages will build the app and publish `dist`.
5. Add your custom domain under the Pages project's **Custom domains** tab if needed.
6. Test sign-in, student self-enrolment, camera permissions, QR scanning, Supabase requests, and a complete attendance check-in on the deployed URL.

## Static hosting and Supabase

- The `public/_headers` file is copied by Vite into `dist/_headers`; Cloudflare Pages uses it to apply the app's security headers.
- The app connects directly to Supabase. Keep Supabase Row Level Security (RLS) and RPC checks enabled. The Supabase publishable/anon key is intended to be present in browser code; never place a Supabase `service_role` secret in the frontend.
- Camera access requires HTTPS. The default `*.pages.dev` domain provides HTTPS.
- There are no Netlify-specific functions to migrate in this project. `netlify.toml` is ignored by Cloudflare Pages and may be kept for rollback or removed once Cloudflare is working.

## Before switching DNS

Deploy first to the temporary `*.pages.dev` address. Test all lecturer and student workflows there. Then add the custom domain in Cloudflare Pages and follow the domain-assignment instructions before changing DNS. Keep the existing Netlify site available until the Cloudflare version has passed those tests.
