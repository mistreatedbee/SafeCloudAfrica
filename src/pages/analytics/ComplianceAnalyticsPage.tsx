import React from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { getComplianceKpis, getRolling12Period } from '../../api/services/kpiFormulasService';

export function ComplianceAnalyticsPage() {
  const { activeCompanyId } = useTenant();
  const period = getRolling12Period();

  const { data: compliance, loading, error } = useAsync(
    async () => {
      if (!activeCompanyId) return null;
      return await getComplianceKpis(activeCompanyId, { period });
    },
    [activeCompanyId]
  );

  const fmt = (v: number | null) => (v != null ? `${v.toFixed(1)}%` : '—');

  return (
    <Layout title="Compliance & Performance KPIs">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <h1 className="text-2xl font-bold text-charcoal">Compliance & Performance</h1>
        <p className="text-sm text-charcoal-500">12-month rolling compliance metrics</p>

        {error && (
          <div className="bg-critical/10 border border-critical rounded-xl p-4 text-critical">
            <p className="font-medium">Failed to load</p>
            <p className="text-sm mt-1">{String(error)}</p>
          </div>
        )}

        {loading ? (
          <p className="text-charcoal-500">Loading…</p>
        ) : compliance ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-card">
              <p className="text-xs font-medium text-charcoal-500 uppercase tracking-wide">PPE Compliance %</p>
              <p className="text-2xl font-bold text-charcoal mt-1">{fmt(compliance.ppeCompliancePercent)}</p>
              <p className="text-xs text-charcoal-500 mt-1">Wearing / Observed: {compliance.ppeWearing} / {compliance.ppeObserved}</p>
            </div>
            <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-card">
              <p className="text-xs font-medium text-charcoal-500 uppercase tracking-wide">Training Completion %</p>
              <p className="text-2xl font-bold text-charcoal mt-1">{fmt(compliance.trainingCompletionPercent)}</p>
              <p className="text-xs text-charcoal-500 mt-1">Trained / Total employees: {compliance.employeesTrained} / {compliance.totalEmployees}</p>
            </div>
            <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-card">
              <p className="text-xs font-medium text-charcoal-500 uppercase tracking-wide">Inspection Compliance %</p>
              <p className="text-2xl font-bold text-charcoal mt-1">{fmt(compliance.inspectionCompliancePercent)}</p>
              <p className="text-xs text-charcoal-500 mt-1">Completed / Planned: {compliance.inspectionsCompleted} / {compliance.inspectionsPlanned}</p>
            </div>
            <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-card">
              <p className="text-xs font-medium text-charcoal-500 uppercase tracking-wide">Corrective Action Closure %</p>
              <p className="text-2xl font-bold text-charcoal mt-1">{fmt(compliance.correctiveActionClosurePercent)}</p>
              <p className="text-xs text-charcoal-500 mt-1">Closed / Raised: {compliance.actionsClosed} / {compliance.actionsRaised}</p>
            </div>
            <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-card">
              <p className="text-xs font-medium text-charcoal-500 uppercase tracking-wide">Audit Score %</p>
              <p className="text-2xl font-bold text-charcoal mt-1">{fmt(compliance.auditScorePercent)}</p>
              <p className="text-xs text-charcoal-500 mt-1">Points: {compliance.auditPointsScored} / {compliance.auditPointsTotal}</p>
            </div>
          </div>
        ) : null}
      </motion.div>
    </Layout>
  );
}
