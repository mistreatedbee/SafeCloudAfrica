import React, { lazy, Suspense, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3Icon,
  TrendingUpIcon,
  TrendingDownIcon,
  AlertTriangleIcon,
  CalendarIcon,
  FilterIcon
} from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { ChartSuspenseFallback } from '../components/ui/RouteSuspenseFallback';

const IncidentAnalyticsTrendChartsSection = lazy(() => import('./IncidentAnalyticsTrendChartsSection'));
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import { listIncidentsWithFilters } from '../api/services/incidentsService';
import type { Incident } from '../api/models/entities';
import type { IncidentCategory, RiskLevel } from '../api/models/core';
import { listIncidentInvestigationsForIncidents } from '../api/services/incidentInvestigationsService';
import type { UUID } from '../api/models/core';

type TrendPeriod = '1month' | '2months' | '3months' | '6months' | '12months';

export function IncidentAnalyticsPage() {
  const navigate = useNavigate();
  const { activeCompanyId } = useTenant();
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>('12months');
  const [selectedCategory, setSelectedCategory] = useState<IncidentCategory | 'all'>('all');
  const [selectedRiskLevel, setSelectedRiskLevel] = useState<RiskLevel | 'all'>('all');
  const [selectedRootCause, setSelectedRootCause] = useState<string>('all');

  const { data: incidents, loading, error: loadError } = useAsync<Incident[]>(
    async () => {
      if (!activeCompanyId) return [];
      const now = new Date();
      const cutoffDate = new Date();
      if (trendPeriod === '1month') {
        cutoffDate.setMonth(now.getMonth() - 1);
      } else if (trendPeriod === '2months') {
        cutoffDate.setMonth(now.getMonth() - 2);
      } else if (trendPeriod === '3months') {
        cutoffDate.setMonth(now.getMonth() - 3);
      } else if (trendPeriod === '6months') {
        cutoffDate.setMonth(now.getMonth() - 6);
      } else {
        cutoffDate.setMonth(now.getMonth() - 12);
      }
      return await listIncidentsWithFilters({
        companyId: activeCompanyId,
        category: selectedCategory !== 'all' ? selectedCategory : undefined,
        from: cutoffDate.toISOString(),
        limit: 1000
      });
    },
    [activeCompanyId, trendPeriod, selectedCategory]
  );

  const { data: investigations = [] } = useAsync(
    async () => {
      if (!activeCompanyId || !incidents?.length) return [];
      return listIncidentInvestigationsForIncidents(
        activeCompanyId,
        incidents.map((i) => i.id as UUID)
      );
    },
    [activeCompanyId, incidents]
  );

  const investigationsByIncidentId = useMemo(() => {
    const map = new Map<string, any>();
    for (const inv of investigations ?? []) map.set(String((inv as any).incident_id), inv as any);
    return map;
  }, [investigations]);

  const rootCauseOptions = useMemo(() => {
    const set = new Set<string>();
    for (const inv of investigations ?? []) {
      const rows = [
        ...((inv as any).root_causes_human ?? []),
        ...((inv as any).root_causes_workplace ?? []),
        ...((inv as any).system_failures ?? [])
      ];
      for (const entry of rows) {
        const label = String((entry as any)?.item ?? entry ?? '').trim();
        if (label) set.add(label);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [investigations]);

  // Filter incidents by date range
  const filteredIncidents = useMemo(() => {
    if (!incidents) return [];
    const now = new Date();
    const cutoffDate = new Date();
    if (trendPeriod === '3months') {
      cutoffDate.setMonth(now.getMonth() - 3);
    } else if (trendPeriod === '6months') {
      cutoffDate.setMonth(now.getMonth() - 6);
    } else {
      cutoffDate.setMonth(now.getMonth() - 12);
    }

    return incidents.filter(incident => {
      const incidentDate = new Date(incident.occurred_at);
      const inDateRange = incidentDate >= cutoffDate;
      const matchesCategory = selectedCategory === 'all' || incident.category === selectedCategory;
      // Prefer dedicated columns; fallback to metadata for older rows.
      const riskLevelRaw = String((incident as any)?.risk_rating ?? (incident as any)?.metadata?.riskLevel ?? '').toLowerCase();
      const riskLevel: RiskLevel =
        riskLevelRaw === 'critical' ? 'critical' :
        riskLevelRaw === 'high' ? 'high' :
        riskLevelRaw === 'low' ? 'low' :
        'medium';
      const matchesRisk = selectedRiskLevel === 'all' || riskLevel === selectedRiskLevel;
      const inv = investigationsByIncidentId.get(String(incident.id));
      const rootItems = inv
        ? [
            ...((inv as any).root_causes_human ?? []),
            ...((inv as any).root_causes_workplace ?? []),
            ...((inv as any).system_failures ?? [])
          ].map((entry) => String((entry as any)?.item ?? entry ?? '').trim().toLowerCase()).filter(Boolean)
        : [];
      const matchesRootCause = selectedRootCause === 'all' || rootItems.includes(selectedRootCause.toLowerCase());
      return inDateRange && matchesCategory && matchesRisk && matchesRootCause;
    });
  }, [incidents, trendPeriod, selectedCategory, selectedRiskLevel, selectedRootCause, investigationsByIncidentId]);

  const trendIncidents = useMemo(
    () => filteredIncidents.filter((incident) => String(incident.status) === 'closed' && investigationsByIncidentId.has(String(incident.id))),
    [filteredIncidents, investigationsByIncidentId]
  );

  // Trend analysis by month
  const monthlyTrends = useMemo(() => {
    const trends = new Map<string, { count: number; categories: Map<string, number>; riskLevels: Map<RiskLevel, number> }>();
    
    filteredIncidents.forEach(incident => {
      const date = new Date(incident.occurred_at);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!trends.has(monthKey)) {
        trends.set(monthKey, {
          count: 0,
          categories: new Map(),
          riskLevels: new Map()
        });
      }
      
      const trend = trends.get(monthKey)!;
      trend.count++;
      trend.categories.set(incident.category, (trend.categories.get(incident.category) || 0) + 1);
      
      const riskLevelRaw = String((incident as any)?.risk_rating ?? (incident as any)?.metadata?.riskLevel ?? '').toLowerCase();
      const riskLevel: RiskLevel =
        riskLevelRaw === 'critical' ? 'critical' :
        riskLevelRaw === 'high' ? 'high' :
        riskLevelRaw === 'low' ? 'low' :
        'medium';
      trend.riskLevels.set(riskLevel, (trend.riskLevels.get(riskLevel) || 0) + 1);
    });
    
    return Array.from(trends.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        ...data,
        categories: Array.from(data.categories.entries()),
        riskLevels: Array.from(data.riskLevels.entries())
      }));
  }, [trendIncidents]);

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    const breakdown = new Map<string, number>();
    trendIncidents.forEach(incident => {
      breakdown.set(incident.category, (breakdown.get(incident.category) || 0) + 1);
    });
    return Array.from(breakdown.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);
  }, [trendIncidents]);

  // Risk level breakdown
  const riskLevelBreakdown = useMemo(() => {
    const breakdown = new Map<RiskLevel, number>();
    trendIncidents.forEach(incident => {
      const riskLevelRaw = String((incident as any)?.risk_rating ?? (incident as any)?.metadata?.riskLevel ?? '').toLowerCase();
      const riskLevel: RiskLevel =
        riskLevelRaw === 'critical' ? 'critical' :
        riskLevelRaw === 'high' ? 'high' :
        riskLevelRaw === 'low' ? 'low' :
        'medium';
      breakdown.set(riskLevel, (breakdown.get(riskLevel) || 0) + 1);
    });
    return Array.from(breakdown.entries());
  }, [trendIncidents]);

  // Department/Site breakdown (extracted from location if available)
  const departmentBreakdown = useMemo(() => {
    const breakdown = new Map<string, number>();
    trendIncidents.forEach(incident => {
      const location = incident.location || 'Unknown';
      breakdown.set(location, (breakdown.get(location) || 0) + 1);
    });
    return Array.from(breakdown.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);
  }, [trendIncidents]);

  // Calculate trend direction
  const trendDirection = useMemo(() => {
    if (monthlyTrends.length < 2) return 'neutral';
    const recent = monthlyTrends.slice(-3).reduce((sum, t) => sum + t.count, 0) / 3;
    const older = monthlyTrends.slice(0, 3).reduce((sum, t) => sum + t.count, 0) / 3;
    if (recent > older * 1.1) return 'up';
    if (recent < older * 0.9) return 'down';
    return 'neutral';
  }, [monthlyTrends]);

  return (
    <Layout title="Incident Analytics & Trends">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-6"
      >
        {loadError && (
          <div className="bg-critical/10 border border-critical text-critical px-4 py-3 rounded-lg">
            <p className="font-medium">Failed to load incidents</p>
            <p className="text-sm mt-1">{loadError.message}</p>
          </div>
        )}
        {/* Header */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div>
            <h1 className="text-2xl font-bold text-charcoal">Incident Analytics & Trends</h1>
            <p className="text-sm text-charcoal-500 mt-1">Trend analysis uses completed investigations only (closed incidents with investigation records).</p>
          </div>
          <button
            onClick={() => navigate('/dashboard/incidents/management')}
            className="px-4 py-2 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors"
          >
            View All Incidents
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-surface-300 shadow-card p-4">
          <div className="flex flex-wrap gap-4">
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
                <option value="1month">Last 1 Month</option>
                <option value="2months">Last 2 Months</option>
                <option value="3months">Last 3 Months</option>
                <option value="6months">Last 6 Months</option>
                <option value="12months">Last 12 Months</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-charcoal-500 mb-1">Category</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as IncidentCategory | 'all')}
                className="px-3 py-1.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              >
                <option value="all">All Categories</option>
                {Array.from(new Set(filteredIncidents.map(i => i.category))).map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-charcoal-500 mb-1">Risk Level</label>
              <select
                value={selectedRiskLevel}
                onChange={(e) => setSelectedRiskLevel(e.target.value as RiskLevel | 'all')}
                className="px-3 py-1.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              >
                <option value="all">All Risk Levels</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-charcoal-500 mb-1">Root Cause</label>
              <select
                value={selectedRootCause}
                onChange={(e) => setSelectedRootCause(e.target.value)}
                className="px-3 py-1.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              >
                <option value="all">All Root Causes</option>
                {rootCauseOptions.map((cause) => (
                  <option key={cause} value={cause}>{cause}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Total Incidents</p>
            <p className="text-2xl font-bold text-charcoal mt-1">{trendIncidents.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Trend Direction</p>
            <div className="flex items-center gap-2 mt-1">
              {trendDirection === 'up' && <TrendingUpIcon className="w-5 h-5 text-critical" />}
              {trendDirection === 'down' && <TrendingDownIcon className="w-5 h-5 text-success" />}
              {trendDirection === 'neutral' && <BarChart3Icon className="w-5 h-5 text-charcoal-400" />}
              <span className="text-lg font-bold text-charcoal capitalize">{trendDirection}</span>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Avg per Month</p>
            <p className="text-2xl font-bold text-charcoal mt-1">
              {monthlyTrends.length > 0 
                ? Math.round(trendIncidents.length / monthlyTrends.length)
                : 0}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Critical Risk</p>
            <p className="text-2xl font-bold text-critical mt-1">
              {riskLevelBreakdown.find(([level]) => level === 'critical')?.[1] || 0}
            </p>
          </div>
        </div>

        {/* Trend Charts */}
        <Suspense fallback={<ChartSuspenseFallback />}>
          <IncidentAnalyticsTrendChartsSection
            incidents={trendIncidents}
            period={trendPeriod === '1month' ? '1month' : trendPeriod === '2months' ? '2months' : '12months'}
          />
        </Suspense>

        {/* Monthly Trend Chart */}
        <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
          <h3 className="font-semibold text-charcoal mb-4">Monthly Trend (Detailed)</h3>
          <div className="space-y-2">
            {monthlyTrends.map(trend => {
              const maxCount = Math.max(...monthlyTrends.map(t => t.count), 1);
              const percentage = (trend.count / maxCount) * 100;
              return (
                <div key={trend.month} className="flex items-center gap-4">
                  <div className="w-24 text-xs text-charcoal-500">
                    {new Date(trend.month + '-01').toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-surface-100 rounded-full h-6 overflow-hidden">
                        <div
                          className="bg-teal h-full rounded-full flex items-center justify-end pr-2"
                          style={{ width: `${percentage}%` }}
                        >
                          {trend.count > 0 && (
                            <span className="text-xs font-medium text-white">{trend.count}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Breakdowns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Category Breakdown */}
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal mb-4">By Category</h3>
            <div className="space-y-2">
              {categoryBreakdown.map(([category, count]) => {
                const percentage = (count / filteredIncidents.length) * 100;
                return (
                  <div key={category}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-charcoal">{category}</span>
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

          {/* Risk Level Breakdown */}
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal mb-4">By Risk Level</h3>
            <div className="space-y-3">
              {riskLevelBreakdown.map(([level, count]) => {
                const percentage = (count / filteredIncidents.length) * 100;
                const color = 
                  level === 'critical' ? 'bg-critical' :
                  level === 'high' ? 'bg-warning' :
                  level === 'medium' ? 'bg-teal' :
                  'bg-success';
                const label = level.charAt(0).toUpperCase() + level.slice(1);
                return (
                  <div key={level}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-charcoal">{label}</span>
                      <span className="text-sm font-medium text-charcoal">{count}</span>
                    </div>
                    <div className="w-full bg-surface-100 rounded-full h-2">
                      <div
                        className={`${color} h-2 rounded-full`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Department/Site Breakdown */}
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal mb-4">By Department/Site</h3>
            <div className="space-y-2">
              {departmentBreakdown.map(([dept, count]) => {
                const percentage = (count / filteredIncidents.length) * 100;
                return (
                  <div key={dept}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-charcoal truncate">{dept}</span>
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
        </div>
      </motion.div>
    </Layout>
  );
}

