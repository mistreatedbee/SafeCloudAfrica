import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import type {
  ImprovementClosureStatus,
  ImprovementComment,
  ImprovementRecord,
  ImprovementRiskLevel,
  ImprovementSourceType,
  ImprovementType,
  ImprovementVerificationMethod,
  ImprovementWorkflowStatus,
  UUID
} from '../models/entities';
import type { CompanyRole } from '../models/core';
import { createActivityLog } from './activityLogService';

const FINAL_STATUSES: ImprovementWorkflowStatus[] = ['closed', 'monitoring_required', 'escalated'];
const MANAGEMENT_ROLES: CompanyRole[] = ['owner', 'admin', 'manager', 'supervisor'];
const CLOSURE_ROLES: CompanyRole[] = ['owner', 'admin', 'manager'];

export const IMPROVEMENT_STATUS_LABELS: Record<ImprovementWorkflowStatus, string> = {
  draft: 'Draft',
  open: 'Open',
  in_progress: 'In Progress',
  awaiting_evidence: 'Awaiting Evidence',
  awaiting_verification: 'Awaiting Verification',
  under_management_review: 'Under Management Review',
  closed: 'Closed',
  monitoring_required: 'Monitoring Required',
  escalated: 'Escalated'
};

export const IMPROVEMENT_TYPE_LABELS: Record<ImprovementType, string> = {
  corrective_action: 'Corrective Action (Incident / Non-Conformance)',
  preventive_action: 'Preventive Action (Risk Identified)',
  audit_finding: 'Audit Finding',
  management_review_decision: 'Management Review Decision',
  employee_suggestion: 'Employee Suggestion',
  process_improvement: 'Process Improvement',
  client_complaint: 'Client Complaint',
  other: 'Other'
};

export const IMPROVEMENT_SOURCE_LABELS: Record<ImprovementSourceType, string> = {
  incident: 'Incident',
  ncr: 'NCR',
  audit: 'Audit',
  risk: 'Risk',
  management_review: 'Management Review',
  other: 'Other'
};

export const IMPROVEMENT_VERIFICATION_METHOD_LABELS: Record<ImprovementVerificationMethod, string> = {
  follow_up_audit: 'Follow-up Audit',
  inspection: 'Inspection',
  observation: 'Observation',
  kpi_monitoring: 'KPI Monitoring',
  training_assessment: 'Training Assessment',
  client_feedback: 'Client Feedback',
  other: 'Other'
};

export type ImprovementListFilters = {
  companyId: UUID;
  search?: string;
  status?: ImprovementWorkflowStatus;
  type?: ImprovementType;
  riskLevel?: ImprovementRiskLevel;
  departmentSite?: string;
  raisedByUserId?: UUID;
  responsibleUserId?: UUID;
  sourceType?: ImprovementSourceType;
  dateRaisedFrom?: string;
  dateRaisedTo?: string;
  targetDateFrom?: string;
  targetDateTo?: string;
  closureDateFrom?: string;
  closureDateTo?: string;
  limit?: number;
};

export type ImprovementSummary = {
  openCount: number;
  overdueCount: number;
  highCriticalOpenCount: number;
  closedThisMonthCount: number;
  monitoringRequiredCount: number;
  closureRate: number;
  avgDaysToClose: number;
  byType: Array<{ type: ImprovementType; count: number }>;
  byDepartmentSite: Array<{ departmentSite: string; count: number }>;
  monthlyTrend: Array<{ month: string; opened: number; closed: number }>;
};

export function isImprovementOverdue(rec: Pick<ImprovementRecord, 'status' | 'target_date'>, now = new Date()): boolean {
  if (!rec.target_date) return false;
  if (FINAL_STATUSES.includes(rec.status)) return false;
  return new Date(rec.target_date).getTime() < now.getTime();
}

function canEditRole(role: CompanyRole | null): boolean {
  return !!role && MANAGEMENT_ROLES.includes(role);
}

function canCloseRole(role: CompanyRole | null): boolean {
  return !!role && CLOSURE_ROLES.includes(role);
}

async function getOrCreateNextReferenceNumber(companyId: UUID): Promise<string> {
  const year = new Date().getFullYear();
  const nowIso = new Date().toISOString();

  const { error: upsertError } = await insforge.database.from('improvement_reference_counter').upsert(
    { company_id: companyId, year, last_number: 0, updated_at: nowIso },
    { onConflict: 'company_id,year' }
  );
  if (upsertError) throw new Error(getErrorMessage(upsertError));

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data: counter, error: readError } = await insforge.database
      .from('improvement_reference_counter')
      .select('company_id, year, last_number')
      .eq('company_id', companyId)
      .eq('year', year)
      .maybeSingle();
    if (readError) throw new Error(getErrorMessage(readError));
    if (!counter) {
      // Retry loop: row may not be visible yet due to transaction lag.
      continue;
    }
    const last = Number((counter as any)?.last_number ?? 0);
    const next = last + 1;

    const { data: updated, error: updateError } = await insforge.database
      .from('improvement_reference_counter')
      .update({ last_number: next, updated_at: nowIso })
      .eq('company_id', companyId)
      .eq('year', year)
      .eq('last_number', last)
      .select('last_number')
      .maybeSingle();
    if (updateError) throw new Error(getErrorMessage(updateError));
    if (updated) {
      return `IMP-${year}-${String(next).padStart(5, '0')}`;
    }
  }

  const randomSuffix = String(Math.floor(10000 + Math.random() * 90000));
  return `IMP-${year}-${randomSuffix}`;
}

function requiresManagementReview(rec: Pick<ImprovementRecord, 'improvement_type' | 'risk_level'>): boolean {
  return rec.improvement_type === 'management_review_decision' || rec.risk_level === 'high' || rec.risk_level === 'critical';
}

function validateBeforeStatusUpdate(
  existing: ImprovementRecord,
  patch: Partial<ImprovementRecord>,
  role: CompanyRole | null
): void {
  const nextStatus = (patch.status ?? existing.status) as ImprovementWorkflowStatus;
  const actionRequired = patch.action_required ?? existing.action_required;
  const responsibleUserId = patch.responsible_user_id ?? existing.responsible_user_id;
  const targetDate = patch.target_date ?? existing.target_date;
  const effective = patch.was_action_effective ?? existing.was_action_effective;
  const verifiedBy = patch.verified_by_user_id ?? existing.verified_by_user_id;
  const dateVerified = patch.date_verified ?? existing.date_verified;
  const managementReviewedBy = patch.management_reviewed_by_user_id ?? existing.management_reviewed_by_user_id;
  const managementReviewDate = patch.management_review_date ?? existing.management_review_date;

  if (nextStatus === 'awaiting_verification') {
    if (!actionRequired || !responsibleUserId || !targetDate) {
      throw new Error('Action required, responsible person, and target date are required before verification.');
    }
  }

  if (nextStatus === 'closed') {
    if (!canCloseRole(role)) throw new Error('Only owner/admin/manager roles can close improvements.');
    if (effective !== true) throw new Error('Effectiveness must be confirmed as Yes before closure.');
    if (!verifiedBy || !dateVerified) throw new Error('Verified by and date verified are required before closure.');
    if (requiresManagementReview(existing) && (!managementReviewedBy || !managementReviewDate)) {
      throw new Error('Management review is required before closure for this improvement.');
    }
  }

  if (effective === false && nextStatus === 'closed') {
    throw new Error('Ineffective actions cannot be closed. Re-open or escalate.');
  }
}

function enforceEffectivenessEscalation(patch: Partial<ImprovementRecord>): Partial<ImprovementRecord> {
  if (patch.was_action_effective === false && patch.status === 'closed') {
    return { ...patch, status: 'escalated' };
  }
  return patch;
}

async function createInAppNotification(input: {
  companyId: UUID;
  userId: UUID;
  title: string;
  message: string;
  severity?: ImprovementRiskLevel;
}): Promise<void> {
  await insforge.database.from('notifications').insert({
    company_id: input.companyId,
    user_id: input.userId,
    title: input.title,
    message: input.message,
    severity: input.severity ?? 'medium'
  });
}

async function notifyImprovementTransition(input: {
  companyId: UUID;
  userIds: Array<UUID | null | undefined>;
  record: ImprovementRecord;
  eventType: string;
  title: string;
  message: string;
  statusLabel?: string;
}): Promise<void> {
  const recipientUserIds = Array.from(new Set(input.userIds.filter(Boolean).map(String))) as UUID[];
  if (recipientUserIds.length === 0) return;

  const { resolveUserDisplayName } = await import('./userDisplayNameService');
  const responsibleName = input.record.responsible_user_id
    ? await resolveUserDisplayName(input.companyId, input.record.responsible_user_id)
    : '';

  const { notifyRelevantUsers } = await import('./notificationEventsService');
  await notifyRelevantUsers({
    companyId: input.companyId,
    eventKey: `${input.eventType}:${input.record.id}`,
    eventType: input.eventType,
    title: input.title,
    message: input.message,
    recipientUserIds,
    emailTemplateKey: 'improvements',
    emailVariables: {
      reference: input.record.reference_number,
      status: input.statusLabel ?? IMPROVEMENT_STATUS_LABELS[input.record.status],
      severity: input.record.risk_level,
      owner: responsibleName
    },
    actionUrl: '/dashboard/management/improvements',
    metadata: { itemType: 'improvement', itemId: input.record.id }
  }).catch(() => undefined);
}

export async function listImprovements(input: ImprovementListFilters): Promise<ImprovementRecord[]> {
  let q = insforge.database
    .from('improvements')
    .select('*')
    .eq('company_id', input.companyId)
    .order('updated_at', { ascending: false })
    .limit(input.limit ?? 300);

  if (input.search?.trim()) {
    const s = input.search.trim();
    q = q.or(`reference_number.ilike.%${s}%,description.ilike.%${s}%,department_site.ilike.%${s}%`);
  }
  if (input.status) q = q.eq('status', input.status);
  if (input.type) q = q.eq('improvement_type', input.type);
  if (input.riskLevel) q = q.eq('risk_level', input.riskLevel);
  if (input.departmentSite?.trim()) q = q.ilike('department_site', `%${input.departmentSite.trim()}%`);
  if (input.raisedByUserId) q = q.eq('raised_by_user_id', input.raisedByUserId);
  if (input.responsibleUserId) q = q.eq('responsible_user_id', input.responsibleUserId);
  if (input.sourceType) q = q.eq('source_type', input.sourceType);
  if (input.dateRaisedFrom) q = q.gte('date_raised', input.dateRaisedFrom);
  if (input.dateRaisedTo) q = q.lte('date_raised', input.dateRaisedTo);
  if (input.targetDateFrom) q = q.gte('target_date', input.targetDateFrom);
  if (input.targetDateTo) q = q.lte('target_date', input.targetDateTo);
  if (input.closureDateFrom) q = q.gte('closure_date', input.closureDateFrom);
  if (input.closureDateTo) q = q.lte('closure_date', input.closureDateTo);

  const { data, error } = await q;
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as ImprovementRecord[];
}

export async function listLinkedImprovements(input: {
  companyId: UUID;
  sourceType: ImprovementSourceType;
  sourceId: UUID;
}): Promise<ImprovementRecord[]> {
  const { data, error } = await insforge.database
    .from('improvements')
    .select('*')
    .eq('company_id', input.companyId)
    .eq('source_type', input.sourceType)
    .eq('source_id', input.sourceId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as ImprovementRecord[];
}

export async function getImprovement(companyId: UUID, improvementId: UUID): Promise<ImprovementRecord> {
  const { data, error } = await insforge.database
    .from('improvements')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', improvementId)
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Improvement not found.');
  return data as ImprovementRecord;
}

export async function createImprovement(input: {
  companyId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole | null;
  dateRaised?: string;
  raisedByUserId?: UUID;
  departmentSite?: string | null;
  improvementType: ImprovementType;
  improvementTypeOtherText?: string | null;
  description?: string | null;
  riskLevel?: ImprovementRiskLevel;
  actionRequired?: string | null;
  responsibleUserId?: UUID | null;
  resourcesNeeded?: string | null;
  targetDate?: string | null;
  status?: ImprovementWorkflowStatus;
  evidenceFileIds?: UUID[] | null;
  verificationMethods?: ImprovementVerificationMethod[] | null;
  verificationMethodOtherText?: string | null;
  verifiedByUserId?: UUID | null;
  dateVerified?: string | null;
  wasActionEffective?: boolean | null;
  managementReviewedByUserId?: UUID | null;
  managementReviewDate?: string | null;
  managementRecommendations?: string | null;
  managementDecision?: 'approve' | 'monitor' | 'escalate' | 'rework' | null;
  closureStatus?: ImprovementClosureStatus | null;
  closedByUserId?: UUID | null;
  closureDate?: string | null;
  lessonsLearned?: string | null;
  sourceType?: ImprovementSourceType;
  sourceId?: UUID | null;
  sourceOtherText?: string | null;
}): Promise<ImprovementRecord> {
  if (!canEditRole(input.actorRole)) {
    throw new Error('You do not have permission to create improvements.');
  }

  const referenceNumber = await getOrCreateNextReferenceNumber(input.companyId);
  const nowIso = new Date().toISOString();
  const status = input.status ?? 'open';

  const payload = {
    company_id: input.companyId,
    reference_number: referenceNumber,
    date_raised: input.dateRaised ?? nowIso,
    raised_by_user_id: input.raisedByUserId ?? input.actorUserId,
    department_site: input.departmentSite ?? null,
    improvement_type: input.improvementType,
    improvement_type_other_text: input.improvementTypeOtherText ?? null,
    description: input.description ?? null,
    risk_level: input.riskLevel ?? 'medium',
    action_required: input.actionRequired ?? null,
    responsible_user_id: input.responsibleUserId ?? null,
    resources_needed: input.resourcesNeeded ?? null,
    target_date: input.targetDate ?? null,
    status,
    evidence_file_ids: input.evidenceFileIds ?? null,
    verification_methods: input.verificationMethods ?? null,
    verification_method_other_text: input.verificationMethodOtherText ?? null,
    verified_by_user_id: input.verifiedByUserId ?? null,
    date_verified: input.dateVerified ?? null,
    was_action_effective: input.wasActionEffective ?? null,
    management_reviewed_by_user_id: input.managementReviewedByUserId ?? null,
    management_review_date: input.managementReviewDate ?? null,
    management_recommendations: input.managementRecommendations ?? null,
    management_decision: input.managementDecision ?? null,
    closed_by_user_id: input.closedByUserId ?? null,
    closure_date: input.closureDate ?? null,
    closure_status: input.closureStatus ?? null,
    lessons_learned: input.lessonsLearned ?? null,
    source_type: input.sourceType ?? 'other',
    source_id: input.sourceId ?? null,
    source_other_text: input.sourceOtherText ?? null,
    created_by_user_id: input.actorUserId,
    updated_by_user_id: input.actorUserId
  };

  const { data, error } = await insforge.database.from('improvements').insert(payload).select('*').single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create improvement.');
  const created = data as ImprovementRecord;

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'improvements.create',
    entityType: 'improvement',
    entityId: created.id,
    metadata: { referenceNumber: created.reference_number, status: created.status }
  });

  if (created.responsible_user_id) {
    await notifyImprovementTransition({
      companyId: input.companyId,
      userIds: [created.responsible_user_id],
      record: created,
      eventType: 'improvement_assigned',
      title: 'Improvement Assigned',
      message: `You were assigned improvement ${created.reference_number}.`,
      statusLabel: 'Assigned'
    });
  }

  return created;
}

export async function updateImprovement(input: {
  companyId: UUID;
  improvementId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole | null;
  patch: Partial<ImprovementRecord>;
  transitionComment?: string;
}): Promise<ImprovementRecord> {
  if (!canEditRole(input.actorRole)) {
    throw new Error('You do not have permission to update improvements.');
  }
  const existing = await getImprovement(input.companyId, input.improvementId);
  const patch = enforceEffectivenessEscalation(input.patch);
  validateBeforeStatusUpdate(existing, patch, input.actorRole);

  const nextStatus = (patch.status ?? existing.status) as ImprovementWorkflowStatus;
  const closureStatus = patch.closure_status ?? existing.closure_status;
  const nowIso = new Date().toISOString();

  const updateData: Record<string, unknown> = {
    ...patch,
    updated_by_user_id: input.actorUserId,
    updated_at: nowIso
  };

  if (nextStatus === 'closed' && !patch.closure_date) {
    updateData.closure_date = nowIso;
  }
  if (nextStatus === 'closed' && !patch.closed_by_user_id) {
    updateData.closed_by_user_id = input.actorUserId;
  }
  if (nextStatus === 'closed' && !closureStatus) {
    updateData.closure_status = 'closed';
  }
  if (patch.was_action_effective === false && !patch.status) {
    updateData.status = 'escalated';
  }

  const { data, error } = await insforge.database
    .from('improvements')
    .update(updateData)
    .eq('company_id', input.companyId)
    .eq('id', input.improvementId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update improvement.');
  const updated = data as ImprovementRecord;

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'improvements.update',
    entityType: 'improvement',
    entityId: input.improvementId,
    metadata: { fromStatus: existing.status, toStatus: updated.status }
  });

  if (input.transitionComment?.trim()) {
    await addImprovementComment({
      companyId: input.companyId,
      improvementId: input.improvementId,
      userId: input.actorUserId,
      message: input.transitionComment.trim()
    });
  }

  if (existing.status !== updated.status) {
    if (updated.status === 'awaiting_verification' && updated.verified_by_user_id) {
      await notifyImprovementTransition({
        companyId: input.companyId,
        userIds: [updated.verified_by_user_id],
        record: updated,
        eventType: 'improvement_verification_requested',
        title: 'Verification Requested',
        message: `Verification requested for ${updated.reference_number}.`,
        statusLabel: 'Verification requested'
      });
    }
    if (updated.status === 'escalated') {
      const { data: admins } = await insforge.database
        .from('company_memberships')
        .select('user_id')
        .eq('company_id', input.companyId)
        .in('role', ['owner', 'admin', 'manager']);
      const ids = (admins ?? []).map((x: any) => x.user_id as UUID);
      await notifyImprovementTransition({
        companyId: input.companyId,
        userIds: ids,
        record: updated,
        eventType: 'improvement_escalated',
        title: 'Improvement Escalated',
        message: `Improvement ${updated.reference_number} was escalated.`,
        statusLabel: 'Escalated'
      });
    }
    if (updated.status === 'closed' && updated.raised_by_user_id) {
      await notifyImprovementTransition({
        companyId: input.companyId,
        userIds: [updated.raised_by_user_id],
        record: updated,
        eventType: 'improvement_closed',
        title: 'Improvement Closed',
        message: `Improvement ${updated.reference_number} has been closed.`,
        statusLabel: 'Closed'
      });
    }
  }

  return updated;
}

export async function updateImprovementStatus(input: {
  companyId: UUID;
  improvementId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole | null;
  status: ImprovementWorkflowStatus;
  comment?: string;
}): Promise<ImprovementRecord> {
  return await updateImprovement({
    companyId: input.companyId,
    improvementId: input.improvementId,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    patch: { status: input.status },
    transitionComment: input.comment
  });
}

export async function deleteImprovement(input: {
  companyId: UUID;
  improvementId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole | null;
}): Promise<void> {
  if (!canEditRole(input.actorRole)) {
    throw new Error('You do not have permission to delete improvements.');
  }

  const existing = await getImprovement(input.companyId, input.improvementId);

  const { error: commentsError } = await insforge.database
    .from('improvement_comments')
    .delete()
    .eq('company_id', input.companyId)
    .eq('improvement_id', input.improvementId);
  if (commentsError) throw new Error(getErrorMessage(commentsError));

  const { error } = await insforge.database
    .from('improvements')
    .delete()
    .eq('company_id', input.companyId)
    .eq('id', input.improvementId);
  if (error) throw new Error(getErrorMessage(error));

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'improvements.delete',
    entityType: 'improvement',
    entityId: input.improvementId,
    metadata: { referenceNumber: existing.reference_number, status: existing.status }
  });
}

export async function listImprovementComments(companyId: UUID, improvementId: UUID): Promise<ImprovementComment[]> {
  const { data, error } = await insforge.database
    .from('improvement_comments')
    .select('*')
    .eq('company_id', companyId)
    .eq('improvement_id', improvementId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as ImprovementComment[];
}

export async function addImprovementComment(input: {
  companyId: UUID;
  improvementId: UUID;
  userId: UUID;
  message: string;
  parentCommentId?: UUID | null;
}): Promise<ImprovementComment> {
  const msg = input.message.trim();
  if (!msg) throw new Error('Comment cannot be empty.');
  const { data, error } = await insforge.database
    .from('improvement_comments')
    .insert({
      company_id: input.companyId,
      improvement_id: input.improvementId,
      user_id: input.userId,
      message: msg,
      parent_comment_id: input.parentCommentId ?? null
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to add comment.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.userId,
    action: 'improvements.comment',
    entityType: 'improvement',
    entityId: input.improvementId
  });

  return data as ImprovementComment;
}

export async function getImprovementSummary(companyId: UUID): Promise<ImprovementSummary> {
  const records = await listImprovements({ companyId, limit: 3000 });
  const now = new Date();
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const openCount = records.filter((r) => !FINAL_STATUSES.includes(r.status)).length;
  const overdueCount = records.filter((r) => isImprovementOverdue(r, now)).length;
  const highCriticalOpenCount = records.filter(
    (r) => !FINAL_STATUSES.includes(r.status) && (r.risk_level === 'high' || r.risk_level === 'critical')
  ).length;
  const closedThisMonthCount = records.filter(
    (r) => r.status === 'closed' && r.closure_date && new Date(r.closure_date).getTime() >= startMonth.getTime()
  ).length;
  const monitoringRequiredCount = records.filter((r) => r.status === 'monitoring_required').length;

  const closed = records.filter((r) => r.closure_date && FINAL_STATUSES.includes(r.status));
  const closureRate = records.length ? closed.length / records.length : 0;
  const closeDurations = closed
    .map((r) => {
      const a = new Date(r.date_raised).getTime();
      const b = new Date(r.closure_date as string).getTime();
      return Math.max(0, Math.round((b - a) / (1000 * 60 * 60 * 24)));
    })
    .filter((v) => Number.isFinite(v));
  const avgDaysToClose = closeDurations.length
    ? closeDurations.reduce((sum, value) => sum + value, 0) / closeDurations.length
    : 0;

  const byTypeMap = new Map<ImprovementType, number>();
  for (const rec of records) byTypeMap.set(rec.improvement_type, (byTypeMap.get(rec.improvement_type) ?? 0) + 1);
  const byType = [...byTypeMap.entries()].map(([type, count]) => ({ type, count }));

  const byDeptMap = new Map<string, number>();
  for (const rec of records) {
    const key = rec.department_site?.trim() || 'Unspecified';
    byDeptMap.set(key, (byDeptMap.get(key) ?? 0) + 1);
  }
  const byDepartmentSite = [...byDeptMap.entries()]
    .map(([departmentSite, count]) => ({ departmentSite, count }))
    .sort((a, b) => b.count - a.count);

  const monthBuckets: Array<{ month: string; opened: number; closed: number }> = [];
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const id = `${yyyy}-${mm}`;
    monthBuckets.push({ month: id, opened: 0, closed: 0 });
  }
  const bucketByMonth = new Map(monthBuckets.map((m) => [m.month, m]));
  for (const rec of records) {
    const raised = new Date(rec.date_raised);
    const raisedMonth = `${raised.getFullYear()}-${String(raised.getMonth() + 1).padStart(2, '0')}`;
    const openBucket = bucketByMonth.get(raisedMonth);
    if (openBucket) openBucket.opened += 1;

    if (rec.closure_date) {
      const closedAt = new Date(rec.closure_date);
      const closedMonth = `${closedAt.getFullYear()}-${String(closedAt.getMonth() + 1).padStart(2, '0')}`;
      const closedBucket = bucketByMonth.get(closedMonth);
      if (closedBucket) closedBucket.closed += 1;
    }
  }

  return {
    openCount,
    overdueCount,
    highCriticalOpenCount,
    closedThisMonthCount,
    monitoringRequiredCount,
    closureRate,
    avgDaysToClose,
    byType,
    byDepartmentSite,
    monthlyTrend: monthBuckets
  };
}

export async function runImprovementReminderSweep(companyId: UUID): Promise<void> {
  const records = await listImprovements({ companyId, limit: 3000 });
  const now = new Date();
  const managersResp = await insforge.database
    .from('company_memberships')
    .select('user_id, role')
    .eq('company_id', companyId)
    .in('role', ['owner', 'admin', 'manager']);
  const managerIds = (managersResp.data ?? []).map((row: any) => row.user_id as UUID);

  await Promise.all(
    records.map(async (rec) => {
      if (!rec.target_date || FINAL_STATUSES.includes(rec.status)) return;
      const target = new Date(rec.target_date);
      const days = Math.floor((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (days === 3 && rec.responsible_user_id) {
        await createInAppNotification({
          companyId,
          userId: rec.responsible_user_id,
          title: 'Improvement Target Due Soon',
          message: `${rec.reference_number} is due in 3 days.`,
          severity: rec.risk_level
        }).catch(() => undefined);
      }

      if (days < 0) {
        const recipients = new Set<UUID>(managerIds);
        if (rec.responsible_user_id) recipients.add(rec.responsible_user_id);
        await Promise.all(
          [...recipients].map((userId) =>
            createInAppNotification({
              companyId,
              userId,
              title: 'Improvement Overdue',
              message: `${rec.reference_number} is overdue and requires escalation.`,
              severity: rec.risk_level === 'critical' ? 'critical' : 'high'
            }).catch(() => undefined)
          )
        );
      }
    })
  );
}
