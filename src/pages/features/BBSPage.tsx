import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { EyeIcon, ThumbsUpIcon, AlertTriangleIcon, SearchIcon, PlusIcon } from 'lucide-react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import { listBbsObservations } from '../../api/services/bbsService';
import type { BbsObservation } from '../../api/models/entities';
import { BbsObservationCreateModal } from '../../components/features/BbsObservationCreateModal';
import { isSellableFeatureAccessError } from '../../api/services/sellableFeaturesService';
import { SellableFeatureLockedPage } from './SellableFeatureLockedPage';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

export function BBSPage() {
  const [q, setQ] = useState('');
  const { user } = useUser();
  const { activeCompanyId } = useTenant();
  const [createOpen, setCreateOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, error } = useAsync<BbsObservation[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listBbsObservations(activeCompanyId);
    },
    [activeCompanyId, refreshKey]
  );

  const rows = useMemo(() => {
    const list = (data ?? []).map((o) => ({
      id: `OBS-${String(o.id).slice(0, 6)}`,
      type: o.type === 'unsafe_act' ? 'Unsafe act' : o.type === 'near_miss' ? 'Near miss' : 'Positive',
      title: o.title,
      area: o.area ?? '—',
      status: o.status === 'action_required' ? 'Action Required' : o.status === 'closed' ? 'Closed' : 'Logged'
    }));
    const qq = q.trim().toLowerCase();
    if (!qq) return list;
    return list.filter((o) => o.title.toLowerCase().includes(qq) || o.id.toLowerCase().includes(qq));
  }, [data, q]);

  if (isSellableFeatureAccessError(error) && error.code === 'FEATURE_LOCKED') {
    return <SellableFeatureLockedPage featureKey="bbs" />;
  }

  return (
    <Layout title="Behaviour-Based Safety (BBS)">
      {activeCompanyId && user?.id && (
        <BbsObservationCreateModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          companyId={activeCompanyId}
          createdByUserId={user.id}
          onCreated={() => setRefreshKey((k) => k + 1)}
        />
      )}
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="relative flex-1 max-w-md">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-400" />
            <input
              type="search"
              placeholder="Search observations..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            New Observation
          </button>
        </motion.div>

        <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal flex items-center gap-2">
              <EyeIcon className="w-5 h-5 text-teal" />
              Digital observations
            </h3>
            <p className="text-sm text-charcoal-500 mt-2">
              Capture observations and track status in real time across your company.
            </p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal flex items-center gap-2">
              <ThumbsUpIcon className="w-5 h-5 text-success" />
              Positive reinforcement
            </h3>
            <p className="text-sm text-charcoal-500 mt-2">
              Track positive behaviours and recognition scoring to increase participation.
            </p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal flex items-center gap-2">
              <AlertTriangleIcon className="w-5 h-5 text-warning" />
              Unsafe act trends
            </h3>
            <p className="text-sm text-charcoal-500 mt-2">
              Use the observation list to identify common unsafe acts and coach teams accordingly.
            </p>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="space-y-3">
          {rows.length === 0 && (
            <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <p className="text-sm text-charcoal-500">No observations yet.</p>
            </div>
          )}
          {rows.map((o) => (
            <div key={o.id} className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-charcoal">{o.title}</p>
                  <p className="text-sm text-charcoal-400 mt-0.5">
                    {o.id} • {o.area} • {o.type}
                  </p>
                </div>
                <span className="px-2 py-1 bg-surface-100 rounded text-xs font-semibold text-charcoal-600">
                  {o.status}
                </span>
              </div>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </Layout>
  );
}
