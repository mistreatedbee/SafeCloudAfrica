import React, { useState } from 'react';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { listKPIAssessments } from '../../api/services/kpiAssessmentService';
import { listKPIFindings } from '../../api/services/kpiFindingService';
import type { KPIAssessment } from '../../api/models/entities';
import { exportKPIReports } from '../../api/services/kpiExportService';
import { downloadFile } from '../../api/services/exportService';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

type ReportType = 'employee' | 'project' | 'department_ranking';

export function KPIReportsPage() {
  const { activeCompanyId } = useTenant();
  const [reportType, setReportType] = useState<ReportType>('employee');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [exporting, setExporting] = useState<'pdf' | 'csv' | null>(null);

  const { data: assessments, loading } = useAsync<KPIAssessment[]>(
    async () => {
      if (!activeCompanyId) return [];
      return listKPIAssessments({
        organizationId: activeCompanyId,
        periodFrom: periodFrom || undefined,
        periodTo: periodTo || undefined,
        limit: 500
      });
    },
    [activeCompanyId, periodFrom, periodTo]
  );

  const { data: findings } = useAsync(
    async () => {
      if (!activeCompanyId) return [];
      return listKPIFindings({ organizationId: activeCompanyId, limit: 1000 });
    },
    [activeCompanyId]
  );

  const list = assessments ?? [];
  const openFindings = (findings ?? []).filter((f: any) => f.status !== 'closed');

  const handleExport = async (format: 'pdf' | 'csv') => {
    if (!activeCompanyId) return;
    setExporting(format);
    try {
      const blob = await exportKPIReports({
        reportType,
        organizationId: activeCompanyId,
        assessments: list,
        findings: findings ?? [],
        periodFrom: periodFrom || undefined,
        periodTo: periodTo || undefined
      }, format);
      const name = `kpi-${reportType}-${periodFrom || 'all'}-${periodTo || 'all'}.${format === 'pdf' ? 'html' : 'csv'}`;
      downloadFile(blob, name);
    } catch (e) {
      console.error(e);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-charcoal">KPI Reports</h2>
      <div className="flex flex-wrap gap-4">
        <select
          value={reportType}
          onChange={(e) => setReportType(e.target.value as ReportType)}
          className="px-3 py-2 border border-surface-300 rounded-lg text-sm"
        >
          <option value="employee">Employee report</option>
          <option value="project">Project report</option>
          <option value="department_ranking">Department ranking</option>
        </select>
        <input
          type="date"
          placeholder="From"
          value={periodFrom}
          onChange={(e) => setPeriodFrom(e.target.value)}
          className="px-3 py-2 border border-surface-300 rounded-lg text-sm"
        />
        <input
          type="date"
          placeholder="To"
          value={periodTo}
          onChange={(e) => setPeriodTo(e.target.value)}
          className="px-3 py-2 border border-surface-300 rounded-lg text-sm"
        />
        <button
          type="button"
          onClick={() => handleExport('pdf')}
          disabled={exporting !== null}
          className="px-4 py-2 rounded-lg bg-navy text-white text-sm font-medium hover:bg-navy-800 disabled:opacity-50"
        >
          {exporting === 'pdf' ? 'Exporting…' : 'Export PDF'}
        </button>
        <button
          type="button"
          onClick={() => handleExport('csv')}
          disabled={exporting !== null}
          className="px-4 py-2 rounded-lg bg-teal text-white text-sm font-medium hover:bg-teal-600 disabled:opacity-50"
        >
          {exporting === 'csv' ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-3 p-6">
          <LoadingSpinner size={20} />
          <span className="text-charcoal-500">Loading…</span>
        </div>
      )}

      {!loading && (
        <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
          <p className="text-sm text-charcoal-500">
            {list.length} assessments in range. {openFindings.length} open findings.
          </p>
          <p className="text-sm text-charcoal-500 mt-1">
            Use filters and export to PDF or CSV.
          </p>
        </div>
      )}
    </div>
  );
}
