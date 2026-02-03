import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { FolderIcon, ClipboardCheckIcon, FileTextIcon, BarChart3Icon, PlusIcon } from 'lucide-react';
import { Layout } from '../../components/layout/Layout';
import { ComplianceScore } from '../../components/ui/ComplianceScore';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import { listModuleTargets } from '../../api/services/moduleTargetsService';
import { listDocuments } from '../../api/services/documentsService';
import { listApprovals } from '../../api/services/approvalsService';
import { listTasks } from '../../api/services/tasksService';
import { listActivityLogs } from '../../api/services/activityLogService';
import { listQualityNcrs, countOpenQualityNcrs } from '../../api/services/qualityNcrsService';
import type { Approval, Document, ModuleTarget, Task, QualityNcr } from '../../api/models/entities';
import { useNavigate } from 'react-router-dom';
import { ModuleTargetCreateModal } from '../../components/general/ModuleTargetCreateModal';
import { AlertCircleIcon, PlusIcon } from 'lucide-react';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { NcrCreateModal } from '../../components/ncrs/NcrCreateModal';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

export function GeneralModulePage() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { activeCompanyId, activeRole } = useTenant();
  const canManage = activeRole === 'admin' || activeRole === 'manager' || activeRole === 'supervisor' || activeRole === 'consultant';

  const [createKpiOpen, setCreateKpiOpen] = useState(false);
  const [createNcrOpen, setCreateNcrOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: kpis } = useAsync<ModuleTarget[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listModuleTargets({ companyId: activeCompanyId, module: 'general', limit: 200 });
    },
    [activeCompanyId, refreshKey]
  );
  const { data: tasks } = useAsync<Task[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listTasks({ companyId: activeCompanyId, limit: 2000 });
    },
    [activeCompanyId, refreshKey]
  );
  const { data: docs } = useAsync<Document[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listDocuments(activeCompanyId);
    },
    [activeCompanyId, refreshKey]
  );
  const { data: approvals } = useAsync<Approval[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listApprovals(activeCompanyId);
    },
    [activeCompanyId, refreshKey]
  );
  const { data: activity } = useAsync(
    async () => {
      if (!activeCompanyId) return [];
      return await listActivityLogs({ companyId: activeCompanyId, limit: 15 });
    },
    [activeCompanyId, refreshKey]
  );
  const { data: ncrs } = useAsync<QualityNcr[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listQualityNcrs({ companyId: activeCompanyId, limit: 10 });
    },
    [activeCompanyId, refreshKey]
  );
  const { data: openNcrsCount } = useAsync(
    async () => {
      if (!activeCompanyId) return 0;
      return await countOpenQualityNcrs(activeCompanyId);
    },
    [activeCompanyId, refreshKey]
  );

  const kpiScore = useMemo(() => {
    const list = kpis ?? [];
    if (list.length === 0) return 0;
    const achieved = list.filter((k) => k.achieved).length;
    return Math.round((achieved / list.length) * 100);
  }, [kpis]);

  const taskCounts = useMemo(() => {
    const list = tasks ?? [];
    return {
      total: list.length,
      pending: list.filter((t) => t.status === 'pending').length,
      inProgress: list.filter((t) => t.status === 'in-progress').length,
      overdue: list.filter((t) => t.status === 'overdue').length
    };
  }, [tasks]);

  const docCounts = useMemo(() => {
    const list = docs ?? [];
    const inReview = list.filter((d) => d.status === 'in_review').length;
    const drafts = list.filter((d) => d.status === 'draft').length;
    const approved = list.filter((d) => d.status === 'approved').length;
    return { total: list.length, drafts, inReview, approved };
  }, [docs]);

  const approvalCounts = useMemo(() => {
    const list = approvals ?? [];
    const pending = list.filter((a) => a.status === 'pending').length;
    const mine = user?.id ? list.filter((a) => a.approver_user_id === user.id && a.status === 'pending').length : 0;
    return { pending, mine };
  }, [approvals, user?.id]);

  return (
    <Layout title="General Programme Management">
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
        <motion.div
          variants={itemVariants}
          className="bg-gradient-to-r from-navy to-navy-700 rounded-2xl p-6 text-white"
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-xl">
                <FolderIcon className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">General</h1>
                <p className="text-navy-200">Programme overview, policies, and core reporting</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <ComplianceScore score={kpiScore} size="md" showLabel={false} />
              <div className="text-right">
                <p className="text-sm text-navy-200">Module Compliance</p>
                <p className="text-3xl font-bold">{kpiScore}%</p>
              </div>
            </div>
          </div>
        </motion.div>

        {activeCompanyId && user?.id && (
          <>
            <ModuleTargetCreateModal
              open={createKpiOpen}
              onClose={() => setCreateKpiOpen(false)}
              companyId={activeCompanyId}
              createdByUserId={user.id}
              module="general"
              onCreated={() => setRefreshKey((k) => k + 1)}
            />
            <NcrCreateModal
              open={createNcrOpen}
              onClose={() => setCreateNcrOpen(false)}
              companyId={activeCompanyId}
              createdByUserId={user.id}
              defaultModule="general"
              onCreated={() => setRefreshKey((k) => k + 1)}
            />
          </>
        )}

        <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Tasks</p>
            <p className="text-2xl font-bold text-charcoal mt-1">{taskCounts.total}</p>
            <p className="text-xs text-charcoal-400 mt-1">{taskCounts.overdue} overdue</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Documents</p>
            <p className="text-2xl font-bold text-charcoal mt-1">{docCounts.total}</p>
            <p className="text-xs text-charcoal-400 mt-1">{docCounts.inReview} in review</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Approvals</p>
            <p className="text-2xl font-bold text-charcoal mt-1">{approvalCounts.pending}</p>
            <p className="text-xs text-charcoal-400 mt-1">{approvalCounts.mine} assigned to you</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Open NCRs</p>
            <p className="text-2xl font-bold text-critical mt-1">{openNcrsCount ?? 0}</p>
            <p className="text-xs text-charcoal-400 mt-1">Non-conformances</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Programme KPIs</p>
            <p className="text-2xl font-bold text-teal mt-1">{(kpis ?? []).length}</p>
            <p className="text-xs text-charcoal-400 mt-1">{kpiScore}% achieved</p>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => navigate('/tasks')}
            className="px-4 py-2 rounded-lg bg-white border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
          >
            Open tasks
          </button>
          <button
            type="button"
            onClick={() => navigate('/documents')}
            className="px-4 py-2 rounded-lg bg-white border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
          >
            Open documents
          </button>
          <button
            type="button"
            onClick={() => navigate('/reports')}
            className="px-4 py-2 rounded-lg bg-white border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
          >
            Open reports
          </button>
          <button
            type="button"
            onClick={() => navigate('/approvals')}
            className="px-4 py-2 rounded-lg bg-white border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
          >
            Open approvals
          </button>
          <button
            type="button"
            disabled={!canManage}
            onClick={() => setCreateKpiOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <PlusIcon className="w-4 h-4" />
            Add KPI
          </button>
        </motion.div>

        <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal flex items-center gap-2">
              <ClipboardCheckIcon className="w-5 h-5 text-teal" />
              Core engine
            </h3>
            <p className="text-sm text-charcoal-500 mt-2">
              Tasks drive programme execution and accountability. Live task counts and statuses update in real time.
            </p>
            <button
              type="button"
              onClick={() => navigate('/tasks')}
              className="mt-4 text-sm font-medium text-teal hover:text-teal-700 transition-colors"
            >
              Manage tasks →
            </button>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal flex items-center gap-2">
              <FileTextIcon className="w-5 h-5 text-teal" />
              Document control
            </h3>
            <p className="text-sm text-charcoal-500 mt-2">
              Uploads, downloads, review status, and approvals are tracked per company in real time.
            </p>
            <button
              type="button"
              onClick={() => navigate('/documents')}
              className="mt-4 text-sm font-medium text-teal hover:text-teal-700 transition-colors"
            >
              Manage documents →
            </button>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal flex items-center gap-2">
              <BarChart3Icon className="w-5 h-5 text-teal" />
              Dashboards
            </h3>
            <p className="text-sm text-charcoal-500 mt-2">
              Programme KPIs and activity logs provide a live audit trail of work completed and decisions made.
            </p>
            <button
              type="button"
              onClick={() => navigate('/reports')}
              className="mt-4 text-sm font-medium text-teal hover:text-teal-700 transition-colors"
            >
              View analytics →
            </button>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent NCRs */}
          <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
              <h3 className="font-semibold text-charcoal flex items-center gap-2">
                <AlertCircleIcon className="w-5 h-5 text-critical" />
                Recent Non-Conformance Reports
              </h3>
              <div className="flex items-center gap-2">
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setCreateNcrOpen(true)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-critical text-white rounded-lg text-xs font-medium hover:bg-critical-600 transition-colors"
                  >
                    <PlusIcon className="w-3 h-3" />
                    New NCR
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => navigate('/reports')}
                  className="text-sm font-medium text-teal hover:text-teal-700 transition-colors"
                >
                  View all →
                </button>
              </div>
            </div>
            <div className="divide-y divide-surface-100">
              {(ncrs ?? []).length === 0 && (
                <div className="px-5 py-3">
                  <p className="text-sm text-charcoal-500">No NCRs yet.</p>
                </div>
              )}
              {(ncrs ?? []).map((ncr) => (
                <div
                  key={ncr.id}
                  className="px-5 py-3 hover:bg-surface-50 cursor-pointer transition-colors"
                  onClick={() => navigate('/reports')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-blue-500">
                        NCR-{String(ncr.id).slice(0, 8)}
                      </p>
                      <p className="text-sm text-charcoal mt-0.5">{ncr.title}</p>
                      <p className="text-xs text-charcoal-400 mt-0.5">
                        {new Date(ncr.occurred_at).toLocaleDateString('en-ZA')}
                      </p>
                    </div>
                    <StatusBadge status={ncr.status as any} size="sm" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
              <h3 className="font-semibold text-charcoal">Recent programme activity</h3>
              <button
                type="button"
                onClick={() => setRefreshKey((k) => k + 1)}
                className="text-sm font-medium text-teal hover:text-teal-700 transition-colors"
              >
                Refresh
              </button>
            </div>
            <div className="divide-y divide-surface-100">
              {(activity ?? []).length === 0 && (
                <div className="px-5 py-4">
                  <p className="text-sm text-charcoal-500">No activity yet.</p>
                </div>
              )}
              {(activity ?? []).map((a: any) => (
                <div key={a.id} className="px-5 py-3">
                  <p className="text-sm font-medium text-charcoal">{a.action}</p>
                  <p className="text-xs text-charcoal-400 mt-0.5">{new Date(a.created_at).toLocaleString('en-ZA')}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </Layout>
  );
}

