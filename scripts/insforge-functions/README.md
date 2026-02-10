# InsForge Edge Functions

These scripts are stubs for SafeCloud Africa serverless functions. Deploy them via the InsForge MCP or dashboard.

## Functions

| File | Purpose |
|------|--------|
| `emailSend.js` | Send email (SendGrid/Mailgun via env) |
| `auditProposalsSend.js` | Send 3 audit date proposals to auditees |
| `auditProposalRespond.js` | Auditee selects/declines date; update audit status |
| `cronDailyComplianceReminders.js` | Daily: document review, expiring training/medical, upcoming audits |
| `cronOverdueEscalations.js` | Overdue CAPA, NCR, missing pre-audit docs |
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

Use the InsForge **create-function** or **update-function** MCP tool with the corresponding `codeFile` path (e.g. `scripts/insforge-functions/emailSend.js`).

## Environment

- **emailSend**: Set `SENDGRID_API_KEY` or `MAILGUN_API_KEY` (and related Mailgun vars) in the function’s environment.
- **Cron functions**: Run with a service/admin key so they can query all companies and send notifications.
