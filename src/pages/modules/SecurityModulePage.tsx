import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { LockIcon, KeyIcon, ShieldAlertIcon, DownloadIcon, ArrowRightIcon } from 'lucide-react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { listActivityLogs } from '../../api/services/activityLogService';
import { toCsv, downloadTextFile } from '../../utils/csv';
import type { ActivityLog } from '../../api/models/entities';
import { useNavigate } from 'react-router-dom';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

export function SecurityModulePage() {
  const navigate = useNavigate();
  const { activeCompanyId, activeRole } = useTenant();
  const canManage = activeRole === 'owner' || activeRole === 'admin' || activeRole === 'manager';

  const { data: logs, loading } = useAsync<ActivityLog[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listActivityLogs({ companyId: activeCompanyId, limit: 50 });
    },
    [activeCompanyId]
  );

  const recent = logs ?? [];
  const summary = useMemo(() => {
    const byAction = new Map<string, number>();
    for (const l of recent) byAction.set(l.action, (byAction.get(l.action) ?? 0) + 1);
    return Array.from(byAction.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [recent]);

  return (
    <Layout title="Security Management">
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
        <motion.div
          variants={itemVariants}
          className="bg-gradient-to-r from-slate-700 to-slate-800 rounded-2xl p-6 text-white"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-xl">
              <LockIcon className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Security</h1>
              <p className="text-slate-200">Access control, audit trails, approvals, and evidence readiness</p>
            </div>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal flex items-center gap-2">
              <KeyIcon className="w-5 h-5 text-teal" />
              Authentication & sessions
            </h3>
            <p className="text-sm text-charcoal-500 mt-2">
              Authentication is enforced by InsForge sign-in. Company access is restricted by workspace + role permissions (RLS).
            </p>
            <button
              type="button"
              onClick={() => navigate('/settings')}
              disabled={!canManage}
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-teal hover:text-teal-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Manage security settings <ArrowRightIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal flex items-center gap-2">
              <ShieldAlertIcon className="w-5 h-5 text-warning" />
              Audit trail
            </h3>
            <p className="text-sm text-charcoal-500 mt-2">
              Activity logs are recorded for key actions (invites, reports, training, medical, evidence, approvals).
            </p>
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                const dateStamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                const csv = toCsv(
                  (recent ?? []).map((r) => ({
                    created_at: r.created_at,
                    action: r.action,
                    actor_user_id: r.actor_user_id,
                    entity_type: r.entity_type ?? '',
                    entity_id: r.entity_id ?? '',
                    metadata: JSON.stringify(r.metadata ?? {})
                  }))
                );
                downloadTextFile(`safecloudafrica-audit-trail-${dateStamp}.csv`, csv, 'text/csv;charset=utf-8');
              }}
              disabled={!activeCompanyId}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-100 text-charcoal text-sm font-semibold hover:bg-surface-200 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <DownloadIcon className="w-4 h-4" />
              Export audit trail
            </button>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal">RBAC enforcement</h3>
            <p className="text-sm text-charcoal-500 mt-2">
              UI actions are disabled by role and database RLS prevents cross-company access. Admin/Manager can manage users and settings.
            </p>
            <button
              type="button"
              onClick={() => navigate('/users')}
              disabled={!canManage}
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-teal hover:text-teal-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Manage roles & users <ArrowRightIcon className="w-4 h-4" />
            </button>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
            <h3 className="font-semibold text-charcoal">Recent audit trail</h3>
            <span className="text-sm text-charcoal-400">{recent.length} entries</span>
          </div>
          <div className="divide-y divide-surface-100">
            {loading && (
              <div className="px-5 py-4">
                <p className="text-sm text-charcoal-500">Loading…</p>
              </div>
            )}
            {!loading && recent.length === 0 && (
              <div className="px-5 py-4">
                <p className="text-sm text-charcoal-500">No activity yet.</p>
              </div>
            )}
            {summary.map(([action, count]) => (
              <div key={action} className="px-5 py-3 flex items-center justify-between">
                <p className="text-sm text-charcoal">{action}</p>
                <span className="text-xs font-semibold bg-surface-100 rounded px-2 py-1 text-charcoal-600">{count}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </Layout>
  );
}

