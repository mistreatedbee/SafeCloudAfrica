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

export type PpeSummaryResponse = {
  totalCost: number;
  totalIssuedCount: number;
  topItemBySpend: { name: string; totalCost: number } | null;
  itemSpendBreakdown: Array<{
    name: string;
    qty: number;
    avgUnitCost: number;
    totalCost: number;
  }>;
};

export type PpeTrendsResponse = Array<{ month: number; totalCost: number }>;

export type PpeItemsSort = 'totalCost_desc' | 'totalCost_asc' | 'qty_desc' | 'name_asc';

export type PpeItemsResponse = Array<{
  name: string;
  qty: number;
  avgUnitCost: number;
  totalCost: number;
}>;

type PpeDateRangeInput = {
  from?: string | null;
  to?: string | null;
  siteId?: UUID | null;
  departmentId?: UUID | null;
  issuedToUserId?: UUID | null;
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

function parseIssueDate(issue: {
  issue_date?: string | null;
  issued_at?: string | null;
}): Date | null {
  const raw = issue.issue_date ? `${issue.issue_date}T00:00:00Z` : issue.issued_at;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function withinRange(date: Date | null, from?: string | null, to?: string | null): boolean {
  if (!date) return false;
  if (from) {
    const fromDate = new Date(`${from}T00:00:00Z`);
    if (date < fromDate) return false;
  }
  if (to) {
    const toDate = new Date(`${to}T23:59:59.999Z`);
    if (date > toDate) return false;
  }
  return true;
}

function getIssueCost(issue: {
  total_cost_at_issue?: number | null;
  unit_cost_at_issue?: number | null;
  quantity_issued?: number | null;
}): { qty: number; unitCost: number; totalCost: number } {
  const qtyRaw = Number(issue.quantity_issued);
  const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;
  const unitRaw = Number(issue.unit_cost_at_issue);
  const unitCost = Number.isFinite(unitRaw) && unitRaw >= 0 ? unitRaw : 0;
  const totalRaw = Number(issue.total_cost_at_issue);
  const totalCost = Number.isFinite(totalRaw) ? totalRaw : qty * unitCost;
  return { qty, unitCost, totalCost };
}

function yyyyMmDd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function getPpeSummary(
  companyId: UUID,
  input: PpeDateRangeInput
): Promise<PpeSummaryResponse> {
  const issues = await listPpeIssues({
    companyId,
    dateFrom: input.from ?? null,
    dateTo: input.to ?? null,
    siteId: input.siteId ?? null,
    departmentId: input.departmentId ?? null,
    issuedToUserId: input.issuedToUserId ?? null,
    limit: 5000
  });

  const byItem = new Map<string, { name: string; qty: number; unitCostSum: number; totalCost: number }>();
  let totalCost = 0;
  let totalIssuedCount = 0;

  for (const issue of issues) {
    const issueDate = parseIssueDate(issue);
    if (!withinRange(issueDate, input.from, input.to)) continue;

    const { qty, unitCost, totalCost: issueTotal } = getIssueCost(issue);
    const name = String(issue.ppe_item_name ?? issue.ppe_item_id ?? 'Unknown item');
    const cur = byItem.get(name) ?? { name, qty: 0, unitCostSum: 0, totalCost: 0 };
    cur.qty += qty;
    cur.unitCostSum += unitCost * qty;
    cur.totalCost += issueTotal;
    byItem.set(name, cur);
    totalCost += issueTotal;
    totalIssuedCount += qty;
  }

  const itemSpendBreakdown = Array.from(byItem.values())
    .map((item) => ({
      name: item.name,
      qty: item.qty,
      avgUnitCost: item.qty > 0 ? item.unitCostSum / item.qty : 0,
      totalCost: item.totalCost
    }))
    .sort((a, b) => b.totalCost - a.totalCost);

  const topItem = itemSpendBreakdown[0] ?? null;

  return {
    totalCost,
    totalIssuedCount,
    topItemBySpend: topItem ? { name: topItem.name, totalCost: topItem.totalCost } : null,
    itemSpendBreakdown
  };
}

export async function getPpeTrends(
  companyId: UUID,
  input: {
    year: number;
    siteId?: UUID | null;
    departmentId?: UUID | null;
    issuedToUserId?: UUID | null;
  }
): Promise<PpeTrendsResponse> {
  const year = Number(input.year);
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const issues = await listPpeIssues({
    companyId,
    dateFrom: from,
    dateTo: to,
    siteId: input.siteId ?? null,
    departmentId: input.departmentId ?? null,
    issuedToUserId: input.issuedToUserId ?? null,
    limit: 5000
  });

  const totals = Array.from({ length: 12 }, () => 0);
  for (const issue of issues) {
    const date = parseIssueDate(issue);
    if (!withinRange(date, from, to) || !date) continue;
    const month = date.getUTCMonth();
    totals[month] += getIssueCost(issue).totalCost;
  }
  return totals.map((totalCost, i) => ({ month: i + 1, totalCost }));
}

export async function getPpeItems(
  companyId: UUID,
  input: PpeDateRangeInput & { sort?: PpeItemsSort }
): Promise<PpeItemsResponse> {
  const summary = await getPpeSummary(companyId, input);
  const rows = [...summary.itemSpendBreakdown];
  switch (input.sort ?? 'totalCost_desc') {
    case 'totalCost_asc':
      rows.sort((a, b) => a.totalCost - b.totalCost);
      break;
    case 'qty_desc':
      rows.sort((a, b) => b.qty - a.qty);
      break;
    case 'name_asc':
      rows.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'totalCost_desc':
    default:
      rows.sort((a, b) => b.totalCost - a.totalCost);
      break;
  }
  return rows;
}

export async function getPpeRecordsInRange(
  companyId: UUID,
  input: PpeDateRangeInput
) {
  const issues = await listPpeIssues({
    companyId,
    dateFrom: input.from ?? null,
    dateTo: input.to ?? null,
    siteId: input.siteId ?? null,
    departmentId: input.departmentId ?? null,
    issuedToUserId: input.issuedToUserId ?? null,
    limit: 5000
  });
  return issues.filter((issue) => withinRange(parseIssueDate(issue), input.from, input.to));
}

export function getMonthRange(monthAnchorDate: string): { from: string; to: string; year: number } {
  const anchor = new Date(`${monthAnchorDate || new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(anchor.getTime())) {
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    return { from: yyyyMmDd(from), to: yyyyMmDd(to), year: now.getUTCFullYear() };
  }
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth();
  const from = new Date(Date.UTC(year, month, 1));
  const to = new Date(Date.UTC(year, month + 1, 0));
  return { from: yyyyMmDd(from), to: yyyyMmDd(to), year };
}

export function getYearRange(year: number): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
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
