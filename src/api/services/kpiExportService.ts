import type { KPIAssessment, KPIFinding } from '../models/entities';

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type KPIReportInput = {
  reportType: 'employee' | 'project' | 'department_ranking';
  organizationId: string;
  assessments: KPIAssessment[];
  findings: KPIFinding[];
  periodFrom?: string;
  periodTo?: string;
};

export async function exportKPIReports(input: KPIReportInput, format: 'pdf' | 'csv'): Promise<Blob> {
  if (format === 'csv') return exportKPIReportsCSV(input);
  return exportKPIReportsHTML(input);
}

function exportKPIReportsCSV(input: KPIReportInput): Promise<Blob> {
  const { reportType, assessments } = input;
  let headers: string[];
  let rows: string[][];

  if (reportType === 'employee' || reportType === 'project') {
    headers = ['Name', 'Manager', 'Type', 'Period start', 'Period end', 'Status', 'Overall score', 'Rating band'];
    rows = assessments.map((a) => [
      a.employee_name_snapshot || a.project_name || '',
      a.manager_name_snapshot || '',
      a.assessment_type,
      a.period_start_date,
      a.period_end_date,
      a.status,
      a.overall_score != null ? String(a.overall_score) : '',
      a.overall_rating_band || ''
    ]);
  } else {
    const byDept: Record<string, { sum: number; count: number }> = {};
    assessments.forEach((a) => {
      const key = (a.department_id as string) ?? 'Unassigned';
      if (!byDept[key]) byDept[key] = { sum: 0, count: 0 };
      if (a.overall_score != null) {
        byDept[key].sum += a.overall_score;
        byDept[key].count += 1;
      }
    });
    headers = ['Department', 'Avg score', 'Count'];
    rows = Object.entries(byDept)
      .filter(([, v]) => v.count > 0)
      .map(([id, v]) => [id, (v.sum / v.count).toFixed(2), String(v.count)])
      .sort((a, b) => Number(b[1]) - Number(a[1]));
  }

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');
  return Promise.resolve(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }));
}

function exportKPIReportsHTML(input: KPIReportInput): Promise<Blob> {
  const { reportType, assessments } = input;
  let title: string;
  let tableRows: string;

  if (reportType === 'employee' || reportType === 'project') {
    title = reportType === 'employee' ? 'Employee KPI Report' : 'Project KPI Report';
    tableRows = assessments
      .map(
        (a) => `
      <tr>
        <td>${escapeHtml(a.employee_name_snapshot || a.project_name || '')}</td>
        <td>${escapeHtml(a.manager_name_snapshot || '')}</td>
        <td>${escapeHtml(a.assessment_type)}</td>
        <td>${escapeHtml(a.period_start_date)}</td>
        <td>${escapeHtml(a.period_end_date)}</td>
        <td>${escapeHtml(a.status)}</td>
        <td>${a.overall_score != null ? a.overall_score.toFixed(2) : ''}</td>
        <td>${escapeHtml(a.overall_rating_band || '')}</td>
      </tr>`
      )
      .join('');
  } else {
    title = 'Department Ranking Report';
    const byDept: Record<string, { sum: number; count: number }> = {};
    assessments.forEach((a) => {
      const key = (a.department_id as string) ?? 'Unassigned';
      if (!byDept[key]) byDept[key] = { sum: 0, count: 0 };
      if (a.overall_score != null) {
        byDept[key].sum += a.overall_score;
        byDept[key].count += 1;
      }
    });
    const sorted = Object.entries(byDept)
      .filter(([, v]) => v.count > 0)
      .map(([id, v]) => ({ id, avg: v.sum / v.count, count: v.count }))
      .sort((a, b) => b.avg - a.avg);
    tableRows = sorted
      .map(
        (d) => `
      <tr>
        <td>${escapeHtml(d.id)}</td>
        <td>${d.avg.toFixed(2)}</td>
        <td>${d.count}</td>
      </tr>`
      )
      .join('');
  }

  const th =
    reportType === 'department_ranking'
      ? '<tr><th>Department</th><th>Avg score</th><th>Count</th></tr>'
      : '<tr><th>Name</th><th>Manager</th><th>Type</th><th>Period start</th><th>Period end</th><th>Status</th><th>Score</th><th>Band</th></tr>';

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8" /><style>
      body { font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.6; color: #333; padding: 20px; }
      .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #0d9488; padding-bottom: 10px; }
      .header h1 { margin: 0; color: #0d9488; }
      table { width: 100%; border-collapse: collapse; margin: 15px 0; }
      th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
      th { background: #f0f0f0; font-weight: bold; }
      .footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 9pt; color: #666; }
    </style></head>
    <body>
      <div class="header">
        <h1>${escapeHtml(title)}</h1>
        <p>Generated on ${new Date().toLocaleString()}</p>
      </div>
      <table>
        <thead>${th}</thead>
        <tbody>${tableRows || '<tr><td colspan="8">No data</td></tr>'}</tbody>
      </table>
      <div class="footer">
        SafeCloud Africa – KPI Module. Print to save as PDF.
      </div>
    </body>
    </html>`;
  return Promise.resolve(new Blob([html], { type: 'text/html;charset=utf-8' }));
}
