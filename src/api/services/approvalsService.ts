import { insforge } from '../insforge/client';
import { withInsforgeSession } from '../insforge/ensureSession';
import type { Approval, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';
import { sendTemplatedNotificationEmail } from './emailService';

async function getProfileEmail(companyId: UUID, userId: UUID): Promise<string | null> {
  const { data } = await insforge.database
    .from('user_profiles')
    .select('email')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle();
  const email = String((data as any)?.email ?? '').trim();
  return email || null;
}

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

  try {
    const email = await getProfileEmail(input.companyId, input.approverUserId);
    if (email) {
      await sendTemplatedNotificationEmail({
        to: email,
        templateKey: 'approvals',
        variables: {
          title: input.entityType,
          itemType: input.entityType,
          requester: input.requestedByUserId,
          status: 'Pending'
        },
        actionUrl: '/dashboard/management/approvals',
        meta: {
          companyId: input.companyId,
          approvalId: (data as any).id,
          entityType: input.entityType,
          entityId: input.entityId
        }
      });
    }
  } catch (err) {
    console.warn('[approvals] notification failed', (data as any).id, err);
  }

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

    if (input.decision === 'rejected' && approval.requested_by_user_id) {
      const { notifyRelevantUsers } = await import('./notificationEventsService');
      await notifyRelevantUsers({
        companyId: input.companyId,
        eventKey: `approval-rejected:${approval.id}`,
        eventType: 'approval_rejected',
        title: 'Approval rejected',
        message: input.signatureNote
          ? `Your "${approval.entity_type}" submission was rejected: ${input.signatureNote}`
          : `Your "${approval.entity_type}" submission was rejected.`,
        recipientUserIds: [approval.requested_by_user_id as UUID],
        emailTemplateKey: 'approvals',
        emailVariables: { title: approval.entity_type, status: 'Rejected' },
        actionUrl: '/dashboard/management/approvals',
        metadata: { itemType: 'approval', itemId: approval.id, entityType: approval.entity_type, entityId: approval.entity_id }
      }).catch(() => undefined);
    }

    return approval;
  });
}
