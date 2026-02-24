import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { PackageIcon, WrenchIcon, ClipboardCheckIcon, UserCheckIcon, PlusIcon, SearchIcon } from 'lucide-react';
import { Layout } from '../../components/layout/Layout';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};
const itemVariants = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } };

const seedRows = [
  { id: 'AST-0001', asset: 'Forklift', status: 'In service', location: 'Main warehouse', assignedTo: 'N/A' },
  { id: 'AST-0002', asset: 'Compressor', status: 'Inspection due', location: 'Plant room', assignedTo: 'N/A' },
  { id: 'AST-0003', asset: 'Generator', status: 'Maintenance due', location: 'Yard', assignedTo: 'N/A' }
];

export function AssetManagementPage() {
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return seedRows;
    return seedRows.filter((row) =>
      [row.id, row.asset, row.status, row.location, row.assignedTo].join(' ').toLowerCase().includes(qq)
    );
  }, [q]);

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
            Add Asset
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
            <table className="w-full min-w-[720px]">
              <thead className="bg-surface-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Asset ID</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Asset</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Status</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Location</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Assigned To</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-surface-50">
                    <td className="px-5 py-3 text-sm text-charcoal-600">{row.id}</td>
                    <td className="px-5 py-3 text-sm text-charcoal">{row.asset}</td>
                    <td className="px-5 py-3 text-sm text-charcoal-600">{row.status}</td>
                    <td className="px-5 py-3 text-sm text-charcoal-600">{row.location}</td>
                    <td className="px-5 py-3 text-sm text-charcoal-600">{row.assignedTo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </motion.div>
    </Layout>
  );
}
