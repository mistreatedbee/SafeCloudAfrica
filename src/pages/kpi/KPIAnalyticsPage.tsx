import React, { useMemo } from 'react';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { listKPIAssessments, listKPIAssessmentLinesByAssessmentIds } from '../../api/services/kpiAssessmentService';
import type { KPIAssessment, KPIAssessmentLine } from '../../api/models/entities';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

export function KPIAnalyticsPage() {
  const { activeCompanyId } = useTenant();
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 12, 1).toISOString().slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);

  const { data: assessments, loading } = useAsync<KPIAssessment[]>(
    async () => {
      if (!activeCompanyId) return [];
      return listKPIAssessments({ organizationId: activeCompanyId, periodFrom: from, periodTo: to, limit: 1000 });
    },
    [activeCompanyId, from, to]
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

  const byMonth: Record<string, { sum: number; count: number }> = {};
  list.forEach((a) => {
    if (a.overall_score == null) return;
    const key = a.period_start_date.slice(0, 7);
    if (!byMonth[key]) byMonth[key] = { sum: 0, count: 0 };
    byMonth[key].sum += a.overall_score;
    byMonth[key].count += 1;
  });

  const monthlyTrend = Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, avg: v.sum / v.count }));

  const byDepartment: Record<string, { sum: number; count: number }> = {};
  list.forEach((a) => {
    if (a.overall_score == null) return;
    const key = String(a.department_id ?? 'Unassigned');
    if (!byDepartment[key]) byDepartment[key] = { sum: 0, count: 0 };
    byDepartment[key].sum += a.overall_score;
    byDepartment[key].count += 1;
  });

  const departmentRanking = Object.entries(byDepartment)
    .map(([id, v]) => ({ id, avg: v.sum / v.count, count: v.count }))
    .sort((a, b) => b.avg - a.avg);

  const achievedCount = lineList.filter((l) => (l.manager_rating ?? 0) >= 4).length;
  const partialCount = lineList.filter((l) => l.manager_rating === 3).length;
  const notAchievedCount = lineList.filter((l) => (l.manager_rating ?? 0) <= 2 && l.manager_rating != null).length;

  const managerDistribution = [1, 2, 3, 4, 5].map((rating) => ({ rating, count: lineList.filter((l) => l.manager_rating === rating).length }));

  if (loading) {
    return (
      <div className="flex items-center gap-3 p-6">
        <LoadingSpinner size={24} />
        <span className="text-charcoal-500">Loading analytics...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-charcoal">KPI Trends & Analytics</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
          <h3 className="font-semibold text-charcoal mb-3">Period comparisons (monthly trend)</h3>
          {monthlyTrend.length === 0 ? (
            <p className="text-sm text-charcoal-500">No trend data yet.</p>
          ) : (
            <div className="space-y-2">
              {monthlyTrend.slice(-12).map(({ month, avg }) => (
                <div key={month} className="flex items-center gap-2">
                  <span className="text-charcoal-500 w-24">{month}</span>
                  <div className="flex-1 h-5 bg-surface-100 rounded overflow-hidden">
                    <div className="h-full bg-teal/80 rounded" style={{ width: `${Math.min(100, (avg / 5) * 100)}%` }} />
                  </div>
                  <span className="text-sm font-medium w-12">{avg.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
          <h3 className="font-semibold text-charcoal mb-3">Department KPI trends</h3>
          {departmentRanking.length === 0 ? (
            <p className="text-sm text-charcoal-500">No department data yet.</p>
          ) : (
            <ul className="space-y-2">
              {departmentRanking.map((d, i) => (
                <li key={d.id} className="flex items-center gap-2">
                  <span className="text-charcoal-500 w-6">{i + 1}.</span>
                  <span className="flex-1 text-charcoal">{d.id === 'Unassigned' ? 'Unassigned' : d.id}</span>
                  <span className="font-medium text-charcoal">{d.avg.toFixed(2)}</span>
                  <span className="text-charcoal-500 text-xs">({d.count})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
          <h3 className="font-semibold text-charcoal mb-2">Achieved vs Not Achieved</h3>
          <p className="text-sm text-teal-700">Achieved: {achievedCount}</p>
          <p className="text-sm text-amber-700">Partially Achieved: {partialCount}</p>
          <p className="text-sm text-critical">Not Achieved: {notAchievedCount}</p>
        </div>

        <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
          <h3 className="font-semibold text-charcoal mb-2">Manager rating distribution</h3>
          <div className="space-y-2">
            {managerDistribution.map((r) => (
              <div key={r.rating} className="flex items-center gap-2">
                <span className="w-10 text-charcoal-600">{r.rating}</span>
                <div className="flex-1 h-4 bg-surface-100 rounded">
                  <div className="h-full bg-navy/80 rounded" style={{ width: `${Math.min(100, r.count * 8)}%` }} />
                </div>
                <span className="w-10 text-sm text-charcoal">{r.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
