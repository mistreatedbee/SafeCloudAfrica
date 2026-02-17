import { listPpeIssues, listPpeStock, type PpeIssuesFilters } from './ppeService';
import type { UUID } from '../models/entities';

export type PpeAnalyticsFilters = {
  companyId: UUID;
  dateFrom?: string | null;
  dateTo?: string | null;
  siteId?: UUID | null;
  departmentId?: UUID | null;
  issuedToUserId?: UUID | null;
};

export type PpeCostSummary = {
  totalPpeCost: number;
  topCostingPpeItems: Array<{
    ppeItemId: UUID;
    ppeItemName: string | null;
    totalCost: number;
    quantityIssued: number;
    avgCostPerIssue: number;
  }>;
  costByCategory: Array<{ category: string | null; totalCost: number }>;
  costByDepartment: Array<{ departmentId: UUID | null; departmentName?: string | null; totalCost: number }>;
  costBySite: Array<{ siteId: UUID | null; siteName?: string | null; totalCost: number }>;
};

export type PpeUsageSummary = {
  totalQuantityIssued: number;
  usageByPpeItem: Array<{
    ppeItemId: UUID;
    ppeItemName: string | null;
    quantityIssued: number;
  }>;
  usageByCategory: Array<{ category: string | null; quantityIssued: number }>;
  usageByDepartment: Array<{
    departmentId: UUID | null;
    departmentName?: string | null;
    quantityIssued: number;
  }>;
  repeatIssuesByEmployee: Array<{
    issuedToUserId: UUID | null;
    issuedToName?: string | null;
    count: number;
  }>;
  reasonBreakdown: Array<{ reason: string | null; count: number; quantity: number }>;
};

export type PpeMostExpensiveItem = {
  ppeItemId: UUID;
  ppeItemName: string | null;
  totalCost: number;
  totalQtyIssued: number;
  avgCostPerIssue: number;
  isTop: boolean;
};

function toFilters(f: PpeAnalyticsFilters): PpeIssuesFilters {
  return {
    companyId: f.companyId,
    dateFrom: f.dateFrom,
    dateTo: f.dateTo,
    siteId: f.siteId,
    departmentId: f.departmentId,
    issuedToUserId: f.issuedToUserId,
    limit: 5000
  };
}

export async function getPpeCostSummary(
  companyId: UUID,
  filters?: Partial<PpeAnalyticsFilters>
): Promise<PpeCostSummary> {
  const f: PpeAnalyticsFilters = { companyId, ...filters };
  const issues = await listPpeIssues(toFilters(f));

  const totalPpeCost = issues.reduce(
    (sum, i) => sum + (Number(i.total_cost_at_issue) || 0),
    0
  );

  const byItem = new Map<
    string,
    { name: string | null; cost: number; qty: number }
  >();
  const byCategory = new Map<string, number>();
  const byDepartment = new Map<string, number>();
  const bySite = new Map<string, number>();

  for (const i of issues) {
    const cost = Number(i.total_cost_at_issue) || 0;
    const qty = Number(i.quantity_issued) || 1;
    const itemId = i.ppe_item_id;
    if (itemId) {
      const cur = byItem.get(itemId) || { name: i.ppe_item_name ?? null, cost: 0, qty: 0 };
      cur.cost += cost;
      cur.qty += qty;
      byItem.set(itemId, cur);
    }
    const cat = i.ppe_category ?? 'Uncategorised';
    byCategory.set(cat, (byCategory.get(cat) || 0) + cost);
    const deptId = i.department_id ?? 'none';
    byDepartment.set(deptId, (byDepartment.get(deptId) || 0) + cost);
    const siteId = i.site_id ?? 'none';
    bySite.set(siteId, (bySite.get(siteId) || 0) + cost);
  }

  const topCostingPpeItems = Array.from(byItem.entries())
    .map(([ppeItemId, v]) => ({
      ppeItemId: ppeItemId as UUID,
      ppeItemName: v.name,
      totalCost: v.cost,
      quantityIssued: v.qty,
      avgCostPerIssue: v.qty > 0 ? v.cost / v.qty : 0
    }))
    .sort((a, b) => b.totalCost - a.totalCost)
    .slice(0, 20);

  const costByCategory = Array.from(byCategory.entries()).map(([category, totalCost]) => ({
    category: category === 'Uncategorised' ? null : category,
    totalCost
  }));

  const costByDepartment = Array.from(byDepartment.entries()).map(([departmentId, totalCost]) => ({
    departmentId: departmentId === 'none' ? null : (departmentId as UUID),
    totalCost
  }));

  const costBySite = Array.from(bySite.entries()).map(([siteId, totalCost]) => ({
    siteId: siteId === 'none' ? null : (siteId as UUID),
    totalCost
  }));

  return {
    totalPpeCost,
    topCostingPpeItems,
    costByCategory,
    costByDepartment,
    costBySite
  };
}

export async function getPpeUsageSummary(
  companyId: UUID,
  filters?: Partial<PpeAnalyticsFilters>
): Promise<PpeUsageSummary> {
  const f: PpeAnalyticsFilters = { companyId, ...filters };
  const issues = await listPpeIssues(toFilters(f));

  let totalQuantityIssued = 0;
  const byItem = new Map<string, { name: string | null; qty: number }>();
  const byCategory = new Map<string, number>();
  const byDepartment = new Map<string, number>();
  const byUser = new Map<string, number>();
  const byReason = new Map<string, { count: number; quantity: number }>();

  for (const i of issues) {
    const qty = Number(i.quantity_issued) || 1;
    totalQuantityIssued += qty;

    const itemId = i.ppe_item_id;
    if (itemId) {
      const cur = byItem.get(itemId) || { name: i.ppe_item_name ?? null, qty: 0 };
      cur.qty += qty;
      byItem.set(itemId, cur);
    }
    const cat = i.ppe_category ?? 'Uncategorised';
    byCategory.set(cat, (byCategory.get(cat) || 0) + qty);
    const deptId = i.department_id ?? 'none';
    byDepartment.set(deptId, (byDepartment.get(deptId) || 0) + qty);
    const userId = i.issued_to_user_id ?? 'anonymous';
    byUser.set(userId, (byUser.get(userId) || 0) + 1);
    const reason = i.reason_for_issue ?? 'Not specified';
    const rcur = byReason.get(reason) || { count: 0, quantity: 0 };
    rcur.count += 1;
    rcur.quantity += qty;
    byReason.set(reason, rcur);
  }

  const usageByPpeItem = Array.from(byItem.entries()).map(([ppeItemId, v]) => ({
    ppeItemId: ppeItemId as UUID,
    ppeItemName: v.name,
    quantityIssued: v.qty
  }));

  const usageByCategory = Array.from(byCategory.entries()).map(([category, quantityIssued]) => ({
    category: category === 'Uncategorised' ? null : category,
    quantityIssued
  }));

  const usageByDepartment = Array.from(byDepartment.entries()).map(([departmentId, quantityIssued]) => ({
    departmentId: departmentId === 'none' ? null : (departmentId as UUID),
    quantityIssued
  }));

  const repeatIssuesByEmployee = Array.from(byUser.entries())
    .filter(([, count]) => count > 1)
    .map(([issuedToUserId, count]) => ({
      issuedToUserId: issuedToUserId === 'anonymous' ? null : (issuedToUserId as UUID),
      count
    }))
    .sort((a, b) => b.count - a.count);

  const reasonBreakdown = Array.from(byReason.entries()).map(([reason, v]) => ({
    reason: reason === 'Not specified' ? null : reason,
    count: v.count,
    quantity: v.quantity
  }));

  return {
    totalQuantityIssued,
    usageByPpeItem,
    usageByCategory,
    usageByDepartment,
    repeatIssuesByEmployee,
    reasonBreakdown
  };
}

export async function getPpeMostExpensiveItems(
  companyId: UUID,
  filters?: Partial<PpeAnalyticsFilters>
): Promise<PpeMostExpensiveItem[]> {
  const summary = await getPpeCostSummary(companyId, filters);
  const top = summary.topCostingPpeItems;
  if (top.length === 0) return [];
  const maxCost = top[0]?.totalCost ?? 0;
  return top.map((t, idx) => ({
    ppeItemId: t.ppeItemId,
    ppeItemName: t.ppeItemName,
    totalCost: t.totalCost,
    totalQtyIssued: t.quantityIssued,
    avgCostPerIssue: t.avgCostPerIssue,
    isTop: idx === 0 && t.totalCost === maxCost
  }));
}

export async function getPpeLowStockCount(
  companyId: UUID,
  siteId?: UUID | null,
  departmentId?: UUID | null
): Promise<number> {
  const stocks = await listPpeStock({
    companyId,
    siteId,
    departmentId,
    includeInactive: false
  });
  return stocks.filter((s) => s.reorder_level > 0 && s.on_hand_qty <= s.reorder_level).length;
}
