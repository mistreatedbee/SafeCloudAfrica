import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { FlaskConicalIcon, ShieldCheckIcon, FileTextIcon, AlertTriangleIcon, PlusIcon, SearchIcon } from 'lucide-react';
import { Layout } from '../../components/layout/Layout';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};
const itemVariants = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } };

const seedRows = [
  { id: 'CHEM-0001', chemical: 'Sulfuric Acid', sds: 'Pending', storage: 'Store A', approval: 'Pending' },
  { id: 'CHEM-0002', chemical: 'Acetone', sds: 'Available', storage: 'Store B', approval: 'Approved' },
  { id: 'CHEM-0003', chemical: 'Diesel', sds: 'Available', storage: 'Tank Yard', approval: 'Approved' }
];

export function HazardousChemicalManagementPage() {
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return seedRows;
    return seedRows.filter((row) =>
      [row.id, row.chemical, row.sds, row.storage, row.approval].join(' ').toLowerCase().includes(qq)
    );
  }, [q]);

  return (
    <Layout title="Hazardous Chemical Management">
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
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Add Chemical
          </button>
        </motion.div>

        <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500 flex items-center gap-2"><FlaskConicalIcon className="w-4 h-4 text-teal" />Chemicals Registered</p>
            <p className="text-2xl font-bold text-charcoal mt-1">0</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500 flex items-center gap-2"><FileTextIcon className="w-4 h-4 text-warning" />SDS On File</p>
            <p className="text-2xl font-bold text-charcoal mt-1">0</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500 flex items-center gap-2"><ShieldCheckIcon className="w-4 h-4 text-success" />Approved Chemicals</p>
            <p className="text-2xl font-bold text-charcoal mt-1">0</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
            <p className="text-sm text-charcoal-500 flex items-center gap-2"><AlertTriangleIcon className="w-4 h-4 text-critical" />Compliance Gaps</p>
            <p className="text-2xl font-bold text-charcoal mt-1">0</p>
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
            <table className="w-full min-w-[720px]">
              <thead className="bg-surface-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Chemical ID</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Chemical</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">SDS</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Storage</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Approval</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-surface-50">
                    <td className="px-5 py-3 text-sm text-charcoal-600">{row.id}</td>
                    <td className="px-5 py-3 text-sm text-charcoal">{row.chemical}</td>
                    <td className="px-5 py-3 text-sm text-charcoal-600">{row.sds}</td>
                    <td className="px-5 py-3 text-sm text-charcoal-600">{row.storage}</td>
                    <td className="px-5 py-3 text-sm text-charcoal-600">{row.approval}</td>
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
