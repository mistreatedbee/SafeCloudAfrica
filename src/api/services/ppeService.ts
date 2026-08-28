import { insforge } from '../insforge/client';
import { withInsforgeSession } from '../insforge/ensureSession';
import type {
  PPEIssue,
  PPEItem,
  PpeIssueCapaLink,
  PpeIssueNcrLink,
  PpeReorderRequest,
  PpeReorderRequestStatus,
  PpeSizeWithPrice,
  PpeStock,
  PpeStockMovement,
  PpeStockMovementType,
  UUID
} from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';
import { createNotification } from './notificationsService';
import { getMyProfile } from './profilesService';
import { sendTemplatedNotificationEmail } from './emailService';
import { getHrEmployeeById } from './hrService';

async function getPpeEmail(companyId: UUID, userId?: UUID | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await insforge.database
    .from('user_profiles')
    .select('email')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle();
  const email = String((data as any)?.email ?? '').trim();
  return email || null;
}

export async function listPpeItems(companyId: UUID): Promise<PPEItem[]> {
  return withInsforgeSession('ppe_items:list', async () => {
    const { data, error } = await insforge.database.from('ppe_items').select('*').eq('company_id', companyId).order('created_at', {
      ascending: false
    });
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? []) as PPEItem[];
  });
}

export type PpeIssuesFilters = {
  companyId: UUID;
  dateFrom?: string | null;
  dateTo?: string | null;
  siteId?: UUID | null;
  departmentId?: UUID | null;
  issuedToUserId?: UUID | null;
  /** Filter by the HR employee record PPE was issued to (matches even when the employee has no linked platform user). */
  issuedToEmployeeId?: UUID | null;
  ppeItemId?: UUID | null;
  reasonForIssue?: string | null;
  issuedByUserId?: UUID | null;
  limit?: number;
};

export async function listPpeIssues(
  companyIdOrFilters: UUID | PpeIssuesFilters,
  limit = 200
): Promise<PPEIssue[]> {
  return withInsforgeSession('ppe_issues:list', async () => {
  const input: PpeIssuesFilters =
    typeof companyIdOrFilters === 'string' || typeof companyIdOrFilters === 'object'
      ? typeof companyIdOrFilters === 'object'
        ? companyIdOrFilters
        : { companyId: companyIdOrFilters, limit }
      : { companyId: companyIdOrFilters as UUID, limit };
  const {
    companyId,
    dateFrom,
    dateTo,
    siteId,
    departmentId,
    issuedToUserId,
    issuedToEmployeeId,
    ppeItemId,
    reasonForIssue,
    issuedByUserId,
    limit: lim
  } = input;

  let query = insforge.database
    .from('ppe_issues')
    .select('*')
    .eq('company_id', companyId);

  if (dateFrom) {
    query = query.gte('issued_at', `${dateFrom}T00:00:00Z`);
  }
  if (dateTo) {
    query = query.lte('issued_at', `${dateTo}T23:59:59.999Z`);
  }
  if (siteId !== undefined && siteId !== null) query = query.eq('site_id', siteId);
  if (departmentId !== undefined && departmentId !== null) query = query.eq('department_id', departmentId);
  if (issuedToUserId !== undefined && issuedToUserId !== null)
    query = query.eq('issued_to_user_id', issuedToUserId);
  if (issuedToEmployeeId !== undefined && issuedToEmployeeId !== null)
    query = query.eq('issued_to_employee_id', issuedToEmployeeId);
  if (ppeItemId !== undefined && ppeItemId !== null) query = query.eq('ppe_item_id', ppeItemId);
  if (reasonForIssue) query = query.eq('reason_for_issue', reasonForIssue);
  if (issuedByUserId !== undefined && issuedByUserId !== null)
    query = query.eq('issued_by_user_id', issuedByUserId);

  const { data, error } = await query
    .order('issue_date', { ascending: false, nullsFirst: false })
    .order('issued_at', { ascending: false })
    .limit(lim ?? limit);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as PPEIssue[];
  });
}

export async function getPpeIssueById(companyId: UUID, issueId: UUID): Promise<PPEIssue | null> {
  return withInsforgeSession('ppe_issues:get', async () => {
  const { data, error } = await insforge.database
    .from('ppe_issues')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', issueId)
    .maybeSingle();
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? null) as PPEIssue | null;
  });
}

/** Flag (or clear) a non-conformance on a PPE issue and notify the issued-to employee's supervisor. */
export async function flagPpeIssueNonConformance(input: {
  companyId: UUID;
  issueId: UUID;
  actorUserId: UUID;
  isNonConformant: boolean;
  reason?: string | null;
}): Promise<PPEIssue> {
  return withInsforgeSession('ppe_issues:flag_non_conformance', async () => {
  if (input.isNonConformant && !input.reason?.trim()) {
    throw new Error('A reason is required to flag a non-conformance.');
  }

  const { data, error } = await insforge.database
    .from('ppe_issues')
    .update({
      is_non_conformant: input.isNonConformant,
      non_conformance_reason: input.isNonConformant ? input.reason!.trim() : null
    })
    .eq('company_id', input.companyId)
    .eq('id', input.issueId)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('PPE issue not found.');
  const issue = data as PPEIssue;

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: input.isNonConformant ? 'ppe_issues.flag_non_conformance' : 'ppe_issues.clear_non_conformance',
    entityType: 'ppe_issue',
    entityId: input.issueId
  });

  if (input.isNonConformant && issue.issued_to_employee_id) {
    try {
      const employee = await getHrEmployeeById(input.companyId, issue.issued_to_employee_id);
      const supervisorUserId = employee?.supervisor_user_id;
      if (supervisorUserId && supervisorUserId !== input.actorUserId) {
        const { notifyRelevantUsers } = await import('./notificationEventsService');
        const employeeName = employee ? `${employee.first_name} ${employee.last_name}`.trim() : 'An employee';
        const itemLabel = issue.ppe_item_name ?? 'PPE item';
        await notifyRelevantUsers({
          companyId: input.companyId,
          eventKey: `ppe-non-conformance:${issue.id}`,
          eventType: 'ppe_non_conformance_flagged',
          title: `PPE non-conformance flagged — ${employeeName}`,
          message: `${employeeName}'s ${itemLabel} issue was flagged as a non-conformance. Reason: ${issue.non_conformance_reason}`,
          recipientUserIds: [supervisorUserId],
          emailTemplateKey: 'ppe_management',
          emailVariables: { title: itemLabel, status: 'Non-conformance flagged', employee: employeeName },
          actionUrl: '/dashboard/safety/ppe',
          metadata: { itemType: 'ppe_issue', itemId: issue.id }
        }).catch((err) => console.warn('[ppe] non-conformance notification failed', err));
      }
    } catch (err) {
      console.warn('[ppe] failed to resolve supervisor for non-conformance notification', err);
    }
  }

  return issue;
  });
}

export async function getPpeCompliance(companyId: UUID): Promise<number> {
  // Real-time compliance proxy: % of issued items that have been returned before (or on) due date.
  const issues = await listPpeIssues(companyId, 1000);
  if (issues.length === 0) return 0;
  let ok = 0;
  for (const i of issues) {
    if (!i.return_due_at) continue;
    if (!i.returned_at) continue;
    const due = new Date(i.return_due_at).getTime();
    const returned = new Date(i.returned_at).getTime();
    if (!Number.isNaN(due) && !Number.isNaN(returned) && returned <= due) ok += 1;
  }
  const relevant = issues.filter((i) => i.return_due_at && i.returned_at).length;
  if (relevant === 0) return 0;
  return Math.round((ok / relevant) * 100);
}

export async function createPpeItem(input: {
  companyId: UUID;
  name: string;
  category?: string | null;
  unitCost?: number | null;
  sizesWithPrices?: PpeSizeWithPrice[] | null;
  description?: string | null;
  sizesAvailable?: string[] | null;
  supplierName?: string | null;
  stockLocation?: string | null;
}): Promise<PPEItem> {
  return withInsforgeSession('ppe_items:create', async () => {
  const { data, error } = await insforge.database
    .from('ppe_items')
    .insert({
      company_id: input.companyId,
      name: input.name,
      category: input.category ?? null,
      unit_cost: typeof input.unitCost === 'number' ? input.unitCost : null,
      description: input.description ?? null,
      sizes_available: Array.isArray(input.sizesAvailable) ? input.sizesAvailable : null,
      sizes_with_prices: Array.isArray(input.sizesWithPrices) ? input.sizesWithPrices : null,
      supplier_name: input.supplierName ?? null,
      stock_location: input.stockLocation ?? null
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create PPE item.');
  return data as PPEItem;
  });
}

export async function updatePpeItem(input: {
  companyId: UUID;
  itemId: UUID;
  patch: Partial<{
    name: string;
    category: string | null;
    unit_cost: number | null;
    description: string | null;
    sizes_available: string[] | null;
    sizes_with_prices: PpeSizeWithPrice[] | null;
    supplier_name: string | null;
    stock_location: string | null;
  }>;
}): Promise<PPEItem> {
  return withInsforgeSession('ppe_items:update', async () => {
  const payload: Record<string, unknown> = { ...input.patch };
  if ('sizes_available' in input.patch) payload.sizes_available = input.patch.sizes_available ?? null;
  if ('sizes_with_prices' in input.patch) payload.sizes_with_prices = input.patch.sizes_with_prices ?? null;
  const { data, error } = await insforge.database
    .from('ppe_items')
    .update(payload)
    .eq('company_id', input.companyId)
    .eq('id', input.itemId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update PPE item.');
  return data as PPEItem;
  });
}

export async function deletePpeItem(input: {
  companyId: UUID;
  itemId: UUID;
  actorUserId: UUID;
}): Promise<void> {
  return withInsforgeSession('ppe_items:delete', async () => {
  const { data: stockRefs, error: stockRefsError } = await insforge.database
    .from('ppe_stock')
    .select('id')
    .eq('company_id', input.companyId)
    .eq('ppe_item_id', input.itemId)
    .limit(1);
  if (stockRefsError) throw new Error(getErrorMessage(stockRefsError));

  if ((stockRefs ?? []).length > 0) {
    throw new Error('This PPE item is linked to stock records and cannot be deleted.');
  }

  const { data: issueRefs, error: issueRefsError } = await insforge.database
    .from('ppe_issues')
    .select('id')
    .eq('company_id', input.companyId)
    .eq('ppe_item_id', input.itemId)
    .limit(1);
  if (issueRefsError) throw new Error(getErrorMessage(issueRefsError));

  if ((issueRefs ?? []).length > 0) {
    throw new Error('This PPE item has issue history and cannot be deleted.');
  }

  const { error } = await insforge.database
    .from('ppe_items')
    .delete()
    .eq('company_id', input.companyId)
    .eq('id', input.itemId);
  if (error) throw new Error(getErrorMessage(error));

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'ppe_items.delete',
    entityType: 'ppe_item',
    entityId: input.itemId
  });
  });
}

export type CreatePpeIssueInput = {
  companyId: UUID;
  ppeItemId: UUID;
  issuedToUserId?: UUID | null;
  issuedToEmployeeId?: UUID | null;
  /** Display name for the recipient when they are not HR/user-linked (e.g. a contractor). */
  issuedToName?: string | null;
  issuedByUserId: UUID;
  issuedByRole?: string | null;
  nextIssueAt?: string | null;
  returnDueAt?: string | null;
  notes?: string | null;
  issueDate?: string | null;
  siteId?: UUID | null;
  departmentId?: UUID | null;
  issuedToEmployeeNumber?: string | null;
  jobRole?: string | null;
  jobDescription?: string | null;
  size?: string | null;
  quantityIssued?: number;
  reasonForIssue?: string | null;
  unitCostAtIssue?: number | null;
  stockId?: UUID | null;
  adminOverrideInsufficientStock?: boolean;
};

/** Resolve stock for issuing: match site/dept first, then fall back to any active stock for the item/size. */
export async function resolvePpeStockForIssue(input: {
  companyId: UUID;
  ppeItemId: UUID;
  siteId?: UUID | null;
  departmentId?: UUID | null;
  size?: string | null;
}): Promise<PpeStock | null> {
  const exact = await getPpeStockByLocation(input);
  if (exact) return exact;
  const candidates = await listPpeStock({
    companyId: input.companyId,
    ppeItemId: input.ppeItemId,
    size: input.size ?? null,
    includeInactive: false
  });
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    const withQty = candidates.filter((row) => (row.on_hand_qty ?? 0) > 0);
    return (withQty[0] ?? candidates[0]) ?? null;
  }
  return null;
}

export async function createPpeIssue(input: CreatePpeIssueInput): Promise<PPEIssue> {
  return withInsforgeSession('ppe_issues:create', async () => {
  const quantity = Number.isFinite(input.quantityIssued) && input.quantityIssued! > 0 ? input.quantityIssued! : 1;
  const issueDate = input.issueDate || new Date().toISOString().slice(0, 10);
  const issuedAt = new Date().toISOString();

  const { data: itemRow, error: itemError } = await insforge.database
    .from('ppe_items')
    .select('name, category, unit_cost')
    .eq('company_id', input.companyId)
    .eq('id', input.ppeItemId)
    .single();
  if (itemError || !itemRow) throw new Error('PPE item not found.');
  const item = itemRow as PPEItem;
  const ppeItemName = item.name;
  const ppeCategory = item.category ?? null;
  const unitCost =
    typeof input.unitCostAtIssue === 'number' ? input.unitCostAtIssue : (item.unit_cost ?? null);
  const totalCostAtIssue = unitCost != null && quantity > 0 ? unitCost * quantity : null;

  let issuedByName: string | null = null;
  const issuedByRole: string | null = input.issuedByRole ?? null;
  try {
    const profile = await getMyProfile(input.companyId, input.issuedByUserId);
    if (profile?.full_name) issuedByName = profile.full_name;
  } catch {
    // optional
  }

  if (input.stockId) {
    const { data: stockRow, error: stockErr } = await insforge.database
      .from('ppe_stock')
      .select('on_hand_qty')
      .eq('company_id', input.companyId)
      .eq('id', input.stockId)
      .single();
    if (!stockErr && stockRow) {
      const onHand = (stockRow as PpeStock).on_hand_qty ?? 0;
      if (onHand < quantity && !input.adminOverrideInsufficientStock) {
        const e = new Error('Insufficient stock for this issue.') as Error & { insufficientStock?: boolean; allowOverride?: boolean };
        e.insufficientStock = true;
        e.allowOverride = true;
        throw e;
      }
    }
  }

  const issuePayload = {
    company_id: input.companyId,
    ppe_item_id: input.ppeItemId,
    issued_to_user_id: input.issuedToUserId ?? null,
    issued_to_employee_id: input.issuedToEmployeeId ?? null,
    issued_to_name: input.issuedToUserId || input.issuedToEmployeeId ? null : (input.issuedToName ?? null),
    issued_by_user_id: input.issuedByUserId,
    issued_at: issuedAt,
    next_issue_at: input.nextIssueAt ?? null,
    return_due_at: input.returnDueAt ?? null,
    notes: input.notes ?? null,
    site_id: input.siteId ?? null,
    department_id: input.departmentId ?? null,
    issue_date: issueDate,
    issued_to_employee_number: input.issuedToEmployeeNumber ?? null,
    job_role: input.jobRole ?? null,
    job_description: input.jobDescription ?? null,
    ppe_item_name: ppeItemName,
    ppe_category: ppeCategory,
    size: input.size ?? null,
    quantity_issued: quantity,
    reason_for_issue: input.reasonForIssue ?? null,
    issued_by_name: issuedByName,
    issued_by_role: issuedByRole,
    unit_cost_at_issue: unitCost,
    total_cost_at_issue: totalCostAtIssue
  };

  // Inserts the ppe_issues row and (when a stock record is resolved) decrements
  // ppe_stock + records the movement in one Postgres transaction (see
  // ppe_issue_and_decrement_stock in
  // docs/migrations/ppe_issue_atomic_rpc_2026_08_21.sql) -- the issue and its stock
  // effect can no longer exist independently of each other.
  const { data: rpcRows, error: rpcError } = await insforge.database.rpc('ppe_issue_and_decrement_stock', {
    p_issue: issuePayload,
    p_stock_id: input.stockId ?? null,
    p_quantity: input.stockId ? quantity : null,
    p_allow_negative_stock: input.adminOverrideInsufficientStock ?? false
  });
  if (rpcError) {
    const message = getErrorMessage(rpcError);
    if (/insufficient stock/i.test(message)) {
      const e = new Error(message) as Error & { insufficientStock?: boolean; allowOverride?: boolean };
      e.insufficientStock = true;
      e.allowOverride = true;
      throw e;
    }
    throw new Error(message);
  }
  const issueRow = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
  if (!issueRow) throw new Error('Failed to issue PPE.');
  const issue = issueRow as PPEIssue;

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.issuedByUserId,
    action: 'ppe_issues.create',
    entityType: 'ppe_issue',
    entityId: issue.id
  });

  try {
    const email = await getPpeEmail(input.companyId, input.issuedToUserId);
    if (email) {
      await sendTemplatedNotificationEmail({
        to: email,
        templateKey: 'ppe_management',
        variables: {
          title: issue.ppe_item_name ?? ppeItemName,
          status: 'Issued',
          employee: issue.issued_to_employee_number ?? input.issuedToUserId ?? '',
          dueDate: input.returnDueAt
        },
        actionUrl: '/dashboard/safety/ppe',
        meta: { companyId: input.companyId, ppeIssueId: issue.id }
      });
    }
  } catch (err) {
    console.warn('[ppe] notification failed', err);
  }

  return issue;
  });
}

// ---------------------------
// PPE inventory & stock
// ---------------------------

export async function listPpeStock(input: {
  companyId: UUID;
  siteId?: UUID | null;
  departmentId?: UUID | null;
  includeInactive?: boolean;
  ppeItemId?: UUID | null;
  size?: string | null;
}): Promise<PpeStock[]> {
  return withInsforgeSession('ppe_stock:list', async () => {
  let query = insforge.database.from('ppe_stock').select('*').eq('company_id', input.companyId);

  if (input.siteId !== undefined) {
    query = query.eq('site_id', input.siteId);
  }
  if (input.departmentId !== undefined) {
    query = query.eq('department_id', input.departmentId);
  }
  if (input.ppeItemId !== undefined && input.ppeItemId !== null) {
    query = query.eq('ppe_item_id', input.ppeItemId);
  }
  if (input.size !== undefined && input.size !== null) {
    query = query.eq('size', input.size);
  }
  if (!input.includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query.order('updated_at', { ascending: false });
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as PpeStock[];
  });
}

/** Resolve a stock record by location, item, and optional size (e.g. for issuing). Returns first match. */
export async function getPpeStockByLocation(input: {
  companyId: UUID;
  siteId?: UUID | null;
  departmentId?: UUID | null;
  ppeItemId: UUID;
  size?: string | null;
}): Promise<PpeStock | null> {
  const list = await listPpeStock({
    companyId: input.companyId,
    siteId: input.siteId,
    departmentId: input.departmentId,
    ppeItemId: input.ppeItemId,
    size: input.size ?? null,
    includeInactive: false
  });
  return list.length > 0 ? list[0] : null;
}

export async function createPpeStock(input: {
  companyId: UUID;
  siteId?: UUID | null;
  departmentId?: UUID | null;
  ppeItemId: UUID;
  onHandQty?: number;
  reorderLevel?: number;
  reorderQty?: number;
  createdByUserId: UUID;
  capturedByEmployeeId?: UUID | null;
  capturedByUserId?: UUID | null;
  capturedByName?: string | null;
  dateOrdered?: string | null;
  dateStockReceived?: string | null;
  openingStockQty?: number | null;
  qtyOrdered?: number | null;
  qtyReceived?: number | null;
  expiryDate?: string | null;
  size?: string | null;
}): Promise<PpeStock> {
  return withInsforgeSession('ppe_stock:create', async () => {
  const capturedByUserId = input.capturedByUserId ?? input.createdByUserId;
  let capturedByName = input.capturedByName ?? null;
  if (!capturedByName && capturedByUserId) {
    try {
      const profile = await getMyProfile(input.companyId, capturedByUserId);
      if (profile?.full_name) capturedByName = profile.full_name;
    } catch {
      // optional
    }
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await insforge.database
    .from('ppe_stock')
    .insert({
      company_id: input.companyId,
      site_id: input.siteId ?? null,
      department_id: input.departmentId ?? null,
      ppe_item_id: input.ppeItemId,
      on_hand_qty: 0,
      reserved_qty: 0,
      reorder_level: typeof input.reorderLevel === 'number' ? input.reorderLevel : 0,
      reorder_qty: typeof input.reorderQty === 'number' ? input.reorderQty : 0,
      is_active: true,
      created_by_user_id: input.createdByUserId,
      updated_by_user_id: input.createdByUserId,
      created_at: nowIso,
      updated_at: nowIso,
      captured_by_user_id: capturedByUserId,
      captured_by_employee_id: input.capturedByEmployeeId ?? null,
      captured_by_name: capturedByName,
      date_ordered: input.dateOrdered ?? null,
      date_stock_received: input.dateStockReceived ?? null,
      // opening_stock_qty is the permanent "initial quantity" for this stock record — it
      // must never change after creation (see updatePpeStock, which deliberately excludes
      // it from the editable patch). Auto-populate from onHandQty (what the create form
      // calls "Initial quantity") when the caller doesn't pass it explicitly, so the user
      // never has to type the same number into two fields.
      opening_stock_qty:
        typeof input.openingStockQty === 'number'
          ? input.openingStockQty
          : typeof input.onHandQty === 'number'
            ? input.onHandQty
            : null,
      qty_ordered: input.qtyOrdered ?? null,
      qty_received: input.qtyReceived ?? null,
      expiry_date: input.expiryDate ?? null,
      size: input.size ?? null
    })
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create PPE stock record.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'ppe_stock.create',
    entityType: 'ppe_stock',
    entityId: (data as any).id as UUID
  });

  const initialQty = typeof input.onHandQty === 'number' ? input.onHandQty : 0;
  if (initialQty > 0) {
    await createPpeStockMovement({
      companyId: input.companyId,
      stockId: (data as any).id as UUID,
      movementType: 'in',
      quantity: initialQty,
      reason: 'Opening stock',
      actorUserId: input.createdByUserId,
      transactionDate: input.dateStockReceived ?? null
    });
  }

  return data as PpeStock;
  });
}

export async function updatePpeStock(input: {
  companyId: UUID;
  stockId: UUID;
  patch: Partial<
    Pick<
      PpeStock,
      | 'reorder_level'
      | 'reorder_qty'
      | 'is_active'
      | 'date_ordered'
      | 'date_stock_received'
      | 'captured_by_name'
      // opening_stock_qty deliberately excluded — it's the permanent initial quantity for
      // this stock record and must never change after creation (only on_hand_qty moves).
      | 'qty_ordered'
      | 'qty_received'
      | 'expiry_date'
    >
  >;
  actorUserId: UUID;
}): Promise<PpeStock> {
  return withInsforgeSession('ppe_stock:update', async () => {
  const nowIso = new Date().toISOString();
  const { data, error } = await insforge.database
    .from('ppe_stock')
    .update({
      ...input.patch,
      updated_at: nowIso,
      updated_by_user_id: input.actorUserId
    })
    .eq('company_id', input.companyId)
    .eq('id', input.stockId)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update PPE stock.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'ppe_stock.update',
    entityType: 'ppe_stock',
    entityId: input.stockId,
    metadata: input.patch as Record<string, unknown>
  });

  return data as PpeStock;
  });
}

export async function deletePpeStock(input: {
  companyId: UUID;
  stockId: UUID;
  actorUserId: UUID;
}): Promise<PpeStock> {
  return withInsforgeSession('ppe_stock:delete', async () => {
  const nowIso = new Date().toISOString();
  const { data, error } = await insforge.database
    .from('ppe_stock')
    .update({
      is_active: false,
      updated_at: nowIso,
      updated_by_user_id: input.actorUserId
    })
    .eq('company_id', input.companyId)
    .eq('id', input.stockId)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to archive PPE stock.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'ppe_stock.delete',
    entityType: 'ppe_stock',
    entityId: input.stockId
  });

  return data as PpeStock;
  });
}

export async function listPpeStockMovements(input: {
  companyId: UUID;
  stockId: UUID;
  limit?: number;
}): Promise<PpeStockMovement[]> {
  return withInsforgeSession('ppe_stock_movements:list', async () => {
  const { data, error } = await insforge.database
    .from('ppe_stock_movements')
    .select('*')
    .eq('company_id', input.companyId)
    .eq('stock_id', input.stockId)
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 200);

  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as PpeStockMovement[];
  });
}

export async function createPpeStockMovement(input: {
  companyId: UUID;
  stockId: UUID;
  movementType: PpeStockMovementType;
  quantity: number;
  reason?: string | null;
  referenceType?: string | null;
  referenceId?: UUID | null;
  ppeIssueId?: UUID | null;
  actorUserId: UUID;
  transactionDate?: string | null;
  allowNegativeStock?: boolean;
}): Promise<{ stock: PpeStock; movement: PpeStockMovement }> {
  return withInsforgeSession('ppe_stock_movements:create', async () => {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error('Quantity must be a positive number.');
  }

  // Updates ppe_stock.on_hand_qty and inserts the matching ppe_stock_movements row in
  // one Postgres transaction (see ppe_apply_stock_movement in
  // docs/migrations/ppe_stock_movement_atomic_rpc_2026_08_20.sql) so the two writes
  // can never succeed/fail independently of each other.
  const { data: rpcRows, error: rpcError } = await insforge.database.rpc('ppe_apply_stock_movement', {
    p_company_id: input.companyId,
    p_stock_id: input.stockId,
    p_movement_type: input.movementType,
    p_quantity: input.quantity,
    p_actor_user_id: input.actorUserId,
    p_reason: input.reason ?? null,
    p_reference_type: input.referenceType ?? null,
    p_reference_id: input.referenceId ?? null,
    p_ppe_issue_id: input.ppeIssueId ?? null,
    p_transaction_date: input.transactionDate ?? null,
    p_allow_negative_stock: input.allowNegativeStock ?? false
  });

  if (rpcError) {
    const message = getErrorMessage(rpcError);
    if (/insufficient stock/i.test(message)) {
      const e = new Error(message) as Error & { insufficientStock?: boolean };
      e.insufficientStock = true;
      throw e;
    }
    throw new Error(message);
  }
  const rpcResult = (Array.isArray(rpcRows) ? rpcRows[0] : rpcRows) as
    | { stock_id: UUID; new_on_hand_qty: number; movement_id: UUID }
    | undefined;
  if (!rpcResult) throw new Error('Failed to apply PPE stock movement.');

  const [{ data: updatedStockRow, error: updateError }, { data: movementRow, error: movementError }] = await Promise.all([
    insforge.database.from('ppe_stock').select('*').eq('company_id', input.companyId).eq('id', input.stockId).single(),
    insforge.database.from('ppe_stock_movements').select('*').eq('company_id', input.companyId).eq('id', rpcResult.movement_id).single()
  ]);
  if (updateError) throw new Error(getErrorMessage(updateError));
  if (!updatedStockRow) throw new Error('Failed to load updated PPE stock.');
  if (movementError) throw new Error(getErrorMessage(movementError));
  if (!movementRow) throw new Error('Failed to load PPE stock movement.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'ppe_stock_movements.create',
    entityType: 'ppe_stock_movement',
    entityId: (movementRow as any).id as UUID,
    metadata: {
      stockId: input.stockId,
      movementType: input.movementType,
      quantity: input.quantity
    }
  });

  // Basic low-stock notification to the actor when falling below reorder level.
  const updatedStock = updatedStockRow as PpeStock;
  if (updatedStock.reorder_level > 0 && updatedStock.on_hand_qty <= updatedStock.reorder_level) {
    await createNotification(
      input.companyId,
      input.actorUserId,
      'warning',
      'PPE stock below reorder level',
      'PPE stock has fallen below the configured reorder level.'
    );

    // Auto-create a reorder request when stock is low and no open request exists.
    const { data: existingReorders, error: existingError } = await insforge.database
      .from('ppe_reorder_requests')
      .select('id,status')
      .eq('company_id', input.companyId)
      .eq('stock_id', input.stockId)
      .in('status', ['draft', 'requested', 'approved', 'ordered']);

    if (existingError) {
      // Do not block stock movement on reorder lookup failures.
      // eslint-disable-next-line no-console
      console.warn?.('Failed to check existing PPE reorder requests', existingError);
    }

    const hasOpenReorder = !!existingReorders && existingReorders.length > 0;
    if (!hasOpenReorder) {
      try {
        const suggestedQty =
          (updatedStock.reorder_qty && updatedStock.reorder_qty > 0
            ? updatedStock.reorder_qty
            : Math.max(updatedStock.reorder_level * 2 - updatedStock.on_hand_qty, 1)) || 1;

        await createPpeReorderRequest({
          companyId: input.companyId,
          stockId: input.stockId,
          requestedQty: suggestedQty,
          reason: 'Auto-generated due to low PPE stock level.',
          status: 'requested',
          requestedByUserId: input.actorUserId
        });
      } catch (err) {
        // Best-effort: do not block the original stock movement if reorder creation fails.
        // eslint-disable-next-line no-console
        console.warn?.('Failed to auto-create PPE reorder request', err);
      }
    }
  }

  return {
    stock: updatedStock,
    movement: movementRow as PpeStockMovement
  };
  });
}

// ---------------------------
// PPE reorder requests
// ---------------------------

export async function listPpeReorderRequests(input: {
  companyId: UUID;
  status?: PpeReorderRequestStatus;
  limit?: number;
}): Promise<PpeReorderRequest[]> {
  return withInsforgeSession('ppe_reorder_requests:list', async () => {
  let query = insforge.database
    .from('ppe_reorder_requests')
    .select('*')
    .eq('company_id', input.companyId);

  if (input.status) {
    query = query.eq('status', input.status);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 200);

  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as PpeReorderRequest[];
  });
}

export async function createPpeReorderRequest(input: {
  companyId: UUID;
  stockId: UUID;
  requestedQty: number;
  reason?: string | null;
  status?: PpeReorderRequestStatus;
  requestedByUserId: UUID;
}): Promise<PpeReorderRequest> {
  return withInsforgeSession('ppe_reorder_requests:create', async () => {
  if (!Number.isFinite(input.requestedQty) || input.requestedQty <= 0) {
    throw new Error('Requested quantity must be a positive number.');
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await insforge.database
    .from('ppe_reorder_requests')
    .insert({
      company_id: input.companyId,
      stock_id: input.stockId,
      requested_qty: input.requestedQty,
      reason: input.reason ?? null,
      status: input.status ?? 'requested',
      requested_by_user_id: input.requestedByUserId,
      created_at: nowIso,
      updated_at: nowIso
    })
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create PPE reorder request.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.requestedByUserId,
    action: 'ppe_reorder_requests.create',
    entityType: 'ppe_reorder_request',
    entityId: (data as any).id as UUID
  });

  // Notify the requester that the reorder request was logged.
  await createNotification(
    input.companyId,
    input.requestedByUserId,
    'info',
    'PPE reorder request created',
    'Your PPE reorder request has been created.'
  );

  return data as PpeReorderRequest;
  });
}

export async function updatePpeReorderRequestStatus(input: {
  companyId: UUID;
  reorderRequestId: UUID;
  status: PpeReorderRequestStatus;
  actorUserId: UUID;
}): Promise<PpeReorderRequest> {
  return withInsforgeSession('ppe_reorder_requests:update_status', async () => {
  const nowIso = new Date().toISOString();

  const { data: existingRow, error: fetchError } = await insforge.database
    .from('ppe_reorder_requests')
    .select('*')
    .eq('company_id', input.companyId)
    .eq('id', input.reorderRequestId)
    .single();

  if (fetchError) throw new Error(getErrorMessage(fetchError));
  if (!existingRow) throw new Error('Reorder request not found.');

  const patch: Record<string, unknown> = {
    status: input.status,
    updated_at: nowIso
  };

  if (input.status === 'approved' || input.status === 'rejected' || input.status === 'ordered' || input.status === 'received') {
    patch.approved_by_user_id = input.actorUserId;
    patch.approved_at = nowIso;
  }

  const { data, error } = await insforge.database
    .from('ppe_reorder_requests')
    .update(patch)
    .eq('company_id', input.companyId)
    .eq('id', input.reorderRequestId)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update PPE reorder request.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'ppe_reorder_requests.update_status',
    entityType: 'ppe_reorder_request',
    entityId: input.reorderRequestId,
    metadata: { status: input.status }
  });

  const reorderRequest = data as PpeReorderRequest;
  const requesterId = (existingRow as any).requested_by_user_id as UUID | null;
  if (
    requesterId &&
    requesterId !== input.actorUserId &&
    ['approved', 'rejected', 'received'].includes(input.status)
  ) {
    const statusLabel =
      input.status === 'approved' ? 'Approved' : input.status === 'rejected' ? 'Rejected' : 'Fulfilled';
    const { notifyRelevantUsers } = await import('./notificationEventsService');
    await notifyRelevantUsers({
      companyId: input.companyId,
      eventKey: `ppe-reorder-${input.status}:${input.reorderRequestId}`,
      eventType: `ppe_reorder_${input.status}`,
      title: `PPE reorder request ${statusLabel.toLowerCase()}`,
      message: `Your PPE reorder request has been ${statusLabel.toLowerCase()}.`,
      recipientUserIds: [requesterId],
      emailTemplateKey: 'ppe_management',
      emailVariables: {
        title: 'PPE reorder request',
        status: statusLabel
      },
      actionUrl: '/dashboard/safety/ppe',
      metadata: { itemType: 'ppe_reorder_request', itemId: input.reorderRequestId }
    }).catch((err) => {
      console.warn('[ppe] reorder status notification failed', input.reorderRequestId, err);
    });
  }

  return reorderRequest;
  });
}

// ---------------------------
// PPE issue links: NCRs & CAPA
// ---------------------------

export async function getPpeIssueLinks(input: {
  companyId: UUID;
  issueId: UUID;
}): Promise<{ ncrLinks: PpeIssueNcrLink[]; capaLinks: PpeIssueCapaLink[] }> {
  return withInsforgeSession('ppe_issue_links:get', async () => {
  const [{ data: ncrData, error: ncrError }, { data: capaData, error: capaError }] = await Promise.all([
    insforge.database
      .from('ppe_issue_ncr_links')
      .select('*')
      .eq('company_id', input.companyId)
      .eq('ppe_issue_id', input.issueId),
    insforge.database
      .from('ppe_issue_capa_links')
      .select('*')
      .eq('company_id', input.companyId)
      .eq('ppe_issue_id', input.issueId)
  ]);

  if (ncrError) throw new Error(getErrorMessage(ncrError));
  if (capaError) throw new Error(getErrorMessage(capaError));

  return {
    ncrLinks: (ncrData ?? []) as PpeIssueNcrLink[],
    capaLinks: (capaData ?? []) as PpeIssueCapaLink[]
  };
  });
}

export async function setPpeIssueLinks(input: {
  companyId: UUID;
  issueId: UUID;
  ncrIds?: UUID[];
  correctiveActionIds?: UUID[];
  actorUserId: UUID;
}): Promise<void> {
  return withInsforgeSession('ppe_issue_links:set', async () => {
  const ncrIds = input.ncrIds ?? [];
  const capaIds = input.correctiveActionIds ?? [];

  // Clear existing links
  const [{ error: ncrDeleteError }, { error: capaDeleteError }] = await Promise.all([
    insforge.database
      .from('ppe_issue_ncr_links')
      .delete()
      .eq('company_id', input.companyId)
      .eq('ppe_issue_id', input.issueId),
    insforge.database
      .from('ppe_issue_capa_links')
      .delete()
      .eq('company_id', input.companyId)
      .eq('ppe_issue_id', input.issueId)
  ]);

  if (ncrDeleteError) throw new Error(getErrorMessage(ncrDeleteError));
  if (capaDeleteError) throw new Error(getErrorMessage(capaDeleteError));

  const inserts: PromiseLike<unknown>[] = [];

  const nowIso = new Date().toISOString();

  if (ncrIds.length > 0) {
    inserts.push(
      insforge.database
        .from('ppe_issue_ncr_links')
        .insert(
          ncrIds.map((ncrId) => ({
            company_id: input.companyId,
            ppe_issue_id: input.issueId,
            ncr_id: ncrId,
            created_by_user_id: input.actorUserId,
            created_at: nowIso
          }))
        )
    );
  }

  if (capaIds.length > 0) {
    inserts.push(
      insforge.database
        .from('ppe_issue_capa_links')
        .insert(
          capaIds.map((correctiveActionId) => ({
            company_id: input.companyId,
            ppe_issue_id: input.issueId,
            corrective_action_id: correctiveActionId,
            created_by_user_id: input.actorUserId,
            created_at: nowIso
          }))
        )
    );
  }

  if (inserts.length > 0) {
    const results = await Promise.all(inserts);
    for (const res of results as any[]) {
      if (res.error) throw new Error(getErrorMessage(res.error));
    }
  }

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'ppe_issue.set_links',
    entityType: 'ppe_issue',
    entityId: input.issueId,
    metadata: {
      ncrIds,
      correctiveActionIds: capaIds
    }
  });
  });
}
