import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3Icon, AlertTriangleIcon, ClockIcon, DownloadIcon } from 'lucide-react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { getSafetyKpis, getLtiFreeHours, getRolling12Period } from '../../api/services/kpiFormulasService';
import { buildKpiPackExport, downloadKpiPackCsv, printKpiPackPdf } from '../../api/services/kpiPackExportService';
import { Link } from 'react-router-dom';

export function SafetyStatisticsPage() {
  const { activeCompanyId } = useTenant();
  const [exporting, setExporting] = useState(false);
  const period = getRolling12Period();

  const { data: safety, loading, error } = useAsync(
    async () => {
      if (!activeCompanyId) return null;
      return await getSafetyKpis(activeCompanyId, { period });
    },
    [activeCompanyId]
  );

  const { data: ltiFree } = useAsync(
    async () => {
      if (!activeCompanyId) return null;
      return await getLtiFreeHours(activeCompanyId);
    },
    [activeCompanyId]
  );

  const formatRate = (v: number) => (v == null || Number.isNaN(v) ? '—' : v.toFixed(2));
  const formatNum = (v: number) => (v == null || Number.isNaN(v) ? '—' : v.toLocaleString());

  return (
    <Layout title="Safety Statistics (KPI)">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-charcoal">Safety Statistics</h1>
            <p className="text-sm text-charcoal-500 mt-1">12-month rolling rates (multiplier: {safety?.multiplier === 1_000_000 ? '1,000,000' : '200,000'})</p>
          </div>
          <div className="flex gap-2">
            <Link to="/dashboard/incidents/analysis" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-300 text-charcoal text-sm">
              <BarChart3Icon className="w-4 h-4" /> Incident trends
            </Link>
            <button
              type="button"
              disabled={exporting || !activeCompanyId}
              onClick={async () => {
                if (!activeCompanyId) return;
                setExporting(true);
                try {
                  const { csvContent, htmlContent } = await buildKpiPackExport(activeCompanyId);
                  downloadKpiPackCsv(csvContent);
                  printKpiPackPdf(htmlContent);
                } finally {
                  setExporting(false);
                }
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm disabled:opacity-50"
            >
              <DownloadIcon className="w-4 h-4" /> Export KPI Pack (CSV + Print PDF)
            </button>
          </div>
        </div>

        {safety?.missingMonths?.length ? (
          <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangleIcon className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-charcoal">Missing hours for some months</p>
              <p className="text-sm text-charcoal-600 mt-1">Hours not entered for: {safety.missingMonths.join(', ')}. KPIs use available months only. Add entries in Management → Hours Worked.</p>
            </div>
          </div>
        ) : null}

        {error && (
          <div className="bg-critical/10 border border-critical rounded-xl p-4 text-critical">
            <p className="font-medium">Failed to load safety KPIs</p>
            <p className="text-sm mt-1">{String(error)}</p>
          </div>
        )}

        {loading ? (
          <p className="text-charcoal-500">Loading…</p>
        ) : safety ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-card">
                <p className="text-xs font-medium text-charcoal-500 uppercase tracking-wide">TRIR / TRIFR</p>
                <p className="text-2xl font-bold text-charcoal mt-1">{formatRate(safety.trir)}</p>
                <p className="text-xs text-charcoal-500 mt-1">Recordable injuries: {safety.recordableInjuries}</p>
              </div>
              <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-card">
                <p className="text-xs font-medium text-charcoal-500 uppercase tracking-wide">LTIFR</p>
                <p className="text-2xl font-bold text-charcoal mt-1">{formatRate(safety.ltifr)}</p>
                <p className="text-xs text-charcoal-500 mt-1">Lost time injuries: {safety.lostTimeInjuries}</p>
              </div>
              <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-card">
                <p className="text-xs font-medium text-charcoal-500 uppercase tracking-wide">Severity Rate</p>
                <p className="text-2xl font-bold text-charcoal mt-1">{formatRate(safety.severityRate)}</p>
                <p className="text-xs text-charcoal-500 mt-1">Total lost days: {safety.totalLostDays}</p>
              </div>
              <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-card">
                <p className="text-xs font-medium text-charcoal-500 uppercase tracking-wide">Incident Freq. Rate</p>
                <p className="text-2xl font-bold text-charcoal mt-1">{formatRate(safety.incidentFrequencyRate)}</p>
                <p className="text-xs text-charcoal-500 mt-1">Total incidents: {safety.totalIncidents}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-card">
                <p className="text-xs font-medium text-charcoal-500 uppercase tracking-wide">Fatality Rate</p>
                <p className="text-2xl font-bold text-charcoal mt-1">{formatRate(safety.fatalityRate)}</p>
                <p className="text-xs text-charcoal-500 mt-1">Fatalities: {safety.fatalities}</p>
              </div>
              <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-card">
                <p className="text-xs font-medium text-charcoal-500 uppercase tracking-wide">Near Miss Freq. Rate</p>
                <p className="text-2xl font-bold text-charcoal mt-1">{formatRate(safety.nearMissFrequencyRate)}</p>
                <p className="text-xs text-charcoal-500 mt-1">Near misses: {safety.nearMisses}</p>
              </div>
              <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-card">
                <p className="text-xs font-medium text-charcoal-500 uppercase tracking-wide">Accident Freq. Rate</p>
                <p className="text-2xl font-bold text-charcoal mt-1">{formatRate(safety.accidentFrequencyRate)}</p>
                <p className="text-xs text-charcoal-500 mt-1">Accidents: {safety.accidents}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-card">
              <p className="text-sm font-medium text-charcoal mb-2 flex items-center gap-2">
                <ClockIcon className="w-4 h-4" /> Total hours worked (rolling 12 months)
              </p>
              <p className="text-xl font-bold text-charcoal">{formatNum(safety.totalHoursWorked)}</p>
            </div>
            {ltiFree && (
              <div className="bg-white rounded-xl border border-surface-200 p-4 shadow-card">
                <p className="text-sm font-medium text-charcoal mb-2 flex items-center gap-2">LTI-free hours (since last LTI/Fatality)</p>
                <p className="text-2xl font-bold text-teal">{formatNum(ltiFree.ltiFreeHours)}</p>
                {ltiFree.lastResetDate && (
                  <p className="text-xs text-charcoal-500 mt-2">
                    Last reset: {new Date(ltiFree.lastResetDate).toLocaleDateString()} ({ltiFree.lastResetReason}). <Link to="/dashboard/incidents/management" className="text-teal hover:underline">View incidents</Link>
                  </p>
                )}
              </div>
            )}
          </>
        ) : null}
      </motion.div>
    </Layout>
  );
}
