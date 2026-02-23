import type { UUID } from '../models/entities';
import {
  getRolling12Period,
  getSafetyKpis,
  getComplianceKpis,
  getQualityKpis,
  getEnvironmentalKpis,
  getLtiFreeHours
} from './kpiFormulasService';
import { toCsv } from '../../utils/csv';
import { downloadTextFile } from '../../utils/csv';
import { downloadFile } from './exportService';

export type KpiPackExportResult = { csvContent: string; htmlContent: string };

export async function buildKpiPackExport(companyId: UUID): Promise<KpiPackExportResult> {
  const period = getRolling12Period();
  const [safety, compliance, quality, env, ltiFree] = await Promise.all([
    getSafetyKpis(companyId, { period }),
    getComplianceKpis(companyId, { period }),
    getQualityKpis(companyId, { period }),
    getEnvironmentalKpis(companyId, { period }),
    getLtiFreeHours(companyId)
  ]);

  const csvRows: Record<string, unknown>[] = [
    { Category: 'Safety', KPI: 'TRIR', Value: safety?.trir ?? '', Notes: 'Recordable injuries' },
    { Category: 'Safety', KPI: 'LTIFR', Value: safety?.ltifr ?? '', Notes: 'Lost time injuries' },
    { Category: 'Safety', KPI: 'Severity Rate', Value: safety?.severityRate ?? '', Notes: 'Lost days' },
    { Category: 'Safety', KPI: 'Incident Freq. Rate', Value: safety?.incidentFrequencyRate ?? '', Notes: '' },
    { Category: 'Safety', KPI: 'Fatality Rate', Value: safety?.fatalityRate ?? '', Notes: '' },
    { Category: 'Safety', KPI: 'Near Miss Freq. Rate', Value: safety?.nearMissFrequencyRate ?? '', Notes: '' },
    { Category: 'Safety', KPI: 'Accident Freq. Rate', Value: safety?.accidentFrequencyRate ?? '', Notes: '' },
    { Category: 'Safety', KPI: 'Total hours worked', Value: safety?.totalHoursWorked ?? '', Notes: 'Rolling 12 months' },
    { Category: 'Safety', KPI: 'LTI-free hours', Value: ltiFree?.ltiFreeHours ?? '', Notes: ltiFree?.lastResetReason ?? '' },
    { Category: 'Compliance', KPI: 'PPE Compliance %', Value: compliance?.ppeCompliancePercent ?? '', Notes: '' },
    { Category: 'Compliance', KPI: 'Training Completion %', Value: compliance?.trainingCompletionPercent ?? '', Notes: '' },
    { Category: 'Compliance', KPI: 'Inspection Compliance %', Value: compliance?.inspectionCompliancePercent ?? '', Notes: '' },
    { Category: 'Compliance', KPI: 'Corrective Action Closure %', Value: compliance?.correctiveActionClosurePercent ?? '', Notes: '' },
    { Category: 'Compliance', KPI: 'Audit Score %', Value: compliance?.auditScorePercent ?? '', Notes: '' },
    { Category: 'Quality', KPI: 'Customer Complaint Rate %', Value: quality?.customerComplaintRate ?? '', Notes: '' },
    { Category: 'Quality', KPI: 'Non-Conformance Rate %', Value: quality?.nonConformanceRate ?? '', Notes: '' },
    { Category: 'Environmental', KPI: 'Waste Recycling %', Value: env?.wasteRecyclingRate ?? '', Notes: '' },
    { Category: 'Environmental', KPI: 'Spill Freq. Rate', Value: env?.spillFrequencyRate ?? '', Notes: '' },
    { Category: 'Environmental', KPI: 'Env. Incident Rate', Value: env?.environmentalIncidentRate ?? '', Notes: '' },
    { Category: 'Environmental', KPI: 'Energy Consumption Rate', Value: env?.energyConsumptionRate ?? '', Notes: '' }
  ];
  const csvContent = toCsv(csvRows);

  const fmt = (v: number | null | undefined) => (v != null && !Number.isNaN(v) ? v.toFixed(2) : '—');
  const fmtPct = (v: number | null | undefined) => (v != null && !Number.isNaN(v) ? `${v.toFixed(1)}%` : '—');

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>KPI Pack Summary - SafeCloud Africa</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 24px; color: #333; max-width: 800px; margin: 0 auto; }
    h1 { font-size: 1.5rem; margin-bottom: 8px; }
    .meta { color: #666; font-size: 0.875rem; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #eee; }
    th { background: #f5f5f5; font-weight: 600; }
    .section { margin-bottom: 20px; }
    .section h2 { font-size: 1.1rem; margin-bottom: 8px; color: #0d9488; }
    @media print { body { padding: 16px; } }
  </style>
</head>
<body>
  <h1>KPI Pack Summary</h1>
  <p class="meta">Generated ${new Date().toLocaleString()}. Rolling 12 months.</p>

  <div class="section">
    <h2>Safety</h2>
    <table>
      <tr><th>KPI</th><th>Value</th></tr>
      <tr><td>TRIR / TRIFR</td><td>${fmt(safety?.trir)}</td></tr>
      <tr><td>LTIFR</td><td>${fmt(safety?.ltifr)}</td></tr>
      <tr><td>Severity Rate</td><td>${fmt(safety?.severityRate)}</td></tr>
      <tr><td>Incident Freq. Rate</td><td>${fmt(safety?.incidentFrequencyRate)}</td></tr>
      <tr><td>Fatality Rate</td><td>${fmt(safety?.fatalityRate)}</td></tr>
      <tr><td>Near Miss Freq. Rate</td><td>${fmt(safety?.nearMissFrequencyRate)}</td></tr>
      <tr><td>Accident Freq. Rate</td><td>${fmt(safety?.accidentFrequencyRate)}</td></tr>
      <tr><td>Total hours worked</td><td>${(safety?.totalHoursWorked ?? 0).toLocaleString()}</td></tr>
      <tr><td>LTI-free hours</td><td>${(ltiFree?.ltiFreeHours ?? 0).toLocaleString()}${ltiFree?.lastResetDate ? ` (reset: ${new Date(ltiFree.lastResetDate).toLocaleDateString()})` : ''}</td></tr>
    </table>
  </div>

  <div class="section">
    <h2>Compliance & Performance</h2>
    <table>
      <tr><th>KPI</th><th>Value</th></tr>
      <tr><td>PPE Compliance %</td><td>${fmtPct(compliance?.ppeCompliancePercent)}</td></tr>
      <tr><td>Training Completion %</td><td>${fmtPct(compliance?.trainingCompletionPercent)}</td></tr>
      <tr><td>Inspection Compliance %</td><td>${fmtPct(compliance?.inspectionCompliancePercent)}</td></tr>
      <tr><td>Corrective Action Closure %</td><td>${fmtPct(compliance?.correctiveActionClosurePercent)}</td></tr>
      <tr><td>Audit Score %</td><td>${fmtPct(compliance?.auditScorePercent)}</td></tr>
    </table>
  </div>

  <div class="section">
    <h2>Quality</h2>
    <table>
      <tr><th>KPI</th><th>Value</th></tr>
      <tr><td>Customer Complaint Rate %</td><td>${quality?.customerComplaintRate != null ? quality.customerComplaintRate.toFixed(2) + '%' : '—'}</td></tr>
      <tr><td>Non-Conformance Rate %</td><td>${quality?.nonConformanceRate != null ? quality.nonConformanceRate.toFixed(2) + '%' : '—'}</td></tr>
    </table>
  </div>

  <div class="section">
    <h2>Environmental</h2>
    <table>
      <tr><th>KPI</th><th>Value</th></tr>
      <tr><td>Waste Recycling %</td><td>${fmtPct(env?.wasteRecyclingRate)}</td></tr>
      <tr><td>Spill Freq. Rate</td><td>${fmt(env?.spillFrequencyRate)}</td></tr>
      <tr><td>Environmental Incident Rate</td><td>${fmt(env?.environmentalIncidentRate)}</td></tr>
      <tr><td>Energy Consumption Rate</td><td>${env?.energyConsumptionRate != null ? env.energyConsumptionRate.toFixed(2) : '—'}</td></tr>
    </table>
  </div>

  <p class="meta">SafeCloud Africa / IDSMP. Tenant-isolated data.</p>
</body>
</html>`;

  return { csvContent, htmlContent };
}

export function downloadKpiPackCsv(csvContent: string): void {
  const filename = `kpi-pack-${new Date().toISOString().slice(0, 10)}.csv`;
  downloadTextFile(filename, csvContent, 'text/csv;charset=utf-8');
}

export function printKpiPackPdf(htmlContent: string): void {
  const blob = new Blob([htmlContent], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = url;
  iframe.onload = () => {
    iframe.contentWindow?.print();
    URL.revokeObjectURL(url);
  };
  document.body.appendChild(iframe);
}
