import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { SirenIcon, AlertTriangleIcon, PhoneIcon, ClipboardCheckIcon, PlusIcon } from 'lucide-react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import { getEmergencyPreparednessSummary, listEmergencyDrills } from '../../api/services/emergencyDrillsService';
import { listDocuments } from '../../api/services/documentsService';
import type { EmergencyDrill, Document } from '../../api/models/entities';
import { EmergencyDrillCreateModal } from '../../components/features/EmergencyDrillCreateModal';
import { isSellableFeatureAccessError } from '../../api/services/sellableFeaturesService';
import { SellableFeatureLockedPage } from './SellableFeatureLockedPage';
import { ListEmptyState } from '../../components/ui/ListEmptyState';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

export function EmergencyPreparednessPage() {
  const { user } = useUser();
  const { activeCompanyId, activeRole } = useTenant();
  const canManage = activeRole === 'owner' || activeRole === 'admin' || activeRole === 'manager' || activeRole === 'supervisor' || activeRole === 'consultant';
  const [createOpen, setCreateOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: drills, error: drillsError } = useAsync<EmergencyDrill[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listEmergencyDrills(activeCompanyId);
    },
    [activeCompanyId, refreshKey]
  );
  const { data: docs } = useAsync<Document[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listDocuments(activeCompanyId);
    },
    [activeCompanyId]
  );
  const { data: preparednessSummary } = useAsync(
    async () => {
      if (!activeCompanyId) return null;
      return getEmergencyPreparednessSummary(activeCompanyId);
    },
    [activeCompanyId, refreshKey]
  );

  const openDrills = useMemo(() => (drills ?? []).filter((d) => d.status === 'scheduled').length, [drills]);
  const plansUpdated = useMemo(
    () => (docs ?? []).filter((d) => (d.category ?? '').toLowerCase().includes('emergency') || d.title.toLowerCase().includes('emergency')).length,
    [docs]
  );
  const nextReviewDays = useMemo(() => {
    const upcoming = (drills ?? [])
      .filter((d) => d.status === 'scheduled')
      .map((d) => new Date(d.drill_date).getTime())
      .filter((t) => Number.isFinite(t))
      .sort((a, b) => a - b);
    if (upcoming.length === 0) return null;
    const diffMs = upcoming[0] - Date.now();
    const days = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
    return days;
  }, [drills]);

  if (isSellableFeatureAccessError(drillsError) && drillsError.code === 'FEATURE_LOCKED') {
    return <SellableFeatureLockedPage featureKey="emergencyPreparedness" />;
  }

  return (
    <Layout title="Emergency Preparedness & Crisis Response">
      {activeCompanyId && user?.id && (
        <EmergencyDrillCreateModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          companyId={activeCompanyId}
          createdByUserId={user.id}
          onCreated={() => setRefreshKey((k) => k + 1)}
        />
      )}
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
        <motion.div
          variants={itemVariants}
          className="bg-gradient-to-r from-critical to-critical-600 rounded-2xl p-6 text-white"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-xl">
              <SirenIcon className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Emergency Preparedness</h1>
              <p className="text-critical-100">Emergency plans and drill scheduling with live tracking</p>
            </div>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Open drills</p>
            <p className="text-2xl font-bold text-warning mt-1">{openDrills}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Completed drills</p>
            <p className="text-2xl font-bold text-success mt-1">{(drills ?? []).filter((d) => d.status === 'completed').length}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Average score</p>
            <p className="text-2xl font-bold text-charcoal mt-1">{preparednessSummary?.averagePerformanceScore ?? 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Plans updated</p>
            <p className="text-2xl font-bold text-charcoal mt-1">{plansUpdated}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500">Next review</p>
            <p className="text-2xl font-bold text-charcoal mt-1">{nextReviewDays === null ? '—' : `${nextReviewDays}d`}</p>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal flex items-center gap-2">
              <ClipboardCheckIcon className="w-5 h-5 text-teal" />
              Plans & drills
            </h3>
            <p className="text-sm text-charcoal-500 mt-2">
              Schedule drills and keep an up-to-date list of emergency plans stored in Documents.
            </p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal flex items-center gap-2">
              <AlertTriangleIcon className="w-5 h-5 text-warning" />
              Escalations
            </h3>
            <p className="text-sm text-charcoal-500 mt-2">
              Configure escalation preferences and email templates in Settings.
            </p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
            <h3 className="font-semibold text-charcoal flex items-center gap-2">
              <PhoneIcon className="w-5 h-5 text-teal" />
              Escalations
            </h3>
            <p className="text-sm text-charcoal-500 mt-2">
              Planned integration points for WhatsApp/SMS can be configured when enabled.
            </p>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
            <h3 className="font-semibold text-charcoal">Emergency drills</h3>
            <button
              type="button"
              disabled={!canManage}
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-2 px-3 py-2 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <PlusIcon className="w-4 h-4" />
              Schedule
            </button>
          </div>
          <div className="divide-y divide-surface-100">
            {(drills ?? []).length === 0 && (
              <div className="px-3 py-2">
                <ListEmptyState
                  embedded
                  icon={ClipboardCheckIcon}
                  title="No emergency drills scheduled"
                  description="Schedule drills to prove your plans, train responders, and keep compliance evidence ready."
                  primaryAction={
                    canManage
                      ? { kind: 'button', label: 'Schedule drill', onClick: () => setCreateOpen(true) }
                      : { kind: 'link', to: '/documents', label: 'View documents' }
                  }
                />
              </div>
            )}
            {(drills ?? []).map((d) => (
              <div key={d.id} className="px-5 py-4 hover:bg-surface-50 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-charcoal">{d.name}</p>
                    <p className="text-sm text-charcoal-400 mt-0.5">
                      DRL-{String(d.id).slice(0, 6)} • {new Date(d.drill_date).toLocaleDateString('en-ZA')}
                    </p>
                  </div>
                  <span className="px-2 py-1 bg-surface-100 rounded text-xs font-semibold text-charcoal-600">
                    {d.status === 'scheduled' ? 'Scheduled' : d.status === 'completed' ? 'Completed' : 'Cancelled'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </Layout>
  );
}
