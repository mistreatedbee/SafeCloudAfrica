import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { HardHatIcon, PlusIcon } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import {
  listPpeIssues,
  listPpeItems,
  listPpeReorderRequests,
  listPpeStock
} from '../api/services/ppeService';
import type {
  Department,
  PPEIssue,
  PPEItem,
  PpeReorderRequest,
  PpeStock,
  Site
} from '../api/models/entities';
import { useUser } from '@insforge/react';
import { PpeIssueModal } from '../components/ppe/PpeIssueModal';
import { PpeItemCreateModal } from '../components/ppe/PpeItemCreateModal';
import { listSites } from '../api/services/sitesService';
import { listDepartments } from '../api/services/departmentsService';
import { PpeStockCreateModal } from '../components/ppe/PpeStockCreateModal';
import { PpeStockDetailModal } from '../components/ppe/PpeStockDetailModal';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

export function PPEPage() {
  const { user } = useUser();
  const { activeCompanyId, activeRole } = useTenant();
  const canManage = activeRole === 'admin' || activeRole === 'manager' || activeRole === 'supervisor' || activeRole === 'consultant';
  const [activeTab, setActiveTab] = useState<'issues' | 'inventory'>('issues');
  const [issueOpen, setIssueOpen] = useState(false);
  const [createItemOpen, setCreateItemOpen] = useState(false);
  const [stockCreateOpen, setStockCreateOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState<PpeStock | null>(null);
  const [stockDetailOpen, setStockDetailOpen] = useState(false);
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

  const { data: stocks, loading: stocksLoading, error: stocksError } = useAsync<PpeStock[]>(
    async () => {
      if (!activeCompanyId || activeTab !== 'inventory') return [];
      return await listPpeStock({ companyId: activeCompanyId });
    },
    [activeCompanyId, activeTab, refreshKey]
  );

  const { data: reorderRequests } = useAsync<PpeReorderRequest[]>(
    async () => {
      if (!activeCompanyId || activeTab !== 'inventory') return [];
      return await listPpeReorderRequests({ companyId: activeCompanyId });
    },
    [activeCompanyId, activeTab, refreshKey]
  );

  const { data: sites } = useAsync<Site[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listSites(activeCompanyId);
    },
    [activeCompanyId]
  );

  const { data: departments } = useAsync<Department[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listDepartments(activeCompanyId);
    },
    [activeCompanyId]
  );

  const itemById = useMemo(() => new Map((items ?? []).map((i) => [i.id, i])), [items]);
  const siteById = useMemo(() => new Map((sites ?? []).map((s) => [s.id, s])), [sites]);
  const departmentById = useMemo(
    () => new Map((departments ?? []).map((d) => [d.id, d])),
    [departments]
  );

  const issueRows = (issues ?? []).map((i) => {
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

  const stockRows = (stocks ?? []).map((s) => {
    const item = itemById.get(s.ppe_item_id);
    const site = s.site_id ? siteById.get(s.site_id) : null;
    const dept = s.department_id ? departmentById.get(s.department_id) : null;
    const status =
      s.on_hand_qty === 0
        ? 'Out of stock'
        : s.reorder_level > 0 && s.on_hand_qty <= s.reorder_level
        ? 'Low'
        : 'OK';
    const statusClass =
      status === 'Out of stock'
        ? 'bg-critical/10 text-critical'
        : status === 'Low'
        ? 'bg-warning/10 text-warning'
        : 'bg-teal/10 text-teal';

    return {
      raw: s,
      id: `STK-${String(s.id).slice(0, 8)}`,
      itemName: item?.name ?? `Item ${String(s.ppe_item_id).slice(0, 8)}`,
      siteName: site?.name ?? '—',
      departmentName: dept?.name ?? '—',
      onHand: s.on_hand_qty,
      reserved: s.reserved_qty,
      reorderLevel: s.reorder_level,
      reorderQty: s.reorder_qty,
      status,
      statusClass
    };
  });

  const openReorderCount = (reorderRequests ?? []).filter(
    (r) => r.status !== 'received' && r.status !== 'rejected'
  ).length;

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
          <PpeStockCreateModal
            open={stockCreateOpen}
            onClose={() => setStockCreateOpen(false)}
            companyId={activeCompanyId}
            createdByUserId={user.id}
            items={items ?? []}
            sites={sites ?? []}
            departments={departments ?? []}
            onCreated={() => setRefreshKey((k) => k + 1)}
          />
          {selectedStock && (
            <PpeStockDetailModal
              open={stockDetailOpen}
              onClose={() => {
                setStockDetailOpen(false);
                setSelectedStock(null);
              }}
              companyId={activeCompanyId}
              actorUserId={user.id}
              stock={selectedStock}
              item={itemById.get(selectedStock.ppe_item_id)}
              siteName={selectedStock.site_id ? siteById.get(selectedStock.site_id)?.name ?? null : null}
              departmentName={
                selectedStock.department_id
                  ? departmentById.get(selectedStock.department_id)?.name ?? null
                  : null
              }
              onChanged={() => setRefreshKey((k) => k + 1)}
            />
          )}
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
            <button
              type="button"
              disabled={!canManage || (items ?? []).length === 0}
              onClick={() => setStockCreateOpen(true)}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <PlusIcon className="w-4 h-4" />
              Add Stock
            </button>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="flex items-center justify-between border-b border-surface-200 pb-2">
          <div className="flex items-center gap-4 text-sm">
            <button
              type="button"
              onClick={() => setActiveTab('issues')}
              className={`pb-1 border-b-2 ${
                activeTab === 'issues'
                  ? 'border-teal text-teal font-semibold'
                  : 'border-transparent text-charcoal-500'
              }`}
            >
              Issues
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('inventory')}
              className={`pb-1 border-b-2 ${
                activeTab === 'inventory'
                  ? 'border-teal text-teal font-semibold'
                  : 'border-transparent text-charcoal-500'
              }`}
            >
              Inventory &amp; Reorders
            </button>
          </div>
          {activeTab === 'inventory' && (
            <div className="text-xs text-charcoal-500">
              {openReorderCount > 0
                ? `${openReorderCount} open reorder ${openReorderCount === 1 ? 'request' : 'requests'}`
                : 'No open reorder requests'}
            </div>
          )}
        </motion.div>

        {activeTab === 'issues' && (
          <>
            {!loading && !error && (items ?? []).length === 0 && (
              <motion.div
                variants={itemVariants}
                className="bg-white rounded-xl border border-warning/30 p-4 shadow-card"
              >
                <p className="text-sm font-semibold text-warning">No PPE items set up yet</p>
                <p className="text-sm text-charcoal-500 mt-1">
                  Add at least one PPE item, then issue it to an employee.
                </p>
              </motion.div>
            )}

            <motion.div
              variants={itemVariants}
              className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
                <h3 className="font-semibold text-charcoal">PPE Register</h3>
                <span className="text-sm text-charcoal-400">{issueRows.length} issues</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface-50">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                        ID
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                        Item
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                        Issued To
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                        Next Issue
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                        Return Date
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                        Cost
                      </th>
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
                    {!loading && !error && issueRows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-5 py-4 text-sm text-charcoal-500">
                          No PPE issues yet.
                        </td>
                      </tr>
                    )}
                    {issueRows.map((row) => (
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
          </>
        )}

        {activeTab === 'inventory' && (
          <motion.div
            variants={itemVariants}
            className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
              <h3 className="font-semibold text-charcoal">PPE Inventory</h3>
              <span className="text-sm text-charcoal-400">
                {stockRows.length} stock {stockRows.length === 1 ? 'record' : 'records'}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface-50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                      Item
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                      Site
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                      Department
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                      On hand
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                      Reserved
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                      Reorder level
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                      Reorder qty
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {stocksLoading && (
                    <tr>
                      <td colSpan={10} className="px-5 py-4 text-sm text-charcoal-500">
                        Loading inventory…
                      </td>
                    </tr>
                  )}
                  {stocksError && (
                    <tr>
                      <td colSpan={10} className="px-5 py-4 text-sm text-critical">
                        {stocksError.message}
                      </td>
                    </tr>
                  )}
                  {!stocksLoading && !stocksError && stockRows.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-5 py-4 text-sm text-charcoal-500">
                        No PPE stock records yet. Use &quot;Add Stock&quot; to create one.
                      </td>
                    </tr>
                  )}
                  {stockRows.map((row) => (
                    <tr key={row.id} className="hover:bg-surface-50 transition-colors">
                      <td className="px-5 py-4 text-sm font-medium text-teal">{row.id}</td>
                      <td className="px-5 py-4 text-sm text-charcoal">{row.itemName}</td>
                      <td className="px-5 py-4 text-sm text-charcoal-500">{row.siteName}</td>
                      <td className="px-5 py-4 text-sm text-charcoal-500">{row.departmentName}</td>
                      <td className="px-5 py-4 text-sm text-charcoal-500">{row.onHand}</td>
                      <td className="px-5 py-4 text-sm text-charcoal-500">{row.reserved}</td>
                      <td className="px-5 py-4 text-sm text-charcoal-500">{row.reorderLevel}</td>
                      <td className="px-5 py-4 text-sm text-charcoal-500">{row.reorderQty}</td>
                      <td className="px-5 py-4 text-sm">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${row.statusClass}`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-right">
                        <button
                          type="button"
                          className="px-3 py-1.5 rounded-lg border border-surface-300 text-xs font-medium text-charcoal hover:bg-surface-50"
                          onClick={() => {
                            setSelectedStock(row.raw);
                            setStockDetailOpen(true);
                          }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </motion.div>
    </Layout>
  );
}

