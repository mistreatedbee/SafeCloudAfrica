import React from 'react';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { listKPIAssessments } from '../../api/services/kpiAssessmentService';
import type { KPIAssessment } from '../../api/models/entities';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

export function KPIAnalyticsPage() {
  const { activeCompanyId } = useTenant();
  const now = new Date();
  const monthsBack = 12;
  const from = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1).toISOString().slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);

  const { data: assessments, loading } = useAsync<KPIAssessment[]>(
    async () => {
      if (!activeCompanyId) return [];
      return listKPIAssessments({
        organizationId: activeCompanyId,
        periodFrom: from,
        periodTo: to,
        limit: 500
      });
    },
    [activeCompanyId, from, to]
  );

  const list = assessments ?? [];
  const byMonth: Record<string, { sum: number; count: number }> = {};
  list.forEach((a) => {
    const key = a.period_start_date.slice(0, 7);
    if (!byMonth[key]) byMonth[key] = { sum: 0, count: 0 };
    if (a.overall_score != null) {
      byMonth[key].sum += a.overall_score;
      byMonth[key].count += 1;
    }
  });
  const sortedMonths = Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, avg: v.count > 0 ? v.sum / v.count : 0 }));

  const byDept: Record<string, { sum: number; count: number }> = {};
  list.forEach((a) => {
    const key = (a.department_id as string) ?? 'Unassigned';
    if (!byDept[key]) byDept[key] = { sum: 0, count: 0 };
    if (a.overall_score != null) {
      byDept[key].sum += a.overall_score;
      byDept[key].count += 1;
    }
  });
  const departmentRanking = Object.entries(byDept)
    .filter(([, v]) => v.count > 0)
    .map(([id, v]) => ({ id, avg: v.sum / v.count, count: v.count }))
    .sort((a, b) => b.avg - a.avg);

  const lastN = sortedMonths.slice(-6);
  const movingAvg = lastN.length >= 2
    ? lastN.reduce((s, x) => s + x.avg, 0) / lastN.length
    : null;

  const bonusScores = list
    .filter((a) => a.overall_score != null && a.bonus_score != null)
    .map((a) => ({ id: a.assessment_id, score: a.overall_score!, bonus: a.bonus_score! }));

  if (loading) {
    return (
      <div className="flex items-center gap-3 p-6">
        <LoadingSpinner size={24} />
        <span className="text-charcoal-500">Loading analytics…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-charcoal">KPI Trends & Analytics</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
          <h3 className="font-semibold text-charcoal mb-3">Monthly performance trend</h3>
          {sortedMonths.length === 0 ? (
            <p className="text-sm text-charcoal-500">No data yet.</p>
          ) : (
            <div className="space-y-2">
              {sortedMonths.slice(-12).map(({ month, avg }) => (
                <div key={month} className="flex items-center gap-2">
                  <span className="text-charcoal-500 w-24">{month}</span>
                  <div className="flex-1 h-5 bg-surface-100 rounded overflow-hidden">
                    <div
                      className="h-full bg-teal/80 rounded"
                      style={{ width: `${Math.min(100, (avg / 5) * 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium w-12">{avg.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
          <h3 className="font-semibold text-charcoal mb-3">Department ranking (avg score)</h3>
          {departmentRanking.length === 0 ? (
            <p className="text-sm text-charcoal-500">No data yet.</p>
          ) : (
            <ul className="space-y-2">
              {departmentRanking.map((d, i) => (
                <li key={d.id} className="flex items-center gap-2">
                  <span className="text-charcoal-500 w-6">{i + 1}.</span>
                  <span className="flex-1 text-charcoal">{d.id === 'Unassigned' ? 'Unassigned' : d.id.slice(0, 8)}</span>
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
          <h3 className="font-semibold text-charcoal mb-2">Forecast (simple moving avg, last 6 months)</h3>
          <p className="text-charcoal-600">
            {movingAvg != null ? `~ ${movingAvg.toFixed(2)}` : 'Not enough data.'}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
          <h3 className="font-semibold text-charcoal mb-2">
            Predictive performance <span className="text-xs font-normal text-charcoal-500">(beta)</span>
          </h3>
          <p className="text-sm text-charcoal-500">
            Simple heuristics based on recent trend. More data improves accuracy.
          </p>
          {movingAvg != null && (
            <p className="mt-2 text-charcoal-600">
              Trend: {movingAvg >= 4 ? 'Strong' : movingAvg >= 3 ? 'Stable' : 'Needs improvement'}.
            </p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
        <h3 className="font-semibold text-charcoal mb-2">Performance bonus scoring</h3>
        <p className="text-sm text-charcoal-500 mb-2">
          Bonus index derived from overall score and consistency (stored as bonus_score on assessments).
        </p>
        {bonusScores.length === 0 ? (
          <p className="text-sm text-charcoal-500">No bonus scores computed yet.</p>
        ) : (
          <p className="text-sm text-charcoal-600">{bonusScores.length} assessments with bonus score.</p>
        )}
      </div>
    </div>
  );
}
