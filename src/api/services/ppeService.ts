import { insforge } from '../insforge/client';
import type {
  PPEIssue,
  PPEItem,
  PpeIssueCapaLink,
  PpeIssueNcrLink,
  PpeReorderRequest,
  PpeReorderRequestStatus,
  PpeStock,
  PpeStockMovement,
  PpeStockMovementType,
  UUID
} from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';
import { createNotification } from './notificationsService';

export async function listPpeItems(companyId: UUID): Promise<PPEItem[]> {
  const { data, error } = await insforge.database.from('ppe_items').select('*').eq('company_id', companyId).order('created_at', {
    ascending: false
  });
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as PPEItem[];
}

export async function listPpeIssues(companyId: UUID, limit = 200): Promise<PPEIssue[]> {
  const { data, error } = await insforge.database
    .from('ppe_issues')
    .select('*')
    .eq('company_id', companyId)
    .order('issued_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as PPEIssue[];
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

export async function createPpeItem(input: { companyId: UUID; name: string; category?: string; unitCost?: number | null }): Promise<PPEItem> {
  const { data, error } = await insforge.database
    .from('ppe_items')
    .insert({
      company_id: input.companyId,
      name: input.name,
      category: input.category ?? null,
      unit_cost: typeof input.unitCost === 'number' ? input.unitCost : null
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create PPE item.');
  return data as PPEItem;
}

export async function createPpeIssue(input: {
  companyId: UUID;
  ppeItemId: UUID;
  issuedToUserId?: UUID | null;
  issuedByUserId: UUID;
  nextIssueAt?: string | null;
  returnDueAt?: string | null;
  notes?: string | null;
}): Promise<PPEIssue> {
  const { data, error } = await insforge.database
    .from('ppe_issues')
    .insert({
      company_id: input.companyId,
      ppe_item_id: input.ppeItemId,
      issued_to_user_id: input.issuedToUserId ?? null,
      issued_by_user_id: input.issuedByUserId,
      issued_at: new Date().toISOString(),
      next_issue_at: input.nextIssueAt ?? null,
      return_due_at: input.returnDueAt ?? null,
      notes: input.notes ?? null
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to issue PPE.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.issuedByUserId,
    action: 'ppe_issues.create',
    entityType: 'ppe_issue',
    entityId: (data as any).id as UUID
  });

  return data as PPEIssue;
}

// ---------------------------
// PPE inventory & stock
// ---------------------------

export async function listPpeStock(input: {
  companyId: UUID;
  siteId?: UUID | null;
  departmentId?: UUID | null;
  includeInactive?: boolean;
}): Promise<PpeStock[]> {
  let query = insforge.database.from('ppe_stock').select('*').eq('company_id', input.companyId);

  if (input.siteId !== undefined) {
    query = query.eq('site_id', input.siteId);
  }
  if (input.departmentId !== undefined) {
    query = query.eq('department_id', input.departmentId);
  }
  if (!input.includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query.order('updated_at', { ascending: false });
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as PpeStock[];
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
}): Promise<PpeStock> {
  const nowIso = new Date().toISOString();
  const { data, error } = await insforge.database
    .from('ppe_stock')
    .insert({
      company_id: input.companyId,
      site_id: input.siteId ?? null,
      department_id: input.departmentId ?? null,
      ppe_item_id: input.ppeItemId,
      on_hand_qty: typeof input.onHandQty === 'number' ? input.onHandQty : 0,
      reserved_qty: 0,
      reorder_level: typeof input.reorderLevel === 'number' ? input.reorderLevel : 0,
      reorder_qty: typeof input.reorderQty === 'number' ? input.reorderQty : 0,
      is_active: true,
      created_by_user_id: input.createdByUserId,
      updated_by_user_id: input.createdByUserId,
      created_at: nowIso,
      updated_at: nowIso
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

  return data as PpeStock;
}

export async function updatePpeStock(input: {
  companyId: UUID;
  stockId: UUID;
  patch: Partial<Pick<PpeStock, 'reorder_level' | 'reorder_qty' | 'is_active'>>;
  actorUserId: UUID;
}): Promise<PpeStock> {
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
    metadata: input.patch as any
  });

  return data as PpeStock;
}

export async function listPpeStockMovements(input: {
  companyId: UUID;
  stockId: UUID;
  limit?: number;
}): Promise<PpeStockMovement[]> {
  const { data, error } = await insforge.database
    .from('ppe_stock_movements')
    .select('*')
    .eq('company_id', input.companyId)
    .eq('stock_id', input.stockId)
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 200);

  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as PpeStockMovement[];
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
}): Promise<{ stock: PpeStock; movement: PpeStockMovement }> {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error('Quantity must be a positive number.');
  }

  const { data: stockRow, error: stockError } = await insforge.database
    .from('ppe_stock')
    .select('*')
    .eq('company_id', input.companyId)
    .eq('id', input.stockId)
    .single();

  if (stockError) throw new Error(getErrorMessage(stockError));
  if (!stockRow) throw new Error('PPE stock record not found.');

  const stock = stockRow as PpeStock;
  const currentQty = stock.on_hand_qty ?? 0;
  let newQty = currentQty;

  if (input.movementType === 'in' || input.movementType === 'return') {
    newQty = currentQty + input.quantity;
  } else if (input.movementType === 'out') {
    newQty = currentQty - input.quantity;
    if (newQty < 0) {
      throw new Error('Insufficient stock for this movement.');
    }
  } else if (input.movementType === 'adjust') {
    // For adjustments, treat quantity as the new on-hand quantity.
    newQty = input.quantity;
  }

  const nowIso = new Date().toISOString();

  const { data: updatedStockRow, error: updateError } = await insforge.database
    .from('ppe_stock')
    .update({
      on_hand_qty: newQty,
      updated_at: nowIso,
      updated_by_user_id: input.actorUserId
    })
    .eq('company_id', input.companyId)
    .eq('id', input.stockId)
    .select('*')
    .single();

  if (updateError) throw new Error(getErrorMessage(updateError));
  if (!updatedStockRow) throw new Error('Failed to update PPE stock quantity.');

  const { data: movementRow, error: movementError } = await insforge.database
    .from('ppe_stock_movements')
    .insert({
      company_id: input.companyId,
      stock_id: input.stockId,
      movement_type: input.movementType,
      quantity: input.quantity,
      reason: input.reason ?? null,
      reference_type: input.referenceType ?? null,
      reference_id: input.referenceId ?? null,
      ppe_issue_id: input.ppeIssueId ?? null,
      old_on_hand_qty: currentQty,
      new_on_hand_qty: newQty,
      created_by_user_id: input.actorUserId,
      created_at: nowIso
    })
    .select('*')
    .single();

  if (movementError) throw new Error(getErrorMessage(movementError));
  if (!movementRow) throw new Error('Failed to create PPE stock movement.');

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
      'high',
      'PPE stock below reorder level',
      'PPE stock has fallen below the configured reorder level.'
    );
  }

  return {
    stock: updatedStock,
    movement: movementRow as PpeStockMovement
  };
}

// ---------------------------
// PPE reorder requests
// ---------------------------

export async function listPpeReorderRequests(input: {
  companyId: UUID;
  status?: PpeReorderRequestStatus;
  limit?: number;
}): Promise<PpeReorderRequest[]> {
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
}

export async function createPpeReorderRequest(input: {
  companyId: UUID;
  stockId: UUID;
  requestedQty: number;
  reason?: string | null;
  status?: PpeReorderRequestStatus;
  requestedByUserId: UUID;
}): Promise<PpeReorderRequest> {
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
    'medium',
    'PPE reorder request created',
    'Your PPE reorder request has been created.'
  );

  return data as PpeReorderRequest;
}

export async function updatePpeReorderRequestStatus(input: {
  companyId: UUID;
  reorderRequestId: UUID;
  status: PpeReorderRequestStatus;
  actorUserId: UUID;
}): Promise<PpeReorderRequest> {
  const nowIso = new Date().toISOString();

  const { data: existingRow, error: fetchError } = await insforge.database
    .from('ppe_reorder_requests')
    .select('*')
    .eq('company_id', input.companyId)
    .eq('id', input.reorderRequestId)
    .single();

  if (fetchError) throw new Error(getErrorMessage(fetchError));
  if (!existingRow) throw new Error('Reorder request not found.');

  const patch: any = {
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

  return data as PpeReorderRequest;
}

// ---------------------------
// PPE issue links: NCRs & CAPA
// ---------------------------

export async function getPpeIssueLinks(input: {
  companyId: UUID;
  issueId: UUID;
}): Promise<{ ncrLinks: PpeIssueNcrLink[]; capaLinks: PpeIssueCapaLink[] }> {
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
}

export async function setPpeIssueLinks(input: {
  companyId: UUID;
  issueId: UUID;
  ncrIds?: UUID[];
  correctiveActionIds?: UUID[];
  actorUserId: UUID;
}): Promise<void> {
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

  const inserts: Promise<unknown>[] = [];

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
}

