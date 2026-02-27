# InsForge Edge Functions

These scripts are stubs for SafeCloud Africa serverless functions. Deploy them via the InsForge MCP or dashboard.

## Functions

| File | Purpose |
|------|--------|
| `auditProposalsSend.js` | Send 3 audit date proposals to auditees |
| `auditProposalRespond.js` | Auditee selects/declines date; update audit status |
| `cronDailyComplianceReminders.js` | Daily: document review, expiring training/medical, upcoming audits |
| `cronOverdueEscalations.js` | Overdue CAPA, NCR, missing pre-audit docs |
| `cronReviewMeetingReminders.js` | Management review meeting reminders + action item escalations |
| `cronPpeReorderChecks.js` | Low stock / near-expiry PPE; create reorder requests |

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
