import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useUser } from '@insforge/react';
import {
  ShieldIcon,
  AlertTriangleIcon,
  ClipboardCheckIcon,
  FileTextIcon,
  TrendingUpIcon,
  HardHatIcon,
  ArrowRightIcon,
  TargetIcon,
  ActivityIcon,
  PlusIcon
} from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { ComplianceScore } from '../components/ui/ComplianceScore';
import { StatCard } from '../components/ui/StatCard';
import { TrendChart } from '../components/ui/TrendChart';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import { countIncidentsByStatusForModule, listIncidents } from '../api/services/incidentsService';
import { countPendingTasksByModule } from '../api/services/tasksService';
import { countRisks } from '../api/services/risksService';
import { getPpeCompliance } from '../api/services/ppeService';
import { listModuleTargets } from '../api/services/moduleTargetsService';
import { listActivityLogs } from '../api/services/activityLogService';
import { isNearMiss } from '../api/utils/incidents';
import { FirstWinBanner } from '../components/onboarding/FirstWinBanner';
import { ListEmptyState } from '../components/ui/ListEmptyState';
import { ObjectiveCreateModal } from '../components/general/ObjectiveCreateModal';
import type { ModuleTargetStatus } from '../api/models/entities';

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

function timeAgo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return `${days} days ago`;
}

function objectiveStatus(status: ModuleTargetStatus | undefined, achieved?: boolean) {
  return status ?? (achieved ? 'completed' : 'not_started');
}

function objectiveStatusLabel(status: ModuleTargetStatus | undefined, achieved?: boolean) {
  const normalized = objectiveStatus(status, achieved);
  if (normalized === 'completed') return 'Completed';
  if (normalized === 'in_progress') return 'In Progress';
  if (normalized === 'not_achieved') return 'Not Achieved';
  return 'Not Started';
}

function objectiveStatusClass(status: ModuleTargetStatus | undefined, achieved?: boolean) {
  const normalized = objectiveStatus(status, achieved);
  if (normalized === 'completed') return 'bg-success/10 text-success border-success/20';
  if (normalized === 'in_progress') return 'bg-warning/10 text-warning border-warning/20';
  if (normalized === 'not_achieved') return 'bg-critical/10 text-critical border-critical/20';
  return 'bg-surface-100 text-charcoal-500 border-surface-200';
}

export function SafetyPage() {
  const navigate = useNavigate();
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const [refreshKey, setRefreshKey] = useState(0);
  const [createObjectiveOpen, setCreateObjectiveOpen] = useState(false);
  const showSafetyFirstWin = activeRole != null && activeRole !== 'employee';

  const { data: summary, loading: summaryLoading } = useAsync(
    async () => {
      if (!activeCompanyId) return null;
      const [openIncidents, pendingActions, activeHazards, ppeCompliance] = await Promise.all([
        countIncidentsByStatusForModule(activeCompanyId, 'safety', 'open'),
        countPendingTasksByModule(activeCompanyId, 'safety'),
        countRisks(activeCompanyId, { module: 'safety', status: 'open' }),
        getPpeCompliance(activeCompanyId)
      ]);

      // Real-time compliance proxy derived from live tables.
      const compliance = Math.max(0, Math.min(100, 100 - openIncidents * 3 - pendingActions * 1 - activeHazards * 2));

      return { compliance, openIncidents, pendingActions, activeHazards, ppeCompliance };
    },
    [activeCompanyId]
  );

  const { data: objectives, loading: objectivesLoading } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return await listModuleTargets({ companyId: activeCompanyId, module: 'safety', limit: 10 });
  }, [activeCompanyId, refreshKey]);

  const { data: activity, loading: activityLoading } = useAsync(async () => {
    if (!activeCompanyId) return [];
    const logs = await listActivityLogs({ companyId: activeCompanyId, limit: 25 });
    return logs.filter((l) => String(l.action).startsWith('incidents.') || String(l.action).startsWith('risks.') || String(l.action).startsWith('inspections.') || String(l.action).startsWith('ppe_'));
  }, [activeCompanyId]);

  const { data: trends, loading: trendsLoading } = useAsync(async () => {
    if (!activeCompanyId) return [];
    const incidents = await listIncidents({ companyId: activeCompanyId, limit: 500 });
    const safety = incidents.filter((i) => i.module === 'safety');
    const byMonth = new Map<string, { incidents: number; nearMisses: number; lti: number }>();
    for (const i of safety) {
      const d = new Date(i.occurred_at);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      const entry = byMonth.get(key) ?? { incidents: 0, nearMisses: 0, lti: 0 };
      entry.incidents += 1;
      if (isNearMiss(i as any)) entry.nearMisses += 1;
      if (String(i.severity).toLowerCase() === 'critical') entry.lti += 1;
      byMonth.set(key, entry);
    }
    return Array.from(byMonth.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([month, v]) => ({ month, ...v }));
  }, [activeCompanyId]);

  const safetyStats = summary ?? { compliance: 0, openIncidents: 0, pendingActions: 0, activeHazards: 0, ppeCompliance: 0 };

  function LoadingPlaceholder({ label }: { label: string }) {
    return (
      <div className="bg-white rounded-xl border border-surface-300 p-6 text-center text-sm text-charcoal-400 animate-pulse">
        {label}
      </div>
    );
  }

  return (
    <Layout title="Safety Management">
      {activeCompanyId && (
        <ObjectiveCreateModal
          open={createObjectiveOpen}
          onClose={() => setCreateObjectiveOpen(false)}
          companyId={activeCompanyId}
          module="safety"
          onCreated={() => setRefreshKey((k) => k + 1)}
        />
      )}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-6">

        {showSafetyFirstWin ? <FirstWinBanner persona="safety" /> : null}

        {/* Module Header */}
        <motion.div
          variants={itemVariants}
          className="bg-gradient-to-r from-teal to-teal-600 rounded-2xl p-6 text-white">

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-xl">
                <ShieldIcon className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Safety Management</h1>
                <p className="text-teal-100">ISO 45001:2018 Aligned</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <ComplianceScore
                score={safetyStats.compliance}
                size="md"
                showLabel={false} />

              <div className="text-right">
                <p className="text-sm text-teal-100">Module Compliance</p>
                <p className="text-3xl font-bold">{safetyStats.compliance}%</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <motion.div
          variants={itemVariants}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4">

          {summaryLoading ? (
            <>
              <LoadingPlaceholder label="Loading stats…" />
              <LoadingPlaceholder label="Loading stats…" />
              <LoadingPlaceholder label="Loading stats…" />
              <LoadingPlaceholder label="Loading stats…" />
            </>
          ) : (
            <>
              <StatCard
                title="Open Incidents"
                value={safetyStats.openIncidents}
                icon="AlertTriangle"
                iconColor="#E74C3C"
                variant="critical" />

              <StatCard
                title="Pending Actions"
                value={safetyStats.pendingActions}
                icon="ClipboardCheck"
                iconColor="#F5A623"
                variant="warning" />

              <StatCard
                title="Active Hazards"
                value={safetyStats.activeHazards}
                icon="AlertTriangle"
                iconColor="#F5A623" />

              <StatCard
                title="PPE Compliance"
                value={`${safetyStats.ppeCompliance}%`}
                icon="Shield"
                iconColor="#2ECC71"
                variant="success" />
            </>
          )}

        </motion.div>

        {/* Objectives & Trends */}
        <motion.div
          variants={itemVariants}
          className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Safety Objectives */}
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal mb-4 flex items-center gap-2">
              <TrendingUpIcon className="w-5 h-5 text-teal" />
              Safety Objectives
            </h3>
            <div className="space-y-4">
              {objectivesLoading && (
                <p className="text-sm text-charcoal-400 animate-pulse text-center py-4">Loading objectives…</p>
              )}
              {!objectivesLoading && (objectives ?? []).length === 0 && (
                <ListEmptyState
                  embedded
                  icon={TargetIcon}
                  title="No objectives yet"
                  description="Create a safety objective, assign a responsible person, and track it to completion."
                  primaryAction={{
                    kind: 'button',
                    label: 'Create Objective',
                    onClick: () => setCreateObjectiveOpen(true),
                    disabled: !activeCompanyId || !user?.id
                  }}
                />
              )}
              {!objectivesLoading && (objectives ?? []).length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface-100">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Objective</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Target</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Responsible Person</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Target Date</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-200">
                      {(objectives ?? []).map((objective) => (
                        <tr key={objective.id}>
                          <td className="px-3 py-3 text-sm font-medium text-charcoal">{objective.name}</td>
                          <td className="px-3 py-3 text-sm text-charcoal-600">
                            {objective.target_text || `${objective.target_value}${objective.unit ?? ''}`}
                          </td>
                          <td className="px-3 py-3 text-sm text-charcoal-600">{objective.responsible_name || '-'}</td>
                          <td className="px-3 py-3 text-sm text-charcoal-600">{objective.target_date || '-'}</td>
                          <td className="px-3 py-3">
                            <span className={`px-2 py-1 rounded-full border text-xs font-semibold whitespace-nowrap ${objectiveStatusClass(objective.status, objective.achieved)}`}>
                              {objectiveStatusLabel(objective.status, objective.achieved)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="pt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setCreateObjectiveOpen(true)}
                      disabled={!activeCompanyId || !user?.id}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60"
                    >
                      <PlusIcon className="w-4 h-4" />
                      Create Objective
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Incident Trends */}
          {trendsLoading ? (
            <LoadingPlaceholder label="Loading incident trends…" />
          ) : (
            <TrendChart title="Safety Incident Trends" type="bar" height={220} data={trends ?? []} />
          )}
        </motion.div>

        {/* Quick Access Cards */}
        <motion.div variants={itemVariants}>
          <h2 className="text-lg font-semibold text-charcoal mb-4">
            Quick Access
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
            {
              icon: AlertTriangleIcon,
              label: 'Report Incident',
              color: '#E74C3C'
            },
            {
              icon: ClipboardCheckIcon,
              label: 'Safety Inspection',
              color: '#0FB9B1'
            },
            {
              icon: FileTextIcon,
              label: 'Risk Assessment',
              color: '#F5A623'
            },
            {
              icon: HardHatIcon,
              label: 'PPE Management',
              color: '#0A2540'
            }].
            map((item, index) =>
            <button
              key={index}
              type="button"
              onClick={() => {
                if (item.label === 'Report Incident') navigate('/incidents/new');
                if (item.label === 'Safety Inspection') navigate('/inspections');
                if (item.label === 'Risk Assessment') navigate('/risks');
                if (item.label === 'PPE Management') navigate('/ppe');
              }}
              className="flex flex-col items-center gap-3 p-5 bg-white rounded-xl border border-surface-300 shadow-card hover:shadow-card-hover transition-all active:scale-[0.98]">

                <div
                className="p-3 rounded-lg"
                style={{
                  backgroundColor: `${item.color}15`
                }}>

                  <item.icon
                  className="w-6 h-6"
                  style={{
                    color: item.color
                  }} />

                </div>
                <span className="text-sm font-medium text-charcoal">
                  {item.label}
                </span>
              </button>
            )}
          </div>
        </motion.div>

        {/* Recent Activity */}
        <motion.div variants={itemVariants}>
          <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
              <h3 className="font-semibold text-charcoal">
                Recent Safety Activity
              </h3>
              <button
                type="button"
                onClick={() => navigate('/reports')}
                className="text-sm font-medium text-teal hover:text-teal-700 flex items-center gap-1 transition-colors"
              >
                View all <ArrowRightIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="divide-y divide-surface-100">
              {activityLoading && (
                <p className="px-5 py-6 text-sm text-charcoal-400 animate-pulse text-center">Loading recent activity…</p>
              )}
              {!activityLoading && (activity ?? []).length === 0 && (
                <div className="px-5 py-2">
                  <ListEmptyState
                    embedded
                    icon={ActivityIcon}
                    title="No recent safety activity"
                    description="Incidents, inspections, risks, and PPE actions will appear here as your team works in the safety module."
                    primaryAction={{ kind: 'link', to: '/incidents', label: 'Go to incidents' }}
                    secondaryAction={{ kind: 'link', to: '/inspections', label: 'Inspections' }}
                  />
                </div>
              )}
              {!activityLoading && (activity ?? []).map((a) => (
                <div key={a.id} className="px-5 py-4 hover:bg-surface-50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-charcoal">{a.action}</p>
                      <p className="text-sm text-charcoal-400 mt-0.5">
                        {(a.entity_type ?? 'record')} • {(a.entity_id ? String(a.entity_id).slice(0, 8) : '—')}
                      </p>
                    </div>
                    <span className="text-xs text-charcoal-400 whitespace-nowrap">{timeAgo(a.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </Layout>);

}
