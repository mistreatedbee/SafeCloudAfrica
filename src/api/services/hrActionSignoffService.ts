import { insforge } from '../insforge/client';
import { withInsforgeSession } from '../insforge/ensureSession';
import { getErrorMessage } from '../insforge/errors';
import type { HrActionSignoffRequest, UUID } from '../models/entities';
import { createActivityLog } from './activityLogService';
import { updateHrRecord } from './hrService';

export async function createSignoffRequest(input: {
  companyId: UUID;
  entityType: string;
  entityId: UUID;
  assessmentId: UUID | null;
  actionSummary?: string | null;
  requestedForEmployeeId: UUID;
  requestedForUserId: UUID | null;
  requestedByUserId: UUID;
  note?: string | null;
  notificationTitle?: string;
  notificationMessage?: string;
}): Promise<HrActionSignoffRequest> {
  return withInsforgeSession('hr-signoff:create', async () => {
    const { data, error } = await insforge.database
      .from('hr_action_signoff_requests')
      .insert({
        company_id: input.companyId,
        entity_type: input.entityType,
        entity_id: input.entityId,
        assessment_id: input.assessmentId,
        action_summary: input.actionSummary ?? null,
        requested_for_employee_id: input.requestedForEmployeeId,
        requested_for_user_id: input.requestedForUserId,
        requested_by_user_id: input.requestedByUserId,
        note: input.note ?? null
      })
      .select('*')
      .single();
    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to create sign-off request.');

    const created = data as HrActionSignoffRequest;

    await createActivityLog({
      companyId: input.companyId,
      actorUserId: input.requestedByUserId,
      action: 'hr_action_signoff_requests.create',
      entityType: input.entityType,
      entityId: input.entityId
    }).catch(() => {});

    if (input.requestedForUserId) {
      const { notifyRelevantUsers } = await import('./notificationEventsService');
      await notifyRelevantUsers({
        companyId: input.companyId,
        eventKey: `hr-signoff-requested:${created.id}`,
        eventType: 'hr_action_signoff_requested',
        title: input.notificationTitle ?? 'Sign-off requested',
        message: input.notificationMessage ?? 'A sign-off has been requested from you on an HR action item.',
        recipientUserIds: [input.requestedForUserId],
        emailTemplateKey: 'hr_updates',
        emailVariables: {
          title: input.notificationTitle ?? 'Sign-off Requested',
          status: 'Pending',
          employee: input.requestedForUserId
        },
        actionUrl: '/dashboard/hr/wellness',
        metadata: {
          itemType: 'hr_action_signoff',
          itemId: created.id,
          module: 'hr',
          assessmentId: input.assessmentId,
          actionId: input.entityId
        }
      }).catch((err) => {
        console.warn('[hr-signoff] notification failed', err);
      });
    }

    return created;
  });
}

export async function listSignoffRequestsForEmployee(
  companyId: UUID,
  employeeId: UUID,
  status?: 'pending' | 'signed_off' | 'cancelled'
): Promise<HrActionSignoffRequest[]> {
  return withInsforgeSession('hr-signoff:list-for-employee', async () => {
    let q = insforge.database
      .from('hr_action_signoff_requests')
      .select('*')
      .eq('company_id', companyId)
      .eq('requested_for_employee_id', employeeId);
    if (status) q = q.eq('status', status);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? []) as HrActionSignoffRequest[];
  });
}

export async function listSignoffRequestsForAssessment(
  companyId: UUID,
  assessmentId: UUID
): Promise<HrActionSignoffRequest[]> {
  return withInsforgeSession('hr-signoff:list-for-assessment', async () => {
    const { data, error } = await insforge.database
      .from('hr_action_signoff_requests')
      .select('*')
      .eq('company_id', companyId)
      .eq('assessment_id', assessmentId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? []) as HrActionSignoffRequest[];
  });
}

export async function signOffWellnessAction(input: {
  companyId: UUID;
  requestId: UUID;
  actionId: UUID;
  actorUserId: UUID;
}): Promise<void> {
  return withInsforgeSession('hr-signoff:sign-off', async () => {
    const nowIso = new Date().toISOString();
    const { data, error } = await insforge.database
      .from('hr_action_signoff_requests')
      .update({ status: 'signed_off', signed_off_at: nowIso, updated_at: nowIso })
      .eq('id', input.requestId)
      .eq('company_id', input.companyId)
      .select('requested_by_user_id')
      .maybeSingle();
    if (error) throw new Error(getErrorMessage(error));

    await updateHrRecord('hr_employee_wellness_actions', {
      companyId: input.companyId,
      rowId: input.actionId,
      actorUserId: input.actorUserId,
      patch: { status: 'COMPLETED', completed_date: nowIso.slice(0, 10) }
    });

    await createActivityLog({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'hr_action_signoff_requests.sign_off',
      entityType: 'hr_employee_wellness_action',
      entityId: input.actionId
    }).catch(() => {});

    const requestedByUserId = (data as any)?.requested_by_user_id as UUID | undefined;
    if (requestedByUserId && requestedByUserId !== input.actorUserId) {
      const { notifyRelevantUsers } = await import('./notificationEventsService');
      await notifyRelevantUsers({
        companyId: input.companyId,
        eventKey: `hr-signoff-complete:${input.requestId}`,
        eventType: 'hr_action_signed_off',
        title: 'Sign-off completed',
        message: 'An HR action item you requested a sign-off on has been signed off.',
        recipientUserIds: [requestedByUserId],
        emailTemplateKey: 'hr_updates',
        emailVariables: { title: 'HR Action Sign-off', status: 'Completed' },
        actionUrl: '/dashboard/hr/wellness',
        metadata: { itemType: 'hr_action_signoff', itemId: input.requestId, actionId: input.actionId }
      }).catch(() => undefined);
    }
  });
}
