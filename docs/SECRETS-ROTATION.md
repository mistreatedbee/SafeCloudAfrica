# Secrets rotation (short runbook)

## Resend API key (`RESEND_API_KEY`)

Used by [`api/email/send.ts`](../api/email/send.ts) for transactional email (invites, notifications).

1. **Create** a new API key in the [Resend dashboard](https://resend.com/api-keys).
2. **Vercel**: Project → Settings → Environment Variables → set `RESEND_API_KEY` to the new value (all relevant environments: Production / Preview / Development as needed).
3. **Redeploy** the latest production deployment (or trigger a new deploy) so serverless functions pick up the new variable.
4. **Verify**: send a test email via your product flow (e.g. user invite) or `POST /api/email/send` with a valid Bearer session and body `{ "to": "you@example.com", "subject": "Rotation test", "text": "ok" }`. Confirm delivery and check Vercel function logs; successful sends are also recorded as operational events where configured.
5. **Revoke** the old Resend key in the dashboard after cutover.
6. **Rollback**: restore the previous `RESEND_API_KEY` in Vercel and redeploy if something fails.

If your sending domain changes, update **`EMAIL_FROM`** in Vercel to match a verified domain in Resend.

## `vercel.json` and InsForge URL

Rewrite destinations in [`vercel.json`](../vercel.json) (`/api/*` and `/functions/*` → InsForge) are **static** and do not read `process.env`. Whenever **`INSFORGE_BASE_URL`** / **`VITE_INSFORGE_BASE_URL`** changes, update those destinations to the same InsForge origin, or run:

```bash
INSFORGE_BASE_URL=https://your-project.us-west.insforge.app node scripts/sync-vercel-insforge-rewrites.mjs
```

Then commit the updated `vercel.json` and deploy.
