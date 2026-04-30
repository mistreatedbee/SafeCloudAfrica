# Secrets rotation (short runbook)

## Resend API key (`RESEND_API_KEY`)

Used by [`api/email/send.ts`](../api/email/send.ts) for transactional email (invites, notifications).

1. **Create** a new API key in the [Resend dashboard](https://resend.com/api-keys).
2. **Vercel**: Project -> Settings -> Environment Variables -> set `RESEND_API_KEY` to the new value (all relevant environments: Production / Preview / Development as needed).
3. **Redeploy** the latest production deployment (or trigger a new deploy) so serverless functions pick up the new variable.
4. **Verify**: send a test email via your product flow (e.g. user invite) or `POST /api/email/send` with a valid Bearer session and body `{ "to": "you@example.com", "subject": "Rotation test", "text": "ok" }`. Confirm delivery and check Vercel function logs; successful sends are also recorded as operational events where configured.
5. **Revoke** the old Resend key in the dashboard after cutover.
6. **Rollback**: restore the previous `RESEND_API_KEY` in Vercel and redeploy if something fails.

If your sending domain changes, update **`EMAIL_FROM`** in Vercel to match a verified domain in Resend, such as `noreply@mg.safecloudafrica.com`. Do not use consumer domains like `gmail.com`, and remember that `resend.dev` is only suitable for limited test sending.

## `vercel.json` and InsForge URL

This repo now uses a **same-origin Vercel proxy** for auth and API compatibility:

- `/api/(.*)` -> `/api/insforge-proxy?path=$1`
- `/functions/(.*)` -> `/api/insforge-functions?path=$1`

Those rewrite targets are intentionally local Vercel functions, not direct InsForge URLs. The proxy reads `INSFORGE_BASE_URL` / `VITE_INSFORGE_BASE_URL` at runtime and applies auth compatibility shims for legacy tenants.

When auth proxy behavior, `vercel.json`, or `INSFORGE_BASE_URL` changes:

1. Confirm [`vercel.json`](../vercel.json) still routes through the local proxy handlers above.
2. Redeploy the Vercel project so the new serverless proxy code is active.
3. Verify login and session refresh in production after deployment.

If production shows `405` on `/api/auth/sessions` or `/api/auth/refresh`, first confirm the latest deployment is serving the current proxy-based `vercel.json` rather than an older direct-to-InsForge rewrite setup.
