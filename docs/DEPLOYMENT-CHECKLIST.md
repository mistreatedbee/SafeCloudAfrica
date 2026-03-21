# SafeCloud Africa — Deployment Checklist (Vercel + InsForge)

Use this checklist when deploying the IDSMP upgrade to production.

## Vercel (Frontend)

- [ ] **Environment variables** set in Vercel project:
  - `VITE_INSFORGE_BASE_URL` — InsForge API URL (e.g. `https://xxxx.us-west.insforge.app`)
  - `VITE_INSFORGE_ANON_KEY` — InsForge anon/publishable key
  - `INSFORGE_BASE_URL` — same origin as above for **serverless** `api/*` routes (or rely on `VITE_*` if mirrored in server env)
  - `INSFORGE_ANON_KEY` — optional server copy for API routes
  - `INSFORGE_SERVICE_ROLE_KEY` — for platform operational events / server inserts (see superadmin health UI)
  - `APP_URL` or `VITE_APP_URL` — public site URL for invite links when request headers lack Host (Vercel sets `VERCEL_URL` automatically)
  - `RESEND_API_KEY`, `EMAIL_FROM` — email (`api/email/send`)
  - (Optional) `ALERT_WEBHOOK_URL`, `CRON_SECRET` — see `env.example`
  - (Optional) `VITE_ENABLE_DEMO_SEED=true` and `VITE_DEMO_SEED_TOKEN` for `/seed-demo` (disable or gate in production)
- [ ] **`vercel.json` InsForge rewrites** must use the **same InsForge origin** as `INSFORGE_BASE_URL`. Static JSON cannot read env vars; after changing backend URL, run `node scripts/sync-vercel-insforge-rewrites.mjs` (see `docs/SECRETS-ROTATION.md`) or edit destinations manually, then commit and deploy.
- [ ] **Build**: `npm run build` succeeds; no `localhost` or dev URLs in production build.
- [ ] **Redirects**: SPA fallback configured (e.g. `/* /index.html 200`).

## InsForge (Backend)

- [ ] **Allowed origins (CORS)**: In your InsForge project settings, allow your production frontend origin (e.g. `https://safe-cloud-africa.vercel.app`). If this is missing, the browser will block API requests with "No 'Access-Control-Allow-Origin' header" even when the API returns 503 or other errors.
- [ ] **Schema**: Apply `docs/phase2-schema.sql` to InsForge Postgres (all migrations; RLS enabled).
- [ ] **Storage buckets** created and policies applied:
  - `sca-documents` — company documents
  - `sca-templates` — template library
  - `sca-logos` — company logos
  - `sca-evidence` — evidence attachments
  - `sca-training-certificates` — training certificates
  - `sca-medical-certificates` — medical certificates
- [ ] **Bucket policy**: Read/write restricted to authenticated users; path prefix by `company_id` where applicable.
- [ ] **Edge Functions** (optional; deploy from `scripts/insforge-functions/`):
  - `emailSend` — email delivery (set `SENDGRID_API_KEY` or `MAILGUN_*` in function env)
  - `auditProposalsSend` — send audit date proposals
  - `auditProposalRespond` — auditee date selection
  - `cronDailyComplianceReminders` — document/training/medical/audit reminders
  - `cronOverdueEscalations` — overdue CAPA/NCR escalations
  - `cronPpeReorderChecks` — PPE low-stock / reorder requests (ensure PPE inventory tables are present: `ppe_stock`, `ppe_stock_movements`, `ppe_reorder_requests`, `ppe_issue_ncr_links`, `ppe_issue_capa_links`)
- [ ] **Cron**: If supported, schedule daily/hourly invocations for the cron Edge Functions.

## Smoke Tests

After deployment, verify:

- [ ] **Auth**: Login, logout, session persistence; password reset flow.
- [ ] **Multi-tenant**: Create company → invite user → accept invite; data isolated per company.
- [ ] **RLS**: Second company cannot see first company’s data (e.g. incidents, tasks, NCRs).
- [ ] **Roles**: Admin/Manager see Users & Settings; Employee sees limited create (e.g. incidents, PJO); Auditor read-only on audits/NCRs/inspections.
- [ ] **Create flows**: Create incident, NCR, task, corrective action, PJO, PPE issue; evidence upload.
  - [ ] For PPE: create PPE item → create stock record (site/department) → issue PPE → record stock movements → create PPE reorder request when stock is low → link PPE issue to NCR and CAPA.
- [ ] **Exports**: CSV/PDF export for incidents, NCRs, audits, inspections, risk assessments, PJO (where implemented).
- [ ] **Seed demo** (if enabled): Run `/seed-demo` once; sign in with seeded accounts; confirm sites, departments, and sample data visible.

## Post-Go-Live

- [ ] Disable or strictly gate `/seed-demo` (e.g. platform-admin only + env flag).
- [ ] Configure error reporting (e.g. Sentry) if desired.
- [ ] Document backup and restore procedure for InsForge Postgres.
