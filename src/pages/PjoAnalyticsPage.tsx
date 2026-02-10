import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { BarChart3Icon, CalendarIcon, FilterIcon, TrendingUpIcon } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import type { UUID } from '../api/models/core';
import {
  type ListPjosInput,
  getPjoBreakdownByDepartment,
  getPjoBreakdownByEmployee,
  getPjoBreakdownBySite,
  getPjoNcrStats,
  getPjoQuestionCategoryStats,
  getPjoSummary,
  getPjoTrends
} from '../api/services/pjoService';

type TrendInterval = 'month' | 'day';

export function PjoAnalyticsPage() {
  const navigate = useNavigate();
  const { activeCompanyId } = useTenant();

  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [trendInterval, setTrendInterval] = useState<TrendInterval>('month');
  const [departmentFilter, setDepartmentFilter] = useState<string>('');
  const [siteFilter, setSiteFilter] = useState<string>('');

  const baseFilters: ListPjosInput | null = useMemo(() => {
    if (!activeCompanyId) return null;
    return {
      companyId: activeCompanyId as UUID,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      department: departmentFilter || undefined,
      site: siteFilter || undefined,
      limit: 2000
    };
  }, [activeCompanyId, fromDate, toDate, departmentFilter, siteFilter]);

  const { data: summary, loading: loadingSummary } = useAsync(
    async () => {
      if (!baseFilters) return null;
      return await getPjoSummary(baseFilters);
    },
    [baseFilters]
  );

  const { data: trends, loading: loadingTrends } = useAsync(
    async () => {
      if (!baseFilters) return [];
      return await getPjoTrends({ ...baseFilters, interval: trendInterval });
    },
    [baseFilters, trendInterval]
  );

  const { data: byEmployee } = useAsync(
    async () => {
      if (!baseFilters) return [];
      return await getPjoBreakdownByEmployee(baseFilters);
    },
    [baseFilters]
  );

  const { data: byDepartment } = useAsync(
    async () => {
      if (!baseFilters) return [];
      return await getPjoBreakdownByDepartment(baseFilters);
    },
    [baseFilters]
  );

  const { data: bySite } = useAsync(
    async () => {
      if (!baseFilters) return [];
      return await getPjoBreakdownBySite(baseFilters);
    },
    [baseFilters]
  );

  const { data: categoryStats } = useAsync(
    async () => {
      if (!baseFilters) return [];
      return await getPjoQuestionCategoryStats(baseFilters);
    },
    [baseFilters]
  );

  const { data: ncrStats } = useAsync(
    async () => {
      if (!baseFilters) return null;
      return await getPjoNcrStats(baseFilters);
    },
    [baseFilters]
  );

  const totalForBreakdown = useMemo(
    () => summary?.totalPjos ?? 0,
    [summary]
  );

  return (
    <Layout title="PJO Analytics & Trends">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div>
            <h1 className="text-2xl font-bold text-charcoal">PJO Analytics & Trends</h1>
            <p className="text-sm text-charcoal-500 mt-1">
              Insights by employee, department, site, and question category
            </p>
          </div>
          <button
            onClick={() => navigate('/pjo')}
            className="px-4 py-2 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors"
          >
            View All PJOs
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-surface-300 shadow-card p-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex items-center gap-2">
              <FilterIcon className="w-4 h-4 text-charcoal-400" />
              <span className="text-sm font-medium text-charcoal">Filters:</span>
            </div>
            <div>
              <label className="block text-xs text-charcoal-500 mb-1">From date</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="px-3 py-1.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>
            <div>
              <label className="block text-xs text-charcoal-500 mb-1">To date</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="px-3 py-1.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>
            <div>
              <label className="block text-xs text-charcoal-500 mb-1">Department contains</label>
              <input
                type="text"
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                placeholder="e.g. Operations"
                className="px-3 py-1.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>
            <div>
              <label className="block text-xs text-charcoal-500 mb-1">Site contains</label>
              <input
                type="text"
                value={siteFilter}
                onChange={(e) => setSiteFilter(e.target.value)}
                placeholder="e.g. Plant A"
                className="px-3 py-1.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>
            <div>
              <label className="block text-xs text-charcoal-500 mb-1">Trend interval</label>
              <select
                value={trendInterval}
                onChange={(e) => setTrendInterval(e.target.value as TrendInterval)}
                className="px-3 py-1.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              >
                <option value="month">By month</option>
                <option value="day">By day</option>
              </select>
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Total PJOs</p>
            <p className="text-2xl font-bold text-charcoal mt-1">
              {loadingSummary ? '…' : summary?.totalPjos ?? 0}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Open vs Closed</p>
            <p className="text-sm font-semibold text-charcoal mt-1">
              {loadingSummary
                ? '…'
                : `${summary?.openPjos ?? 0} open • ${summary?.closedPjos ?? 0} closed`}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Checklist Compliance</p>
            <div className="flex items-center gap-2 mt-1">
              <TrendingUpIcon className="w-5 h-5 text-teal" />
              <p className="text-2xl font-bold text-teal">
                {loadingSummary ? '…' : `${Math.round(summary?.compliancePercent ?? 0)}%`}
              </p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">NCRs from PJO</p>
            <p className="text-2xl font-bold text-critical mt-1">
              {ncrStats?.totalNcrs ?? 0}
            </p>
          </div>
        </div>

        {/* Trends */}
        <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
          <h3 className="font-semibold text-charcoal mb-4">Trend over time</h3>
          {loadingTrends && <p className="text-sm text-charcoal-500">Loading trends…</p>}
          {!loadingTrends && (trends?.length ?? 0) === 0 && (
            <p className="text-sm text-charcoal-500">No PJOs in the selected period.</p>
          )}
          {!loadingTrends && (trends?.length ?? 0) > 0 && (
            <div className="space-y-2">
              {trends!.map((t) => {
                const maxCount = Math.max(...trends!.map((x) => x.pjoCount), 1);
                const percentage = (t.pjoCount / maxCount) * 100;
                return (
                  <div key={t.period} className="flex items-center gap-4">
                    <div className="w-28 text-xs text-charcoal-500">
                      {t.period}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-surface-100 rounded-full h-6 overflow-hidden">
                          <div
                            className="bg-teal h-full rounded-full flex items-center justify-end pr-2"
                            style={{ width: `${percentage}%` }}
                          >
                            {t.pjoCount > 0 && (
                              <span className="text-xs font-medium text-white">
                                {t.pjoCount}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-charcoal-500">
                          {t.nonCompliantResponses} non-compliant • {t.ncrCount} NCRs
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Breakdowns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* By employee */}
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal mb-4">By Employee</h3>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {(byEmployee ?? []).map((row) => {
                const percentage =
                  totalForBreakdown > 0 ? (row.pjoCount / totalForBreakdown) * 100 : 0;
                return (
                  <div key={row.key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-charcoal truncate">{row.label}</span>
                      <span className="text-sm font-medium text-charcoal">{row.pjoCount}</span>
                    </div>
                    <div className="w-full bg-surface-100 rounded-full h-2">
                      <div
                        className="bg-teal h-2 rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-charcoal-500 mt-0.5">
                      {row.nonCompliantResponses} non-compliant, {row.ncrCount} NCRs
                    </p>
                  </div>
                );
              })}
              {(byEmployee ?? []).length === 0 && (
                <p className="text-sm text-charcoal-500">No data for this period.</p>
              )}
            </div>
          </div>

          {/* By department */}
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal mb-4">By Department</h3>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {(byDepartment ?? []).map((row) => {
                const percentage =
                  totalForBreakdown > 0 ? (row.pjoCount / totalForBreakdown) * 100 : 0;
                return (
                  <div key={row.key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-charcoal truncate">{row.label}</span>
                      <span className="text-sm font-medium text-charcoal">{row.pjoCount}</span>
                    </div>
                    <div className="w-full bg-surface-100 rounded-full h-2">
                      <div
                        className="bg-teal h-2 rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-charcoal-500 mt-0.5">
                      {row.nonCompliantResponses} non-compliant, {row.ncrCount} NCRs
                    </p>
                  </div>
                );
              })}
              {(byDepartment ?? []).length === 0 && (
                <p className="text-sm text-charcoal-500">No data for this period.</p>
              )}
            </div>
          </div>

          {/* By site */}
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal mb-4">By Site</h3>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {(bySite ?? []).map((row) => {
                const percentage =
                  totalForBreakdown > 0 ? (row.pjoCount / totalForBreakdown) * 100 : 0;
                return (
                  <div key={row.key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-charcoal truncate">{row.label}</span>
                      <span className="text-sm font-medium text-charcoal">{row.pjoCount}</span>
                    </div>
                    <div className="w-full bg-surface-100 rounded-full h-2">
                      <div
                        className="bg-teal h-2 rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-charcoal-500 mt-0.5">
                      {row.nonCompliantResponses} non-compliant, {row.ncrCount} NCRs
                    </p>
                  </div>
                );
              })}
              {(bySite ?? []).length === 0 && (
                <p className="text-sm text-charcoal-500">No data for this period.</p>
              )}
            </div>
          </div>
        </div>

        {/* Categories & NCRs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal mb-4">By Question Category</h3>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {(categoryStats ?? []).map((row) => {
                const percentage =
                  (summary?.totalResponses ?? 0) > 0
                    ? (row.responses / (summary!.totalResponses ?? 1)) * 100
                    : 0;
                return (
                  <div key={row.category}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-charcoal">{row.category}</span>
                      <span className="text-sm font-medium text-charcoal">{row.responses}</span>
                    </div>
                    <div className="w-full bg-surface-100 rounded-full h-2">
                      <div
                        className="bg-teal h-2 rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-charcoal-500 mt-0.5">
                      {row.nonCompliantResponses} non-compliant, {row.ncrCount} NCRs
                    </p>
                  </div>
                );
              })}
              {(categoryStats ?? []).length === 0 && (
                <p className="text-sm text-charcoal-500">No responses for this period.</p>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal mb-4">NCR Severity & Status</h3>
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-semibold text-charcoal-500 mb-2">By severity</h4>
                <div className="space-y-2">
                  {(ncrStats?.bySeverity ?? []).map((row) => {
                    const percentage =
                      (ncrStats?.totalNcrs ?? 0) > 0
                        ? (row.count / (ncrStats!.totalNcrs ?? 1)) * 100
                        : 0;
                    return (
                      <div key={row.severity}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-charcoal capitalize">
                            {row.severity}
                          </span>
                          <span className="text-sm font-medium text-charcoal">
                            {row.count}
                          </span>
                        </div>
                        <div className="w-full bg-surface-100 rounded-full h-2">
                          <div
                            className="bg-critical h-2 rounded-full"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {(ncrStats?.bySeverity ?? []).length === 0 && (
                    <p className="text-sm text-charcoal-500">No NCRs from PJO.</p>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-charcoal-500 mb-2">By status</h4>
                <div className="space-y-2">
                  {(ncrStats?.byStatus ?? []).map((row) => {
                    const percentage =
                      (ncrStats?.totalNcrs ?? 0) > 0
                        ? (row.count / (ncrStats!.totalNcrs ?? 1)) * 100
                        : 0;
                    return (
                      <div key={row.status}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-charcoal capitalize">
                            {row.status.replace(/-/g, ' ')}
                          </span>
                          <span className="text-sm font-medium text-charcoal">
                            {row.count}
                          </span>
                        </div>
                        <div className="w-full bg-surface-100 rounded-full h-2">
                          <div
                            className="bg-teal h-2 rounded-full"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {(ncrStats?.byStatus ?? []).length === 0 && (
                    <p className="text-sm text-charcoal-500">No NCRs from PJO.</p>
                  )}
                </div>
              </div>

              <p className="text-[11px] text-charcoal-400 flex items-center gap-1">
                <CalendarIcon className="w-3 h-3" />
                PJO-linked NCRs only (source_entity_type = &quot;pjo&quot;)
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </Layout>
  );
}

