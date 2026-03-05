import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { listKPIAssessments, listKPIAssessmentLinesByAssessmentIds } from '../../api/services/kpiAssessmentService';
import type { KPIAssessment, KPIAssessmentLine } from '../../api/models/entities';
import { exportKPIReports } from '../../api/services/kpiExportService';
import { downloadFile } from '../../api/services/exportService';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { listDepartments } from '../../api/services/departmentsService';

type ReportType = 'individual_history' | 'department_trends' | 'achieved_vs_not_achieved' | 'manager_rating_distribution' | 'period_comparison';

export function KPIReportsPage() {
  const navigate = useNavigate();
  const { activeCompanyId } = useTenant();
  const [reportType, setReportType] = useState<ReportType>('individual_history');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all');
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);

  const { data: assessments, loading } = useAsync<KPIAssessment[]>(
    async () => {
      if (!activeCompanyId) return [];
      return listKPIAssessments({
        organizationId: activeCompanyId,
        periodFrom: periodFrom || undefined,
        periodTo: periodTo || undefined,
        limit: 1000
      });
    },
    [activeCompanyId, periodFrom, periodTo]
  );

  const assessmentIds = useMemo(() => (assessments ?? []).map((a) => a.assessment_id), [assessments]);

  const { data: lines } = useAsync<KPIAssessmentLine[]>(
    async () => {
      if (!assessmentIds.length) return [];
      return listKPIAssessmentLinesByAssessmentIds(assessmentIds as any);
    },
    [assessmentIds.join('|')]
  );
  const { data: departments } = useAsync(
    async () => {
      if (!activeCompanyId) return [];
      return listDepartments(activeCompanyId);
    },
    [activeCompanyId]
  );

  const departmentNameById = useMemo(() => {
    const map = new Map<string, string>();
    (departments ?? []).forEach((d: any) => map.set(String(d.id), String(d.name)));
    return map;
  }, [departments]);

  const filteredAssessments = useMemo(() => {
    return (assessments ?? []).filter((a) => {
      if (selectedDepartment !== 'all' && String(a.department_id ?? 'unassigned') !== selectedDepartment) return false;
      if (selectedEmployee !== 'all' && String(a.employee_id ?? 'none') !== selectedEmployee) return false;
      return true;
    });
  }, [assessments, selectedDepartment, selectedEmployee]);

  const filteredAssessmentIds = useMemo(() => new Set(filteredAssessments.map((a) => a.assessment_id)), [filteredAssessments]);

  const filteredLines = useMemo(
    () => (lines ?? []).filter((line) => filteredAssessmentIds.has(line.assessment_id)),
    [lines, filteredAssessmentIds]
  );

  const employeeHistoryRows = useMemo(() => {
    const byAssessment = new Map(filteredAssessments.map((a) => [a.assessment_id, a]));
    return filteredLines
      .map((line) => {
        const assessment = byAssessment.get(line.assessment_id);
        if (!assessment) return null;
        const status = line.manager_rating == null
          ? 'Pending'
          : line.manager_rating >= 4
            ? 'Achieved'
            : line.manager_rating === 3
              ? 'Partially Achieved'
              : 'Not Achieved';
        return {
          key: `${line.line_id}`,
          assessmentId: assessment.assessment_id,
          kpiName: line.kpi_questionnaire || line.kpi_title,
          period: `${assessment.period_start_date} to ${assessment.period_end_date}`,
          target: line.importance_rating,
          actualPerformance: line.weighted_score != null ? line.weighted_score.toFixed(2) : '-',
          managerRating: line.manager_rating ?? '-',
          status
        };
      })
      .filter((row): row is NonNullable<typeof row> => !!row);
  }, [filteredAssessments, filteredLines]);

  const departmentOptions = useMemo(() => {
    const map = new Map<string, string>();
    (assessments ?? []).forEach((a) => {
      const key = String(a.department_id ?? 'unassigned');
      if (!map.has(key)) {
        const label = key === 'unassigned' ? 'Unassigned' : (departmentNameById.get(key) ?? key);
        map.set(key, label);
      }
    });
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [assessments, departmentNameById]);

  const employeeOptions = useMemo(() => {
    const map = new Map<string, string>();
    (assessments ?? []).forEach((a) => {
      const key = String(a.employee_id ?? 'none');
      if (!map.has(key)) map.set(key, a.employee_name_snapshot || 'Unknown');
    });
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [assessments]);

  const handleExport = async (format: 'pdf' | 'excel') => {
    if (!activeCompanyId) return;
    setExporting(format);
    try {
      const blob = await exportKPIReports(
        {
          reportType,
          organizationId: activeCompanyId,
          assessments: filteredAssessments,
          lines: filteredLines,
          findings: [],
          periodFrom: periodFrom || undefined,
          periodTo: periodTo || undefined
        },
        format
      );
      const ext = format === 'pdf' ? 'html' : 'csv';
      downloadFile(blob, `kpi-assessment-${reportType}-${periodFrom || 'all'}-${periodTo || 'all'}.${ext}`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-charcoal">KPI Reports & Analytics</h2>

      <div className="flex flex-wrap gap-3">
        <select value={reportType} onChange={(e) => setReportType(e.target.value as ReportType)} className="px-3 py-2 border border-surface-300 rounded-lg text-sm">
          <option value="individual_history">Individual KPI history</option>
          <option value="department_trends">Department KPI trends</option>
          <option value="achieved_vs_not_achieved">Achieved vs Not Achieved</option>
          <option value="manager_rating_distribution">Manager rating distribution</option>
          <option value="period_comparison">Period comparison</option>
        </select>

        <input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />
        <input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} className="px-3 py-2 border border-surface-300 rounded-lg text-sm" />

        <select value={selectedDepartment} onChange={(e) => setSelectedDepartment(e.target.value)} className="px-3 py-2 border border-surface-300 rounded-lg text-sm">
          <option value="all">All departments</option>
          {departmentOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <select value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)} className="px-3 py-2 border border-surface-300 rounded-lg text-sm">
          <option value="all">All employees</option>
          {employeeOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <button type="button" onClick={() => handleExport('pdf')} disabled={exporting !== null} className="px-4 py-2 rounded-lg bg-navy text-white text-sm font-medium hover:bg-navy-800 disabled:opacity-50">
          {exporting === 'pdf' ? 'Exporting...' : 'Export PDF'}
        </button>
        <button type="button" onClick={() => handleExport('excel')} disabled={exporting !== null} className="px-4 py-2 rounded-lg bg-teal text-white text-sm font-medium hover:bg-teal-600 disabled:opacity-50">
          {exporting === 'excel' ? 'Exporting...' : 'Export Excel'}
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-3 p-6">
          <LoadingSpinner size={20} />
          <span className="text-charcoal-500">Loading...</span>
        </div>
      )}

      {!loading && (
        <>
          <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
            <p className="text-sm text-charcoal-500">{filteredAssessments.length} KPI Assessments and {filteredLines.length} KPI Questionnaires in selected range.</p>
            <p className="text-sm text-charcoal-500 mt-1">Use filters for period, department, and employee. Export supports PDF and Excel-compatible CSV.</p>
          </div>

          <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
            <h3 className="font-semibold text-charcoal mb-3">Employee KPI History</h3>
            {employeeHistoryRows.length === 0 ? (
              <p className="text-sm text-charcoal-500">No KPI history records in the selected range.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-charcoal-500 border-b border-surface-200">
                      <th className="py-2 pr-4">KPI name</th>
                      <th className="py-2 pr-4">Assessment period</th>
                      <th className="py-2 pr-4">Target</th>
                      <th className="py-2 pr-4">Actual performance</th>
                      <th className="py-2 pr-4">Manager rating</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {employeeHistoryRows.slice(0, 200).map((row) => (
                      <tr key={row.key} className="border-b border-surface-100 last:border-0">
                        <td className="py-2 pr-4 font-medium text-charcoal">{row.kpiName}</td>
                        <td className="py-2 pr-4">{row.period}</td>
                        <td className="py-2 pr-4 capitalize">{row.target}</td>
                        <td className="py-2 pr-4">{row.actualPerformance}</td>
                        <td className="py-2 pr-4">{row.managerRating}</td>
                        <td className="py-2 pr-4">{row.status}</td>
                        <td className="py-2 pr-4">
                          <button type="button" onClick={() => navigate(`/modules/hr/kpis/assessments/${row.assessmentId}`)} className="text-teal hover:underline">
                            Open
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
