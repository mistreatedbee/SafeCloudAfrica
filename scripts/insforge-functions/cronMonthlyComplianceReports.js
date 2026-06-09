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

function fmtRate(v) {
  if (v == null || !Number.isFinite(v)) return 'n/a';
  return Number(v).toFixed(2);
}
function fmtPct(v) {
  if (v == null || !Number.isFinite(v)) return 'n/a';
  return `${Number(v).toFixed(1)}%`;
}
function fmtNum(v) {
  if (v == null || !Number.isFinite(Number(v))) return 'n/a';
  return Number(v).toLocaleString();
}

function kpiTableRow(label, monthVal, rolling12Val) {
  return `<tr>
    <td style="padding:4px 8px;border:1px solid #e5e7eb;">${escapeHtml(label)}</td>
    <td style="padding:4px 8px;border:1px solid #e5e7eb;text-align:right;">${escapeHtml(String(monthVal ?? 'n/a'))}</td>
    <td style="padding:4px 8px;border:1px solid #e5e7eb;text-align:right;">${escapeHtml(String(rolling12Val ?? 'n/a'))}</td>
  </tr>`;
}

function buildKpiSection(title, rows) {
  return `
    <h3 style="margin:20px 0 6px;">${escapeHtml(title)}</h3>
    <table style="border-collapse:collapse;width:100%;font-size:13px;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th style="padding:4px 8px;border:1px solid #e5e7eb;text-align:left;">Metric</th>
          <th style="padding:4px 8px;border:1px solid #e5e7eb;text-align:right;">This Month</th>
          <th style="padding:4px 8px;border:1px solid #e5e7eb;text-align:right;">Rolling 12-Month</th>
        </tr>
      </thead>
      <tbody>
        ${rows.join('')}
      </tbody>
    </table>`;
}

function buildEmailHtml(summary) {
  const overall = summary.overall || {};
  const topRisks = Array.isArray(summary.topRisks) ? summary.topRisks : [];
  const overdueActions = Array.isArray(summary.overdueActions) ? summary.overdueActions : [];
  const topGaps = Array.isArray(summary.topGaps) ? summary.topGaps : [];

  // KPI sections (present in enriched reports; absent in legacy queued rows).
  const s = summary.safety || null;
  const s12 = summary.safetyRolling12 || null;
  const c = summary.compliance || null;
  const q = summary.quality || null;
  const env = summary.environmental || null;
  const lti = summary.ltiFreeHours || null;

  const safetySection = s ? buildKpiSection('Safety Frequency Rates', [
    kpiTableRow('TRIR / TRIFR',              fmtRate(s.trir),                fmtRate(s12 && s12.trir)),
    kpiTableRow('LTIFR',                     fmtRate(s.ltifr),               fmtRate(s12 && s12.ltifr)),
    kpiTableRow('Severity Rate (LTISR)',      fmtRate(s.severityRate),        fmtRate(s12 && s12.severityRate)),
    kpiTableRow('Incident Freq. Rate',        fmtRate(s.incidentFrequencyRate), fmtRate(s12 && s12.incidentFrequencyRate)),
    kpiTableRow('Fatality Rate',              fmtRate(s.fatalityRate),        fmtRate(s12 && s12.fatalityRate)),
    kpiTableRow('Near-Miss Freq. Rate',       fmtRate(s.nearMissFrequencyRate), fmtRate(s12 && s12.nearMissFrequencyRate)),
    kpiTableRow('Accident Freq. Rate',        fmtRate(s.accidentFrequencyRate), fmtRate(s12 && s12.accidentFrequencyRate)),
    kpiTableRow('Recordable Injuries',        fmtNum(s.recordableInjuries),   fmtNum(s12 && s12.recordableInjuries)),
    kpiTableRow('Lost-Time Injuries',         fmtNum(s.lostTimeInjuries),     fmtNum(s12 && s12.lostTimeInjuries)),
    kpiTableRow('Fatalities',                 fmtNum(s.fatalities),           fmtNum(s12 && s12.fatalities)),
    kpiTableRow('Total Lost Days',            fmtNum(s.totalLostDays),        fmtNum(s12 && s12.totalLostDays)),
    kpiTableRow('Total Hours Worked',         fmtNum(s.totalHoursWorked),     fmtNum(s12 && s12.totalHoursWorked)),
    kpiTableRow('LTI-Free Hours (accum.)',    lti ? fmtNum(lti.ltiFreeHours) : 'n/a', '—')
  ]) : '';

  const complianceSection = c ? buildKpiSection('Compliance', [
    kpiTableRow('PPE Compliance',             fmtPct(c.ppeCompliancePercent),            '—'),
    kpiTableRow('Training Completion',        fmtPct(c.trainingCompletionPercent),       '—'),
    kpiTableRow('Inspection Compliance',      fmtPct(c.inspectionCompliancePercent),     '—'),
    kpiTableRow('CAPA Closure Rate',          fmtPct(c.correctiveActionClosurePercent),  '—'),
    kpiTableRow('Audit Score',                fmtPct(c.auditScorePercent),               '—')
  ]) : '';

  const qualitySection = q ? buildKpiSection('Quality', [
    kpiTableRow('Customer Complaint Rate',    fmtRate(q.customerComplaintRate),   '—'),
    kpiTableRow('Non-Conformance Rate',       fmtRate(q.nonConformanceRate),      '—')
  ]) : '';

  const envSection = env ? buildKpiSection('Environmental', [
    kpiTableRow('Waste Recycling Rate',       fmtPct(env.wasteRecyclingRate),          '—'),
    kpiTableRow('Spill Freq. Rate',           fmtRate(env.spillFrequencyRate),         '—'),
    kpiTableRow('Energy Consumption Rate',    fmtRate(env.energyConsumptionRate),      '—'),
    kpiTableRow('Env. Incident Rate',         fmtRate(env.environmentalIncidentRate),  '—')
  ]) : '';

  return `
    <div style="font-family: Arial, sans-serif; color: #1f2937; max-width: 700px;">
      <h2>Monthly Compliance &amp; Safety Report</h2>
      <p><strong>Overall Score:</strong> ${escapeHtml(String(overall.scorePercentage ?? 'n/a'))}%</p>
      <p><strong>RAG Status:</strong> ${escapeHtml(String(overall.ragStatus ?? 'n/a'))}</p>

      ${safetySection}
      ${complianceSection}
      ${qualitySection}
      ${envSection}

      <h3 style="margin-top:20px;">Top Risks</h3>
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
