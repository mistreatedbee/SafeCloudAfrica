import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { TargetIcon, ClipboardListIcon, PlusIcon, BarChart3Icon } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import { countKpis, listKpis, listPlans } from '../api/services/planningService';
import type { PlanningKpi, PlanningPlan } from '../api/models/entities';
import { useUser } from '@insforge/react';
import { PlanCreateModal } from '../components/planning/PlanCreateModal';
import { KpiCreateModal } from '../components/planning/KpiCreateModal';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

export function PlanningReviewPage() {
  const { activeCompanyId } = useTenant();
  const { user } = useUser();
  const [refreshKey, setRefreshKey] = useState(0);
  const [planCreateOpen, setPlanCreateOpen] = useState(false);
  const [kpiCreateOpen, setKpiCreateOpen] = useState(false);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);

  const { data, loading, error } = useAsync<Array<{ plan: PlanningPlan; kpiCount: number }>>(
    async () => {
      if (!activeCompanyId) return [];
      const plans = await listPlans(activeCompanyId);
      const counts = await Promise.all(plans.map((p) => countKpis(activeCompanyId, p.id)));
      return plans.map((plan, idx) => ({ plan, kpiCount: counts[idx] ?? 0 }));
    },
    [activeCompanyId, refreshKey]
  );

  const plans = data ?? [];

  const { data: expandedKpis } = useAsync<PlanningKpi[]>(
    async () => {
      if (!activeCompanyId || !expandedPlanId) return [];
      return await listKpis(activeCompanyId, expandedPlanId as any);
    },
    [activeCompanyId, expandedPlanId, refreshKey]
  );

  const kpiSummaryByPlan = useMemo(() => {
    const map = new Map<string, { onTrack: number; atRisk: number; behind: number }>();
    for (const row of expandedKpis ?? []) {
      const v = map.get(String(row.plan_id)) ?? { onTrack: 0, atRisk: 0, behind: 0 };
      if (row.status === 'on-track') v.onTrack += 1;
      if (row.status === 'at-risk') v.atRisk += 1;
      if (row.status === 'behind') v.behind += 1;
      map.set(String(row.plan_id), v);
    }
    return map;
  }, [expandedKpis]);

  return (
    <Layout title="Planning, Feedback & Performance Review">
      {activeCompanyId && user?.id && (
        <>
          <PlanCreateModal
            open={planCreateOpen}
            onClose={() => setPlanCreateOpen(false)}
            companyId={activeCompanyId}
            createdByUserId={user.id}
            onCreated={() => setRefreshKey((k) => k + 1)}
          />
          {activePlanId && (
            <KpiCreateModal
              open={kpiCreateOpen}
              onClose={() => setKpiCreateOpen(false)}
              companyId={activeCompanyId}
              planId={activePlanId as any}
              actorUserId={user.id}
              onCreated={() => setRefreshKey((k) => k + 1)}
            />
          )}
        </>
      )}
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
        <motion.div variants={itemVariants} className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-charcoal flex items-center gap-2">
                <TargetIcon className="w-5 h-5 text-teal" />
                Plans and KPIs
              </h2>
              <p className="text-sm text-charcoal-500 mt-2">
                Plans and KPIs are stored per company (planning_plans + planning_kpis).
              </p>
            </div>
            <button
              type="button"
              disabled={!activeCompanyId || !user?.id}
              onClick={() => setPlanCreateOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <PlusIcon className="w-4 h-4" />
              New plan
            </button>
          </div>
          <p className="text-sm text-charcoal-500 mt-2">
            Use plans to track delivery, and KPIs to monitor performance in real time.
          </p>
        </motion.div>

        <motion.div variants={itemVariants} className="space-y-3">
          {loading && (
            <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <p className="text-sm text-charcoal-500">Loading plans…</p>
            </div>
          )}
          {error && (
            <div className="bg-white rounded-xl border border-critical/30 p-4 shadow-card">
              <p className="text-sm font-semibold text-critical">Unable to load plans</p>
              <p className="text-sm text-charcoal-500 mt-1">{error.message}</p>
            </div>
          )}
          {!loading && !error && plans.length === 0 && (
            <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <p className="text-sm text-charcoal-500">No plans yet.</p>
            </div>
          )}
          {plans.map(({ plan: p, kpiCount }) => (
            <div key={p.id} className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-surface-100 rounded-lg">
                  <ClipboardListIcon className="w-5 h-5 text-charcoal-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-charcoal">{p.name}</p>
                      <p className="text-sm text-charcoal-400 mt-0.5">
                        PLN-{String(p.id).slice(0, 8)} • {p.period} • KPIs: {kpiCount}
                      </p>
                    </div>
                    <span className="px-2 py-1 bg-surface-100 rounded text-xs font-semibold text-charcoal-600">
                      {p.status}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={!activeCompanyId || !user?.id}
                      onClick={() => {
                        setActivePlanId(String(p.id));
                        setKpiCreateOpen(true);
                      }}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <PlusIcon className="w-4 h-4" />
                      Add KPI
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpandedPlanId((cur) => (cur === String(p.id) ? null : String(p.id)))}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-100 text-sm font-medium text-charcoal hover:bg-surface-200"
                    >
                      <BarChart3Icon className="w-4 h-4" />
                      {expandedPlanId === String(p.id) ? 'Hide KPIs' : 'View KPIs'}
                    </button>
                    {expandedPlanId === String(p.id) && (
                      <span className="text-xs text-charcoal-500">
                        On-track: {kpiSummaryByPlan.get(String(p.id))?.onTrack ?? 0} • At-risk:{' '}
                        {kpiSummaryByPlan.get(String(p.id))?.atRisk ?? 0} • Behind:{' '}
                        {kpiSummaryByPlan.get(String(p.id))?.behind ?? 0}
                      </span>
                    )}
                  </div>
                  {expandedPlanId === String(p.id) && (
                    <div className="mt-3 bg-surface-50 rounded-lg border border-surface-200 overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-surface-100">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">KPI</th>
                              <th className="px-4 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Current</th>
                              <th className="px-4 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Target</th>
                              <th className="px-4 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-surface-200">
                            {(expandedKpis ?? []).filter((k) => String(k.plan_id) === String(p.id)).length === 0 && (
                              <tr>
                                <td colSpan={4} className="px-4 py-3 text-sm text-charcoal-500">
                                  No KPIs yet.
                                </td>
                              </tr>
                            )}
                            {(expandedKpis ?? [])
                              .filter((k) => String(k.plan_id) === String(p.id))
                              .map((k) => (
                                <tr key={k.id}>
                                  <td className="px-4 py-3 text-sm text-charcoal">{k.name}</td>
                                  <td className="px-4 py-3 text-sm text-charcoal-500">
                                    {k.current_value}
                                    {k.unit ?? ''}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-charcoal-500">
                                    {k.target_value}
                                    {k.unit ?? ''}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-charcoal-500">{k.status}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </Layout>
  );
}

