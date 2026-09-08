import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { PackageIcon, WrenchIcon, ClipboardCheckIcon, UserCheckIcon, PlusIcon, SearchIcon } from 'lucide-react';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import { getAssetManagementSummary, listAssets } from '../../api/services/assetManagementService';
import type { Asset } from '../../api/models/entities';
import { AssetCreateModal } from '../../components/features/AssetCreateModal';
import { isSellableFeatureAccessError } from '../../api/services/sellableFeaturesService';
import { SellableFeatureLockedPage } from './SellableFeatureLockedPage';
import { ListEmptyState } from '../../components/ui/ListEmptyState';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};
const itemVariants = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } };

function formatStatus(status: Asset['status']): string {
  if (status === 'under_maintenance') return 'Under maintenance';
  if (status === 'disposed') return 'Disposed';
  if (status === 'inactive') return 'Inactive';
  return 'Active';
}

export function AssetManagementPage() {
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

  const { data, error, loading } = useAsync<Asset[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listAssets(activeCompanyId);
    },
    [activeCompanyId, refreshKey]
  );
  const { data: summary } = useAsync(
    async () => {
      if (!activeCompanyId) return null;
      return getAssetManagementSummary(activeCompanyId);
    },
    [activeCompanyId, refreshKey]
  );

  const rows = useMemo(() => {
    const list = (data ?? []).map((asset) => ({
      id: asset.asset_tag || `AST-${String(asset.id).slice(0, 6)}`,
      name: asset.name,
      category: asset.category ?? '—',
      location: asset.location ?? '—',
      status: formatStatus(asset.status),
      maintenanceDue: asset.maintenance_due_date ?? '—',
      inspectionDue: asset.inspection_due_date ?? '—'
    }));
    const query = q.trim().toLowerCase();
    if (!query) return list;
    return list.filter(
      (row) =>
        row.name.toLowerCase().includes(query) ||
        row.id.toLowerCase().includes(query) ||
        row.category.toLowerCase().includes(query) ||
        row.location.toLowerCase().includes(query)
    );
  }, [data, q]);

  if (isSellableFeatureAccessError(error) && error.code === 'FEATURE_LOCKED') {
    return <SellableFeatureLockedPage featureKey="assetManagement" />;
  }

  return (
    <Layout title="Asset Management">
      {activeCompanyId && user?.id && (
        <AssetCreateModal
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
            <h1 className="text-2xl font-bold text-charcoal">Asset Management</h1>
            <p className="text-sm text-charcoal-500 mt-1">Track assets, maintenance, inspections, and assignments.</p>
          </div>
          <button
            type="button"
            disabled={!canManage}
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PlusIcon className="w-4 h-4" />
            Add asset
          </button>
        </motion.div>

        <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500 flex items-center gap-2">
              <PackageIcon className="w-4 h-4 text-teal" />
              Total Assets
            </p>
            <p className="text-2xl font-bold text-charcoal mt-1">{summary?.total ?? 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500 flex items-center gap-2">
              <WrenchIcon className="w-4 h-4 text-warning" />
              Maintenance Due
            </p>
            <p className="text-2xl font-bold text-charcoal mt-1">{summary?.maintenanceDue ?? 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500 flex items-center gap-2">
              <ClipboardCheckIcon className="w-4 h-4 text-teal" />
              Inspections Due
            </p>
            <p className="text-2xl font-bold text-charcoal mt-1">{summary?.inspectionsDue ?? 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500 flex items-center gap-2">
              <UserCheckIcon className="w-4 h-4 text-success" />
              Assigned Assets
            </p>
            <p className="text-2xl font-bold text-charcoal mt-1">{summary?.assigned ?? 0}</p>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="font-semibold text-charcoal">Assets</h2>
            <div className="relative w-full sm:w-72">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-400" />
              <input
                type="search"
                placeholder="Search assets..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-8 text-sm text-charcoal-500">Loading assets...</div>
            ) : rows.length === 0 ? (
              <div className="p-4">
                <ListEmptyState
                  embedded
                  icon={PackageIcon}
                  title={q.trim() ? 'No matching assets' : 'No assets registered yet'}
                  description={
                    q.trim()
                      ? 'Try a different search term or clear the filter.'
                      : 'Add your first asset to start tracking maintenance, inspections, and assignments.'
                  }
                  primaryAction={{
                    kind: 'button',
                    label: q.trim() ? 'Clear search' : 'Add asset',
                    onClick: () => (q.trim() ? setQ('') : setCreateOpen(true))
                  }}
                />
              </div>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-surface-50 text-charcoal-500">
                  <tr>
                    <th className="px-5 py-3 text-left font-medium">Tag</th>
                    <th className="px-5 py-3 text-left font-medium">Name</th>
                    <th className="px-5 py-3 text-left font-medium">Category</th>
                    <th className="px-5 py-3 text-left font-medium">Location</th>
                    <th className="px-5 py-3 text-left font-medium">Status</th>
                    <th className="px-5 py-3 text-left font-medium">Maintenance due</th>
                    <th className="px-5 py-3 text-left font-medium">Inspection due</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id + row.name} className="border-t border-surface-200">
                      <td className="px-5 py-3 font-medium text-charcoal">{row.id}</td>
                      <td className="px-5 py-3 text-charcoal">{row.name}</td>
                      <td className="px-5 py-3 text-charcoal-600">{row.category}</td>
                      <td className="px-5 py-3 text-charcoal-600">{row.location}</td>
                      <td className="px-5 py-3 text-charcoal-600">{row.status}</td>
                      <td className="px-5 py-3 text-charcoal-600">{row.maintenanceDue}</td>
                      <td className="px-5 py-3 text-charcoal-600">{row.inspectionDue}</td>
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
