import { insforge } from '../insforge/client';
import type { KPIFinding, KPIFindingProofUpload, KpiFindingStatus, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';
import { createTask } from './tasksService';

export type CreateKPIFindingInput = {
  organizationId: UUID;
  assessmentId: UUID;
  lineId: UUID;
  employeeId?: UUID | null;
  projectId?: UUID | null;
  description: string;
  assignedLineManagerId: UUID;
  dueDate: string;
};

export async function createKPIFinding(input: CreateKPIFindingInput): Promise<KPIFinding> {
  const { data, error } = await insforge.database
    .from('kpi_findings')
    .insert({
      organization_id: input.organizationId,
      assessment_id: input.assessmentId,
      line_id: input.lineId,
      employee_id: input.employeeId ?? null,
      project_id: input.projectId ?? null,
      description: input.description,
      assigned_line_manager_id: input.assignedLineManagerId,
      due_date: input.dueDate,
      status: 'open'
    })
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create KPI finding.');

  const finding = data as KPIFinding;

  // kpi_assessment_lines has no organization_id column — scoped by line_id alone.
  await insforge.database
    .from('kpi_assessment_lines')
    .update({ finding_generated: true, finding_id: finding.finding_id, updated_at: new Date().toISOString() })
    .eq('line_id', input.lineId);

  await createActivityLog({
    companyId: input.organizationId,
    actorUserId: input.assignedLineManagerId,
    action: 'kpi_findings.create',
    entityType: 'kpi_finding',
    entityId: finding.finding_id
  });

  // Best-effort task integration for corrective action workflow when KPI is not achieved.
  await createTask({
    companyId: input.organizationId,
    module: 'hr',
    title: `KPI corrective action: ${input.description.slice(0, 64)}`,
    description: input.description,
    category: 'kpi_follow_up',
    priority: 'medium',
    dueAt: input.dueDate,
    assigneeUserId: input.assignedLineManagerId,
    taskOwnerUserId: input.assignedLineManagerId,
    sourceEntityType: 'kpi_finding',
    sourceEntityId: finding.finding_id,
    createdByUserId: input.assignedLineManagerId
  }).catch(() => undefined);

  const { notifyRelevantUsers } = await import('./notificationEventsService');
  await notifyRelevantUsers({
    companyId: input.organizationId,
    eventKey: `kpi-finding-created:${finding.finding_id}`,
    eventType: 'kpi_finding_created',
    title: 'KPI review pending',
    message: 'A KPI Questionnaire was marked Not Achieved and needs manager follow-up.',
    recipientUserIds: [input.assignedLineManagerId],
    emailTemplateKey: 'kpi_updates',
    emailVariables: {
      title: input.description.slice(0, 120),
      status: 'Manager follow-up required',
      owner: input.assignedLineManagerId,
      dueDate: input.dueDate
    },
    actionUrl: '/dashboard/kpi/findings',
    metadata: { itemType: 'kpi_finding', itemId: finding.finding_id, assessmentId: input.assessmentId }
  }).catch((err) => {
    console.warn('[kpi-finding] notification failed', err);
  });

  return finding;
}

export async function getKPIFinding(findingId: UUID, organizationId: UUID): Promise<KPIFinding | null> {
  const { data, error } = await insforge.database
    .from('kpi_findings')
    .select('*')
    .eq('finding_id', findingId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw new Error(getErrorMessage(error));
  return data as KPIFinding | null;
}

export type ListKPIFindingsFilters = {
  organizationId: UUID;
  status?: KpiFindingStatus;
  assignedLineManagerId?: UUID;
  dueFrom?: string;
  dueTo?: string;
  assessmentId?: UUID;
  limit?: number;
};

export async function listKPIFindings(filters: ListKPIFindingsFilters): Promise<KPIFinding[]> {
  let query = insforge.database
    .from('kpi_findings')
    .select('*')
    .eq('organization_id', filters.organizationId);

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.assignedLineManagerId) query = query.eq('assigned_line_manager_id', filters.assignedLineManagerId);
  if (filters.dueFrom) query = query.gte('due_date', filters.dueFrom);
  if (filters.dueTo) query = query.lte('due_date', filters.dueTo);
  if (filters.assessmentId) query = query.eq('assessment_id', filters.assessmentId);

  const limit = filters.limit ?? 200;
  const { data, error } = await query.order('due_date', { ascending: true }).limit(limit);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as KPIFinding[];
}

export async function updateKPIFindingStatus(
  findingId: UUID,
  organizationId: UUID,
  status: KpiFindingStatus,
  actorUserId: UUID,
  comment?: string
): Promise<KPIFinding> {
  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString()
  };
  if (status === 'closed') {
    updates.closed_at = new Date().toISOString();
  }
  if (comment?.trim()) {
    updates.manager_sign_off_comment = comment.trim();
  }
  const { data, error } = await insforge.database
    .from('kpi_findings')
    .update(updates)
    .eq('finding_id', findingId)
    .eq('organization_id', organizationId)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update finding status.');

  await createActivityLog({
    companyId: organizationId,
    actorUserId,
    action: 'kpi_findings.update',
    entityType: 'kpi_finding',
    entityId: findingId
  });

  const updated = data as KPIFinding;

  if (updated.assigned_line_manager_id && updated.assigned_line_manager_id !== actorUserId) {
    const { notifyRelevantUsers } = await import('./notificationEventsService');
    await notifyRelevantUsers({
      companyId: organizationId,
      eventKey: `kpi-finding-status:${findingId}:${status}`,
      eventType: 'kpi_finding_status_updated',
      title: 'KPI finding status updated',
      message: `KPI finding status changed to ${status}.${comment?.trim() ? ` Comment: ${comment.trim()}` : ''}`,
      recipientUserIds: [updated.assigned_line_manager_id],
      emailTemplateKey: 'kpi_updates',
      emailVariables: { title: updated.description?.slice(0, 120) ?? 'KPI finding', status },
      actionUrl: '/dashboard/kpi/findings',
      metadata: { itemType: 'kpi_finding', itemId: findingId }
    }).catch(() => undefined);
  }

  return updated;
}

export type RejectKPIFindingInput = {
  findingId: UUID;
  organizationId: UUID;
  actorUserId: UUID;
  rejectionReason: string;
};

/** Rejects a finding back to the responsible employee for action and resubmission. */
export async function rejectKPIFinding(input: RejectKPIFindingInput): Promise<KPIFinding> {
  const reason = input.rejectionReason.trim();
  if (!reason) throw new Error('A rejection reason is required.');

  const now = new Date().toISOString();
  const { data, error } = await insforge.database
    .from('kpi_findings')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      rejected_by_user_id: input.actorUserId,
      rejected_at: now,
      updated_at: now
    })
    .eq('finding_id', input.findingId)
    .eq('organization_id', input.organizationId)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to reject finding.');
  const rejected = data as KPIFinding;

  await createActivityLog({
    companyId: input.organizationId,
    actorUserId: input.actorUserId,
    action: 'kpi_findings.reject',
    entityType: 'kpi_finding',
    entityId: input.findingId,
    metadata: { rejectionReason: reason }
  }).catch(() => undefined);

  // Notify the person responsible for resolving the finding (the employee it's about,
  // falling back to the assigned line manager if this finding has no linked employee).
  const responsibleUserId = rejected.employee_id ?? rejected.assigned_line_manager_id;
  if (responsibleUserId && responsibleUserId !== input.actorUserId) {
    const { notifyRelevantUsers } = await import('./notificationEventsService');
    await notifyRelevantUsers({
      companyId: input.organizationId,
      eventKey: `kpi-finding-rejected:${input.findingId}`,
      eventType: 'kpi_finding_rejected',
      title: 'KPI finding rejected — action needed',
      message: `Your KPI finding sign-off was rejected: ${reason}`,
      recipientUserIds: [responsibleUserId],
      emailTemplateKey: 'kpi_updates',
      emailVariables: { title: rejected.description?.slice(0, 120) ?? 'KPI finding', status: 'Rejected — resubmission needed' },
      actionUrl: '/dashboard/kpi/findings',
      metadata: { itemType: 'kpi_finding', itemId: input.findingId }
    }).catch(() => undefined);
  }

  return rejected;
}

export async function attachProofToFinding(
  findingId: UUID,
  organizationId: UUID,
  proof: KPIFindingProofUpload,
  actorUserId: UUID
): Promise<KPIFinding> {
  const finding = await getKPIFinding(findingId, organizationId);
  if (!finding) throw new Error('Finding not found.');
  const existing = (finding.proof_uploads ?? []) as KPIFindingProofUpload[];
  const next = [...existing, { ...proof, uploaded_at: proof.uploaded_at ?? new Date().toISOString() }];

  const { data, error } = await insforge.database
    .from('kpi_findings')
    .update({
      proof_uploads: next,
      updated_at: new Date().toISOString()
    })
    .eq('finding_id', findingId)
    .eq('organization_id', organizationId)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to attach proof.');
  return data as KPIFinding;
}

export type ManagerSignOffInput = {
  findingId: UUID;
  organizationId: UUID;
  managerUserId: UUID;
  comment?: string | null;
  signatureMethod?: string | null;
};

export async function closeKPIFindingWithSignOff(input: ManagerSignOffInput): Promise<KPIFinding> {
  const now = new Date().toISOString();
  const { data, error } = await insforge.database
    .from('kpi_findings')
    .update({
      status: 'closed',
      closed_at: now,
      manager_sign_off_user_id: input.managerUserId,
      manager_sign_off_signed_at: now,
      manager_sign_off_comment: input.comment ?? null,
      manager_sign_off_signature_method: input.signatureMethod ?? 'password_confirm',
      updated_at: now
    })
    .eq('finding_id', input.findingId)
    .eq('organization_id', input.organizationId)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to close finding.');
  const closed = data as KPIFinding;

  // Notify the assessment creator (not just the assigned line manager, who is
  // usually the same person doing the closing here) that the finding was resolved.
  const { data: assessment } = await insforge.database
    .from('kpi_assessments')
    .select('created_by_user_id, assessment_name')
    .eq('assessment_id', closed.assessment_id)
    .eq('organization_id', input.organizationId)
    .maybeSingle();

  const recipientIds = new Set<string>();
  const creatorId = (assessment as { created_by_user_id?: string } | null)?.created_by_user_id;
  if (creatorId && creatorId !== input.managerUserId) recipientIds.add(creatorId);
  if (closed.assigned_line_manager_id && closed.assigned_line_manager_id !== input.managerUserId) {
    recipientIds.add(closed.assigned_line_manager_id);
  }

  if (recipientIds.size > 0) {
    const { notifyRelevantUsers } = await import('./notificationEventsService');
    await notifyRelevantUsers({
      companyId: input.organizationId,
      eventKey: `kpi-finding-closed:${input.findingId}`,
      eventType: 'kpi_finding_closed',
      title: 'KPI finding closed',
      message: 'A KPI finding has been closed with manager sign-off.',
      recipientUserIds: Array.from(recipientIds) as UUID[],
      emailTemplateKey: 'kpi_updates',
      emailVariables: { title: closed.description?.slice(0, 120) ?? 'KPI finding', status: 'Closed' },
      actionUrl: '/dashboard/kpi/findings',
      metadata: { itemType: 'kpi_finding', itemId: input.findingId }
    }).catch(() => undefined);
  }

  return closed;
}

export async function deleteKPIFinding(input: {
  organizationId: UUID;
  findingId: UUID;
  actorUserId: UUID;
}): Promise<void> {
  const { data: existing, error: existingError } = await insforge.database
    .from('kpi_findings')
    .select('finding_id,line_id')
    .eq('organization_id', input.organizationId)
    .eq('finding_id', input.findingId)
    .maybeSingle();
  if (existingError) throw new Error(getErrorMessage(existingError));
  if (!existing) throw new Error('Finding not found.');

  const lineId = (existing as any).line_id as UUID | null;

  const { error } = await insforge.database
    .from('kpi_findings')
    .delete()
    .eq('organization_id', input.organizationId)
    .eq('finding_id', input.findingId);
  if (error) throw new Error(getErrorMessage(error));

  if (lineId) {
    // kpi_assessment_lines has no organization_id column — scoped by line_id/finding_id alone.
    await insforge.database
      .from('kpi_assessment_lines')
      .update({ finding_generated: false, finding_id: null, updated_at: new Date().toISOString() })
      .eq('line_id', lineId)
      .eq('finding_id', input.findingId);
  }

  await createActivityLog({
    companyId: input.organizationId,
    actorUserId: input.actorUserId,
    action: 'kpi_findings.delete',
    entityType: 'kpi_finding',
    entityId: input.findingId
  }).catch(() => undefined);
}
