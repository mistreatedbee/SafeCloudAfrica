import type { UUID } from '../models/core';
import { downloadTextFile, toCsv } from '../../utils/csv';
import { listEnvAirQuality, listEnvImpactAssessments, listEnvRiskOpportunity, listEnvWasteDisposal, listEnvWaterMonitoring } from './environmentService';

export type EnvironmentReportType =
  | 'eia'
  | 'emp'
  | 'audit_summary'
  | 'risk_opportunity'
  | 'waste'
  | 'water'
  | 'air';

type EnvironmentReportDataset = {
  eia: any[];
  risk: any[];
  waste: any[];
  water: any[];
  air: any[];
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function titleFor(type: EnvironmentReportType): string {
  switch (type) {
    case 'eia':
      return 'Environmental Impact Assessment Report';
    case 'emp':
      return 'Environmental Management Plan (Derived)';
    case 'audit_summary':
      return 'Environmental Audit Summary';
    case 'risk_opportunity':
      return 'Environmental Risk and Opportunity Register';
    case 'waste':
      return 'Waste Disposal Register';
    case 'water':
      return 'Water Monitoring Register';
    case 'air':
      return 'Air Quality Monitoring Register';
  }
}

function buildRows(type: EnvironmentReportType, data: EnvironmentReportDataset | any[]): Array<Record<string, unknown>> {
  if (Array.isArray(data)) {
    switch (type) {
      case 'eia':
        return data.map((row) => ({
          ref_number: row.ref_number,
          activity_or_process: row.activity_or_process,
          environmental_aspect: row.environmental_aspect_cause,
          potential_impact: row.potential_impact_effect,
          risk_rating: row.risk_rating,
          risk_level: row.risk_level,
          responsible: row.responsible_name_snapshot || row.responsible_external_name || row.responsible_user_id || '',
          review_date: row.review_date ?? ''
        }));
      case 'risk_opportunity':
        return data.map((row) => ({
          reference_number: row.reference_number,
          type: row.type,
          title: row.risk_or_opportunity,
          rating: row.rating,
          level: row.level,
          status: row.status,
          responsible: row.responsible_name_snapshot || row.responsible_external_name || row.responsible_user_id || '',
          target_date: row.target_date ?? ''
        }));
      case 'waste':
        return data.map((row) => ({
          ref_no: row.ref_no,
          date: row.date,
          waste_category: row.waste_category,
          waste_type_name: row.waste_type_name,
          quantity_value: row.quantity_value,
          quantity_unit: row.quantity_unit,
          disposal_status: row.disposal_status,
          status: row.status,
          responsible: row.responsible_name_snapshot || row.responsible_external_name || row.responsible_user_id || ''
        }));
      case 'water':
        return data.map((row) => ({
          reference_number: row.reference_number,
          sampling_date: row.sampling_date,
          site_facility_name: row.site_facility_name,
          sampling_point: row.gps_location_or_sampling_point_id,
          overall_compliance_status: row.overall_compliance_status,
          reviewer: row.reviewed_by_name_snapshot || row.reviewed_by_user_id || '',
          ncr_id: row.system_generated_capa_id ?? ''
        }));
      case 'air':
        return data.map((row) => ({
          reference_number: row.reference_number,
          monitoring_date: row.monitoring_date,
          monitoring_location: row.monitoring_location,
          method_used: row.method_used,
          overall_status: row.overall_status,
          reviewer: row.reviewed_by_name_snapshot || row.reviewed_by_user_id || '',
          ncr_id: row.system_generated_capa_id ?? ''
        }));
      default:
        return [];
    }
  }

  if (type === 'emp') {
    const totalOpenRisks = data.risk.filter((row) => String(row.status ?? '').toLowerCase() !== 'closed').length;
    const failedWater = data.water.filter((row) => row.overall_compliance_status === 'Fail').length;
    const failedAir = data.air.filter((row) => row.overall_status === 'Fail').length;
    return [
      { section: 'Aspects', metric: 'EIA records', value: data.eia.length },
      { section: 'Operational controls', metric: 'Open risks/opportunities', value: totalOpenRisks },
      { section: 'Waste', metric: 'Waste records', value: data.waste.length },
      { section: 'Water', metric: 'Failed water results', value: failedWater },
      { section: 'Air', metric: 'Failed air results', value: failedAir }
    ];
  }

  const openWaterNcrs = data.water.filter((row) => !!row.system_generated_capa_id).length;
  const openAirNcrs = data.air.filter((row) => !!row.system_generated_capa_id).length;
  return [
    { metric: 'EIA records', value: data.eia.length },
    { metric: 'Risk & opportunity records', value: data.risk.length },
    { metric: 'Waste records', value: data.waste.length },
    { metric: 'Water monitoring records', value: data.water.length },
    { metric: 'Air monitoring records', value: data.air.length },
    { metric: 'Water-linked NCRs', value: openWaterNcrs },
    { metric: 'Air-linked NCRs', value: openAirNcrs }
  ];
}

export async function loadEnvironmentReportDataset(companyId: UUID): Promise<EnvironmentReportDataset> {
  const [eia, risk, waste, water, air] = await Promise.all([
    listEnvImpactAssessments(companyId),
    listEnvRiskOpportunity(companyId),
    listEnvWasteDisposal(companyId),
    listEnvWaterMonitoring(companyId),
    listEnvAirQuality(companyId)
  ]);
  return { eia, risk, waste, water, air };
}

export function buildEnvironmentReportCsv(type: EnvironmentReportType, data: EnvironmentReportDataset | any[], version = 1): string {
  const rows = buildRows(type, data);
  const meta = [
    `Report: ${titleFor(type)}`,
    `Version: ${version}`,
    `Generated at: ${new Date().toISOString()}`,
    ''
  ].join('\r\n');
  return `${meta}\r\n${toCsv(rows)}`;
}

export function renderEnvironmentReportHtml(type: EnvironmentReportType, data: EnvironmentReportDataset | any[], version = 1): string {
  const rows = buildRows(type, data);
  const headers = Object.keys(rows[0] ?? { metric: '', value: '' });
  const tableRows = rows
    .map((row) => `<tr>${headers.map((header) => `<td>${escapeHtml((row as any)[header])}</td>`).join('')}</tr>`)
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(titleFor(type))}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1f2937; padding: 24px; }
    h1 { color: #0f766e; margin-bottom: 8px; }
    .meta { color: #6b7280; font-size: 12px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; }
  </style>
</head>
<body>
  <h1>${escapeHtml(titleFor(type))}</h1>
  <p class="meta">Version ${version} • Generated ${escapeHtml(new Date().toLocaleString())}</p>
  <table>
    <thead><tr>${headers.map((header) => `<th>${escapeHtml(header.replace(/_/g, ' '))}</th>`).join('')}</tr></thead>
    <tbody>${tableRows || `<tr><td colspan="${headers.length || 1}">No data</td></tr>`}</tbody>
  </table>
</body>
</html>`;
}

export function downloadEnvironmentReportCsv(filename: string, csvContent: string): void {
  downloadTextFile(filename, csvContent, 'text/csv;charset=utf-8');
}

export function printEnvironmentReportPdf(htmlContent: string): void {
  const blob = new Blob([htmlContent], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = url;
  iframe.onload = () => {
    iframe.contentWindow?.print();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };
  document.body.appendChild(iframe);
}
