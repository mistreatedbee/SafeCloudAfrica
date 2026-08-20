import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AlertTriangleIcon,
  ClockIcon,
  CalendarIcon,
  TrendingUpIcon,
  ShieldCheckIcon,
  ArrowRightIcon } from
'lucide-react';
import { Layout } from '../components/layout/Layout';
import { ComplianceScore } from '../components/ui/ComplianceScore';
import { StatCard } from '../components/ui/StatCard';
import { RiskHeatMap } from '../components/ui/RiskHeatMap';
import { TrendChart } from '../components/ui/TrendChart';
import { QuickActionButton } from '../components/ui/QuickActionButton';
import { StatusBadge } from '../components/ui/StatusBadge';
import { ModuleCard } from '../components/ui/ModuleCard';
import { useUser } from '@insforge/react';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import type { Incident, Task } from '../api/models/entities';
import { listIncidents, countIncidentsByStatus, countNearMissesThisMonth, countMyIncidents } from '../api/services/incidentsService';
import { countCompanyPendingTasks, countMyPendingTasks, listTasks } from '../api/services/tasksService';
import { listRisks } from '../api/services/risksService';
import { listModuleTargets } from '../api/services/moduleTargetsService';
import { countOverdueCorrectiveActions } from '../api/services/correctiveActionsService';
import { countExpiringTraining, countExpiringTrainingForUser } from '../api/services/trainingService';
import { listInspections } from '../api/services/inspectionsService';
import { useIdentity } from '../hooks/useIdentity';
import { AiBriefingCard } from '../components/ai/AiBriefingCard';
import type { UUID } from '../api/models/entities';
const containerVariants = {
  hidden: {
    opacity: 0
  },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};
const itemVariants = {
  hidden: {
    opacity: 0,
    y: 20
  },
  visible: {
    opacity: 1,
    y: 0
  }
};

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

function formatDateZA(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

const moduleCards = [
  { id: 'safety', name: 'Safety', isoStandard: 'ISO 45001', icon: 'Shield', color: '#0FB9B1' },
  { id: 'quality', name: 'Quality', isoStandard: 'ISO 9001', icon: 'Award', color: '#3498DB' },
  { id: 'environment', name: 'Environment', isoStandard: 'ISO 14001', icon: 'Leaf', color: '#2ECC71' },
  { id: 'health', name: 'Health', icon: 'Heart', color: '#E74C3C' },
  { id: 'legal', name: 'Legal', icon: 'Scale', color: '#9B59B6' },
  { id: 'hr', name: 'HR', icon: 'Users', color: '#F5A623' }
] as const;

export function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { activeCompanyId, activeRole } = useTenant();
  const { fullName } = useIdentity();
  const firstName = String(fullName || user?.email || 'there').split(' ')[0];
  const [refreshKey, setRefreshKey] = useState(0);

  // Lightweight real-time refresh (poll)
  useEffect(() => {
    const t = window.setInterval(() => setRefreshKey((k) => k + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const { data: summary, loading, error } = useAsync<{
    openIncidents: number;
    investigatingIncidents: number;
    nearMissesThisMonth: number;
    pendingTasks: number;
    myIncidents: number;
    myPendingTasks: number;
    tasks: Task[];
    incidents: Incident[];
    overdueActions: number;
    expiringTraining: number;
    moduleScoreByKey: Record<string, number>;
    overallScore: number;
    heatMapData: Array<{ likelihood: number; consequence: number; count: number; level: string }>;
    trendData: Array<{ month: string; incidents: number; nearMisses: number; lti: number }>;
    openInspections: number;
  } | null>(
    async () => {
      if (!activeCompanyId || !user?.id) return null;

      try {
        const [openIncidents, investigatingIncidents, nearMissesThisMonth] = await Promise.all([
          countIncidentsByStatus(activeCompanyId, 'open').catch(() => 0),
          countIncidentsByStatus(activeCompanyId, 'investigating').catch(() => 0),
          countNearMissesThisMonth(activeCompanyId).catch(() => 0)
        ]);

        const [pendingTasks, myPendingTasks, myIncidents] = await Promise.all([
          countCompanyPendingTasks(activeCompanyId).catch(() => 0),
          countMyPendingTasks(activeCompanyId, user.id).catch(() => 0),
          countMyIncidents(activeCompanyId, user.id).catch(() => 0)
        ]);

        const [overdueActions, expiringTraining, inspections] = await Promise.all([
          countOverdueCorrectiveActions(activeCompanyId).catch(() => 0),
          (activeRole === 'employee' ? countExpiringTrainingForUser(activeCompanyId, user.id, 30) : countExpiringTraining(activeCompanyId, 30)).catch(() => 0),
          listInspections({ companyId: activeCompanyId, limit: 500 }).catch(() => [])
        ]);

        const tasks = await listTasks({
          companyId: activeCompanyId,
          assigneeUserId: activeRole === 'employee' ? user.id : undefined,
          limit: 4
        }).catch(() => []);
        
        const incidents = await listIncidents({ companyId: activeCompanyId, limit: 500 }).catch(() => []);

        const risks = await listRisks({ companyId: activeCompanyId, limit: 2000 }).catch(() => []);
        const moduleTargets = await listModuleTargets({ companyId: activeCompanyId, limit: 2000 }).catch(() => []);

        const moduleScoreByKey: Record<string, number> = {};
        const byModule = new Map<string, { total: number; achieved: number }>();
        for (const t of moduleTargets) {
          const key = String(t.module);
          const entry = byModule.get(key) ?? { total: 0, achieved: 0 };
          entry.total += 1;
          if (t.achieved) entry.achieved += 1;
          byModule.set(key, entry);
        }
        for (const [key, v] of byModule.entries()) {
          moduleScoreByKey[key] = v.total === 0 ? 0 : Math.round((v.achieved / v.total) * 100);
        }
        const overallScore = (() => {
          const totals = Array.from(byModule.values()).reduce((acc, v) => acc + v.total, 0);
          const achieved = Array.from(byModule.values()).reduce((acc, v) => acc + v.achieved, 0);
          return totals === 0 ? 0 : Math.round((achieved / totals) * 100);
        })();

        const heatMapData = (() => {
          const map = new Map<string, { likelihood: number; consequence: number; count: number; level: string }>();
          const classify = (rating: number) => {
            if (rating >= 17) return 'critical';
            if (rating >= 10) return 'high';
            if (rating >= 5) return 'medium';
            if (rating >= 2) return 'low';
            return 'minimal';
          };
          for (const r of risks) {
            const likelihood = Math.max(1, Math.min(5, Number((r as any).likelihood ?? 1)));
            const consequence = Math.max(1, Math.min(5, Number((r as any).consequence ?? 1)));
            const rating = Number((r as any).risk_rating ?? (likelihood * consequence));
            const key = `${likelihood}:${consequence}`;
            const prev = map.get(key) ?? { likelihood, consequence, count: 0, level: classify(rating) };
            prev.count += 1;
            // keep the worst level we have seen in that cell
            const levels = ['minimal', 'low', 'medium', 'high', 'critical'];
            const worst = levels[Math.max(levels.indexOf(prev.level), levels.indexOf(classify(rating)))];
            prev.level = worst;
            map.set(key, prev);
          }
          return Array.from(map.values());
        })();

        const trendData = (() => {
          const byMonth = new Map<string, { incidents: number; nearMisses: number; lti: number }>();
          for (const i of incidents) {
            const d = new Date(i.occurred_at);
            if (Number.isNaN(d.getTime())) continue;
            const key = `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
            const entry = byMonth.get(key) ?? { incidents: 0, nearMisses: 0, lti: 0 };
            entry.incidents += 1;
            if (i.is_near_miss) entry.nearMisses += 1;
            if (String(i.severity).toLowerCase() === 'critical') entry.lti += 1;
            byMonth.set(key, entry);
          }
          return Array.from(byMonth.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .slice(-6)
            .map(([month, v]) => ({ month, ...v }));
        })();

        return {
          openIncidents,
          investigatingIncidents,
          nearMissesThisMonth,
          pendingTasks,
          myIncidents,
          myPendingTasks,
          tasks,
          incidents: incidents.slice(0, 5),
          overdueActions,
          expiringTraining,
          moduleScoreByKey,
          overallScore,
          heatMapData,
          trendData,
          openInspections: inspections.filter((i) => i.status !== 'completed').length
        };
      } catch (err) {
        console.error('Dashboard data error:', err);
        throw err;
      }
    },
    [activeCompanyId, activeRole, user?.id, refreshKey]
  );

  const openIncidents = summary?.openIncidents ?? 0;
  const overdueActions = summary?.overdueActions ?? 0;
  const openInspections = summary?.openInspections ?? 0;
  const expiringTraining = summary?.expiringTraining ?? 0;
  const moduleScoreByKey = summary?.moduleScoreByKey ?? {};
  const overallScore = summary?.overallScore ?? 0;
  const dashboardTasks = summary?.tasks ?? [];

  const moduleCardsWithScores = useMemo(() => {
    return moduleCards.map((m) => ({ ...m, score: moduleScoreByKey[m.id] ?? 0 }));
  }, [moduleScoreByKey]);

  return (
    <Layout title="Dashboard">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-6">

        {/* Welcome Banner */}
        <motion.div
          variants={itemVariants}
          className="bg-gradient-to-r from-navy to-navy-700 rounded-2xl p-6 text-white">

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold mb-1">
                Good morning, {firstName}
              </h1>
              <p className="text-navy-200">
                Here's your safety management overview for today
              </p>
            </div>
            <div className="flex items-center gap-3 bg-white/10 rounded-xl px-4 py-3">
              <ShieldCheckIcon className="w-8 h-8 text-success" />
              <div>
                <p className="text-sm text-navy-200">Near misses (this month)</p>
                <p className="text-2xl font-bold">
                  {summary?.nearMissesThisMonth ?? 0}
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {activeCompanyId && (
          <motion.div variants={itemVariants}>
            <AiBriefingCard companyId={activeCompanyId as UUID} />
          </motion.div>
        )}

        {error && (
          <motion.div variants={itemVariants} className="bg-white rounded-xl border border-critical/30 p-4 shadow-card">
            <p className="text-sm font-semibold text-critical">Dashboard data unavailable</p>
            <p className="text-sm text-charcoal-500 mt-1">{error?.message || 'An error occurred while loading dashboard data'}</p>
            <button
              onClick={() => setRefreshKey(k => k + 1)}
              className="mt-3 text-sm text-critical hover:text-critical-600 font-medium underline"
            >
              Try again
            </button>
          </motion.div>
        )}

        {/* Top Stats Row */}
        <motion.div
          variants={itemVariants}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Overall Compliance */}
          <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card md:col-span-2 lg:col-span-1">
            <div className="flex flex-col items-center">
              <ComplianceScore
                score={overallScore}
                size="lg"
                label="Compliance" />

            </div>
          </div>

          <StatCard
            title="Open Incidents"
            value={activeRole === 'employee' ? summary?.myIncidents ?? 0 : openIncidents}
            icon="AlertTriangle"
            iconColor="#E74C3C"
            variant="critical"
            subtitle={activeRole === 'employee' ? 'Reported by you' : `${summary?.investigatingIncidents ?? 0} investigating`} />


          <StatCard
            title="Overdue Actions"
            value={overdueActions}
            icon="ClipboardCheck"
            iconColor="#F5A623"
            variant="warning"
            subtitle="Corrective actions overdue" />


          <StatCard
            title="Expiring Training"
            value={expiringTraining}
            icon="Calendar"
            iconColor="#E74C3C"
            variant="critical"
            subtitle="Next 30 days" />

          <StatCard
            title="Open Inspections"
            value={openInspections}
            icon="ClipboardCheck"
            iconColor="#0FB9B1"
            variant="info"
            subtitle="Checklist workflow" />

        </motion.div>

        {/* Module Compliance Grid */}
        <motion.div variants={itemVariants}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-charcoal">
              Module Compliance
            </h2>
            <button
              type="button"
              onClick={() => navigate('/modules/general')}
              className="text-sm font-medium text-teal hover:text-teal-700 flex items-center gap-1 transition-colors"
            >
              View all modules <ArrowRightIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {moduleCardsWithScores.map((module) =>
            <ModuleCard
              key={module.id}
              name={module.name}
              isoStandard={'isoStandard' in module ? module.isoStandard : undefined}
              score={module.score}
              icon={module.icon}
              color={module.color}
              onClick={() => navigate(`/modules/${module.id}`)} />

            )}
          </div>
        </motion.div>

        {/* Risk Heat Map & Incident Trends */}
        <motion.div
          variants={itemVariants}
          className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <RiskHeatMap data={summary?.heatMapData ?? []} />
          <TrendChart title="Incident Trends (Last 6 Months)" data={summary?.trendData ?? []} />
        </motion.div>

        {/* Quick Actions */}
        <motion.div variants={itemVariants}>
          <h2 className="text-lg font-semibold text-charcoal mb-4">
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <QuickActionButton
              icon="AlertTriangle"
              label="Report Incident"
              onClick={() => navigate('/dashboard/incidents/management/new')} />

            <QuickActionButton
              icon="Upload"
              label="Upload Document"
              variant="secondary"
              onClick={() => navigate('/documents')} />

            <QuickActionButton
              icon="PlusCircle"
              label="Create Task"
              variant="secondary"
              onClick={() => navigate('/dashboard/management/tasks/new')} />

            <QuickActionButton
              icon="ClipboardCheck"
              label="Start Audit"
              variant="secondary"
              onClick={() => navigate('/audits/new')} />

          </div>
        </motion.div>

        {/* Bottom Section: Tasks, Overdue, Training */}
        <motion.div
          variants={itemVariants}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Tasks Due Today */}
          <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
              <h3 className="font-semibold text-charcoal flex items-center gap-2">
                <ClockIcon className="w-5 h-5 text-teal" />
                {activeRole === 'employee' ? 'My Tasks' : 'Company Tasks'}
              </h3>
              <span className="text-sm font-medium text-teal">
                {dashboardTasks.length}
              </span>
            </div>
            <div className="divide-y divide-surface-100">
              {loading && (
                <div className="px-5 py-3">
                  <p className="text-sm text-charcoal-500">Loading…</p>
                </div>
              )}
              {dashboardTasks.map((task) =>
              <div
                key={task.id}
                onClick={() => navigate(`/dashboard/management/tasks/${task.id}`)}
                className="px-5 py-3 hover:bg-surface-50 cursor-pointer transition-colors">

                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-charcoal truncate">
                        {task.title}
                      </p>
                      <p className="text-xs text-charcoal-400 mt-0.5">
                        {task.module}
                      </p>
                    </div>
                    <StatusBadge status={task.status} size="sm" />
                  </div>
                </div>
              )}
            </div>
            <div className="px-5 py-3 bg-surface-50 border-t border-surface-200">
              <button
                onClick={() => navigate('/dashboard/management/tasks')}
                className="text-sm font-medium text-teal hover:text-teal-700 transition-colors">

                View all tasks →
              </button>
            </div>
          </div>

          {/* Overdue Actions */}
          <div className="bg-white rounded-xl border border-warning/30 shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-warning/20 bg-warning-50 flex items-center justify-between">
              <h3 className="font-semibold text-charcoal flex items-center gap-2">
                <AlertTriangleIcon className="w-5 h-5 text-warning" />
                Overdue Actions
              </h3>
              <span className="text-sm font-bold text-warning">
                {overdueActions}
              </span>
            </div>
            <div className="divide-y divide-surface-100">
              <div className="px-5 py-3">
                <p className="text-sm text-charcoal-500">Overdue corrective actions requiring attention.</p>
              </div>
            </div>
            <div className="px-5 py-3 bg-surface-50 border-t border-surface-200">
              <button
                type="button"
                onClick={() => navigate('/dashboard/management/tasks')}
                className="text-sm font-medium text-warning hover:text-warning-700 transition-colors"
              >
                Resolve overdue →
              </button>
            </div>
          </div>

          {/* Training Expiry Alerts */}
          <div className="bg-white rounded-xl border border-critical/30 shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-critical/20 bg-critical-50 flex items-center justify-between">
              <h3 className="font-semibold text-charcoal flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-critical" />
                Training Expiring
              </h3>
              <span className="text-sm font-bold text-critical">
                {expiringTraining}
              </span>
            </div>
            <div className="divide-y divide-surface-100">
              <div className="px-5 py-3">
                <p className="text-sm text-charcoal-500">Training records expiring soon.</p>
              </div>
            </div>
            <div className="px-5 py-3 bg-surface-50 border-t border-surface-200">
              <button
                onClick={() => navigate('/training')}
                className="text-sm font-medium text-critical hover:text-critical-700 transition-colors">

                Manage training →
              </button>
            </div>
          </div>
        </motion.div>

        {/* Recent Incidents */}
        <motion.div variants={itemVariants}>
          <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
              <h3 className="font-semibold text-charcoal">Recent Incidents</h3>
              <button
                onClick={() => navigate('/dashboard/incidents/management')}
                className="text-sm font-medium text-teal hover:text-teal-700 transition-colors">

                View all →
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface-50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                      Title
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                      Location
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {(summary?.incidents ?? []).map((incident) =>
                  <tr
                    key={incident.id}
                    className="hover:bg-surface-50 cursor-pointer transition-colors">

                      <td className="px-5 py-3 text-sm font-medium text-teal">
                        INC-{shortId(incident.id)}
                      </td>
                      <td className="px-5 py-3 text-sm text-charcoal">
                        {incident.title}
                      </td>
                      <td className="px-5 py-3 text-sm text-charcoal-500">
                        {incident.category}
                      </td>
                      <td className="px-5 py-3 text-sm text-charcoal-500">
                        {incident.location ?? '—'}
                      </td>
                      <td className="px-5 py-3 text-sm text-charcoal-500">
                        {formatDateZA(incident.occurred_at)}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={incident.status as any} size="sm" />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </Layout>);

}
