import { insforge } from '../insforge/client';
import type { Approval, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';

export async function listApprovals(companyId: UUID): Promise<Approval[]> {
  const { data, error } = await insforge.database
    .from('approvals')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as Approval[];
}

export async function createApproval(input: {
  companyId: UUID;
  entityType: string;
  entityId: UUID;
  requestedByUserId: UUID;
  approverUserId: UUID;
}): Promise<Approval> {
  const { data, error } = await insforge.database
    .from('approvals')
    .insert({
      company_id: input.companyId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      requested_by_user_id: input.requestedByUserId,
      approver_user_id: input.approverUserId,
      status: 'pending'
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create approval.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.requestedByUserId,
    action: 'approvals.create',
    entityType: 'approval',
    entityId: (data as any).id as UUID
  });

  return data as Approval;
}

export async function decideApproval(input: {
  companyId: UUID;
  approvalId: UUID;
  actorUserId: UUID;
  decision: 'approved' | 'rejected';
  signatureNote?: string;
}): Promise<Approval> {
  const patch = {
    status: input.decision,
    signed_at: new Date().toISOString(),
    signature_note: input.signatureNote ?? null
  };

  const { data, error } = await insforge.database.from('approvals').update(patch).eq('id', input.approvalId).select('*').single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update approval.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: `approvals.${input.decision}`,
    entityType: 'approval',
    entityId: input.approvalId
  });

  return data as Approval;
}