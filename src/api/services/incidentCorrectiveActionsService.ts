import { insforge } from '../insforge/client';
import type { IncidentCorrectiveAction, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import type { Severity } from '../models/core';

export type CreateIncidentCorrectiveActionInput = {
  incidentId: UUID;
  companyId: UUID;
  actionTitle: string;
  actionDescription?: string;
  ownerUserId?: UUID;
  dueDate?: string;
  createdByUserId: UUID;
  sourceCauseType?: 'unsafe_act' | 'unsafe_condition' | 'root_cause' | 'system_failure';
  sourceCauseText?: string;
  taskId?: UUID;
  ncrId?: UUID;
};

export type UpdateIncidentCorrectiveActionInput = {
  actionTitle?: string;
  actionDescription?: string;
  ownerUserId?: UUID;
  dueDate?: string;
  status?: 'Open' | 'In Progress' | 'Awaiting Evidence' | 'Under Review' | 'Closed';
  evidenceDocumentUrls?: string[];
  closureNotes?: string;
  managerApprovalUserId?: UUID;
  sourceCauseType?: 'unsafe_act' | 'unsafe_condition' | 'root_cause' | 'system_failure';
  sourceCauseText?: string | null;
  taskId?: UUID | null;
  ncrId?: UUID | null;
};

function severityToPriority(severity: string | null | undefined): Severity {
  const value = String(severity ?? '').toLowerCase();
  if (value === 'critical') return 'critical';
  if (value === 'high') return 'high';
  if (value === 'low') return 'low';
  return 'medium';
}

async function ensureTaskLinkedForCorrectiveAction(row: IncidentCorrectiveAction): Promise<void> {
  if (row.task_id) return;

  const { data: incidentRow, error: incidentError } = await insforge.database
    .from('incidents')
    .select('id, company_id, module, title, severity')
    .eq('id', row.incident_id)
    .maybeSingle();
  if (incidentError) throw new Error(getErrorMessage(incidentError));
  if (!incidentRow) return;

  const { createTask } = await import('./tasksService');
  const dueDate = row.due_date ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const priority = severityToPriority((incidentRow as any).severity);
  const createdTask = await createTask({
    companyId: (incidentRow as any).company_id as UUID,
    module: ((incidentRow as any).module ?? 'safety') as any,
    title: `CAPA: ${row.action_title}`,
    description: row.action_description ?? `Incident corrective action for ${String((incidentRow as any).title ?? 'incident')}`,
    category: 'capa',
    riskLevel: priority === 'critical' ? 'critical' : priority === 'high' ? 'high' : priority === 'low' ? 'low' : 'medium',
    priority,
    dueAt: dueDate,
    assigneeUserId: row.owner_user_id ?? undefined,
    taskOwnerUserId: row.owner_user_id ?? undefined,
    sourceEntityType: 'incident_corrective_action',
    sourceEntityId: row.id,
    createdByUserId: row.created_by_user_id
  });

  const { error: linkError } = await insforge.database
    .from('incident_corrective_actions')
    .update({ task_id: createdTask.id, updated_at: new Date().toISOString() })
    .eq('id', row.id);
  if (linkError) throw new Error(getErrorMessage(linkError));
}

async function syncLinkedTaskForCorrectiveAction(row: IncidentCorrectiveAction): Promise<void> {
  if (!row.task_id) {
    await ensureTaskLinkedForCorrectiveAction(row);
    return;
  }

  const updatePayload: Record<string, unknown> = {
    title: `CAPA: ${row.action_title}`,
    description: row.action_description ?? null,
    due_at: row.due_date ?? null,
    assignee_user_id: row.owner_user_id ?? null,
    task_owner_user_id: row.owner_user_id ?? null,
    updated_at: new Date().toISOString()
  };

  const { error } = await insforge.database
    .from('tasks')
    .update(updatePayload)
    .eq('id', row.task_id);
  if (error) throw new Error(getErrorMessage(error));
}

export async function createIncidentCorrectiveAction(
  input: CreateIncidentCorrectiveActionInput
): Promise<IncidentCorrectiveAction> {
  const { data, error } = await insforge.database
    .from('incident_corrective_actions')
    .insert({
      incident_id: input.incidentId,
      company_id: input.companyId,
      action_title: input.actionTitle,
      action_description: input.actionDescription ?? null,
      owner_user_id: input.ownerUserId ?? null,
      due_date: input.dueDate ?? null,
      status: 'Open',
      created_by_user_id: input.createdByUserId,
      source_cause_type: input.sourceCauseType ?? null,
      source_cause_text: input.sourceCauseText ?? null,
      task_id: input.taskId ?? null,
      ncr_id: input.ncrId ?? null
    })
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create corrective action.');
  await ensureTaskLinkedForCorrectiveAction(data as IncidentCorrectiveAction);

  // Log activity
  const { createActivityLog } = await import('./activityLogService');
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'incident_corrective_actions.create',
    entityType: 'incident_corrective_action',
    entityId: (data as any).id as UUID,
    metadata: { incidentId: input.incidentId }
  });

  const { syncIncidentClosureFromLinks } = await import('./incidentsService');
  await syncIncidentClosureFromLinks((data as any).incident_id as UUID).catch((syncError) => {
    void syncError;
  });

  return data as IncidentCorrectiveAction;
}

export async function updateIncidentCorrectiveAction(
  actionId: UUID,
  patch: UpdateIncidentCorrectiveActionInput
): Promise<IncidentCorrectiveAction> {
  const updateData: any = {};

  if (patch.actionTitle !== undefined) updateData.action_title = patch.actionTitle;
  if (patch.actionDescription !== undefined) updateData.action_description = patch.actionDescription;
  if (patch.ownerUserId !== undefined) updateData.owner_user_id = patch.ownerUserId;
  if (patch.dueDate !== undefined) updateData.due_date = patch.dueDate;
  if (patch.status !== undefined) updateData.status = patch.status;
  if (patch.evidenceDocumentUrls !== undefined) updateData.evidence_document_urls = patch.evidenceDocumentUrls;
  if (patch.closureNotes !== undefined) updateData.closure_notes = patch.closureNotes;
  if (patch.managerApprovalUserId !== undefined) {
    updateData.manager_approval_user_id = patch.managerApprovalUserId;
    updateData.manager_approval_at = new Date().toISOString();
  }
  if (patch.sourceCauseType !== undefined) updateData.source_cause_type = patch.sourceCauseType;
  if (patch.sourceCauseText !== undefined) updateData.source_cause_text = patch.sourceCauseText;
  if (patch.taskId !== undefined) updateData.task_id = patch.taskId;
  if (patch.ncrId !== undefined) updateData.ncr_id = patch.ncrId;

  updateData.updated_at = new Date().toISOString();

  const { data, error } = await insforge.database
    .from('incident_corrective_actions')
    .update(updateData)
    .eq('id', actionId)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update corrective action.');
  await syncLinkedTaskForCorrectiveAction(data as IncidentCorrectiveAction);

  // Log activity
  const { createActivityLog } = await import('./activityLogService');
  await createActivityLog({
    companyId: (data as any).company_id,
    actorUserId: (data as any).created_by_user_id,
    action: 'incident_corrective_actions.update',
    entityType: 'incident_corrective_action',
    entityId: actionId,
    metadata: { incidentId: (data as any).incident_id, changes: patch }
  });

  const { syncIncidentClosureFromLinks } = await import('./incidentsService');
  await syncIncidentClosureFromLinks((data as any).incident_id as UUID).catch((syncError) => {
    void syncError;
  });

  return data as IncidentCorrectiveAction;
}

export async function listIncidentCorrectiveActions(incidentId: UUID): Promise<IncidentCorrectiveAction[]> {
  const { data, error } = await insforge.database
    .from('incident_corrective_actions')
    .select('*')
    .eq('incident_id', incidentId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as IncidentCorrectiveAction[];
}

export async function getIncidentCorrectiveAction(actionId: UUID): Promise<IncidentCorrectiveAction | null> {
  const { data, error } = await insforge.database
    .from('incident_corrective_actions')
    .select('*')
    .eq('id', actionId)
    .single();

  if (error) throw new Error(getErrorMessage(error));
  return (data ?? null) as IncidentCorrectiveAction | null;
}

export async function deleteIncidentCorrectiveAction(actionId: UUID): Promise<void> {
  const existing = await getIncidentCorrectiveAction(actionId);
  const { error } = await insforge.database
    .from('incident_corrective_actions')
    .delete()
    .eq('id', actionId);

  if (error) throw new Error(getErrorMessage(error));

  if (existing?.incident_id) {
    const { syncIncidentClosureFromLinks } = await import('./incidentsService');
    await syncIncidentClosureFromLinks(existing.incident_id).catch((syncError) => {
      void syncError;
    });
  }
}
