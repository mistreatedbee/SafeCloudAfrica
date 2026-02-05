/**
 * PDF Export Service
 * 
 * Generates PDFs for incidents, audits, NCRs, and risk assessments
 * Uses a simple HTML-to-PDF approach (can be enhanced with pdfkit or puppeteer)
 */

import type { UUID } from '../models/core';
import type { Incident, QualityNcr, Audit } from '../models/entities';

export interface ExportOptions {
  includeEvidence?: boolean;
  includeSignatures?: boolean;
  fontSize?: number;
  orientation?: 'portrait' | 'landscape';
  companyName?: string;
}

export type ExportFormat = 'pdf' | 'csv' | 'xlsx';

/**
 * Export incident to PDF
 */
export async function exportIncidentPDF(
  incident: Incident,
  options: ExportOptions = {}
): Promise<Blob> {
  const { includeEvidence = true, includeSignatures = true, fontSize = 11, companyName = '' } = options;

  // Generate HTML content
  const html = generateIncidentHTML(incident, {
    includeEvidence,
    includeSignatures,
    fontSize,
    companyName,
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
  const { includeEvidence = true, fontSize = 11, companyName = '' } = options;

  const html = generateNCRHTML(ncr, {
    includeEvidence,
    fontSize,
    companyName,
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
  const { includeEvidence = true, fontSize = 11, companyName = '' } = options;

  const html = generateAuditHTML(audit, {
    includeEvidence,
    fontSize,
    companyName,
  });

  return htmlToPDF(html, {
    filename: `audit-${audit.id.slice(0, 8)}.pdf`,
    title: `Audit Report - ${audit.title}`,
  });
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

/**
 * Generate incident HTML for PDF
 */
function generateIncidentHTML(
  incident: Incident,
  options: { includeEvidence: boolean; includeSignatures: boolean; fontSize: number; companyName?: string }
): string {
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString();

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
        <div class="field">
          <span class="field-label">Title:</span>
          <span class="field-value">${incident.title}</span>
        </div>
        <div class="field">
          <span class="field-label">Category:</span>
          <span class="field-value">${incident.category} / ${incident.subcategory}</span>
        </div>
        <div class="field">
          <span class="field-label">Severity:</span>
          <span class="field-value"><span class="severity-${incident.severity}">${incident.severity.toUpperCase()}</span></span>
        </div>
        <div class="field">
          <span class="field-label">Status:</span>
          <span class="field-value">${incident.status}</span>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Incident Details</div>
        <div class="field">
          <span class="field-label">Occurred At:</span>
          <span class="field-value">${formatDate(incident.occurred_at)}</span>
        </div>
        <div class="field">
          <span class="field-label">Location:</span>
          <span class="field-value">${incident.location || 'Not specified'}</span>
        </div>
        ${incident.description ? `
        <div class="field">
          <span class="field-label">Description:</span>
        </div>
        <div style="margin-left: 150px; white-space: pre-wrap;">${incident.description}</div>
        ` : ''}
      </div>

      ${options.includeEvidence ? `
      <div class="section">
        <div class="section-title">Evidence & Attachments</div>
        <p style="color: #666;">Evidence files attached separately</p>
      </div>
      ` : ''}

      <div class="footer">
        <div class="footer-left">SafeCloud Africa</div>
        <div class="footer-right">${options.companyName || 'Company Name'}</div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate NCR HTML for PDF
 */
function generateNCRHTML(ncr: QualityNcr, options: { includeEvidence: boolean; fontSize: number; companyName?: string }): string {
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
        <div class="footer-left">SafeCloud Africa</div>
        <div class="footer-right">${options.companyName || 'Company Name'}</div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate audit HTML for PDF
 */
function generateAuditHTML(audit: Audit, options: { includeEvidence: boolean; fontSize: number; companyName?: string }): string {
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
        <div class="footer-left">SafeCloud Africa</div>
        <div class="footer-right">${options.companyName || 'Company Name'}</div>
      </div>
    </body>
    </html>
  `;
}
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
