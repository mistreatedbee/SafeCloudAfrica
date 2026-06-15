import type { KPIAssessment, KPIAssessmentLine, KPIFinding } from '../models/entities';

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type KPIReportInput = {
  reportType: 'individual_history' | 'department_trends' | 'achieved_vs_not_achieved' | 'manager_rating_distribution' | 'period_comparison';
  organizationId: string;
  assessments: KPIAssessment[];
  lines: KPIAssessmentLine[];
  findings: KPIFinding[];
  periodFrom?: string;
  periodTo?: string;
};

export async function exportKPIReports(input: KPIReportInput, format: 'pdf' | 'excel'): Promise<Blob> {
  if (format === 'excel') return exportKPIReportsCSV(input);
  return exportKPIReportsHTML(input);
}

function exportKPIReportsCSV(input: KPIReportInput): Promise<Blob> {
  const table = buildReportTable(input);
  const csvContent = [
    table.headers.join(','),
    ...table.rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');
  return Promise.resolve(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }));
}

function buildReportTable(input: KPIReportInput): { title: string; headers: string[]; rows: string[][] } {
  const { reportType, assessments, lines } = input;

  if (reportType === 'individual_history') {
    const assessmentById = new Map(assessments.map((a) => [a.assessment_id, a]));
    const rows = lines.map((line) => {
      const assessment = assessmentById.get(line.assessment_id);
      const status = line.achievement_status === 'achieved'
        ? 'Achieved'
        : line.achievement_status === 'partially_achieved'
          ? 'Partially Achieved'
          : line.achievement_status === 'not_achieved'
            ? 'Not Achieved'
            : line.manager_rating == null
              ? 'Pending'
              : line.manager_rating >= 4
                ? 'Achieved'
                : line.manager_rating === 3
                  ? 'Partially Achieved'
                  : 'Not Achieved';
      return [
        line.kpi_questionnaire || line.kpi_title || '',
        assessment?.employee_name_snapshot || assessment?.project_name || '',
        assessment?.department_id ? String(assessment.department_id) : 'Unassigned',
        line.manager_rating != null ? String(line.manager_rating) : '',
        line.weighted_score != null ? String(line.weighted_score) : '',
        status,
        assessment ? `${assessment.period_start_date} to ${assessment.period_end_date}` : '',
        assessment?.assessment_name || 'KPI Assessment'
      ];
    });

    return {
      title: 'Individual KPI History',
      headers: ['KPI Title', 'Employee Name', 'Department', 'Manager Rating', 'KPI Score', 'Status', 'Assessment Period', 'KPI Assessment'],
      rows
    };
  }

  if (reportType === 'department_trends') {
    const byDeptPeriod: Record<string, { dept: string; period: string; sum: number; count: number }> = {};
    assessments.forEach((a) => {
      if (a.overall_score == null) return;
      const dept = (a.department_id as string) || 'Unassigned';
      const period = a.period_start_date.slice(0, 7);
      const key = `${dept}::${period}`;
      if (!byDeptPeriod[key]) byDeptPeriod[key] = { dept, period, sum: 0, count: 0 };
      byDeptPeriod[key].sum += a.overall_score;
      byDeptPeriod[key].count += 1;
    });
    return {
      title: 'Department KPI Trends',
      headers: ['Department', 'Period', 'Average Score', 'Assessments'],
      rows: Object.values(byDeptPeriod)
        .sort((a, b) => a.period.localeCompare(b.period) || a.dept.localeCompare(b.dept))
        .map((x) => [x.dept, x.period, x.count > 0 ? (x.sum / x.count).toFixed(2) : '—', String(x.count)])
    };
  }

  if (reportType === 'achieved_vs_not_achieved') {
    const achieved = lines.filter((l) => (l.manager_rating ?? 0) >= 4).length;
    const partial = lines.filter((l) => l.manager_rating === 3).length;
    const notAchieved = lines.filter((l) => (l.manager_rating ?? 0) <= 2 && l.manager_rating != null).length;
    return {
      title: 'Achieved vs Not Achieved',
      headers: ['Status', 'Count'],
      rows: [
        ['Achieved', String(achieved)],
        ['Partially Achieved', String(partial)],
        ['Not Achieved', String(notAchieved)]
      ]
    };
  }

  if (reportType === 'manager_rating_distribution') {
    const counts = [1, 2, 3, 4, 5].map((n) => [String(n), String(lines.filter((l) => l.manager_rating === n).length)]);
    return {
      title: 'Manager Rating Distribution',
      headers: ['Manager Rating', 'Count'],
      rows: counts
    };
  }

  const byPeriod: Record<string, { sum: number; count: number; total: number }> = {};
  assessments.forEach((a) => {
    const key = a.period_type;
    if (!byPeriod[key]) byPeriod[key] = { sum: 0, count: 0, total: 0 };
    byPeriod[key].total += 1;
    if (a.overall_score != null) {
      byPeriod[key].sum += a.overall_score;
      byPeriod[key].count += 1;
    }
  });
  return {
    title: 'Period Comparison',
    headers: ['Period Type', 'Average Score', 'Assessments'],
    rows: Object.entries(byPeriod).map(([period, v]) => [period, v.count > 0 ? (v.sum / v.count).toFixed(2) : '—', String(v.total)])
  };
}

function exportKPIReportsHTML(input: KPIReportInput): Promise<Blob> {
  const table = buildReportTable(input);
  const headers = table.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  const rows = table.rows
    .map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`)
    .join('');

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
        <h1>${escapeHtml(table.title)}</h1>
        <p>Generated on ${new Date().toLocaleString()}</p>
      </div>
      <table>
        <thead><tr>${headers}</tr></thead>
        <tbody>${rows || `<tr><td colspan="${table.headers.length}">No data</td></tr>`}</tbody>
      </table>
      <div class="footer">SafeCloud Africa - KPI Assessment reports.</div>
    </body>
    </html>`;

  return Promise.resolve(new Blob([html], { type: 'text/html;charset=utf-8' }));
}
