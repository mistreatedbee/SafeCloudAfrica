import { insforge } from '../insforge/client';
import type { IncidentCorrectiveAction, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';

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
  companyId: UUID,
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
    .eq('company_id', companyId)
    .eq('id', actionId)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update corrective action.');

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

export async function listIncidentCorrectiveActions(companyId: UUID, incidentId: UUID): Promise<IncidentCorrectiveAction[]> {
  const { data, error } = await insforge.database
    .from('incident_corrective_actions')
    .select('*')
    .eq('company_id', companyId)
    .eq('incident_id', incidentId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as IncidentCorrectiveAction[];
}

export async function getIncidentCorrectiveAction(companyId: UUID, actionId: UUID): Promise<IncidentCorrectiveAction | null> {
  const { data, error } = await insforge.database
    .from('incident_corrective_actions')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', actionId)
    .single();

  if (error) throw new Error(getErrorMessage(error));
  return (data ?? null) as IncidentCorrectiveAction | null;
}

export async function deleteIncidentCorrectiveAction(companyId: UUID, actionId: UUID): Promise<void> {
  const existing = await getIncidentCorrectiveAction(companyId, actionId);
  const { error } = await insforge.database
    .from('incident_corrective_actions')
    .delete()
    .eq('company_id', companyId)
    .eq('id', actionId);

  if (error) throw new Error(getErrorMessage(error));

  if (existing?.incident_id) {
    const { syncIncidentClosureFromLinks } = await import('./incidentsService');
    await syncIncidentClosureFromLinks(existing.incident_id).catch((syncError) => {
      void syncError;
    });
  }
}
