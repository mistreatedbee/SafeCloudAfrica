import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { FlaskConicalIcon, ShieldCheckIcon, FileTextIcon, AlertTriangleIcon, PlusIcon, SearchIcon } from 'lucide-react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import { getHazardousChemicalSummary, listHazardousChemicals } from '../../api/services/hazardousChemicalsService';
import type { HazardousChemical } from '../../api/models/entities';
import { HazardousChemicalCreateModal } from '../../components/features/HazardousChemicalCreateModal';
import { isSellableFeatureAccessError } from '../../api/services/sellableFeaturesService';
import { SellableFeatureLockedPage } from './SellableFeatureLockedPage';
import { ListEmptyState } from '../../components/ui/ListEmptyState';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};
const itemVariants = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } };

function formatSdsStatus(status: HazardousChemical['sds_status']): string {
  if (status === 'on_file') return 'On file';
  if (status === 'expired') return 'Expired';
  return 'Missing';
}

function formatApprovalStatus(status: HazardousChemical['approval_status']): string {
  if (status === 'approved') return 'Approved';
  if (status === 'restricted') return 'Restricted';
  return 'Pending';
}

export function HazardousChemicalManagementPage() {
  const [q, setQ] = useState('');
  const { user } = useUser();
  const { activeCompanyId, activeRole } = useTenant();
  const canManage =
    activeRole === 'owner' ||
    activeRole === 'admin' ||
    activeRole === 'manager' ||
    activeRole === 'supervisor' ||
    activeRole === 'consultant';
  const [createOpen, setCreateOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, error, loading } = useAsync<HazardousChemical[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listHazardousChemicals(activeCompanyId);
    },
    [activeCompanyId, refreshKey]
  );
  const { data: summary } = useAsync(
    async () => {
      if (!activeCompanyId) return null;
      return getHazardousChemicalSummary(activeCompanyId);
    },
    [activeCompanyId, refreshKey]
  );

  const rows = useMemo(() => {
    const list = (data ?? []).map((chemical) => ({
      id: `CHM-${String(chemical.id).slice(0, 6)}`,
      name: chemical.chemical_name,
      casNumber: chemical.cas_number ?? '—',
      storage: chemical.storage_location ?? '—',
      quantity: chemical.quantity ?? '—',
      sds: formatSdsStatus(chemical.sds_status),
      approval: formatApprovalStatus(chemical.approval_status)
    }));
    const query = q.trim().toLowerCase();
    if (!query) return list;
    return list.filter(
      (row) =>
        row.name.toLowerCase().includes(query) ||
        row.id.toLowerCase().includes(query) ||
        row.casNumber.toLowerCase().includes(query) ||
        row.storage.toLowerCase().includes(query)
    );
  }, [data, q]);

  if (isSellableFeatureAccessError(error) && error.code === 'FEATURE_LOCKED') {
    return <SellableFeatureLockedPage featureKey="hazardousChemicals" />;
  }

  return (
    <Layout title="Hazardous Chemical Management">
      {activeCompanyId && user?.id && (
        <HazardousChemicalCreateModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          companyId={activeCompanyId}
          createdByUserId={user.id}
          onCreated={() => setRefreshKey((k) => k + 1)}
        />
      )}
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
        <motion.div variants={itemVariants} className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-charcoal">Hazardous Chemical Management</h1>
            <p className="text-sm text-charcoal-500 mt-1">
              Manage chemical register, SDS, storage locations, approvals, and compliance evidence.
            </p>
          </div>
          <button
            type="button"
            disabled={!canManage}
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PlusIcon className="w-4 h-4" />
            Add chemical
          </button>
        </motion.div>

        <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500 flex items-center gap-2">
              <FlaskConicalIcon className="w-4 h-4 text-teal" />
              Chemicals Registered
            </p>
            <p className="text-2xl font-bold text-charcoal mt-1">{summary?.registered ?? 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500 flex items-center gap-2">
              <FileTextIcon className="w-4 h-4 text-warning" />
              SDS On File
            </p>
            <p className="text-2xl font-bold text-charcoal mt-1">{summary?.sdsOnFile ?? 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500 flex items-center gap-2">
              <ShieldCheckIcon className="w-4 h-4 text-success" />
              Approved Chemicals
            </p>
            <p className="text-2xl font-bold text-charcoal mt-1">{summary?.approved ?? 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500 flex items-center gap-2">
              <AlertTriangleIcon className="w-4 h-4 text-critical" />
              Compliance Gaps
            </p>
            <p className="text-2xl font-bold text-charcoal mt-1">{summary?.complianceGaps ?? 0}</p>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="font-semibold text-charcoal">Chemical Register</h2>
            <div className="relative w-full sm:w-72">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-400" />
              <input
                type="search"
                placeholder="Search chemicals..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-8 text-sm text-charcoal-500">Loading chemical register...</div>
            ) : rows.length === 0 ? (
              <div className="p-4">
                <ListEmptyState
                  embedded
                  icon={FlaskConicalIcon}
                  title={q.trim() ? 'No matching chemicals' : 'No chemicals registered yet'}
                  description={
                    q.trim()
                      ? 'Try a different search term or clear the filter.'
                      : 'Add chemicals to track SDS status, storage, and approval readiness.'
                  }
                  primaryAction={{
                    kind: 'button',
                    label: q.trim() ? 'Clear search' : 'Add chemical',
                    onClick: () => (q.trim() ? setQ('') : setCreateOpen(true))
                  }}
                />
              </div>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-surface-50 text-charcoal-500">
                  <tr>
                    <th className="px-5 py-3 text-left font-medium">Ref</th>
                    <th className="px-5 py-3 text-left font-medium">Chemical</th>
                    <th className="px-5 py-3 text-left font-medium">CAS</th>
                    <th className="px-5 py-3 text-left font-medium">Storage</th>
                    <th className="px-5 py-3 text-left font-medium">Quantity</th>
                    <th className="px-5 py-3 text-left font-medium">SDS</th>
                    <th className="px-5 py-3 text-left font-medium">Approval</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id + row.name} className="border-t border-surface-200">
                      <td className="px-5 py-3 font-medium text-charcoal">{row.id}</td>
                      <td className="px-5 py-3 text-charcoal">{row.name}</td>
                      <td className="px-5 py-3 text-charcoal-600">{row.casNumber}</td>
                      <td className="px-5 py-3 text-charcoal-600">{row.storage}</td>
                      <td className="px-5 py-3 text-charcoal-600">{row.quantity}</td>
                      <td className="px-5 py-3 text-charcoal-600">{row.sds}</td>
                      <td className="px-5 py-3 text-charcoal-600">{row.approval}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </motion.div>
      </motion.div>
    </Layout>
  );
}
