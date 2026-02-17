import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { listKPIAssessments } from '../../api/services/kpiAssessmentService';
import type { KPIAssessment, KpiAssessmentType, KpiAssessmentStatus } from '../../api/models/entities';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

export function KPIAssessmentsListPage() {
  const navigate = useNavigate();
  const { activeCompanyId } = useTenant();
  const [filterType, setFilterType] = useState<'all' | KpiAssessmentType>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | KpiAssessmentStatus>('all');
  const [search, setSearch] = useState('');

  const { data: assessments, loading, error } = useAsync<KPIAssessment[]>(
    async () => {
      if (!activeCompanyId) return [];
      return listKPIAssessments({
        organizationId: activeCompanyId,
        assessmentType: filterType === 'all' ? undefined : filterType,
        status: filterStatus === 'all' ? undefined : filterStatus,
        search: search.trim() || undefined,
        limit: 200
      });
    },
    [activeCompanyId, filterType, filterStatus, search]
  );

  const list = assessments ?? [];
  const filtered = list; // API already filters

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-lg font-semibold text-charcoal">KPI Assessments</h2>
        <button
          type="button"
          onClick={() => navigate('/modules/hr/kpis/assessments/new')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600"
        >
          New assessment
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          placeholder="Search employee, manager, KPI title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 border border-surface-300 rounded-lg text-sm w-64"
        />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as any)}
          className="px-3 py-2 border border-surface-300 rounded-lg text-sm"
        >
          <option value="all">All types</option>
          <option value="employee">Employee</option>
          <option value="project">Project</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as any)}
          className="px-3 py-2 border border-surface-300 rounded-lg text-sm"
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
          <option value="under_review">Under review</option>
          <option value="finalized">Finalized</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {error && (
        <div className="bg-critical/5 border border-critical/20 rounded-xl p-3 text-sm text-critical">
          {(error as Error).message}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-3 p-6">
          <LoadingSpinner size={20} />
          <span className="text-charcoal-500">Loading…</span>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="bg-white rounded-xl border border-surface-300 p-6 shadow-card">
          <p className="text-charcoal-500">No assessments found.</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-charcoal-500 border-b border-surface-200 bg-surface-50">
                <th className="py-3 px-4">Employee / Project</th>
                <th className="py-3 px-4">Manager</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Period</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Score</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr
                  key={a.assessment_id}
                  className="border-b border-surface-100 last:border-0 hover:bg-surface-50"
                >
                  <td className="py-3 px-4 font-medium text-charcoal">
                    {a.employee_name_snapshot || a.project_name || '—'}
                  </td>
                  <td className="py-3 px-4 text-charcoal-600">{a.manager_name_snapshot || '—'}</td>
                  <td className="py-3 px-4 capitalize">{a.assessment_type}</td>
                  <td className="py-3 px-4 text-charcoal-600">
                    {a.period_start_date} – {a.period_end_date}
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-surface-200 text-charcoal-700 capitalize">
                      {a.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-medium">
                    {a.overall_score != null ? a.overall_score.toFixed(2) : '—'}
                  </td>
                  <td className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => navigate(`/modules/hr/kpis/assessments/${a.assessment_id}`)}
                      className="text-teal hover:underline font-medium"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
