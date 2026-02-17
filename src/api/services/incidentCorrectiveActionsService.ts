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
      created_by_user_id: input.createdByUserId
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

  updateData.updated_at = new Date().toISOString();

  const { data, error } = await insforge.database
    .from('incident_corrective_actions')
    .update(updateData)
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
  const { error } = await insforge.database
    .from('incident_corrective_actions')
    .delete()
    .eq('id', actionId);

  if (error) throw new Error(getErrorMessage(error));
}
