/**
 * InsForge Edge Function: cronMonthlyComplianceReports
 * Generates queued monthly compliance reports and sends summary emails.
 */
const EMAIL_API_URL =
  typeof process !== 'undefined' && process.env && process.env.EMAIL_API_URL
    ? process.env.EMAIL_API_URL
    : 'https://safe-cloud-africa.vercel.app/api/email/send';

const { createInternalClient } = require('./escalationUtils');

module.exports = async function (request) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    const client = createInternalClient();
    const { data: reports, error } = await client.database
      .from('monthly_compliance_reports')
      .select('*')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(25);

    if (error) throw error;

    let sent = 0;
    let failed = 0;

    for (const report of reports || []) {
      try {
        const recipientEmails = Array.isArray(report.recipient_emails) ? report.recipient_emails.filter(Boolean) : [];
        if (recipientEmails.length === 0) {
          await client.database
            .from('monthly_compliance_reports')
            .update({
              status: 'failed',
              delivery_error: 'No recipient emails configured',
              updated_at: new Date().toISOString()
            })
            .eq('id', report.id);
          failed += 1;
          continue;
        }

        const summary = report.summary || {};
        const response = await fetch(EMAIL_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: recipientEmails,
            subject: `Monthly Compliance Report - ${String(report.report_month).slice(0, 7)}`,
            html: buildEmailHtml(summary)
          })
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok || (payload && payload.ok === false)) {
          throw new Error((payload && payload.error) || response.statusText || 'Email send failed');
        }

        await client.database
          .from('monthly_compliance_reports')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            delivery_error: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', report.id);
        sent += 1;
      } catch (e) {
        await client.database
          .from('monthly_compliance_reports')
          .update({
            status: 'failed',
            delivery_error: String(e && e.message ? e.message : e),
            updated_at: new Date().toISOString()
          })
          .eq('id', report.id);
        failed += 1;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        sent,
        failed
      }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e && e.message ? e.message : e) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }
};

function buildEmailHtml(summary) {
  const overall = summary.overall || {};
  const topRisks = Array.isArray(summary.topRisks) ? summary.topRisks : [];
  const overdueActions = Array.isArray(summary.overdueActions) ? summary.overdueActions : [];
  const topGaps = Array.isArray(summary.topGaps) ? summary.topGaps : [];

  return `
    <div style="font-family: Arial, sans-serif; color: #1f2937;">
      <h2>Monthly Compliance Status</h2>
      <p><strong>Overall Score:</strong> ${overall.scorePercentage ?? 'n/a'}%</p>
      <p><strong>RAG Status:</strong> ${overall.ragStatus ?? 'n/a'}</p>
      <h3>Top Risks</h3>
      <ul>
        ${topRisks.map((risk) => `<li>${escapeHtml(String(risk.title || risk.id || 'Risk'))}</li>`).join('')}
      </ul>
      <h3>Overdue Actions</h3>
      <ul>
        ${overdueActions.map((action) => `<li>${escapeHtml(String(action.title || action.id || 'Action'))}</li>`).join('')}
      </ul>
      <h3>Top Gaps</h3>
      <ul>
        ${topGaps.map((gap) => `<li>${escapeHtml(String(gap.label || gap.domain || 'Gap'))}</li>`).join('')}
      </ul>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
