import React from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { getQualityKpis, getRolling12Period } from '../../api/services/kpiFormulasService';

export function QualityAnalyticsPage() {
  const { activeCompanyId } = useTenant();
  const period = getRolling12Period();

  const { data: quality, loading, error } = useAsync(
    async () => {
      if (!activeCompanyId) return null;
      return await getQualityKpis(activeCompanyId, { period });
    },
    [activeCompanyId]
  );

  const fmt = (v: number | null) => (v != null ? `${v.toFixed(2)}%` : '—');

  return (
    <Layout title="Quality KPIs">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <h1 className="text-2xl font-bold text-charcoal">Quality KPIs</h1>
        <p className="text-sm text-charcoal-500">12-month rolling. Enter Operational Inputs (deliveries, items inspected) for denominators.</p>

        {error && (
          <div className="bg-critical/10 border border-critical rounded-xl p-4 text-critical">
            <p className="font-medium">Failed to load</p>
            <p className="text-sm mt-1">{String(error)}</p>
          </div>
        )}

        {loading ? (
          <p className="text-charcoal-500">Loading…</p>
        ) : quality ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-card">
              <p className="text-xs font-medium text-charcoal-500 uppercase tracking-wide">Customer Complaint Rate %</p>
              <p className="text-2xl font-bold text-charcoal mt-1">{fmt(quality.customerComplaintRate)}</p>
              <p className="text-xs text-charcoal-500 mt-1">Complaints / Total deliveries: {quality.complaints} / {quality.totalDeliveries || '—'}</p>
            </div>
            <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-card">
              <p className="text-xs font-medium text-charcoal-500 uppercase tracking-wide">Non-Conformance Rate %</p>
              <p className="text-2xl font-bold text-charcoal mt-1">{fmt(quality.nonConformanceRate)}</p>
              <p className="text-xs text-charcoal-500 mt-1">Non-conforming / Items inspected: {quality.nonConformingItems} / {quality.totalItemsInspected || '—'}</p>
            </div>
          </div>
        ) : null}
      </motion.div>
    </Layout>
  );
}
