# InsForge Edge Functions

These scripts are stubs for SafeCloud Africa serverless functions. Deploy them via the InsForge MCP or dashboard.

## Functions

| File | Purpose | Schedule |
|------|---------|----------|
| `auditProposalsSend.js` | Send 3 audit date proposals to auditees | on-demand |
| `auditProposalRespond.js` | Auditee selects/declines date; update audit status | on-demand |
| `cronDailyComplianceReminders.js` | Daily: document review, expiring training/medical, upcoming audits | daily |
| `cronOverdueEscalations.js` | Overdue CAPA, NCR, missing pre-audit docs | daily |
| `cronReviewMeetingReminders.js` | Management review meeting reminders + action item escalations | daily |
| `cronPpeReorderChecks.js` | Low stock / near-expiry PPE; create reorder requests | daily |
| `cronGenerateMonthlyReports.js` | 1st of month: queue a `monthly_compliance_reports` row (with full KPI summary) for every company | `0 6 1 * *` |
| `cronMonthlyComplianceReports.js` | 1st of month: send queued monthly reports via email | `0 7 1 * *` |

## Monthly Report Crons

Two crons work together on the 1st of each month:

1. **`cronGenerateMonthlyReports`** (`0 6 1 * *`) — loops all companies, resolves management emails, and calls `POST /api/cron/generate-monthly-report` to queue a `monthly_compliance_reports` row. The summary includes safety frequency rates (TRIR, LTIFR, Severity Rate, etc.), compliance KPIs (PPE %, training %, etc.), quality, and environmental KPIs.
2. **`cronMonthlyComplianceReports`** (`0 7 1 * *`) — picks up queued rows and dispatches emails with a full KPI frequency-rate table.

Required env vars for both: `INSFORGE_INTERNAL_URL`, `SERVICE_ROLE_KEY`, `EMAIL_API_URL`, `APP_BASE_URL`, `CRON_SECRET`.

## Deployment

Each function must export:

```js
module.exports = async function (request) {
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200
  });
};
```

Use the InsForge **create-function** or **update-function** MCP tool for cron jobs.

## Environment

- **Email API**: Configure `EMAIL_API_URL` for cron functions (defaults to `https://safe-cloud-africa.vercel.app/api/email/send`).
- **Vercel**: Set `RESEND_API_KEY` and `EMAIL_FROM` for `/api/email/send`.
- **Cron functions**: Run with a service/admin key so they can query all companies and send notifications.

## Health heartbeat (optional)

After each scheduled run, ping the Vercel heartbeat so platform ops can see last job status (Super Admin → Platform health).

- Set `CRON_SECRET` in Vercel (and the same value in InsForge cron env if calling from Edge).
- **Success**: `GET` or `POST` `https://<your-app>.vercel.app/api/cron/heartbeat` with `Authorization: Bearer <CRON_SECRET>` (or `?secret=<CRON_SECRET>&status=ok`).
- **Failure** (top-level catch): same URL with `status=error` and optional `message=` (query) or JSON body `{ "status": "error", "message": "..." }` for POST.

Vercel’s own hourly cron (if enabled in `vercel.json`) calls this path with the project `CRON_SECRET` header automatically.
