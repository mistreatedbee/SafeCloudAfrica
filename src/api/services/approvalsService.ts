import { insforge } from '../insforge/client';
import { withInsforgeSession } from '../insforge/ensureSession';
import type { Approval, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';

export async function listApprovals(companyId: UUID): Promise<Approval[]> {
  return withInsforgeSession('approvals:list', async () => {
    const { data, error } = await insforge.database
      .from('approvals')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? []) as Approval[];
  });
}

export async function createApproval(input: {
  companyId: UUID;
  entityType: string;
  entityId: UUID;
  requestedByUserId: UUID;
  approverUserId: UUID;
}): Promise<Approval> {
  return withInsforgeSession('approvals:create', async () => {
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

  const { notifyRelevantUsers } = await import('./notificationEventsService');
  await notifyRelevantUsers({
    companyId: input.companyId,
    eventKey: `approval-created:${(data as any).id}`,
    eventType: 'approval_created',
    title: 'Approval requested',
    message: `A "${input.entityType}" submission is awaiting your approval.`,
    recipientUserIds: [input.approverUserId],
    emailTemplateKey: 'approvals',
    emailVariables: {
      title: input.entityType,
      itemType: input.entityType,
      requester: input.requestedByUserId,
      status: 'Pending'
    },
    actionUrl: '/dashboard/management/approvals',
    metadata: {
      itemType: 'approval',
      itemId: (data as any).id,
      entityType: input.entityType,
      entityId: input.entityId
    }
  }).catch((err) => {
    console.warn('[approvals] notification failed', (data as any).id, err);
  });

  return data as Approval;
  });
}

export async function decideApproval(input: {
  companyId: UUID;
  approvalId: UUID;
  actorUserId: UUID;
  decision: 'approved' | 'rejected';
  signatureNote?: string;
}): Promise<Approval> {
  return withInsforgeSession('approvals:decide', async () => {
    const patch = {
      status: input.decision,
      signed_at: new Date().toISOString(),
      signature_note: input.signatureNote ?? null
    };
    const { data, error } = await insforge.database
      .from('approvals')
      .update(patch)
      .eq('company_id', input.companyId)
      .eq('id', input.approvalId)
      .select('*')
      .single();
    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to update approval.');
    const approval = data as Approval;
    await createActivityLog({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: `approvals.${input.decision}`,
      entityType: 'approval',
      entityId: input.approvalId
    });

    if (approval.requested_by_user_id && (input.decision === 'rejected' || input.decision === 'approved')) {
      const { notifyRelevantUsers } = await import('./notificationEventsService');
      const isRejected = input.decision === 'rejected';
      await notifyRelevantUsers({
        companyId: input.companyId,
        eventKey: `approval-${input.decision}:${approval.id}`,
        eventType: isRejected ? 'approval_rejected' : 'approval_approved',
        title: isRejected ? 'Approval rejected' : 'Approval granted',
        message: isRejected
          ? (input.signatureNote
            ? `Your "${approval.entity_type}" submission was rejected: ${input.signatureNote}`
            : `Your "${approval.entity_type}" submission was rejected.`)
          : `Your "${approval.entity_type}" submission was approved.`,
        recipientUserIds: [approval.requested_by_user_id as UUID],
        emailTemplateKey: 'approvals',
        emailVariables: { title: approval.entity_type, status: isRejected ? 'Rejected' : 'Approved' },
        actionUrl: '/dashboard/management/approvals',
        metadata: { itemType: 'approval', itemId: approval.id, entityType: approval.entity_type, entityId: approval.entity_id }
      }).catch(() => undefined);
    }

    return approval;
  });
}
