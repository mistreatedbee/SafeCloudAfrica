import { insforge } from '../insforge/client';
import { withInsforgeSession } from '../insforge/ensureSession';
import { getErrorMessage } from '../insforge/errors';
import type { UUID } from '../models/entities';
import type { PermitType } from '../constants/permitToWork';
import { createActivityLog } from './activityLogService';

export type PermitToWorkStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'REJECTED'
  | 'CLOSED'
  | 'CANCELLED';

export type PermitToWork = {
  id: UUID;
  company_id: UUID;
  permit_number: string | null;
  permit_type: PermitType | null;
  work_description: string;
  mandatory_requirements: string | null;
  location: string | null;
  site_id: UUID | null;
  requested_by_user_id: UUID | null;
  approved_by_user_id: UUID | null;
  valid_from: string | null;
  valid_to: string | null;
  hazards: string[];
  precautions: string[];
  status: PermitToWorkStatus;
  status_comment: string | null;
  closed_at: string | null;
  closed_by_user_id: UUID | null;
  created_at: string;
  updated_at: string;
};

async function notifyPermitRecipient(input: {
  companyId: UUID;
  permit: PermitToWork;
  recipientUserId: UUID;
  eventKey: string;
  eventType: string;
  title: string;
  message: string;
  statusLabel: string;
}): Promise<void> {
  const { notifyRelevantUsers } = await import('./notificationEventsService');
  await notifyRelevantUsers({
    companyId: input.companyId,
    eventKey: input.eventKey,
    eventType: input.eventType,
    title: input.title,
    message: input.message,
    recipientUserIds: [input.recipientUserId],
    emailTemplateKey: 'permit_to_work',
    emailVariables: {
      reference: input.permit.permit_number ?? input.permit.id,
      title: input.permit.work_description,
      status: input.statusLabel,
      location: input.permit.location ?? undefined,
      dueDate: input.permit.valid_to ?? undefined
    },
    actionUrl: '/dashboard/safety/permit-to-work',
    metadata: { itemType: 'permit_to_work', itemId: input.permit.id }
  }).catch((err) => {
    console.warn('[permits] notification failed', input.permit.id, err);
  });
}

export async function listPermitsToWork(companyId: UUID): Promise<PermitToWork[]> {
  return withInsforgeSession('permits_to_work:list', async () => {
    const { data, error } = await insforge.database
      .from('permits_to_work')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? []) as PermitToWork[];
  });
}

export async function createPermitToWork(input: {
  companyId: UUID;
  permitNumber?: string | null;
  permitType?: PermitType | null;
  workDescription: string;
  mandatoryRequirements?: string | null;
  location?: string | null;
  siteId?: UUID | null;
  requestedByUserId?: UUID | null;
  approvedByUserId?: UUID | null;
  validFrom?: string | null;
  validTo?: string | null;
  hazards?: string[];
  precautions?: string[];
  actorUserId: UUID;
}): Promise<PermitToWork> {
  return withInsforgeSession('permits_to_work:create', async () => {
    if (!input.approvedByUserId) {
      throw new Error('Person to approve permit is required.');
    }

    const { data, error } = await insforge.database
      .from('permits_to_work')
      .insert({
        company_id: input.companyId,
        permit_number: input.permitNumber ?? null,
        permit_type: input.permitType ?? null,
        work_description: input.workDescription,
        mandatory_requirements: input.mandatoryRequirements ?? null,
        location: input.location ?? null,
        site_id: input.siteId ?? null,
        requested_by_user_id: input.requestedByUserId ?? input.actorUserId,
        approved_by_user_id: input.approvedByUserId,
        valid_from: input.validFrom ?? null,
        valid_to: input.validTo ?? null,
        hazards: input.hazards ?? [],
        precautions: input.precautions ?? [],
        status: 'PENDING',
        status_comment: null
      })
      .select('*')
      .single();
    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to create permit to work.');

    await createActivityLog({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'permits_to_work.create',
      entityType: 'permit_to_work',
      entityId: (data as PermitToWork).id
    });

    const permit = data as PermitToWork;
    if (permit.approved_by_user_id) {
      await notifyPermitRecipient({
        companyId: input.companyId,
        permit,
        recipientUserId: permit.approved_by_user_id,
        eventKey: `permit-created:${permit.id}`,
        eventType: 'permit_to_work_created',
        title: 'Permit to work awaiting approval',
        message: `A permit to work "${permit.work_description}" is awaiting your approval.`,
        statusLabel: 'Awaiting approval'
      });
    }

    return permit;
  });
}

export async function updatePermitToWork(input: {
  companyId: UUID;
  permitId: UUID;
  patch: Partial<
    Pick<
      PermitToWork,
      | 'permit_number'
      | 'permit_type'
      | 'work_description'
      | 'mandatory_requirements'
      | 'location'
      | 'site_id'
      | 'approved_by_user_id'
      | 'valid_from'
      | 'valid_to'
      | 'hazards'
      | 'precautions'
      | 'status'
      | 'status_comment'
      | 'closed_at'
      | 'closed_by_user_id'
    >
  >;
  actorUserId: UUID;
}): Promise<PermitToWork> {
  return withInsforgeSession('permits_to_work:update', async () => {
    const { data, error } = await insforge.database
      .from('permits_to_work')
      .update({ ...input.patch, updated_at: new Date().toISOString() })
      .eq('company_id', input.companyId)
      .eq('id', input.permitId)
      .select('*')
      .single();
    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to update permit to work.');

    await createActivityLog({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'permits_to_work.update',
      entityType: 'permit_to_work',
      entityId: input.permitId,
      metadata: input.patch as Record<string, unknown>
    });

    return data as PermitToWork;
  });
}

export async function approvePermitToWork(input: {
  companyId: UUID;
  permitId: UUID;
  actorUserId: UUID;
  comment?: string | null;
}): Promise<PermitToWork> {
  const permit = await updatePermitToWork({
    companyId: input.companyId,
    permitId: input.permitId,
    actorUserId: input.actorUserId,
    patch: {
      status: 'APPROVED',
      approved_by_user_id: input.actorUserId,
      status_comment: input.comment?.trim() || null
    }
  });

  if (permit.requested_by_user_id) {
    await notifyPermitRecipient({
      companyId: input.companyId,
      permit,
      recipientUserId: permit.requested_by_user_id,
      eventKey: `permit-approved:${permit.id}`,
      eventType: 'permit_to_work_approved',
      title: 'Permit to work approved',
      message: `Your permit "${permit.work_description}" has been approved.`,
      statusLabel: 'Approved'
    });
  }

  return permit;
}

export async function rejectPermitToWork(input: {
  companyId: UUID;
  permitId: UUID;
  actorUserId: UUID;
  comment: string;
}): Promise<PermitToWork> {
  const comment = input.comment.trim();
  if (!comment) throw new Error('A rejection comment is required.');

  const permit = await updatePermitToWork({
    companyId: input.companyId,
    permitId: input.permitId,
    actorUserId: input.actorUserId,
    patch: {
      status: 'REJECTED',
      status_comment: comment
    }
  });

  if (permit.requested_by_user_id) {
    await notifyPermitRecipient({
      companyId: input.companyId,
      permit,
      recipientUserId: permit.requested_by_user_id,
      eventKey: `permit-rejected:${permit.id}`,
      eventType: 'permit_to_work_rejected',
      title: 'Permit to work rejected',
      message: `Your permit "${permit.work_description}" was rejected. Comment: ${comment}`,
      statusLabel: 'Rejected'
    });
  }

  return permit;
}

export async function suspendPermitToWork(input: {
  companyId: UUID;
  permitId: UUID;
  actorUserId: UUID;
  comment: string;
}): Promise<PermitToWork> {
  const comment = input.comment.trim();
  if (!comment) throw new Error('A suspension comment is required.');

  const permit = await updatePermitToWork({
    companyId: input.companyId,
    permitId: input.permitId,
    actorUserId: input.actorUserId,
    patch: {
      status: 'SUSPENDED',
      status_comment: comment
    }
  });

  if (permit.requested_by_user_id) {
    await notifyPermitRecipient({
      companyId: input.companyId,
      permit,
      recipientUserId: permit.requested_by_user_id,
      eventKey: `permit-suspended:${permit.id}`,
      eventType: 'permit_to_work_suspended',
      title: 'Permit to work suspended',
      message: `Your permit "${permit.work_description}" was suspended. Comment: ${comment}`,
      statusLabel: 'Suspended'
    });
  }

  return permit;
}

export async function closePermitToWork(input: {
  companyId: UUID;
  permitId: UUID;
  actorUserId: UUID;
  comment?: string | null;
}): Promise<PermitToWork> {
  return updatePermitToWork({
    companyId: input.companyId,
    permitId: input.permitId,
    actorUserId: input.actorUserId,
    patch: {
      status: 'CLOSED',
      status_comment: input.comment?.trim() || null,
      closed_at: new Date().toISOString(),
      closed_by_user_id: input.actorUserId
    }
  });
}

export async function deletePermitToWork(input: { companyId: UUID; permitId: UUID; actorUserId: UUID }): Promise<void> {
  return withInsforgeSession('permits_to_work:delete', async () => {
    const { error } = await insforge.database
      .from('permits_to_work')
      .delete()
      .eq('company_id', input.companyId)
      .eq('id', input.permitId);
    if (error) throw new Error(getErrorMessage(error));

    await createActivityLog({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'permits_to_work.delete',
      entityType: 'permit_to_work',
      entityId: input.permitId
    });
  });
}
