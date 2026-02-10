import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { BarChart3Icon, CalendarIcon, FilterIcon } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import { listInspections } from '../api/services/inspectionsService';
import type { Inspection } from '../api/models/entities';
import type { ModuleKey } from '../api/models/core';

type TrendPeriod = '3months' | '6months' | '12months';

export function InspectionAnalyticsPage() {
  const navigate = useNavigate();
  const { activeCompanyId } = useTenant();
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>('12months');
  const [selectedModule, setSelectedModule] = useState<ModuleKey | 'all'>('all');
  const [selectedStatus, setSelectedStatus] = useState<Inspection['status'] | 'all'>('all');

  const { data: inspections, loading } = useAsync<Inspection[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listInspections({ companyId: activeCompanyId, limit: 1000 });
    },
    [activeCompanyId]
  );

  const filteredInspections = useMemo(() => {
    if (!inspections) return [];
    const now = new Date();
    const cutoffDate = new Date();
    if (trendPeriod === '3months') {
      cutoffDate.setMonth(now.getMonth() - 3);
    } else if (trendPeriod === '6months') {
      cutoffDate.setMonth(now.getMonth() - 6);
    } else {
      cutoffDate.setMonth(now.getMonth() - 12);
    }

    return inspections.filter((inspection) => {
      const d = new Date(inspection.scheduled_at ?? inspection.created_at);
      const inDateRange = d >= cutoffDate;
      const matchesModule = selectedModule === 'all' || inspection.module === selectedModule;
      const matchesStatus = selectedStatus === 'all' || inspection.status === selectedStatus;
      return inDateRange && matchesModule && matchesStatus;
    });
  }, [inspections, trendPeriod, selectedModule, selectedStatus]);

  const monthlyTrends = useMemo(() => {
    const trends = new Map<
      string,
      { inspections: number; nc: number; completed: number }
    >();

    filteredInspections.forEach((inspection) => {
      const d = new Date(inspection.scheduled_at ?? inspection.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!trends.has(key)) {
        trends.set(key, { inspections: 0, nc: 0, completed: 0 });
      }
      const t = trends.get(key)!;
      t.inspections += 1;
      if ((inspection.nonconformances_count ?? 0) > 0) t.nc += 1;
      if (inspection.status === 'completed') t.completed += 1;
    });

    return Array.from(trends.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({ month, ...data }));
  }, [filteredInspections]);

  const moduleBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    filteredInspections.forEach((i) => {
      map.set(i.module, (map.get(i.module) ?? 0) + 1);
    });
    return Array.from(map.entries()).sort(([, a], [, b]) => b - a);
  }, [filteredInspections]);

  const statusBreakdown = useMemo(() => {
    const map = new Map<Inspection['status'], number>();
    filteredInspections.forEach((i) => {
      map.set(i.status, (map.get(i.status) ?? 0) + 1);
    });
    return Array.from(map.entries());
  }, [filteredInspections]);

  const ncRate = useMemo(() => {
    if (filteredInspections.length === 0) return 0;
    const withNc = filteredInspections.filter((i) => (i.nonconformances_count ?? 0) > 0).length;
    return Math.round((withNc / filteredInspections.length) * 100);
  }, [filteredInspections]);

  return (
    <Layout title="Inspection Analytics & Trends">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-6"
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div>
            <h1 className="text-2xl font-bold text-charcoal">Inspection Analytics & Trends</h1>
            <p className="text-sm text-charcoal-500 mt-1">Rolling trend analysis for inspections</p>
          </div>
          <button
            onClick={() => navigate('/inspections')}
            className="px-4 py-2 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors"
          >
            View All Inspections
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
              <label className="block text-xs text-charcoal-500 mb-1">Period</label>
              <select
                value={trendPeriod}
                onChange={(e) => setTrendPeriod(e.target.value as TrendPeriod)}
                className="px-3 py-1.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              >
                <option value="3months">Last 3 Months</option>
                <option value="6months">Last 6 Months</option>
                <option value="12months">Last 12 Months</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-charcoal-500 mb-1">Module</label>
              <select
                value={selectedModule}
                onChange={(e) => setSelectedModule(e.target.value as ModuleKey | 'all')}
                className="px-3 py-1.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              >
                <option value="all">All Modules</option>
                <option value="safety">Safety</option>
                <option value="quality">Quality</option>
                <option value="environment">Environment</option>
                <option value="health">Health</option>
                <option value="legal">Legal</option>
                <option value="hr">HR</option>
                <option value="general">General</option>
                <option value="security">Security</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-charcoal-500 mb-1">Status</label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value as Inspection['status'] | 'all')}
                className="px-3 py-1.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              >
                <option value="all">All</option>
                <option value="scheduled">Scheduled</option>
                <option value="in-progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Total Inspections</p>
            <p className="text-2xl font-bold text-charcoal mt-1">{filteredInspections.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Average per Month</p>
            <p className="text-2xl font-bold text-charcoal mt-1">
              {monthlyTrends.length > 0
                ? Math.round(filteredInspections.length / monthlyTrends.length)
                : 0}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">With Non-Conformances</p>
            <p className="text-2xl font-bold text-critical mt-1">
              {filteredInspections.filter((i) => (i.nonconformances_count ?? 0) > 0).length}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">NC Rate</p>
            <p className="text-2xl font-bold text-critical mt-1">{ncRate}%</p>
          </div>
        </div>

        {/* Monthly Trend */}
        <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
          <h3 className="font-semibold text-charcoal mb-4">Monthly Trend</h3>
          {monthlyTrends.length === 0 && (
            <p className="text-sm text-charcoal-500">No inspections in the selected period.</p>
          )}
          {monthlyTrends.length > 0 && (
            <div className="space-y-2">
              {monthlyTrends.map((trend) => {
                const maxCount = Math.max(...monthlyTrends.map((t) => t.inspections), 1);
                const percentage = (trend.inspections / maxCount) * 100;
                return (
                  <div key={trend.month} className="flex items-center gap-4">
                    <div className="w-24 text-xs text-charcoal-500">
                      {new Date(trend.month + '-01').toLocaleDateString('en-ZA', {
                        month: 'short',
                        year: 'numeric'
                      })}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-surface-100 rounded-full h-6 overflow-hidden">
                          <div
                            className="bg-teal h-full rounded-full flex items-center justify-end pr-2"
                            style={{ width: `${percentage}%` }}
                          >
                            {trend.inspections > 0 && (
                              <span className="text-xs font-medium text-white">
                                {trend.inspections}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-charcoal-500">
                          {trend.nc} with NC • {trend.completed} completed
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
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal mb-4">By Module</h3>
            <div className="space-y-2">
              {moduleBreakdown.map(([module, count]) => {
                const percentage = (count / filteredInspections.length) * 100;
                return (
                  <div key={module}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-charcoal">{module}</span>
                      <span className="text-sm font-medium text-charcoal">{count}</span>
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
            </div>
          </div>

          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal mb-4">By Status</h3>
            <div className="space-y-2">
              {statusBreakdown.map(([status, count]) => {
                const percentage = (count / filteredInspections.length) * 100;
                return (
                  <div key={status}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-charcoal capitalize">{status}</span>
                      <span className="text-sm font-medium text-charcoal">{count}</span>
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
            </div>
          </div>

          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal mb-4">Recent Activity</h3>
            <div className="space-y-2">
              {filteredInspections
                .slice()
                .sort(
                  (a, b) =>
                    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                )
                .slice(0, 5)
                .map((i) => (
                  <div
                    key={i.id}
                    className="flex items-center justify-between text-xs text-charcoal-600"
                  >
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-surface-100">
                        <BarChart3Icon className="w-3 h-3 text-charcoal-500" />
                      </span>
                      <span className="truncate max-w-[180px]">{i.title}</span>
                    </div>
                    <span className="flex items-center gap-1 text-charcoal-400">
                      <CalendarIcon className="w-3 h-3" />
                      {new Date(i.created_at).toLocaleDateString('en-ZA')}
                    </span>
                  </div>
                ))}
              {filteredInspections.length === 0 && (
                <p className="text-sm text-charcoal-500">No recent inspections.</p>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </Layout>
  );
}

