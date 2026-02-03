import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUpIcon, ClipboardCheckIcon, PlusIcon } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import { listImprovements } from '../api/services/improvementService';
import type { ImprovementAction } from '../api/models/entities';
import { useUser } from '@insforge/react';
import { ImprovementCreateModal } from '../components/improvement/ImprovementCreateModal';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

export function ImprovementPage() {
  const { activeCompanyId } = useTenant();
  const { user } = useUser();
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, loading, error } = useAsync<ImprovementAction[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listImprovements(activeCompanyId);
    },
    [activeCompanyId, refreshKey]
  );

  const improvements = data ?? [];
  return (
    <Layout title="Continuous Improvement & Management Review">
      {activeCompanyId && user?.id && (
        <ImprovementCreateModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          companyId={activeCompanyId}
          createdByUserId={user.id}
          onCreated={() => setRefreshKey((k) => k + 1)}
        />
      )}
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
        <motion.div variants={itemVariants} className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-charcoal flex items-center gap-2">
                <TrendingUpIcon className="w-5 h-5 text-success" />
                Improvement actions
              </h2>
              <p className="text-sm text-charcoal-500 mt-2">
                Improvement actions are stored per company and can be linked to tasks, audits, incidents, and KPIs.
              </p>
            </div>
            <button
              type="button"
              disabled={!activeCompanyId || !user?.id}
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-success text-white text-sm font-semibold hover:bg-success-600 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <PlusIcon className="w-4 h-4" />
              New action
            </button>
          </div>
          <p className="text-sm text-charcoal-500 mt-2">
            Create, track, and close-out improvements with clear ownership and target dates.
          </p>
        </motion.div>

        <motion.div variants={itemVariants} className="space-y-3">
          {loading && (
            <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <p className="text-sm text-charcoal-500">Loading improvements…</p>
            </div>
          )}
          {error && (
            <div className="bg-white rounded-xl border border-critical/30 p-4 shadow-card">
              <p className="text-sm font-semibold text-critical">Unable to load improvements</p>
              <p className="text-sm text-charcoal-500 mt-1">{error.message}</p>
            </div>
          )}
          {!loading && !error && improvements.length === 0 && (
            <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <p className="text-sm text-charcoal-500">No improvement actions yet.</p>
            </div>
          )}
          {improvements.map((i) => (
            <div key={i.id} className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-surface-100 rounded-lg">
                  <ClipboardCheckIcon className="w-5 h-5 text-charcoal-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-charcoal">{i.title}</p>
                      <p className="text-sm text-charcoal-400 mt-0.5">
                        IMP-{String(i.id).slice(0, 8)} • Module: {i.module} • Owner:{' '}
                        {i.owner_user_id ? String(i.owner_user_id).slice(0, 8) : '—'}
                      </p>
                    </div>
                    <span className="px-2 py-1 bg-surface-100 rounded text-xs font-semibold text-charcoal-600">
                      {i.status}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </Layout>
  );
}

