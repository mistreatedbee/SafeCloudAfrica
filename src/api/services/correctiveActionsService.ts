import { insforge } from '../insforge/client';
import { withInsforgeSession } from '../insforge/ensureSession';
import type { UUID } from '../models/entities';
import type { ModuleKey } from '../models/core';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';
import { listEvidence } from './evidenceService';

export interface CorrectiveAction {
  id: UUID;
  company_id: UUID;
  action_number: string;
  title: string;
  description: string | null;
  action_type: 'corrective' | 'preventive';
  source_type: 'ncr' | 'risk_assessment' | 'incident' | 'audit' | 'observation' | 'complaint' | 'pjo' | 'kpi' | 'audit_finding';
  source_id: UUID;
  status: 'open' | 'assigned' | 'in-progress' | 'completed' | 'verified' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to_user_id: UUID | null;
  created_date: string | null;
  due_date: string;
  completed_date: string | null;
  verified_date: string | null;
  verified_by_user_id: UUID | null;
  root_cause: string | null;
  proposed_solution: string | null;
  effectiveness_check: string | null;
  evidence_url: string | null;
  linked_task_id: UUID | null;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
}

function generateActionNumber(): string {
  const date = new Date();
  const yyyymm = date.getFullYear().toString() + String(date.getMonth() + 1).padStart(2, '0');
  const random = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `CA-${yyyymm}-${random}`;
}

export type CreateCorrectiveActionInput = {
  companyId: UUID;
  title: string;
  description?: string;
  actionType: 'corrective' | 'preventive';
  sourceType: 'ncr' | 'risk_assessment' | 'incident' | 'audit' | 'observation' | 'complaint' | 'pjo' | 'kpi' | 'audit_finding';
  sourceId: UUID;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate: string;
  assignedToUserId?: UUID;
  rootCause?: string;
  proposedSolution?: string;
  createdByUserId: UUID;
};

export async function createCorrectiveAction(input: CreateCorrectiveActionInput): Promise<CorrectiveAction> {
  const actionNumber = generateActionNumber();
  
  const { data, error } = await insforge.database
    .from('corrective_actions')
    .insert({
      company_id: input.companyId,
      action_number: actionNumber,
      title: input.title,
      description: input.description ?? null,
      action_type: input.actionType,
      source_type: input.sourceType,
      source_id: input.sourceId,
      priority: input.priority,
      status: input.assignedToUserId ? 'assigned' : 'open',
      due_date: input.dueDate,
      assigned_to_user_id: input.assignedToUserId ?? null,
      root_cause: input.rootCause ?? null,
      proposed_solution: input.proposedSolution ?? null,
      created_date: new Date().toISOString().split('T')[0],
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create corrective action');
  
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'corrective_actions.create',
    entityType: 'corrective_action',
    entityId: (data as any).id as UUID,
    details: { source: input.sourceType, actionNumber }
  });
  
  return data as CorrectiveAction;
}

export type ListCorrectiveActionsInput = {
  companyId: UUID;
  status?: CorrectiveAction['status'];
  sourceType?: CorrectiveAction['source_type'];
  sourceId?: UUID;
  assignedToUserId?: UUID;
  limit?: number;
};

export async function listCorrectiveActions(input: ListCorrectiveActionsInput): Promise<CorrectiveAction[]> {
  let query = insforge.database
    .from('corrective_actions')
    .select('*')
    .eq('company_id', input.companyId);
  
  if (input.status) {
    query = query.eq('status', input.status);
  }
  
  if (input.sourceType) {
    query = query.eq('source_type', input.sourceType);
  }
  
  if (input.sourceId) {
    query = query.eq('source_id', input.sourceId);
  }
  
  if (input.assignedToUserId) {
    query = query.eq('assigned_to_user_id', input.assignedToUserId);
  }
  
  const { data, error } = await query
    .order('due_date', { ascending: true })
    .limit(input.limit ?? 200);
  
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as CorrectiveAction[];
}

export async function getCorrectiveAction(actionId: UUID, companyId: UUID): Promise<CorrectiveAction> {
  const { data, error } = await insforge.database
    .from('corrective_actions')
    .select('*')
    .eq('id', actionId)
    .eq('company_id', companyId)
    .single();
  
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Corrective action not found');
  
  return data as CorrectiveAction;
}

export type UpdateCorrectiveActionInput = {
  actionId: UUID;
  companyId: UUID;
  status?: CorrectiveAction['status'];
  priority?: CorrectiveAction['priority'];
  assignedToUserId?: UUID | null;
  description?: string;
  rootCause?: string;
  proposedSolution?: string;
  effectivenessCheck?: string;
  evidenceUrl?: string;
  linkedTaskId?: UUID | null;
  completedDate?: string | null;
  verifiedDate?: string | null;
  verifiedByUserId?: UUID | null;
  updatedByUserId: UUID;
};

export async function updateCorrectiveAction(input: UpdateCorrectiveActionInput): Promise<CorrectiveAction> {
  const updateData: any = {
    updated_at: new Date().toISOString()
  };
  
  if (input.status !== undefined) updateData.status = input.status;
  if (input.priority !== undefined) updateData.priority = input.priority;
  if (input.assignedToUserId !== undefined) updateData.assigned_to_user_id = input.assignedToUserId;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.rootCause !== undefined) updateData.root_cause = input.rootCause;
  if (input.proposedSolution !== undefined) updateData.proposed_solution = input.proposedSolution;
  if (input.effectivenessCheck !== undefined) updateData.effectiveness_check = input.effectivenessCheck;
  if (input.evidenceUrl !== undefined) updateData.evidence_url = input.evidenceUrl;
  if (input.linkedTaskId !== undefined) updateData.linked_task_id = input.linkedTaskId;
  if (input.completedDate !== undefined) updateData.completed_date = input.completedDate;
  if (input.verifiedDate !== undefined) updateData.verified_date = input.verifiedDate;
  if (input.verifiedByUserId !== undefined) updateData.verified_by_user_id = input.verifiedByUserId;
  
  const { data, error } = await insforge.database
    .from('corrective_actions')
    .update(updateData)
    .eq('id', input.actionId)
    .eq('company_id', input.companyId)
    .select('*')
    .single();
  
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update corrective action');
  
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.updatedByUserId,
    action: 'corrective_actions.update',
    entityType: 'corrective_action',
    entityId: input.actionId,
    details: { newStatus: input.status }
  });
  
  return data as CorrectiveAction;
}

export async function completeCorrectiveAction(
  actionId: UUID,
  companyId: UUID,
  effectivenessCheck: string,
  completedByUserId: UUID
): Promise<CorrectiveAction> {
  const today = new Date().toISOString().split('T')[0];
  
  const { data, error } = await insforge.database
    .from('corrective_actions')
    .update({
      status: 'completed',
      completed_date: today,
      effectiveness_check: effectivenessCheck,
      updated_at: new Date().toISOString()
    })
    .eq('id', actionId)
    .eq('company_id', companyId)
    .select('*')
    .single();
  
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to complete corrective action');
  
  await createActivityLog({
    companyId: companyId,
    actorUserId: completedByUserId,
    action: 'corrective_actions.complete',
    entityType: 'corrective_action',
    entityId: actionId
  });
  
  return data as CorrectiveAction;
}

export async function verifyCorrectiveAction(
  actionId: UUID,
  companyId: UUID,
  verifiedByUserId: UUID
): Promise<CorrectiveAction> {
  const today = new Date().toISOString().split('T')[0];
  
  const { data, error } = await insforge.database
    .from('corrective_actions')
    .update({
      status: 'verified',
      verified_date: today,
      verified_by_user_id: verifiedByUserId,
      updated_at: new Date().toISOString()
    })
    .eq('id', actionId)
    .eq('company_id', companyId)
    .select('*')
    .single();
  
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to verify corrective action');
  
  await createActivityLog({
    companyId: companyId,
    actorUserId: verifiedByUserId,
    action: 'corrective_actions.verify',
    entityType: 'corrective_action',
    entityId: actionId
  });
  
  return data as CorrectiveAction;
}

async function syncLinkedSourceOnClose(input: {
  companyId: UUID;
  actorUserId: UUID;
  action: CorrectiveAction;
}): Promise<void> {
  const nowIso = new Date().toISOString();
  const sourceId = input.action.source_id;
  const sourceType = input.action.source_type;
  if (!sourceId) return;

  if (sourceType === 'ncr') {
    await insforge.database
      .from('quality_ncrs')
      .update({
        status: 'closed',
        closed_at: nowIso,
        closed_by_user_id: input.actorUserId,
        updated_at: nowIso
      })
      .eq('company_id', input.companyId)
      .eq('id', sourceId);
    return;
  }

  if (sourceType === 'incident') {
    await insforge.database
      .from('incidents')
      .update({
        status: 'closed',
        updated_at: nowIso
      })
      .eq('company_id', input.companyId)
      .eq('id', sourceId);
    return;
  }

  if (sourceType === 'complaint') {
    await insforge.database
      .from('customer_complaints')
      .update({
        status: 'closed',
        updated_at: nowIso
      })
      .eq('company_id', input.companyId)
      .eq('id', sourceId);
  }
}

export async function closeCorrectiveAction(
  actionId: UUID,
  companyId: UUID,
  closedByUserId: UUID
): Promise<CorrectiveAction> {
  const current = await getCorrectiveAction(actionId, companyId);
  if (!current.verified_by_user_id) {
    throw new Error('Manager sign-off is required before closing this CAPA.');
  }

  const evidence = await listEvidence(companyId, { entityType: 'corrective_action', entityId: actionId, limit: 1 });
  const hasEvidence = Boolean((current.evidence_url ?? '').trim()) || evidence.length > 0;
  if (!hasEvidence) {
    throw new Error('Evidence is required before closing this CAPA.');
  }

  const closureDate = new Date().toISOString().split('T')[0];
  const nowIso = new Date().toISOString();
  const { data, error } = await insforge.database
    .from('corrective_actions')
    .update({
      status: 'closed',
      completed_date: closureDate,
      closure_date: nowIso,
      updated_at: nowIso
    })
    .eq('id', actionId)
    .eq('company_id', companyId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to close corrective action');

  const closed = data as CorrectiveAction;
  await createActivityLog({
    companyId,
    actorUserId: closedByUserId,
    action: 'corrective_actions.close',
    entityType: 'corrective_action',
    entityId: actionId
  });

  await syncLinkedSourceOnClose({
    companyId,
    actorUserId: closedByUserId,
    action: closed
  }).catch(() => undefined);

  return closed;
}

export async function getOverdueActions(companyId: UUID): Promise<CorrectiveAction[]> {
  const today = new Date().toISOString().split('T')[0];
  
  const { data, error } = await insforge.database
    .from('corrective_actions')
    .select('*')
    .eq('company_id', companyId)
    .lt('due_date', today)
    .in('status', ['open', 'assigned', 'in-progress']);
  
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as CorrectiveAction[];
}

export async function getDueSoonActions(companyId: UUID, daysAhead = 7): Promise<CorrectiveAction[]> {
  const today = new Date();
  const soon = new Date(today.getTime() + daysAhead * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const todayStr = today.toISOString().split('T')[0];
  
  const { data, error } = await insforge.database
    .from('corrective_actions')
    .select('*')
    .eq('company_id', companyId)
    .gte('due_date', todayStr)
    .lte('due_date', soon)
    .in('status', ['open', 'assigned', 'in-progress']);
  
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as CorrectiveAction[];
}

export async function countOpenCorrectiveActions(companyId: UUID, input?: { module?: ModuleKey }): Promise<number> {
  return withInsforgeSession('corrective-actions:count-open', async () => {
  const base = insforge.database
    .from('corrective_actions')
    .select('*', { count: 'planned', head: true })
    .eq('company_id', companyId)
    .neq('status', 'closed');
  const q = input?.module ? base.eq('module', input.module) : base;
  const { count, error } = await q;
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
  });
}

export async function countOverdueCorrectiveActions(companyId: UUID, input?: { module?: ModuleKey }): Promise<number> {
  return withInsforgeSession('corrective-actions:count-overdue', async () => {
  const base = insforge.database
    .from('corrective_actions')
    .select('*', { count: 'planned', head: true })
    .eq('company_id', companyId)
    .neq('status', 'closed')
    .lt('due_date', new Date().toISOString());
  const q = input?.module ? base.eq('module', input.module) : base;
  const { count, error } = await q;
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
  });
}

export async function deleteCorrectiveAction(
  actionId: UUID,
  companyId: UUID,
  deletedByUserId: UUID
): Promise<void> {
  const { error } = await insforge.database
    .from('corrective_actions')
    .delete()
    .eq('id', actionId)
    .eq('company_id', companyId);
  
  if (error) throw new Error(getErrorMessage(error));
  
  await createActivityLog({
    companyId: companyId,
    actorUserId: deletedByUserId,
    action: 'corrective_actions.delete',
    entityType: 'corrective_action',
    entityId: actionId
  });
}
