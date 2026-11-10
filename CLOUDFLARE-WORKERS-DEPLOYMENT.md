# Cloudflare Workers deployment notes

CampusSign's current test deployment has been observed at `https://campussign.irldogman.workers.dev`. The Cloudflare dashboard showed a Worker deployment, so this guide intentionally refers to Workers rather than Pages.

## Existing deployment — safest path

1. Open Cloudflare Dashboard → Workers & Pages → `campussign`.
2. Open Settings → Build.
3. Confirm Git provider, private GitHub repository and production branch (`main`).
4. Record the current Build command, Deploy command and any environment variables before changing them.
5. Do not create a second Worker or alter deployment commands merely because the source ZIP is being restored. Preserve the working configuration already attached to the account.
6. Commit a small change to the configured branch and confirm Cloudflare reports the latest deployment as Ready.
7. Test the `workers.dev` address before considering Netlify retirement.

Cloudflare Workers Builds uses a build step (for example `npm run build`) followed by a deploy step (typically Wrangler). The deploy command/configuration depends on how the Worker was originally created. Current official documentation: https://developers.cloudflare.com/workers/ci-cd/builds/configuration/

## Local project build

```bash
npm install
npm run build
npm run preview
```

The Vite build output is `dist/`. This repository is a Vite frontend that communicates directly with Supabase. Do not add a Supabase `service_role` key to Cloudflare build variables. Only public frontend values such as the project URL and publishable key are appropriate.

## Important distinction

Cloudflare Pages and Cloudflare Workers are related but different deployment products. The current observed site uses the `workers.dev` hostname. Do not follow a Pages-specific setup guide or create a new Pages project unless intentionally migrating deployment architecture.
