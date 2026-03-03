import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import { listKPIAssessments, listKPIAssessmentLinesByAssessmentIds } from '../../api/services/kpiAssessmentService';
import { listKPIFindings } from '../../api/services/kpiFindingService';
import type { KPIAssessment, KPIAssessmentLine } from '../../api/models/entities';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { TrendingUpIcon, AlertTriangleIcon, AwardIcon, BarChart3Icon } from 'lucide-react';

export function KPIDashboardPage() {
  const navigate = useNavigate();
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  const { data: assessments, loading } = useAsync<KPIAssessment[]>(
    async () => {
      if (!activeCompanyId) return [];
      return listKPIAssessments({
        organizationId: activeCompanyId,
        employeeId: activeRole === 'employee' && user?.id ? (user.id as any) : undefined,
        managerId: (activeRole === 'manager' || activeRole === 'supervisor') && user?.id ? (user.id as any) : undefined,
        periodFrom: thisMonthStart,
        periodTo: thisMonthEnd,
        limit: 500
      });
    },
    [activeCompanyId, activeRole, user?.id, thisMonthStart, thisMonthEnd]
  );

  const { data: openFindings } = useAsync(
    async () => {
      if (!activeCompanyId) return [];
      return listKPIFindings({ organizationId: activeCompanyId, status: 'open', limit: 100 });
    },
    [activeCompanyId]
  );

  const assessmentIds = useMemo(() => (assessments ?? []).map((a) => a.assessment_id), [assessments]);

  const { data: lines } = useAsync<KPIAssessmentLine[]>(
    async () => {
      if (!assessmentIds.length) return [];
      return listKPIAssessmentLinesByAssessmentIds(assessmentIds as any);
    },
    [assessmentIds.join('|')]
  );

  const list = assessments ?? [];
  const lineList = lines ?? [];

  const rated = lineList.filter((l) => l.manager_rating != null);
  const avgScore = list.length > 0 ? (list.reduce((sum, a) => sum + (a.overall_score ?? 0), 0) / Math.max(1, list.filter((a) => a.overall_score != null).length)) : null;
  const notAchievedCount = rated.filter((l) => (l.manager_rating ?? 0) <= 2).length;
  const achievedCount = rated.filter((l) => (l.manager_rating ?? 0) >= 4).length;
  const partiallyAchievedCount = rated.filter((l) => l.manager_rating === 3).length;
  const openFindingsCount = openFindings?.length ?? 0;

  const byDepartment: Record<string, { sum: number; count: number }> = {};
  list.forEach((a) => {
    const key = (a.department_id as string) ?? 'unassigned';
    if (!byDepartment[key]) byDepartment[key] = { sum: 0, count: 0 };
    if (a.overall_score != null) {
      byDepartment[key].sum += a.overall_score;
      byDepartment[key].count += 1;
    }
  });

  const topDepartments = Object.entries(byDepartment)
    .filter(([, v]) => v.count > 0)
    .map(([id, v]) => ({ id, avg: v.sum / v.count }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 5);

  if (loading) {
    return (
      <div className="flex items-center gap-3 p-6">
        <LoadingSpinner size={24} />
        <span className="text-charcoal-500">Loading dashboard...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
          <p className="text-sm text-charcoal-500 flex items-center gap-2"><TrendingUpIcon className="w-4 h-4" /> Avg score (current month)</p>
          <p className="text-2xl font-bold text-charcoal mt-1">{avgScore != null ? avgScore.toFixed(2) : '-'}</p>
        </div>
        <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
          <p className="text-sm text-charcoal-500 flex items-center gap-2"><AlertTriangleIcon className="w-4 h-4" /> Not Achieved</p>
          <p className="text-2xl font-bold text-critical mt-1">{notAchievedCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
          <p className="text-sm text-charcoal-500">KPI Assessments (current month)</p>
          <p className="text-2xl font-bold text-charcoal mt-1">{list.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
          <p className="text-sm text-charcoal-500 flex items-center gap-2"><AwardIcon className="w-4 h-4" /> Open corrective actions</p>
          <p className="text-2xl font-bold text-charcoal mt-1">{openFindingsCount}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
          <h3 className="font-semibold text-charcoal mb-3">Achievement distribution</h3>
          <div className="space-y-2 text-sm">
            <p className="text-teal-700">Achieved: {achievedCount}</p>
            <p className="text-amber-700">Partially Achieved: {partiallyAchievedCount}</p>
            <p className="text-critical">Not Achieved: {notAchievedCount}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
          <h3 className="font-semibold text-charcoal mb-3">Department KPI aggregation</h3>
          {topDepartments.length === 0 ? (
            <p className="text-sm text-charcoal-500">No department score data yet.</p>
          ) : (
            <div className="space-y-2">
              {topDepartments.map((d, i) => (
                <div key={d.id} className="flex items-center gap-2">
                  <span className="text-charcoal-500 w-6">{i + 1}.</span>
                  <div className="flex-1 h-6 bg-surface-100 rounded overflow-hidden">
                    <div className="h-full bg-teal/80 rounded" style={{ width: `${Math.min(100, (d.avg / 5) * 100)}%` }} />
                  </div>
                  <span className="text-sm font-medium text-charcoal w-12">{d.avg.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
        <h3 className="font-semibold text-charcoal mb-3 flex items-center gap-2"><BarChart3Icon className="w-4 h-4" /> Recent KPI Assessments</h3>
        {list.length === 0 ? (
          <p className="text-sm text-charcoal-500">No KPI Assessments found for this period.</p>
        ) : (
          <ul className="space-y-2">
            {list.slice(0, 5).map((a) => (
              <li key={a.assessment_id} className="flex items-center justify-between py-2 border-b border-surface-100 last:border-0">
                <span className="text-sm text-charcoal">{a.assessment_name || a.employee_name_snapshot || a.project_name || 'KPI Assessment'}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-charcoal">{a.overall_score != null ? a.overall_score.toFixed(2) : '-'}</span>
                  <button type="button" onClick={() => navigate(`/modules/hr/kpis/assessments/${a.assessment_id}`)} className="text-sm text-teal hover:underline">View</button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <button type="button" onClick={() => navigate('/modules/hr/kpis/assessments')} className="mt-3 text-sm font-medium text-teal hover:text-teal-700">
          View all KPI Assessment records
        </button>
      </div>
    </div>
  );
}
