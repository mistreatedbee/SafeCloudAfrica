/**
 * PDF Export Service
 * 
 * Generates PDFs for incidents, audits, NCRs, and risk assessments
 * Uses a simple HTML-to-PDF approach (can be enhanced with pdfkit or puppeteer)
 */

import type { UUID } from '../models/core';
import type {
  Incident,
  QualityNcr,
  Audit,
  EvidenceAttachment,
  IncidentCorrectiveAction,
  PPEIssue
} from '../models/entities';
import type { PpeCostSummary, PpeUsageSummary } from './ppeAnalyticsService';
import { getPublicUrl } from './storageService';
import type { StorageBucket } from './storageService';

export interface ExportOptions {
  includeEvidence?: boolean;
  includeSignatures?: boolean;
  fontSize?: number;
  orientation?: 'portrait' | 'landscape';
  companyName?: string;
  generatedBy?: string;
  evidenceList?: EvidenceAttachment[];
  correctiveActions?: IncidentCorrectiveAction[];
}

export type ExportFormat = 'pdf' | 'csv' | 'xlsx';

/**
 * Export incident to PDF
 */
export async function exportIncidentPDF(
  incident: Incident,
  options: ExportOptions = {}
): Promise<Blob> {
  const {
    includeEvidence = true,
    includeSignatures = true,
    fontSize = 11,
    companyName = '',
    generatedBy = '',
    evidenceList = [],
    correctiveActions = []
  } = options;

  // Generate HTML content
  const html = generateIncidentHTML(incident, {
    includeEvidence,
    includeSignatures,
    fontSize,
    companyName,
    generatedBy,
    evidenceList,
    correctiveActions
  });

  // Convert to PDF (using simple approach - can upgrade to pdfkit)
  return htmlToPDF(html, {
    filename: `incident-${incident.id.slice(0, 8)}.pdf`,
    title: `Incident Report - ${incident.title}`,
  });
}

/**
 * Export NCR to PDF
 */
export async function exportNCRPDF(
  ncr: QualityNcr,
  options: ExportOptions = {}
): Promise<Blob> {
  const { includeEvidence = true, fontSize = 11, companyName = '', generatedBy = '' } = options;

  const html = generateNCRHTML(ncr, {
    includeEvidence,
    fontSize,
    companyName,
    generatedBy,
  });

  return htmlToPDF(html, {
    filename: `ncr-${ncr.nc_number}.pdf`,
    title: `Non-Conformance Report - ${ncr.nc_number}`,
  });
}

/**
 * Export audit to PDF
 */
export async function exportAuditPDF(
  audit: Audit,
  options: ExportOptions = {}
): Promise<Blob> {
  const { includeEvidence = true, fontSize = 11, companyName = '', generatedBy = '' } = options;

  const html = generateAuditHTML(audit, {
    includeEvidence,
    fontSize,
    companyName,
    generatedBy,
  });

  return htmlToPDF(html, {
    filename: `audit-${audit.id.slice(0, 8)}.pdf`,
    title: `Audit Report - ${audit.title}`,
  });
}

/**
 * Export risk assessment to PDF (full assessment with line items)
 */
export async function exportRiskAssessmentPDF(
  assessment: { id: string; title: string; assessment_number: string; assessment_type: string; status: string; area_location?: string | null; activity_process_operation?: string | null; created_at: string },
  items: Array<{ hazard_description?: string; hazard?: string; risk_index?: string; risk_level?: string; raw_risk_rating_rr?: number; risk_rating?: number; existing_controls?: string | null }>,
  options: ExportOptions = {}
): Promise<Blob> {
  const { companyName = '', generatedBy = '', fontSize = 11 } = options;
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString();
  const rows = items
    .map(
      (item, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml((item.hazard || item.hazard_description) ?? '')}</td>
        <td>${escapeHtml((item.risk_index || item.risk_level) ?? '')}</td>
        <td>${(item.raw_risk_rating_rr ?? item.risk_rating) ?? ''}</td>
        <td>${escapeHtml(item.existing_controls ?? '')}</td>
      </tr>`
    )
    .join('');
  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8" /><style>
      body { font-family: Arial, sans-serif; font-size: ${fontSize}pt; line-height: 1.6; color: #333; }
      .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #0066cc; padding-bottom: 10px; }
      .header h1 { margin: 0; color: #0066cc; }
      table { width: 100%; border-collapse: collapse; margin: 15px 0; }
      th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
      th { background: #f0f0f0; font-weight: bold; }
      .footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 9pt; color: #666; }
    </style></head>
    <body>
      <div class="header">
        <h1>Risk Assessment</h1>
        ${companyName ? `<p>${escapeHtml(companyName)}</p>` : ''}
      </div>
      <p><strong>${escapeHtml(assessment.title)}</strong></p>
      <p>Number: ${escapeHtml(assessment.assessment_number)} | Type: ${escapeHtml(assessment.assessment_type)} | Status: ${escapeHtml(assessment.status)}</p>
      ${assessment.area_location ? `<p>Area: ${escapeHtml(assessment.area_location)}</p>` : ''}
      ${assessment.activity_process_operation ? `<p>Activity: ${escapeHtml(assessment.activity_process_operation)}</p>` : ''}
      <p>Created: ${formatDate(assessment.created_at)}</p>
      <h3>Line items</h3>
      <table>
        <thead><tr><th>#</th><th>Hazard / Risk</th><th>Risk Index</th><th>RR</th><th>Existing controls</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">No items</td></tr>'}</tbody>
      </table>
      <div class="footer">
        ${generatedBy ? `Generated by ${escapeHtml(generatedBy)} on ${new Date().toLocaleString()}` : ''}
      </div>
    </body>
    </html>`;
  return htmlToPDF(html, {
    filename: `risk-assessment-${assessment.assessment_number}.pdf`,
    title: `Risk Assessment - ${assessment.assessment_number}`,
  });
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Export high-risk register to CSV (assessments with high/critical risk counts)
 */
export function exportHighRiskRegisterCSV(
  assessments: Array<{ id: string; assessment_number: string; title: string; assessment_type: string; status: string; high_risks: number; medium_risks: number; total_risks: number; area_location?: string | null; next_review_date?: string | null }>
): Blob {
  const headers = ['Assessment #', 'Title', 'Type', 'Status', 'High risks', 'Medium risks', 'Total', 'Area', 'Next review'];
  const rows = assessments
    .filter((a) => (a.high_risks ?? 0) > 0)
    .map((a) => [
      a.assessment_number,
      a.title,
      a.assessment_type,
      a.status,
      String(a.high_risks ?? 0),
      String(a.medium_risks ?? 0),
      String(a.total_risks ?? 0),
      a.area_location ?? '',
      a.next_review_date ? new Date(a.next_review_date).toLocaleDateString() : ''
    ]);
  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');
  return new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
}

/**
 * Export incidents list to CSV
 */
export function exportIncidentsCSV(incidents: Incident[]): Blob {
  // CSV headers
  const headers = [
    'ID',
    'Title',
    'Category',
    'Subcategory',
    'Severity',
    'Status',
    'Location',
    'Occurred Date',
    'Created By',
    'Created Date',
  ];

  // CSV rows
  const rows = incidents.map((incident) => [
    incident.id.slice(0, 8),
    incident.title,
    incident.category,
    incident.subcategory,
    incident.severity,
    incident.status,
    incident.location || '',
    new Date(incident.occurred_at).toLocaleDateString(),
    incident.created_by_user_id.slice(0, 8),
    new Date(incident.created_at).toLocaleDateString(),
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
  ].join('\n');

  return new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
}

/**
 * Export PPE issue register to CSV
 */
export function exportPpeIssueRegisterCSV(issues: PPEIssue[]): Blob {
  const headers = [
    'ID',
    'Issue Date',
    'PPE Item',
    'Category',
    'Size',
    'Quantity',
    'Reason',
    'Issued To (User ID)',
    'Employee Number',
    'Job Role',
    'Issued By',
    'Department ID',
    'Site ID',
    'Unit Cost',
    'Total Cost',
    'Notes'
  ];
  const rows = issues.map((i) => [
    i.id.slice(0, 8),
    i.issue_date ?? (i.issued_at ? i.issued_at.slice(0, 10) : ''),
    i.ppe_item_name ?? '',
    i.ppe_category ?? '',
    i.size ?? '',
    i.quantity_issued ?? 1,
    i.reason_for_issue ?? '',
    i.issued_to_user_id ?? '',
    i.issued_to_employee_number ?? '',
    i.job_role ?? '',
    i.issued_by_name ?? '',
    i.department_id ?? '',
    i.site_id ?? '',
    i.unit_cost_at_issue ?? '',
    i.total_cost_at_issue ?? '',
    (i.notes ?? '').replace(/"/g, '""')
  ]);
  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');
  return new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
}

/**
 * Export PPE cost summary to CSV
 */
export function exportPpeCostSummaryCSV(summary: PpeCostSummary): Blob {
  const lines: string[] = [
    'PPE Cost Summary',
    `Total PPE Cost,R ${summary.totalPpeCost.toFixed(2)}`,
    '',
    'Top Costing Items',
    'Item Name,Total Cost,Quantity,Avg Cost Per Issue'
  ];
  summary.topCostingPpeItems.forEach((t) => {
    lines.push(
      `"${(t.ppeItemName ?? '').replace(/"/g, '""')}",${t.totalCost.toFixed(2)},${t.quantityIssued},${t.avgCostPerIssue.toFixed(2)}`
    );
  });
  lines.push('', 'Cost by Category', 'Category,Total Cost');
  summary.costByCategory.forEach((c) => {
    lines.push(`"${(c.category ?? '').replace(/"/g, '""')}",${c.totalCost.toFixed(2)}`);
  });
  lines.push('', 'Cost by Department', 'Department ID,Total Cost');
  summary.costByDepartment.forEach((d) => {
    lines.push(`${d.departmentId ?? ''},${d.totalCost.toFixed(2)}`);
  });
  lines.push('', 'Cost by Site', 'Site ID,Total Cost');
  summary.costBySite.forEach((s) => {
    lines.push(`${s.siteId ?? ''},${s.totalCost.toFixed(2)}`);
  });
  return new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
}

/**
 * Export PPE usage summary to CSV
 */
export function exportPpeUsageSummaryCSV(summary: PpeUsageSummary): Blob {
  const lines: string[] = [
    'PPE Usage Summary',
    `Total Quantity Issued,${summary.totalQuantityIssued}`,
    '',
    'Usage by Item',
    'Item Name,Quantity Issued'
  ];
  summary.usageByPpeItem.forEach((u) => {
    lines.push(`"${(u.ppeItemName ?? '').replace(/"/g, '""')}",${u.quantityIssued}`);
  });
  lines.push('', 'Usage by Category', 'Category,Quantity');
  summary.usageByCategory.forEach((c) => {
    lines.push(`"${(c.category ?? '').replace(/"/g, '""')}",${c.quantityIssued}`);
  });
  lines.push('', 'Reason Breakdown', 'Reason,Count,Quantity');
  summary.reasonBreakdown.forEach((r) => {
    lines.push(`"${(r.reason ?? '').replace(/"/g, '""')}",${r.count},${r.quantity}`);
  });
  return new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
}

/**
 * Export PPE cost summary to PDF (HTML print)
 */
export async function exportPpeCostSummaryPDF(
  summary: PpeCostSummary,
  options: { companyName?: string; generatedBy?: string } = {}
): Promise<Blob> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"/><style>
      body{font-family:Arial,sans-serif;font-size:11pt;padding:20px;}
      h1{color:#0369a1;} .section{margin:20px 0;}
      table{border-collapse:collapse;width:100%;} th,td{border:1px solid #ddd;padding:8px;text-align:left;}
      th{background:#f0f9ff;}
    </style></head>
    <body>
      <h1>PPE Cost Summary</h1>
      <p>Generated: ${new Date().toLocaleString()} ${options.companyName ? ` • ${options.companyName}` : ''}</p>
      <div class="section">
        <h2>Total PPE Cost: R ${summary.totalPpeCost.toFixed(2)}</h2>
      </div>
      <div class="section">
        <h3>Top Costing Items</h3>
        <table>
          <tr><th>Item</th><th>Total Cost</th><th>Qty</th><th>Avg/Issue</th></tr>
          ${summary.topCostingPpeItems.slice(0, 15).map((t) => `
            <tr><td>${(t.ppeItemName ?? '—').replace(/</g, '&lt;')}</td><td>R ${t.totalCost.toFixed(2)}</td><td>${t.quantityIssued}</td><td>R ${t.avgCostPerIssue.toFixed(2)}</td></tr>
          `).join('')}
        </table>
      </div>
      <div class="section">
        <h3>Cost by Category</h3>
        <table>
          <tr><th>Category</th><th>Total Cost</th></tr>
          ${summary.costByCategory.map((c) => `
            <tr><td>${(c.category ?? '—').replace(/</g, '&lt;')}</td><td>R ${c.totalCost.toFixed(2)}</td></tr>
          `).join('')}
        </table>
      </div>
    </body>
    </html>
  `;
  return htmlToPDF(html, { filename: 'ppe-cost-summary.pdf', title: 'PPE Cost Summary' });
}

/**
 * Export PPE usage summary to PDF (HTML print)
 */
export async function exportPpeUsageSummaryPDF(
  summary: PpeUsageSummary,
  options: { companyName?: string; generatedBy?: string } = {}
): Promise<Blob> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"/><style>
      body{font-family:Arial,sans-serif;font-size:11pt;padding:20px;}
      h1{color:#0369a1;} .section{margin:20px 0;}
      table{border-collapse:collapse;width:100%;} th,td{border:1px solid #ddd;padding:8px;text-align:left;}
      th{background:#f0f9ff;}
    </style></head>
    <body>
      <h1>PPE Usage Summary</h1>
      <p>Generated: ${new Date().toLocaleString()} ${options.companyName ? ` • ${options.companyName}` : ''}</p>
      <div class="section">
        <h2>Total Quantity Issued: ${summary.totalQuantityIssued}</h2>
      </div>
      <div class="section">
        <h3>Usage by Item</h3>
        <table>
          <tr><th>Item</th><th>Quantity Issued</th></tr>
          ${summary.usageByPpeItem.slice(0, 15).map((u) => `
            <tr><td>${(u.ppeItemName ?? '—').replace(/</g, '&lt;')}</td><td>${u.quantityIssued}</td></tr>
          `).join('')}
        </table>
      </div>
      <div class="section">
        <h3>Reason Breakdown</h3>
        <table>
          <tr><th>Reason</th><th>Count</th><th>Quantity</th></tr>
          ${summary.reasonBreakdown.map((r) => `
            <tr><td>${(r.reason ?? '—').replace(/</g, '&lt;')}</td><td>${r.count}</td><td>${r.quantity}</td></tr>
          `).join('')}
        </table>
      </div>
    </body>
    </html>
  `;
  return htmlToPDF(html, { filename: 'ppe-usage-summary.pdf', title: 'PPE Usage Summary' });
}

/**
 * Export audit checklist to CSV
 */
export function exportAuditChecklistCSV(
  audit: Audit,
  questions: Array<{ id: string; question: string; answer?: string; notes?: string }>
): Blob {
  const headers = ['Question #', 'Question', 'Answer', 'Notes'];
  const rows = questions.map((q, idx) => [
    idx + 1,
    q.question,
    q.answer || '',
    q.notes || '',
  ]);

  const csvContent = [
    `Audit Report: ${audit.title}`,
    `Audit Date: ${new Date(audit.scheduled_date).toLocaleDateString()}`,
    `Status: ${audit.status}`,
    '',
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
  ].join('\n');

  return new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
}

function escapeHtmlReport(s: string | null | undefined): string {
  if (s == null) return '—';
  const t = String(s);
  return t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generate incident HTML for PDF (audit-ready: risk rating, sections, evidence list, inline images, corrective actions)
 */
function generateIncidentHTML(
  incident: Incident,
  options: {
    includeEvidence: boolean;
    includeSignatures: boolean;
    fontSize: number;
    companyName?: string;
    generatedBy?: string;
    evidenceList?: EvidenceAttachment[];
    correctiveActions?: IncidentCorrectiveAction[];
  }
): string {
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString();
  const formatDateTime = (iso: string) => new Date(iso).toLocaleString();
  const inc = incident as Record<string, unknown>;
  const evidenceList = options.evidenceList ?? [];
  const correctiveActions = options.correctiveActions ?? [];

  const severity1To5 = (inc.risk_severity_1_5 as number) ?? null;
  const likelihood1To5 = (inc.risk_likelihood_1_5 as number) ?? null;
  const product = (inc.risk_rating_product as number) ?? (severity1To5 != null && likelihood1To5 != null ? severity1To5 * likelihood1To5 : null);
  const classification = (inc.risk_classification as string) ?? (product != null ? (product <= 5 ? 'Low' : product <= 12 ? 'Medium' : 'High') : null);

  const riskClassStyle = classification === 'High' ? 'background:#dc2626;color:white;padding:4px 8px;border-radius:4px;' :
    classification === 'Medium' ? 'background:#eab308;color:#333;padding:4px 8px;border-radius:4px;' :
    'background:#22c55e;color:white;padding:4px 8px;border-radius:4px;';

  const evidenceRows = evidenceList.map((ev) => {
    const orig = (ev as any).original_filename ?? ev.title ?? ev.storage_key?.split('/').pop() ?? '—';
    const display = ev.display_title ?? ev.title ?? orig;
    const uploadedAt = formatDateTime(ev.created_at);
    return `<tr><td>${escapeHtmlReport(orig)}</td><td>${escapeHtmlReport(display)}</td><td>${escapeHtmlReport(uploadedAt)}</td><td>—</td></tr>`;
  }).join('');

  const evidenceInlineImages = evidenceList
    .filter((ev) => (ev as any).file_kind === 'image' || /\.(jpg|jpeg|png|gif|webp)$/i.test(ev.storage_key || ''))
    .map((ev) => {
      try {
        const url = getPublicUrl(ev.storage_bucket as StorageBucket, ev.storage_key);
        return `<div class="section"><img src="${escapeHtmlReport(url)}" alt="${escapeHtmlReport(ev.display_title ?? ev.title ?? '')}" style="max-width:100%;height:auto;max-height:300px;" /></div>`;
      } catch {
        return '';
      }
    })
    .filter(Boolean)
    .join('');

  const correctiveRows = correctiveActions.map((ca) => {
    const due = ca.due_date ? formatDate(ca.due_date) : '—';
    const cause = (ca as any).source_cause_text ? ` (${escapeHtmlReport((ca as any).source_cause_text)})` : '';
    return `<tr><td>${escapeHtmlReport(ca.action_title)}${cause}</td><td>${escapeHtmlReport(ca.action_description ?? '')}</td><td>—</td><td>${due}</td><td>${escapeHtmlReport(ca.status)}</td></tr>`;
  }).join('');

  const section = (title: string, value: string | null | undefined) =>
    value ? `<div class="field"><span class="field-label">${escapeHtmlReport(title)}:</span><span class="field-value">${escapeHtmlReport(value)}</span></div>` : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body { font-family: Arial, sans-serif; font-size: ${options.fontSize}pt; line-height: 1.6; color: #333; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #0066cc; padding-bottom: 10px; }
        .header h1 { margin: 0; color: #0066cc; }
        .section { margin: 20px 0; }
        .section-title { font-weight: bold; background: #f0f0f0; padding: 8px; margin-bottom: 10px; }
        .field { margin: 10px 0; display: flex; }
        .field-label { width: 150px; font-weight: bold; }
        .field-value { flex: 1; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background: #f0f0f0; font-weight: bold; }
        .severity-critical { color: #dc2626; font-weight: bold; }
        .severity-high { color: #ea580c; font-weight: bold; }
        .severity-medium { color: #f59e0b; font-weight: bold; }
        .severity-low { color: #10b981; font-weight: bold; }
        .footer { margin-top: 40px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 9pt; color: #666; display: flex; justify-content: space-between; align-items: center; }
        .footer-left { text-align: left; }
        .footer-right { text-align: right; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Incident Report</h1>
        <p>Generated: ${new Date().toLocaleString()}</p>
      </div>

      <div class="section">
        <div class="section-title">Basic Information</div>
        <div class="field"><span class="field-label">Title:</span><span class="field-value">${escapeHtmlReport(incident.title)}</span></div>
        <div class="field"><span class="field-label">Category:</span><span class="field-value">${escapeHtmlReport(incident.category)} / ${escapeHtmlReport(incident.subcategory)}</span></div>
        <div class="field"><span class="field-label">Type of Incident:</span><span class="field-value">${escapeHtmlReport((inc as any).incident_type ?? (inc as any).type_of_incident)}</span></div>
        <div class="field"><span class="field-label">Severity:</span><span class="field-value"><span class="severity-${incident.severity}">${incident.severity.toUpperCase()}</span></span></div>
        <div class="field"><span class="field-label">Status:</span><span class="field-value">${incident.status}</span></div>
      </div>

      <div class="section">
        <div class="section-title">Risk Rating</div>
        <div class="field"><span class="field-label">Severity (1–5):</span><span class="field-value">${severity1To5 ?? '—'}</span></div>
        <div class="field"><span class="field-label">Likelihood (1–5):</span><span class="field-value">${likelihood1To5 ?? '—'}</span></div>
        <div class="field"><span class="field-label">Risk Rating (read-only):</span><span class="field-value">${product ?? '—'}</span></div>
        <div class="field"><span class="field-label">Risk Classification:</span><span class="field-value" style="${riskClassStyle}">${escapeHtmlReport(classification ?? '—')}</span></div>
      </div>

      <div class="section">
        <div class="section-title">Incident Details</div>
        <div class="field"><span class="field-label">Occurred At:</span><span class="field-value">${formatDate(incident.occurred_at)}</span></div>
        <div class="field"><span class="field-label">Location:</span><span class="field-value">${escapeHtmlReport(incident.location) || 'Not specified'}</span></div>
        ${section('Nature of Incident', (inc as any).nature_of_incident)}
        ${section('Cause of Incident', (inc as any).cause_of_incident)}
        ${section('Loss / Potential Loss', Array.isArray(inc.loss_types) ? (inc.loss_types as string[]).join(', ') : (inc as any).loss_type)}
        ${section('Required Behaviour', (inc as any).required_behaviour)}
        ${incident.description ? `<div class="field"><span class="field-label">Description:</span></div><div style="margin-left: 150px; white-space: pre-wrap;">${escapeHtmlReport(incident.description)}</div>` : ''}
      </div>

      <div class="section">
        <div class="section-title">Incident Flow</div>
        ${section('Instruction breakdown / flow', (inc as any).instruction_breakdown)}
      </div>
      <div class="section">
        <div class="section-title">Unsafe Acts</div>
        <div class="field-value">${escapeHtmlReport((inc as any).unsafe_acts ?? (inc as any).immediate_causes_unsafe_acts ? JSON.stringify((inc as any).immediate_causes_unsafe_acts) : '')}</div>
      </div>
      <div class="section">
        <div class="section-title">Unsafe Conditions</div>
        <div class="field-value">${escapeHtmlReport((inc as any).unsafe_conditions ?? '')}</div>
      </div>
      <div class="section">
        <div class="section-title">Root Causes</div>
        <div class="field-value">${escapeHtmlReport((inc as any).root_cause_human ?? '')} ${escapeHtmlReport((inc as any).root_cause_workplace ?? '')}</div>
      </div>
      <div class="section">
        <div class="section-title">System Failures</div>
        <div class="field-value">${escapeHtmlReport(Array.isArray((inc as any).system_failure) ? (inc as any).system_failure.join(', ') : (inc as any).system_failure)}</div>
      </div>
      <div class="section">
        <div class="section-title">Corrective Actions (summary)</div>
        <div class="field-value">${escapeHtmlReport((inc as any).corrective_actions ?? '')}</div>
      </div>
      <div class="section">
        <div class="section-title">Lessons Learnt</div>
        <div class="field-value">${escapeHtmlReport((inc as any).lessons_learnt ?? '')}</div>
      </div>
      <div class="section">
        <div class="section-title">Conclusion</div>
        <div class="field-value">${escapeHtmlReport((inc as any).conclusion ?? '')}</div>
      </div>
      <div class="section">
        <div class="section-title">Distribution (Copy To)</div>
        <div class="field-value">${escapeHtmlReport(Array.isArray((inc as any).distributions_to_user_ids) ? (inc as any).distributions_to_user_ids.join(', ') : '')}</div>
      </div>

      ${correctiveActions.length > 0 ? `
      <div class="section">
        <div class="section-title">Corrective Actions</div>
        <table><thead><tr><th>Action</th><th>Description</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead><tbody>${correctiveRows}</tbody></table>
      </div>
      ` : ''}

      ${options.includeEvidence && (evidenceList.length > 0 || evidenceInlineImages) ? `
      <div class="section">
        <div class="section-title">Evidence</div>
        ${evidenceInlineImages}
        <table><thead><tr><th>Original filename</th><th>Display title</th><th>Upload date</th><th>Uploaded by</th></tr></thead><tbody>${evidenceRows}</tbody></table>
      </div>
      ` : ''}

      <div class="footer">
        <div class="footer-left">
          <div>SafeCloud Africa</div>
          <div>Generated by: ${escapeHtmlReport(options.generatedBy || 'SafeCloud Africa user')}</div>
        </div>
        <div class="footer-right">
          <div>${escapeHtmlReport(options.companyName || 'Company Name')}</div>
          <div>${new Date().toLocaleDateString()}</div>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate NCR HTML for PDF
 */
function generateNCRHTML(
  ncr: QualityNcr,
  options: { includeEvidence: boolean; fontSize: number; companyName?: string; generatedBy?: string }
): string {
  const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '—');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body { font-family: Arial, sans-serif; font-size: ${options.fontSize}pt; line-height: 1.6; color: #333; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #dc2626; padding-bottom: 10px; }
        .header h1 { margin: 0; color: #dc2626; }
        .section { margin: 20px 0; }
        .section-title { font-weight: bold; background: #fef2f2; padding: 8px; margin-bottom: 10px; }
        .field { margin: 10px 0; display: flex; }
        .field-label { width: 180px; font-weight: bold; }
        .field-value { flex: 1; }
        .footer { margin-top: 40px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 9pt; color: #666; display: flex; justify-content: space-between; align-items: center; }
        .footer-left { text-align: left; }
        .footer-right { text-align: right; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Non-Conformance Report (NCR)</h1>
        <p>Report #: ${ncr.nc_number}</p>
        <p>Generated: ${new Date().toLocaleString()}</p>
      </div>

      <div class="section">
        <div class="section-title">NCR Details</div>
        <div class="field">
          <span class="field-label">Title:</span>
          <span class="field-value">${ncr.title}</span>
        </div>
        <div class="field">
          <span class="field-label">Occurrence Date:</span>
          <span class="field-value">${formatDate(ncr.occurrence_date)}</span>
        </div>
        <div class="field">
          <span class="field-label">Severity:</span>
          <span class="field-value">${ncr.severity}</span>
        </div>
        <div class="field">
          <span class="field-label">Status:</span>
          <span class="field-value">${ncr.status}</span>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Non-Conformance Information</div>
        <div class="field">
          <span class="field-label">Location:</span>
          <span class="field-value">${ncr.location || '—'}</span>
        </div>
        <div class="field">
          <span class="field-label">Risk Classification:</span>
          <span class="field-value">${ncr.risk_classification || '—'}</span>
        </div>
        ${ncr.description ? `
        <div class="field">
          <span class="field-label">Description:</span>
        </div>
        <div style="margin-left: 180px; white-space: pre-wrap;">${ncr.description}</div>
        ` : ''}
      </div>

      <div class="section">
        <div class="section-title">Root Cause & Corrective Actions</div>
        ${ncr.root_cause ? `
        <div class="field">
          <span class="field-label">Root Cause:</span>
        </div>
        <div style="margin-left: 180px; white-space: pre-wrap;">${ncr.root_cause}</div>
        ` : ''}
        ${ncr.corrective_action ? `
        <div class="field">
          <span class="field-label">Corrective Action:</span>
        </div>
        <div style="margin-left: 180px; white-space: pre-wrap;">${ncr.corrective_action}</div>
        ` : ''}
        ${ncr.corrective_action_due_date ? `
        <div class="field">
          <span class="field-label">Due Date:</span>
          <span class="field-value">${formatDate(ncr.corrective_action_due_date)}</span>
        </div>
        ` : ''}
      </div>

      <div class="footer">
        <div class="footer-left">
          <div>SafeCloud Africa</div>
          <div>Generated by: ${options.generatedBy || 'SafeCloud Africa user'}</div>
        </div>
        <div class="footer-right">
          <div>${options.companyName || 'Company Name'}</div>
          <div>${new Date().toLocaleDateString()}</div>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate audit HTML for PDF
 */
function generateAuditHTML(
  audit: Audit,
  options: { includeEvidence: boolean; fontSize: number; companyName?: string; generatedBy?: string }
): string {
  const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '—');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body { font-family: Arial, sans-serif; font-size: ${options.fontSize}pt; line-height: 1.6; color: #333; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #0369a1; padding-bottom: 10px; }
        .header h1 { margin: 0; color: #0369a1; }
        .section { margin: 20px 0; }
        .section-title { font-weight: bold; background: #f0f9ff; padding: 8px; margin-bottom: 10px; }
        .field { margin: 10px 0; display: flex; }
        .field-label { width: 180px; font-weight: bold; }
        .field-value { flex: 1; }
        .footer { margin-top: 40px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 9pt; color: #666; display: flex; justify-content: space-between; align-items: center; }
        .footer-left { text-align: left; }
        .footer-right { text-align: right; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Audit Report</h1>
        <p>Title: ${audit.title}</p>
        <p>Generated: ${new Date().toLocaleString()}</p>
      </div>

      <div class="section">
        <div class="section-title">Audit Details</div>
        <div class="field">
          <span class="field-label">Type:</span>
          <span class="field-value">${audit.audit_type}</span>
        </div>
        <div class="field">
          <span class="field-label">Status:</span>
          <span class="field-value">${audit.status}</span>
        </div>
        <div class="field">
          <span class="field-label">Scheduled Date:</span>
          <span class="field-value">${formatDate(audit.scheduled_date)}</span>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Audit Findings</div>
        <p>Findings documented separately in the audit management system</p>
      </div>

      <div class="footer">
        <div class="footer-left">
          <div>SafeCloud Africa</div>
          <div>Generated by: ${options.generatedBy || 'SafeCloud Africa user'}</div>
        </div>
        <div class="footer-right">
          <div>${options.companyName || 'Company Name'}</div>
          <div>${new Date().toLocaleDateString()}</div>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Convert HTML to PDF blob (simplified implementation)
 * Note: In production, integrate with a proper PDF library like pdfkit or puppeteer
 */
function htmlToPDF(
  html: string,
  options: { filename: string; title: string }
): Promise<Blob> {
  return new Promise((resolve) => {
    // For now, return as HTML blob that can be printed to PDF
    // In production, use:
    // - pdfkit (Node.js server-side)
    // - html2pdf (browser-side)
    // - puppeteer (headless Chrome)
    // - wkhtmltopdf (command-line)

    const blob = new Blob([html], { type: 'text/html' });

    // Trigger browser print dialog
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = url;
    iframe.onload = () => {
      iframe.contentWindow?.print();
      resolve(blob);
    };
    document.body.appendChild(iframe);
  });
}

/**
 * Download file to user's device
 */
export function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
