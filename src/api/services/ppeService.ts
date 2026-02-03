import { insforge } from '../insforge/client';
import type { PPEIssue, PPEItem, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';

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

