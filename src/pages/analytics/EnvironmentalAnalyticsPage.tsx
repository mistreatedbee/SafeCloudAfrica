import React from 'react';
import { motion } from 'framer-motion';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { getEnvironmentalKpis, getRolling12Period } from '../../api/services/kpiFormulasService';

export function EnvironmentalAnalyticsPage() {
  const { activeCompanyId } = useTenant();
  const period = getRolling12Period();

  const { data: env, loading, error } = useAsync(
    async () => {
      if (!activeCompanyId) return null;
      return await getEnvironmentalKpis(activeCompanyId, { period });
    },
    [activeCompanyId]
  );

  const fmtPct = (v: number | null) => (v != null ? `${v.toFixed(1)}%` : '—');
  const fmtRate = (v: number) => (Number.isNaN(v) ? '—' : v.toFixed(2));

  return (
    <Layout title="Environmental KPIs">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <h1 className="text-2xl font-bold text-charcoal">Environmental KPIs</h1>
        <p className="text-sm text-charcoal-500">12-month rolling. Enter Operational Inputs (waste, energy, production) for denominators.</p>

        {error && (
          <div className="bg-critical/10 border border-critical rounded-xl p-4 text-critical">
            <p className="font-medium">Failed to load</p>
            <p className="text-sm mt-1">{String(error)}</p>
          </div>
        )}

        {loading ? (
          <p className="text-charcoal-500">Loading…</p>
        ) : env ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-card">
              <p className="text-xs font-medium text-charcoal-500 uppercase tracking-wide">Waste Recycling Rate %</p>
              <p className="text-2xl font-bold text-charcoal mt-1">{fmtPct(env.wasteRecyclingRate)}</p>
              <p className="text-xs text-charcoal-500 mt-1">Recycled / Total waste: {env.recycledWaste} / {env.totalWasteGenerated}</p>
            </div>
            <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-card">
              <p className="text-xs font-medium text-charcoal-500 uppercase tracking-wide">Spill Frequency Rate</p>
              <p className="text-2xl font-bold text-charcoal mt-1">{fmtRate(env.spillFrequencyRate)}</p>
              <p className="text-xs text-charcoal-500 mt-1">Spills: {env.spills} (per {env.multiplier === 1_000_000 ? '1M' : '200k'} hours)</p>
            </div>
            <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-card">
              <p className="text-xs font-medium text-charcoal-500 uppercase tracking-wide">Environmental Incident Rate</p>
              <p className="text-2xl font-bold text-charcoal mt-1">{fmtRate(env.environmentalIncidentRate)}</p>
              <p className="text-xs text-charcoal-500 mt-1">Incidents: {env.environmentalIncidents}</p>
            </div>
            <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-card">
              <p className="text-xs font-medium text-charcoal-500 uppercase tracking-wide">Energy Consumption Rate</p>
              <p className="text-2xl font-bold text-charcoal mt-1">{env.energyConsumptionRate != null ? env.energyConsumptionRate.toFixed(2) : '—'}</p>
              <p className="text-xs text-charcoal-500 mt-1">Energy / Production: {env.totalEnergyUsed} / {env.productionOutput || '—'}</p>
            </div>
          </div>
        ) : null}
      </motion.div>
    </Layout>
  );
}
