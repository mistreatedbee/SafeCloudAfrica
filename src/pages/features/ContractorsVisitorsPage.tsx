import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { UsersIcon, ClipboardCheckIcon, FileTextIcon, BadgeCheckIcon, PlusIcon } from 'lucide-react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import { getContractorPortalSummary, listContractors } from '../../api/services/contractorsService';
import { listVisitorQrSessions, listVisitors } from '../../api/services/visitorsService';
import type { Contractor, Visitor } from '../../api/models/entities';
import { ContractorCreateModal } from '../../components/features/ContractorCreateModal';
import { VisitorCreateModal } from '../../components/features/VisitorCreateModal';
import { isSellableFeatureAccessError } from '../../api/services/sellableFeaturesService';
import { SellableFeatureLockedPage } from './SellableFeatureLockedPage';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

export function ContractorsVisitorsPage() {
  const { user } = useUser();
  const { activeCompanyId, activeRole } = useTenant();
  const canManage = activeRole === 'admin' || activeRole === 'manager' || activeRole === 'supervisor' || activeRole === 'consultant';
  const [refreshKey, setRefreshKey] = useState(0);
  const [contractorOpen, setContractorOpen] = useState(false);
  const [visitorOpen, setVisitorOpen] = useState(false);

  const { data: contractors, error: contractorsError } = useAsync<Contractor[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listContractors(activeCompanyId);
    },
    [activeCompanyId, refreshKey]
  );
  const { data: visitors, error: visitorsError } = useAsync<Visitor[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listVisitors(activeCompanyId);
    },
    [activeCompanyId, refreshKey]
  );
  const { data: contractorSummary } = useAsync(
    async () => {
      if (!activeCompanyId) return null;
      return getContractorPortalSummary(activeCompanyId);
    },
    [activeCompanyId, refreshKey]
  );
  const { data: qrSessions } = useAsync(
    async () => {
      if (!activeCompanyId) return [];
      return listVisitorQrSessions(activeCompanyId);
    },
    [activeCompanyId, refreshKey]
  );

  const contractorRows = useMemo(
    () =>
      (contractors ?? []).map((c) => ({
        id: `CTR-${String(c.id).slice(0, 6)}`,
        name: c.name,
        status: c.status === 'approved' ? 'Approved' : c.status === 'suspended' ? 'Suspended' : 'Pending',
        documents: c.documents_count ?? 0,
        inductions: c.inductions_count ?? 0
      })),
    [contractors]
  );
  const visitorRows = useMemo(
    () =>
      (visitors ?? []).map((v) => ({
        id: `VST-${String(v.id).slice(0, 6)}`,
        name: v.name,
        status: v.status === 'checked_in' ? 'Checked-in' : v.status === 'checked_out' ? 'Checked-out' : 'Scheduled',
        briefing: v.briefing === 'completed' ? 'Completed' : 'Pending'
      })),
    [visitors]
  );

  if (
    (isSellableFeatureAccessError(contractorsError) && contractorsError.code === 'FEATURE_LOCKED') ||
    (isSellableFeatureAccessError(visitorsError) && visitorsError.code === 'FEATURE_LOCKED')
  ) {
    return <SellableFeatureLockedPage featureKey="contractorsVisitors" />;
  }

  return (
    <Layout title="Contractor & Visitor Safety Control">
      {activeCompanyId && user?.id && (
        <>
          <ContractorCreateModal
            open={contractorOpen}
            onClose={() => setContractorOpen(false)}
            companyId={activeCompanyId}
            createdByUserId={user.id}
            onCreated={() => setRefreshKey((k) => k + 1)}
          />
          <VisitorCreateModal
            open={visitorOpen}
            onClose={() => setVisitorOpen(false)}
            companyId={activeCompanyId}
            createdByUserId={user.id}
            onCreated={() => setRefreshKey((k) => k + 1)}
          />
        </>
      )}
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
        <motion.div variants={itemVariants} className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
          <h2 className="text-lg font-semibold text-charcoal flex items-center gap-2">
            <UsersIcon className="w-5 h-5 text-teal" />
            Contractor and visitor control (sellable module)
          </h2>
          <p className="text-sm text-charcoal-500 mt-2">
            Track contractors and visitors per company, with onboarding readiness and basic status tracking.
          </p>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg bg-surface-50 px-3 py-2">
              <p className="text-charcoal-500">Pending documents</p>
              <p className="text-xl font-semibold text-charcoal">{contractorSummary?.pendingDocuments ?? 0}</p>
            </div>
            <div className="rounded-lg bg-surface-50 px-3 py-2">
              <p className="text-charcoal-500">Completed inductions</p>
              <p className="text-xl font-semibold text-charcoal">{contractorSummary?.completedInductions ?? 0}</p>
            </div>
            <div className="rounded-lg bg-surface-50 px-3 py-2">
              <p className="text-charcoal-500">QR sessions</p>
              <p className="text-xl font-semibold text-charcoal">{qrSessions?.length ?? 0}</p>
            </div>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
              <h3 className="font-semibold text-charcoal flex items-center gap-2">
                <FileTextIcon className="w-5 h-5 text-teal" />
                Contractors
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-sm text-charcoal-400">{contractorRows.length}</span>
                <button
                  type="button"
                  disabled={!canManage}
                  onClick={() => setContractorOpen(true)}
                  className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-400 hover:text-teal transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Add contractor"
                >
                  <PlusIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="divide-y divide-surface-100">
              {contractorRows.length === 0 && (
                <div className="px-5 py-4">
                  <p className="text-sm text-charcoal-500">No contractors yet.</p>
                </div>
              )}
              {contractorRows.map((c) => (
                <div key={c.id} className="px-5 py-4 hover:bg-surface-50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-charcoal">{c.name}</p>
                      <p className="text-sm text-charcoal-400 mt-0.5">{c.id}</p>
                      <p className="text-sm text-charcoal-500 mt-2">
                        Docs: {c.documents} • Inductions: {c.inductions}
                      </p>
                    </div>
                    <span className="px-2 py-1 bg-surface-100 rounded text-xs font-semibold text-charcoal-600">
                      {c.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
              <h3 className="font-semibold text-charcoal flex items-center gap-2">
                <ClipboardCheckIcon className="w-5 h-5 text-teal" />
                Visitors
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-sm text-charcoal-400">{visitorRows.length}</span>
                <button
                  type="button"
                  disabled={!canManage}
                  onClick={() => setVisitorOpen(true)}
                  className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-400 hover:text-teal transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Add visitor"
                >
                  <PlusIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="divide-y divide-surface-100">
              {visitorRows.length === 0 && (
                <div className="px-5 py-4">
                  <p className="text-sm text-charcoal-500">No visitors yet.</p>
                </div>
              )}
              {visitorRows.map((v) => (
                <div key={v.id} className="px-5 py-4 hover:bg-surface-50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-charcoal">{v.name}</p>
                      <p className="text-sm text-charcoal-400 mt-0.5">{v.id}</p>
                      <p className="text-sm text-charcoal-500 mt-2">
                        Status: {v.status} • Briefing: {v.briefing}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-surface-100 rounded text-xs font-semibold text-charcoal-600">
                      <BadgeCheckIcon className="w-4 h-4 text-success" />
                      Demo
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </Layout>
  );
}
