import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import { listKPIAssessments, normalizeAssessmentStatus } from '../../api/services/kpiAssessmentService';
import type { KPIAssessment, KpiAssessmentType, KpiAssessmentStatus } from '../../api/models/entities';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { ListEmptyState } from '../../components/ui/ListEmptyState';
import { ClipboardListIcon } from 'lucide-react';

type StatusFilter = 'all' | Extract<KpiAssessmentStatus, 'draft' | 'in_progress' | 'under_review' | 'completed' | 'closed'>;

export function KPIAssessmentsListPage() {
  const navigate = useNavigate();
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const [filterType, setFilterType] = useState<'all' | KpiAssessmentType>('all');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  const canCreate = activeRole === 'owner' || activeRole === 'admin' || activeRole === 'manager' || activeRole === 'supervisor';

  const { data: assessments, loading, error } = useAsync<KPIAssessment[]>(
    async () => {
      if (!activeCompanyId) return [];
      return listKPIAssessments({
        organizationId: activeCompanyId,
        assessmentType: filterType === 'all' ? undefined : filterType,
        status: filterStatus === 'all' ? undefined : filterStatus,
        employeeId: activeRole === 'employee' && user?.id ? (user.id as any) : undefined,
        managerId: (activeRole === 'manager' || activeRole === 'supervisor') && user?.id ? (user.id as any) : undefined,
        search: search.trim() || undefined,
        limit: 200
      });
    },
    [activeCompanyId, filterType, filterStatus, search, activeRole, user?.id]
  );

  const filtered = assessments ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-lg font-semibold text-charcoal">KPI Assessment</h2>
        {canCreate && (
          <button
            type="button"
            onClick={() => navigate('/modules/hr/kpis/assessments/new')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600"
          >
            New KPI Assessment
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          placeholder="Search employee, manager, KPI Questionnaire"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 border border-surface-300 rounded-lg text-sm w-72"
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
          onChange={(e) => setFilterStatus(e.target.value as StatusFilter)}
          className="px-3 py-2 border border-surface-300 rounded-lg text-sm"
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="in_progress">In Progress</option>
          <option value="under_review">Under Review</option>
          <option value="completed">Completed</option>
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
          <span className="text-charcoal-500">Loading...</span>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <ListEmptyState
          icon={ClipboardListIcon}
          title="No KPI assessments match"
          description="Run employee or project assessments, then track scores, achievement, and review status here."
          primaryAction={
            canCreate
              ? { kind: 'link', to: '/modules/hr/kpis/assessments/new', label: 'New KPI assessment' }
              : { kind: 'link', to: '/modules/hr', label: 'HR module' }
          }
          secondaryAction={
            filterType !== 'all' || filterStatus !== 'all' || search.trim()
              ? {
                  kind: 'button',
                  label: 'Clear filters',
                  onClick: () => {
                    setFilterType('all');
                    setFilterStatus('all');
                    setSearch('');
                  }
                }
              : undefined
          }
        />
      )}

      {!loading && filtered.length > 0 && (
        <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-charcoal-500 border-b border-surface-200 bg-surface-50">
                <th className="py-3 px-4">KPI Assessment</th>
                <th className="py-3 px-4">Employee / Project</th>
                <th className="py-3 px-4">Manager</th>
                <th className="py-3 px-4">Period</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Score</th>
                <th className="py-3 px-4">Achievement %</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.assessment_id} className="border-b border-surface-100 last:border-0 hover:bg-surface-50">
                  <td className="py-3 px-4 font-medium text-charcoal">{a.assessment_name || 'KPI Assessment'}</td>
                  <td className="py-3 px-4 text-charcoal-600">{a.employee_name_snapshot || a.project_name || '-'}</td>
                  <td className="py-3 px-4 text-charcoal-600">{a.manager_name_snapshot || '-'}</td>
                  <td className="py-3 px-4 text-charcoal-600">{a.period_start_date} to {a.period_end_date}</td>
                  <td className="py-3 px-4">
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-surface-200 text-charcoal-700 capitalize">
                      {normalizeAssessmentStatus(a.status).replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-medium">{a.overall_score != null ? a.overall_score.toFixed(2) : '-'}</td>
                  <td className="py-3 px-4 font-medium">{a.achievement_percentage != null ? `${a.achievement_percentage.toFixed(1)}%` : '-'}</td>
                  <td className="py-3 px-4">
                    <button type="button" onClick={() => navigate(`/modules/hr/kpis/assessments/${a.assessment_id}`)} className="text-teal hover:underline font-medium">
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
