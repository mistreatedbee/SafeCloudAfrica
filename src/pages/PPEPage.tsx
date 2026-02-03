import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { HardHatIcon, PlusIcon } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import { listPpeIssues, listPpeItems } from '../api/services/ppeService';
import type { PPEIssue, PPEItem } from '../api/models/entities';
import { useUser } from '@insforge/react';
import { PpeIssueModal } from '../components/ppe/PpeIssueModal';
import { PpeItemCreateModal } from '../components/ppe/PpeItemCreateModal';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

export function PPEPage() {
  const { user } = useUser();
  const { activeCompanyId, activeRole } = useTenant();
  const canManage = activeRole === 'admin' || activeRole === 'manager' || activeRole === 'supervisor' || activeRole === 'consultant';
  const [issueOpen, setIssueOpen] = useState(false);
  const [createItemOpen, setCreateItemOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: issues, loading, error } = useAsync<PPEIssue[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listPpeIssues(activeCompanyId, 500);
    },
    [activeCompanyId, refreshKey]
  );
  const { data: items } = useAsync<PPEItem[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listPpeItems(activeCompanyId);
    },
    [activeCompanyId, refreshKey]
  );

  const itemById = useMemo(() => new Map((items ?? []).map((i) => [i.id, i])), [items]);
  const rows = (issues ?? []).map((i) => {
    const item = itemById.get(i.ppe_item_id);
    return {
      id: `PPE-${String(i.id).slice(0, 8)}`,
      item: item?.name ?? `Item ${String(i.ppe_item_id).slice(0, 8)}`,
      issuedTo: i.issued_to_user_id ? `User ${String(i.issued_to_user_id).slice(0, 8)}` : '—',
      nextIssue: i.next_issue_at ? new Date(i.next_issue_at).toLocaleDateString('en-ZA') : '—',
      returnDate: i.returned_at ? new Date(i.returned_at).toLocaleDateString('en-ZA') : '—',
      cost: item?.unit_cost != null ? `R ${Number(item.unit_cost).toFixed(0)}` : '—'
    };
  });

  return (
    <Layout title="PPE Management">
      {activeCompanyId && user?.id && (
        <>
          <PpeIssueModal
            open={issueOpen}
            onClose={() => setIssueOpen(false)}
            companyId={activeCompanyId}
            issuedByUserId={user.id}
            items={items ?? []}
            onIssued={() => setRefreshKey((k) => k + 1)}
          />
          <PpeItemCreateModal
            open={createItemOpen}
            onClose={() => setCreateItemOpen(false)}
            companyId={activeCompanyId}
            onCreated={() => setRefreshKey((k) => k + 1)}
          />
        </>
      )}
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
        <motion.div variants={itemVariants} className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-navy-50 rounded-xl">
              <HardHatIcon className="w-6 h-6 text-navy" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-charcoal">PPE issuing, returns, and cost tracking</h2>
              <p className="text-sm text-charcoal-400">Company PPE register and issue history</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!canManage}
              onClick={() => setCreateItemOpen(true)}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-surface-300 text-charcoal rounded-lg text-sm font-medium hover:bg-surface-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <PlusIcon className="w-4 h-4" />
              Add PPE item
            </button>
            <button
              type="button"
              disabled={!canManage || (items ?? []).length === 0}
              onClick={() => setIssueOpen(true)}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-navy text-white rounded-lg text-sm font-medium hover:bg-navy-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <PlusIcon className="w-4 h-4" />
              Issue PPE
            </button>
          </div>
        </motion.div>

        {!loading && !error && (items ?? []).length === 0 && (
          <motion.div variants={itemVariants} className="bg-white rounded-xl border border-warning/30 p-4 shadow-card">
            <p className="text-sm font-semibold text-warning">No PPE items set up yet</p>
            <p className="text-sm text-charcoal-500 mt-1">
              Add at least one PPE item, then issue it to an employee.
            </p>
          </motion.div>
        )}

        <motion.div variants={itemVariants} className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
            <h3 className="font-semibold text-charcoal">PPE Register</h3>
            <span className="text-sm text-charcoal-400">{rows.length} issues</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">ID</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Item</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Issued To</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Next Issue</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Return Date</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-5 py-4 text-sm text-charcoal-500">
                      Loading…
                    </td>
                  </tr>
                )}
                {error && (
                  <tr>
                    <td colSpan={6} className="px-5 py-4 text-sm text-critical">
                      {error.message}
                    </td>
                  </tr>
                )}
                {!loading && !error && rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-4 text-sm text-charcoal-500">
                      No PPE issues yet.
                    </td>
                  </tr>
                )}
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-surface-50 transition-colors">
                    <td className="px-5 py-4 text-sm font-medium text-teal">{row.id}</td>
                    <td className="px-5 py-4 text-sm text-charcoal">{row.item}</td>
                    <td className="px-5 py-4 text-sm text-charcoal-500">{row.issuedTo}</td>
                    <td className="px-5 py-4 text-sm text-charcoal-500">{row.nextIssue}</td>
                    <td className="px-5 py-4 text-sm text-charcoal-500">{row.returnDate}</td>
                    <td className="px-5 py-4 text-sm text-charcoal-500">{row.cost}</td>
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

