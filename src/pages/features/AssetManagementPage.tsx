import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { PackageIcon, WrenchIcon, ClipboardCheckIcon, UserCheckIcon, PlusIcon, SearchIcon } from 'lucide-react';
import { Layout } from '../../components/layout/Layout';
import { ListEmptyState } from '../../components/ui/ListEmptyState';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};
const itemVariants = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } };

export function AssetManagementPage() {
  const [q, setQ] = useState('');

  const hasSearch = useMemo(() => q.trim().length > 0, [q]);

  return (
    <Layout title="Asset Management">
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
        <motion.div variants={itemVariants} className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-charcoal">Asset Management</h1>
            <p className="text-sm text-charcoal-500 mt-1">Track assets, maintenance, inspections, and assignments.</p>
          </div>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Live Sync Pending
          </button>
        </motion.div>

        <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500 flex items-center gap-2"><PackageIcon className="w-4 h-4 text-teal" />Total Assets</p>
            <p className="text-2xl font-bold text-charcoal mt-1">0</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500 flex items-center gap-2"><WrenchIcon className="w-4 h-4 text-warning" />Maintenance Due</p>
            <p className="text-2xl font-bold text-charcoal mt-1">0</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500 flex items-center gap-2"><ClipboardCheckIcon className="w-4 h-4 text-teal" />Inspections Due</p>
            <p className="text-2xl font-bold text-charcoal mt-1">0</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500 flex items-center gap-2"><UserCheckIcon className="w-4 h-4 text-success" />Assigned Assets</p>
            <p className="text-2xl font-bold text-charcoal mt-1">0</p>
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
            <div className="p-4">
              <ListEmptyState
                embedded
                icon={PackageIcon}
                title={hasSearch ? 'No matching live assets' : 'No live asset records yet'}
                description="This page no longer shows seed data. Live asset, maintenance, and assignment records will appear here once the backend asset register is connected."
                primaryAction={{
                  kind: 'button',
                  label: hasSearch ? 'Clear Search' : 'Refresh View',
                  onClick: () => setQ('')
                }}
              />
            </div>
          </div>
        </motion.div>
      </motion.div>
    </Layout>
  );
}
