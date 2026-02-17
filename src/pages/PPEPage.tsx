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
  listPpeStock,
  type PpeIssuesFilters
} from '../api/services/ppeService';
import {
  listPpeIssueTracker,
  type PpeIssueTrackerFilters
} from '../api/services/ppeIssueTrackerService';
import {
  getPpeCostSummary,
  getPpeUsageSummary,
  getPpeLowStockCount
} from '../api/services/ppeAnalyticsService';
import { getMyProfile } from '../api/services/profilesService';
import {
  exportPpeIssueRegisterCSV,
  exportPpeCostSummaryCSV,
  exportPpeUsageSummaryCSV,
  exportPpeCostSummaryPDF,
  exportPpeUsageSummaryPDF,
  downloadFile
} from '../api/services/exportService';
import type {
  Department,
  PPEIssue,
  PPEItem,
  PpeIssueTracker,
  PpeReorderRequest,
  PpeStock,
  Site
} from '../api/models/entities';
import { useUser } from '@insforge/react';
import { PpeIssueModal } from '../components/ppe/PpeIssueModal';
import { PpeIssueDetailModal } from '../components/ppe/PpeIssueDetailModal';
import { PpeItemCreateModal } from '../components/ppe/PpeItemCreateModal';
import { listSites } from '../api/services/sitesService';
import { listDepartments } from '../api/services/departmentsService';
import { PpeStockCreateModal } from '../components/ppe/PpeStockCreateModal';
import { PpeStockDetailModal } from '../components/ppe/PpeStockDetailModal';
import { PpeIssueTrackerCreateModal } from '../components/ppe/PpeIssueTrackerCreateModal';
import { PpeIssueTrackerDetailModal } from '../components/ppe/PpeIssueTrackerDetailModal';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

export function PPEPage() {
  const { user } = useUser();
  const { activeCompanyId, activeRole } = useTenant();
  const canManage =
    activeRole === 'admin' ||
    activeRole === 'manager' ||
    activeRole === 'supervisor' ||
    activeRole === 'consultant';
  const canManagerSignoff = activeRole === 'admin' || activeRole === 'manager';
  const canSafetyVerify =
    activeRole === 'admin' || activeRole === 'supervisor' || activeRole === 'consultant';
  const canAuditorConfirm = activeRole === 'auditor';
  const [activeTab, setActiveTab] = useState<'dashboard' | 'tracker' | 'register' | 'inventory'>('dashboard');
  const [issueOpen, setIssueOpen] = useState(false);
  const [createItemOpen, setCreateItemOpen] = useState(false);
  const [stockCreateOpen, setStockCreateOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState<PpeStock | null>(null);
  const [stockDetailOpen, setStockDetailOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [trackerCreateOpen, setTrackerCreateOpen] = useState(false);
  const [selectedTrackerIssue, setSelectedTrackerIssue] = useState<PpeIssueTracker | null>(null);
  const [trackerDetailOpen, setTrackerDetailOpen] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<PPEIssue | null>(null);
  const [issueDetailOpen, setIssueDetailOpen] = useState(false);
  const [trackerFilters, setTrackerFilters] = useState<Pick<PpeIssueTrackerFilters, 'status' | 'riskLevel'>>({
    status: 'all',
    riskLevel: undefined
  });
  const [registerFilters, setRegisterFilters] = useState<{
    dateFrom: string;
    dateTo: string;
    siteId: string;
    departmentId: string;
  }>(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      dateFrom: first.toISOString().slice(0, 10),
      dateTo: now.toISOString().slice(0, 10),
      siteId: '',
      departmentId: ''
    };
  });

  const { data: myProfile } = useAsync(
    async () => {
      if (!activeCompanyId || !user?.id) return null;
      return await getMyProfile(activeCompanyId, user.id);
    },
    [activeCompanyId, user?.id]
  );

  const issuesFilters = useMemo((): PpeIssuesFilters => {
    const f: PpeIssuesFilters = { companyId: activeCompanyId!, limit: 500 };
    if (registerFilters.dateFrom) f.dateFrom = registerFilters.dateFrom;
    if (registerFilters.dateTo) f.dateTo = registerFilters.dateTo;
    if (registerFilters.siteId) f.siteId = registerFilters.siteId as any;
    if (registerFilters.departmentId) f.departmentId = registerFilters.departmentId as any;
    return f;
  }, [activeCompanyId, registerFilters]);

  const { data: issues, loading, error } = useAsync<PPEIssue[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listPpeIssues(activeTab === 'register' ? issuesFilters : activeCompanyId, 500);
    },
    [activeCompanyId, activeTab, refreshKey, issuesFilters]
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

  const { data: trackerIssues, loading: trackerLoading, error: trackerError } = useAsync<
    PpeIssueTracker[]
  >(
    async () => {
      if (!activeCompanyId || activeTab !== 'tracker') return [];
      return await listPpeIssueTracker({
        companyId: activeCompanyId,
        status: trackerFilters.status ?? 'all',
        riskLevel: trackerFilters.riskLevel,
        limit: 200
      });
    },
    [activeCompanyId, activeTab, refreshKey, trackerFilters.status, trackerFilters.riskLevel]
  );

  const { data: reorderRequests } = useAsync<PpeReorderRequest[]>(
    async () => {
      if (!activeCompanyId || activeTab !== 'inventory') return [];
      return await listPpeReorderRequests({ companyId: activeCompanyId });
    },
    [activeCompanyId, activeTab, refreshKey]
  );

  const dashboardDateFrom = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  }, []);
  const dashboardDateTo = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const { data: costSummary } = useAsync(
    async () => {
      if (!activeCompanyId || activeTab !== 'dashboard') return null;
      return await getPpeCostSummary(activeCompanyId, {
        dateFrom: dashboardDateFrom,
        dateTo: dashboardDateTo
      });
    },
    [activeCompanyId, activeTab, refreshKey, dashboardDateFrom, dashboardDateTo]
  );
  const { data: usageSummary } = useAsync(
    async () => {
      if (!activeCompanyId || activeTab !== 'dashboard') return null;
      return await getPpeUsageSummary(activeCompanyId, {
        dateFrom: dashboardDateFrom,
        dateTo: dashboardDateTo
      });
    },
    [activeCompanyId, activeTab, refreshKey, dashboardDateFrom, dashboardDateTo]
  );
  const { data: lowStockCount } = useAsync(
    async () => {
      if (!activeCompanyId || activeTab !== 'dashboard') return 0;
      return await getPpeLowStockCount(activeCompanyId);
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

  const { data: profiles } = useAsync(
    async () => {
      if (!activeCompanyId) return [];
      const { listUserProfiles } = await import('../api/services/profilesService');
      return await listUserProfiles(activeCompanyId);
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
    const site = i.site_id ? siteById.get(i.site_id) : null;
    const dept = i.department_id ? departmentById.get(i.department_id) : null;
    return {
      raw: i,
      id: `PPE-${String(i.id).slice(0, 8)}`,
      issueDate: i.issue_date ?? (i.issued_at ? i.issued_at.slice(0, 10) : '—'),
      item: i.ppe_item_name ?? item?.name ?? `Item ${String(i.ppe_item_id).slice(0, 8)}`,
      size: i.size ?? '—',
      reason: i.reason_for_issue ?? '—',
      issuer: i.issued_by_name ?? `User ${String(i.issued_by_user_id).slice(0, 8)}`,
      issuedTo: i.issued_to_user_id
        ? (profiles?.find((p) => p.user_id === i.issued_to_user_id)?.full_name ?? `User ${String(i.issued_to_user_id).slice(0, 8)}`)
        : (i.issued_to_employee_number ?? '—'),
      departmentName: dept?.name ?? '—',
      quantity: i.quantity_issued ?? 1,
      totalCost:
        i.total_cost_at_issue != null
          ? `R ${Number(i.total_cost_at_issue).toFixed(2)}`
          : item?.unit_cost != null
          ? `R ${Number((item.unit_cost ?? 0) * (i.quantity_issued ?? 1)).toFixed(0)}`
          : '—'
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
      statusClass,
      dateOrdered: s.date_ordered ?? '—',
      dateStockReceived: s.date_stock_received ?? '—',
      capturedByName: s.captured_by_name ?? '—'
    };
  });

  const openReorderCount = (reorderRequests ?? []).filter(
    (r) => r.status !== 'received' && r.status !== 'rejected'
  ).length;

  const trackerRows = (trackerIssues ?? []).map((i) => {
    const site = i.site_id ? siteById.get(i.site_id) : null;
    const dept = i.department_id ? departmentById.get(i.department_id) : null;
    const isOverdue = i.status === 'overdue';
    return {
      raw: i,
      id: `PPE-${String(i.id).slice(0, 8)}`,
      siteName: i.site_name_text ?? site?.name ?? '—',
      departmentName: i.department_name_text ?? dept?.name ?? '—',
      person: i.contractor_or_employee_name || '—',
      ppeType: i.ppe_type.replace(/_/g, ' '),
      category: i.issue_category.replace(/_/g, ' '),
      risk: i.risk_level,
      status: i.status.replace(/_/g, ' '),
      targetDate: i.target_completion_date
        ? new Date(i.target_completion_date).toLocaleDateString('en-ZA')
        : '—',
      isOverdue
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
            issuedByName={myProfile?.full_name ?? null}
            issuedByRole={activeRole ?? null}
            items={items ?? []}
            sites={sites ?? []}
            departments={departments ?? []}
            isAdmin={activeRole === 'admin'}
            onIssued={() => setRefreshKey((k) => k + 1)}
          />
          {selectedIssue && (
            <PpeIssueDetailModal
              open={issueDetailOpen}
              onClose={() => {
                setIssueDetailOpen(false);
                setSelectedIssue(null);
              }}
              companyId={activeCompanyId}
              issue={selectedIssue}
              siteName={selectedIssue.site_id ? siteById.get(selectedIssue.site_id)?.name ?? null : null}
              departmentName={
                selectedIssue.department_id
                  ? departmentById.get(selectedIssue.department_id)?.name ?? null
                  : null
              }
            />
          )}
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
          <PpeIssueTrackerCreateModal
            open={trackerCreateOpen}
            onClose={() => setTrackerCreateOpen(false)}
            companyId={activeCompanyId}
            actorUserId={user.id}
            sites={sites ?? []}
            departments={departments ?? []}
            onCreated={() => setRefreshKey((k) => k + 1)}
          />
          {selectedTrackerIssue && (
            <PpeIssueTrackerDetailModal
              open={trackerDetailOpen}
              onClose={() => {
                setTrackerDetailOpen(false);
                setSelectedTrackerIssue(null);
              }}
              companyId={activeCompanyId}
              actorUserId={user.id}
              issue={selectedTrackerIssue}
              canManagerSignoff={canManagerSignoff}
              canSafetyVerify={canSafetyVerify}
              canAuditorConfirm={canAuditorConfirm}
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
              <h2 className="text-lg font-semibold text-charcoal">PPE issues, compliance, and stock</h2>
              <p className="text-sm text-charcoal-400">
                Track PPE non-compliance, corrective actions and real-time stock across sites.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!activeCompanyId || !user?.id}
              onClick={() => setTrackerCreateOpen(true)}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-navy text-white rounded-lg text-sm font-medium hover:bg-navy-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <PlusIcon className="w-4 h-4" />
              Report PPE issue
            </button>
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
              Issue PPE (register)
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
              onClick={() => setActiveTab('dashboard')}
              className={`pb-1 border-b-2 ${
                activeTab === 'dashboard'
                  ? 'border-teal text-teal font-semibold'
                  : 'border-transparent text-charcoal-500'
              }`}
            >
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('tracker')}
              className={`pb-1 border-b-2 ${
                activeTab === 'tracker'
                  ? 'border-teal text-teal font-semibold'
                  : 'border-transparent text-charcoal-500'
              }`}
            >
              Issue Tracker
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('register')}
              className={`pb-1 border-b-2 ${
                activeTab === 'register'
                  ? 'border-teal text-teal font-semibold'
                  : 'border-transparent text-charcoal-500'
              }`}
            >
              Issuing Register
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

        {activeTab === 'dashboard' && (
          <motion.div variants={itemVariants} className="space-y-6">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (costSummary) {
                    downloadFile(
                      exportPpeCostSummaryCSV(costSummary),
                      `ppe-cost-summary-${new Date().toISOString().slice(0, 10)}.csv`
                    );
                  }
                }}
                disabled={!costSummary}
                className="px-3 py-1.5 rounded-lg border border-surface-300 text-xs font-medium text-charcoal hover:bg-surface-50 disabled:opacity-50"
              >
                Export cost CSV
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (costSummary) {
                    const blob = await exportPpeCostSummaryPDF(costSummary);
                    downloadFile(blob, `ppe-cost-summary-${new Date().toISOString().slice(0, 10)}.pdf`);
                  }
                }}
                disabled={!costSummary}
                className="px-3 py-1.5 rounded-lg border border-surface-300 text-xs font-medium text-charcoal hover:bg-surface-50 disabled:opacity-50"
              >
                Export cost PDF
              </button>
              <button
                type="button"
                onClick={() => {
                  if (usageSummary) {
                    downloadFile(
                      exportPpeUsageSummaryCSV(usageSummary),
                      `ppe-usage-summary-${new Date().toISOString().slice(0, 10)}.csv`
                    );
                  }
                }}
                disabled={!usageSummary}
                className="px-3 py-1.5 rounded-lg border border-surface-300 text-xs font-medium text-charcoal hover:bg-surface-50 disabled:opacity-50"
              >
                Export usage CSV
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (usageSummary) {
                    const blob = await exportPpeUsageSummaryPDF(usageSummary);
                    downloadFile(blob, `ppe-usage-summary-${new Date().toISOString().slice(0, 10)}.pdf`);
                  }
                }}
                disabled={!usageSummary}
                className="px-3 py-1.5 rounded-lg border border-surface-300 text-xs font-medium text-charcoal hover:bg-surface-50 disabled:opacity-50"
              >
                Export usage PDF
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
                <p className="text-xs font-medium text-charcoal-500 uppercase tracking-wider">Total cost this month</p>
                <p className="mt-1 text-xl font-semibold text-charcoal">
                  R {(costSummary?.totalPpeCost ?? 0).toFixed(2)}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
                <p className="text-xs font-medium text-charcoal-500 uppercase tracking-wider">Total issues this month</p>
                <p className="mt-1 text-xl font-semibold text-charcoal">{usageSummary?.totalQuantityIssued ?? 0}</p>
              </div>
              <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
                <p className="text-xs font-medium text-charcoal-500 uppercase tracking-wider">Low stock alerts</p>
                <p className="mt-1 text-xl font-semibold text-charcoal">{lowStockCount ?? 0}</p>
              </div>
              <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
                <p className="text-xs font-medium text-charcoal-500 uppercase tracking-wider">Top costing item</p>
                <p className="mt-1 text-sm font-medium text-charcoal truncate">
                  {costSummary?.topCostingPpeItems?.[0]?.ppeItemName ?? '—'}
                </p>
                <p className="text-xs text-charcoal-500">
                  R {(costSummary?.topCostingPpeItems?.[0]?.totalCost ?? 0).toFixed(2)}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
                <h4 className="text-sm font-semibold text-charcoal mb-3">Cost by category</h4>
                <ul className="space-y-2">
                  {(costSummary?.costByCategory ?? []).slice(0, 8).map((c) => (
                    <li key={c.category ?? 'null'} className="flex justify-between text-sm">
                      <span className="text-charcoal-600">{c.category ?? 'Uncategorised'}</span>
                      <span className="font-medium">R {c.totalCost.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
                <h4 className="text-sm font-semibold text-charcoal mb-3">Usage by reason</h4>
                <ul className="space-y-2">
                  {(usageSummary?.reasonBreakdown ?? []).slice(0, 8).map((r) => (
                    <li key={r.reason ?? 'null'} className="flex justify-between text-sm">
                      <span className="text-charcoal-600">{r.reason ?? 'Not specified'}</span>
                      <span className="font-medium">{r.quantity}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'tracker' && (
          <motion.div
            variants={itemVariants}
            className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold text-charcoal">PPE Issue Tracker</h3>
                <p className="text-xs text-charcoal-400">
                  Non-compliance, damaged/expired PPE, incorrect use and replacements.
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <select
                  value={trackerFilters.status ?? 'all'}
                  onChange={(e) =>
                    setTrackerFilters((f) => ({ ...f, status: e.target.value as any }))
                  }
                  className="px-3 py-1.5 bg-white border border-surface-300 rounded-lg"
                >
                  <option value="all">All statuses</option>
                  <option value="open">Open</option>
                  <option value="in_progress">In progress</option>
                  <option value="awaiting_ppe">Awaiting PPE</option>
                  <option value="awaiting_training">Awaiting training</option>
                  <option value="awaiting_evidence">Awaiting evidence</option>
                  <option value="under_review">Under review</option>
                  <option value="overdue">Overdue</option>
                  <option value="closed">Closed</option>
                </select>
                <select
                  value={trackerFilters.riskLevel ?? ''}
                  onChange={(e) =>
                    setTrackerFilters((f) => ({
                      ...f,
                      riskLevel: (e.target.value || undefined) as any
                    }))
                  }
                  className="px-3 py-1.5 bg-white border border-surface-300 rounded-lg"
                >
                  <option value="">All risks</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface-50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                      Site / Department
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                      Person
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                      PPE Type
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                      Risk
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                      Target date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {trackerLoading && (
                    <tr>
                      <td colSpan={8} className="px-5 py-4 text-sm text-charcoal-500">
                        Loading PPE issues…
                      </td>
                    </tr>
                  )}
                  {trackerError && (
                    <tr>
                      <td colSpan={8} className="px-5 py-4 text-sm text-critical">
                        {trackerError.message}
                      </td>
                    </tr>
                  )}
                  {!trackerLoading && !trackerError && trackerRows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-5 py-4 text-sm text-charcoal-500">
                        No PPE issue tracker records yet. Use &quot;Report PPE issue&quot; to log one.
                      </td>
                    </tr>
                  )}
                  {trackerRows.map((row) => (
                    <tr
                      key={row.raw.id}
                      className="hover:bg-surface-50 transition-colors cursor-pointer"
                      onClick={() => {
                        setSelectedTrackerIssue(row.raw);
                        setTrackerDetailOpen(true);
                      }}
                    >
                      <td className="px-5 py-4 text-sm font-medium text-teal">{row.id}</td>
                      <td className="px-5 py-4 text-sm text-charcoal">
                        {row.siteName} / {row.departmentName}
                      </td>
                      <td className="px-5 py-4 text-sm text-charcoal-500">{row.person}</td>
                      <td className="px-5 py-4 text-sm text-charcoal-500 capitalize">
                        {row.ppeType}
                      </td>
                      <td className="px-5 py-4 text-sm text-charcoal-500 capitalize">
                        {row.category}
                      </td>
                      <td className="px-5 py-4 text-sm">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            row.risk === 'critical'
                              ? 'bg-critical/10 text-critical'
                              : row.risk === 'high'
                              ? 'bg-warning/10 text-warning'
                              : row.risk === 'medium'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-teal/10 text-teal'
                          }`}
                        >
                          {row.risk}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            row.isOverdue
                              ? 'bg-critical/10 text-critical'
                              : 'bg-surface-200 text-charcoal-700'
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-charcoal-500">{row.targetDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {activeTab === 'register' && (
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
              <div className="px-5 py-4 border-b border-surface-200 flex flex-wrap items-center justify-between gap-4">
                <h3 className="font-semibold text-charcoal">PPE Issue Register</h3>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <input
                    type="date"
                    value={registerFilters.dateFrom}
                    onChange={(e) =>
                      setRegisterFilters((f) => ({ ...f, dateFrom: e.target.value }))
                    }
                    className="px-2 py-1.5 border border-surface-300 rounded-lg"
                  />
                  <span className="text-charcoal-500">to</span>
                  <input
                    type="date"
                    value={registerFilters.dateTo}
                    onChange={(e) =>
                      setRegisterFilters((f) => ({ ...f, dateTo: e.target.value }))
                    }
                    className="px-2 py-1.5 border border-surface-300 rounded-lg"
                  />
                  <select
                    value={registerFilters.siteId}
                    onChange={(e) =>
                      setRegisterFilters((f) => ({ ...f, siteId: e.target.value }))
                    }
                    className="px-2 py-1.5 border border-surface-300 rounded-lg"
                  >
                    <option value="">All sites</option>
                    {(sites ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={registerFilters.departmentId}
                    onChange={(e) =>
                      setRegisterFilters((f) => ({ ...f, departmentId: e.target.value }))
                    }
                    className="px-2 py-1.5 border border-surface-300 rounded-lg"
                  >
                    <option value="">All departments</option>
                    {(departments ?? []).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <span className="text-sm text-charcoal-400">{issueRows.length} issues</span>
                <button
                  type="button"
                  onClick={() => {
                    if (issues?.length) {
                      downloadFile(
                        exportPpeIssueRegisterCSV(issues),
                        `ppe-issue-register-${new Date().toISOString().slice(0, 10)}.csv`
                      );
                    }
                  }}
                  disabled={!issues?.length}
                  className="px-3 py-1.5 rounded-lg border border-surface-300 text-xs font-medium text-charcoal hover:bg-surface-50 disabled:opacity-50"
                >
                  Export register CSV
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface-50">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                        ID
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                        Issue date
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                        Item
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                        Size
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                        Reason
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                        Issued to
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                        Department
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                        Issued by
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                        Qty
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                        Total cost
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {loading && (
                      <tr>
                        <td colSpan={11} className="px-5 py-4 text-sm text-charcoal-500">
                          Loading…
                        </td>
                      </tr>
                    )}
                    {error && (
                      <tr>
                        <td colSpan={11} className="px-5 py-4 text-sm text-critical">
                          {error.message}
                        </td>
                      </tr>
                    )}
                    {!loading && !error && issueRows.length === 0 && (
                      <tr>
                        <td colSpan={11} className="px-5 py-4 text-sm text-charcoal-500">
                          No PPE issues yet.
                        </td>
                      </tr>
                    )}
                    {issueRows.map((row) => (
                      <tr
                        key={row.raw.id}
                        className="hover:bg-surface-50 transition-colors cursor-pointer"
                        onClick={() => {
                          setSelectedIssue(row.raw);
                          setIssueDetailOpen(true);
                        }}
                      >
                        <td className="px-5 py-4 text-sm font-medium text-teal">{row.id}</td>
                        <td className="px-5 py-4 text-sm text-charcoal-500">{row.issueDate}</td>
                        <td className="px-5 py-4 text-sm text-charcoal">{row.item}</td>
                        <td className="px-5 py-4 text-sm text-charcoal-500">{row.size}</td>
                        <td className="px-5 py-4 text-sm text-charcoal-500">{row.reason}</td>
                        <td className="px-5 py-4 text-sm text-charcoal-500">{row.issuedTo}</td>
                        <td className="px-5 py-4 text-sm text-charcoal-500">{row.departmentName}</td>
                        <td className="px-5 py-4 text-sm text-charcoal-500">{row.issuer}</td>
                        <td className="px-5 py-4 text-sm text-charcoal-500">{row.quantity}</td>
                        <td className="px-5 py-4 text-sm text-charcoal-500">{row.totalCost}</td>
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
                      Date ordered
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                      Date received
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">
                      Captured by
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
                      <td colSpan={13} className="px-5 py-4 text-sm text-charcoal-500">
                        Loading inventory…
                      </td>
                    </tr>
                  )}
                  {stocksError && (
                    <tr>
                      <td colSpan={13} className="px-5 py-4 text-sm text-critical">
                        {stocksError.message}
                      </td>
                    </tr>
                  )}
                  {!stocksLoading && !stocksError && stockRows.length === 0 && (
                    <tr>
                      <td colSpan={13} className="px-5 py-4 text-sm text-charcoal-500">
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
                      <td className="px-5 py-4 text-sm text-charcoal-500">{row.dateOrdered}</td>
                      <td className="px-5 py-4 text-sm text-charcoal-500">{row.dateStockReceived}</td>
                      <td className="px-5 py-4 text-sm text-charcoal-500">{row.capturedByName}</td>
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

