import { insforge } from '../insforge/client';
import { withInsforgeSession } from '../insforge/ensureSession';
import { getErrorMessage } from '../insforge/errors';
import type { UUID } from '../models/entities';
import { createActivityLog } from './activityLogService';

export type LotoStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' | 'REJECTED' | 'CLOSED';

export type LotoRecord = {
  id: UUID;
  company_id: UUID;
  equipment_name: string;
  location: string | null;
  site_id: UUID | null;
  lock_applied_by_user_id: UUID | null;
  lock_applied_at: string | null;
  lock_removed_by_user_id: UUID | null;
  lock_removed_at: string | null;
  reason: string | null;
  isolation_points: string[];
  start_time: string | null;
  end_time: string | null;
  responsible_person_user_id: UUID | null;
  authorised_loto_person_user_id: UUID | null;
  affected_employees_count: number | null;
  zero_energy_verified: boolean | null;
  shift_handover: boolean | null;
  loto_risk_assessment_completed: boolean | null;
  emergency_removal_requested: boolean;
  emergency_removal_notify_user_id: UUID | null;
  emergency_removal_comment: string | null;
  status_comment: string | null;
  restoration_verified: boolean | null;
  closed_at: string | null;
  closed_by_user_id: UUID | null;
  status: LotoStatus;
  created_at: string;
  updated_at: string;
};

async function notifyLotoRecipient(input: {
  companyId: UUID;
  record: LotoRecord;
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
      reference: input.record.equipment_name,
      title: input.record.reason ?? input.record.equipment_name,
      status: input.statusLabel,
      location: input.record.location ?? undefined
    },
    actionUrl: '/dashboard/safety/loto',
    metadata: { itemType: 'loto_record', itemId: input.record.id }
  }).catch((err) => {
    console.warn('[loto] notification failed', input.record.id, err);
  });
}

export async function listLotoRecords(companyId: UUID): Promise<LotoRecord[]> {
  return withInsforgeSession('loto_records:list', async () => {
    const { data, error } = await insforge.database
      .from('loto_records')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? []) as LotoRecord[];
  });
}

export async function createLotoRecord(input: {
  companyId: UUID;
  equipmentName: string;
  location?: string | null;
  siteId?: UUID | null;
  lockAppliedByUserId?: UUID | null;
  reason?: string | null;
  isolationPoints?: string[];
  startTime?: string | null;
  endTime?: string | null;
  responsiblePersonUserId: UUID;
  authorisedLotoPersonUserId: UUID;
  affectedEmployeesCount?: number | null;
  zeroEnergyVerified: boolean;
  shiftHandover: boolean;
  lotoRiskAssessmentCompleted: boolean;
  actorUserId: UUID;
}): Promise<LotoRecord> {
  return withInsforgeSession('loto_records:create', async () => {
    if (input.startTime && input.endTime && input.startTime > input.endTime) {
      throw new Error('Start time must be before end time.');
    }

    const { data, error } = await insforge.database
      .from('loto_records')
      .insert({
        company_id: input.companyId,
        equipment_name: input.equipmentName,
        location: input.location ?? null,
        site_id: input.siteId ?? null,
        lock_applied_by_user_id: input.lockAppliedByUserId ?? input.actorUserId,
        lock_applied_at: null,
        reason: input.reason ?? null,
        isolation_points: input.isolationPoints ?? [],
        start_time: input.startTime ?? null,
        end_time: input.endTime ?? null,
        responsible_person_user_id: input.responsiblePersonUserId,
        authorised_loto_person_user_id: input.authorisedLotoPersonUserId,
        affected_employees_count: input.affectedEmployeesCount ?? null,
        zero_energy_verified: input.zeroEnergyVerified,
        shift_handover: input.shiftHandover,
        loto_risk_assessment_completed: input.lotoRiskAssessmentCompleted,
        emergency_removal_requested: false,
        status: 'PENDING',
        status_comment: null
      })
      .select('*')
      .single();
    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to create LOTO record.');

    await createActivityLog({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'loto_records.create',
      entityType: 'loto_record',
      entityId: (data as LotoRecord).id
    });

    const record = data as LotoRecord;
    if (record.authorised_loto_person_user_id) {
      await notifyLotoRecipient({
        companyId: input.companyId,
        record,
        recipientUserId: record.authorised_loto_person_user_id,
        eventKey: `loto-created:${record.id}`,
        eventType: 'loto_record_created',
        title: 'LOTO lockout awaiting authorisation',
        message: `A LOTO lockout for "${record.equipment_name}" requires your approval.`,
        statusLabel: 'Awaiting approval'
      });
    }

    return record;
  });
}

export async function updateLotoRecord(input: {
  companyId: UUID;
  recordId: UUID;
  patch: Partial<
    Pick<
      LotoRecord,
      | 'equipment_name'
      | 'location'
      | 'site_id'
      | 'lock_removed_by_user_id'
      | 'lock_removed_at'
      | 'reason'
      | 'isolation_points'
      | 'start_time'
      | 'end_time'
      | 'responsible_person_user_id'
      | 'authorised_loto_person_user_id'
      | 'affected_employees_count'
      | 'zero_energy_verified'
      | 'shift_handover'
      | 'loto_risk_assessment_completed'
      | 'emergency_removal_requested'
      | 'emergency_removal_notify_user_id'
      | 'emergency_removal_comment'
      | 'status_comment'
      | 'restoration_verified'
      | 'closed_at'
      | 'closed_by_user_id'
      | 'status'
      | 'lock_applied_at'
    >
  >;
  actorUserId: UUID;
}): Promise<LotoRecord> {
  return withInsforgeSession('loto_records:update', async () => {
    const { data, error } = await insforge.database
      .from('loto_records')
      .update({ ...input.patch, updated_at: new Date().toISOString() })
      .eq('company_id', input.companyId)
      .eq('id', input.recordId)
      .select('*')
      .single();
    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to update LOTO record.');

    await createActivityLog({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'loto_records.update',
      entityType: 'loto_record',
      entityId: input.recordId,
      metadata: input.patch as Record<string, unknown>
    });

    return data as LotoRecord;
  });
}

export async function approveLotoRecord(input: {
  companyId: UUID;
  recordId: UUID;
  actorUserId: UUID;
  comment?: string | null;
}): Promise<LotoRecord> {
  const record = await updateLotoRecord({
    companyId: input.companyId,
    recordId: input.recordId,
    actorUserId: input.actorUserId,
    patch: {
      status: 'ACTIVE',
      lock_applied_at: new Date().toISOString(),
      status_comment: input.comment?.trim() || null
    }
  });

  if (record.responsible_person_user_id) {
    await notifyLotoRecipient({
      companyId: input.companyId,
      record,
      recipientUserId: record.responsible_person_user_id,
      eventKey: `loto-approved:${record.id}`,
      eventType: 'loto_record_approved',
      title: 'LOTO lockout approved',
      message: `LOTO for "${record.equipment_name}" is now active.`,
      statusLabel: 'Active'
    });
  }

  return record;
}

export async function rejectLotoRecord(input: {
  companyId: UUID;
  recordId: UUID;
  actorUserId: UUID;
  comment: string;
}): Promise<LotoRecord> {
  const comment = input.comment.trim();
  if (!comment) throw new Error('A rejection comment is required.');

  const record = await updateLotoRecord({
    companyId: input.companyId,
    recordId: input.recordId,
    actorUserId: input.actorUserId,
    patch: { status: 'REJECTED', status_comment: comment }
  });

  if (record.responsible_person_user_id) {
    await notifyLotoRecipient({
      companyId: input.companyId,
      record,
      recipientUserId: record.responsible_person_user_id,
      eventKey: `loto-rejected:${record.id}`,
      eventType: 'loto_record_rejected',
      title: 'LOTO lockout rejected',
      message: `LOTO for "${record.equipment_name}" was rejected. Comment: ${comment}`,
      statusLabel: 'Rejected'
    });
  }

  return record;
}

export async function suspendLotoRecord(input: {
  companyId: UUID;
  recordId: UUID;
  actorUserId: UUID;
  comment: string;
}): Promise<LotoRecord> {
  const comment = input.comment.trim();
  if (!comment) throw new Error('A suspension comment is required.');

  return updateLotoRecord({
    companyId: input.companyId,
    recordId: input.recordId,
    actorUserId: input.actorUserId,
    patch: { status: 'SUSPENDED', status_comment: comment }
  });
}

export async function cancelLotoRecord(input: {
  companyId: UUID;
  recordId: UUID;
  actorUserId: UUID;
  comment: string;
}): Promise<LotoRecord> {
  const comment = input.comment.trim();
  if (!comment) throw new Error('A cancellation comment is required.');

  return updateLotoRecord({
    companyId: input.companyId,
    recordId: input.recordId,
    actorUserId: input.actorUserId,
    patch: { status: 'CANCELLED', status_comment: comment }
  });
}

export async function requestEmergencyLotoRemoval(input: {
  companyId: UUID;
  recordId: UUID;
  actorUserId: UUID;
  notifyUserId: UUID;
  comment: string;
}): Promise<LotoRecord> {
  const comment = input.comment.trim();
  if (!comment) throw new Error('Emergency removal details are required.');

  const record = await updateLotoRecord({
    companyId: input.companyId,
    recordId: input.recordId,
    actorUserId: input.actorUserId,
    patch: {
      emergency_removal_requested: true,
      emergency_removal_notify_user_id: input.notifyUserId,
      emergency_removal_comment: comment,
      status_comment: comment
    }
  });

  await notifyLotoRecipient({
    companyId: input.companyId,
    record,
    recipientUserId: input.notifyUserId,
    eventKey: `loto-emergency:${record.id}`,
    eventType: 'loto_emergency_removal',
    title: 'Emergency LOTO removal requested',
    message: `Emergency lock removal requested for "${record.equipment_name}". ${comment}`,
    statusLabel: 'Emergency removal requested'
  });

  return record;
}

export async function closeLotoRecord(input: {
  companyId: UUID;
  recordId: UUID;
  actorUserId: UUID;
  restorationVerified: boolean;
  comment?: string | null;
}): Promise<LotoRecord> {
  if (!input.restorationVerified) {
    throw new Error('Restoration / de-isolation must be verified before closing the LOTO.');
  }

  return updateLotoRecord({
    companyId: input.companyId,
    recordId: input.recordId,
    actorUserId: input.actorUserId,
    patch: {
      status: 'CLOSED',
      restoration_verified: true,
      status_comment: input.comment?.trim() || null,
      closed_at: new Date().toISOString(),
      closed_by_user_id: input.actorUserId,
      lock_removed_by_user_id: input.actorUserId,
      lock_removed_at: new Date().toISOString()
    }
  });
}

export async function deleteLotoRecord(input: { companyId: UUID; recordId: UUID; actorUserId: UUID }): Promise<void> {
  return withInsforgeSession('loto_records:delete', async () => {
    const { error } = await insforge.database
      .from('loto_records')
      .delete()
      .eq('company_id', input.companyId)
      .eq('id', input.recordId);
    if (error) throw new Error(getErrorMessage(error));

    await createActivityLog({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'loto_records.delete',
      entityType: 'loto_record',
      entityId: input.recordId
    });
  });
}
