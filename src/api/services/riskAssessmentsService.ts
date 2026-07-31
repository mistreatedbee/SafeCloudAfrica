import { insforge } from '../insforge/client';
import { withInsforgeSession } from '../insforge/ensureSession';
import { getErrorMessage } from '../insforge/errors';
import type { CompanyRole, UUID } from '../models/core';
import { createActivityLog } from './activityLogService';
import { mapTypeToLegacyAssessmentType } from '../../utils/riskAssessmentLegacy';

export type RiskAssessmentType = 'baseline' | 'task' | 'critical' | 'prework';
export type RiskAssessmentStatus = 'draft' | 'submitted' | 'closed';
export type RiskIndex = 'Low' | 'Medium' | 'High';

export type MembershipScope = {
  siteId?: UUID | null;
  departmentId?: UUID | null;
  consultantScope?: {
    expiresAt?: string;
    allowedSites?: UUID[];
    allowedDepartments?: UUID[];
    allowedModules?: string[];
  } | null;
};

export type RiskAssessment = {
  id: UUID;
  company_id: UUID;
  type: RiskAssessmentType;
  title: string;
  heading: string | null;
  area: string | null;
  activity: string | null;
  department_id: UUID | null;
  site_id: UUID | null;
  risk_assessor_user_id: UUID | null;
  risk_assessor_name: string | null;
  assessment_date: string | null;
  next_review_date: string | null;
  reference: string | null;
  status: RiskAssessmentStatus;
  doc_url: string | null;
  doc_id: string | null;
  baseline_spreadsheet_bucket: string | null;
  baseline_spreadsheet_key: string | null;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type RiskAssessmentRow = {
  id: UUID;
  company_id: UUID;
  risk_assessment_id: UUID;
  row_index: number;
  json_data: Record<string, unknown>;
  severity: number | null;
  likelihood: number | null;
  raw_rr: number | null;
  raw_index: RiskIndex | null;
  residual_severity: number | null;
  residual_likelihood: number | null;
  residual_rr: number | null;
  residual_index: RiskIndex | null;
  responsible_person: string | null;
  target_date: string | null;
  completion_date: string | null;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type RiskAssessmentQna = {
  id: UUID;
  company_id: UUID;
  risk_assessment_id: UUID;
  question: string;
  answer: string | null;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type RiskAssessmentSignoff = {
  id: UUID;
  company_id: UUID;
  risk_assessment_id: UUID;
  employee_user_id: UUID | null;
  employee_name: string;
  signature: string | null;
  signed_at: string;
  supervisor_user_id: UUID | null;
  supervisor_signed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RiskAssessmentTemplate = {
  id: UUID;
  company_id: UUID;
  name: string;
  type: RiskAssessmentType;
  header_json: Record<string, unknown>;
  rows_json: Array<Record<string, unknown>>;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

function normalizeType(raw: unknown): RiskAssessmentType {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === 'baseline') return 'baseline';
  if (value === 'critical' || value === 'critical_task') return 'critical';
  if (value === 'prework' || value === 'pre_work') return 'prework';
  return 'task';
}

function normalizeStatus(raw: unknown): RiskAssessmentStatus {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === 'closed' || value === 'archived') return 'closed';
  if (value === 'submitted' || value === 'approved' || value === 'reviewed' || value === 'under_review') return 'submitted';
  return 'draft';
}

function parseDocId(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  const direct = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (direct?.[1]) return direct[1];

  const query = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (query?.[1]) return query[1];

  return null;
}

function isConsultantExpired(scope: MembershipScope['consultantScope']): boolean {
  if (!scope?.expiresAt) return false;
  return new Date(scope.expiresAt).getTime() < Date.now();
}

function isInScope(row: { site_id?: UUID | null; department_id?: UUID | null }, scope?: MembershipScope | null): boolean {
  const s = scope ?? null;
  if (!s) return true;

  if (s.consultantScope) {
    if (isConsultantExpired(s.consultantScope)) return false;
    const sites = new Set((s.consultantScope.allowedSites ?? []).map(String));
    const depts = new Set((s.consultantScope.allowedDepartments ?? []).map(String));
    const siteOk = sites.size === 0 || (row.site_id ? sites.has(String(row.site_id)) : false);
    const deptOk = depts.size === 0 || (row.department_id ? depts.has(String(row.department_id)) : false);
    return siteOk || deptOk || (sites.size === 0 && depts.size === 0);
  }

  const siteScoped = !!s.siteId;
  const deptScoped = !!s.departmentId;
  if (!siteScoped && !deptScoped) return true;
  if (siteScoped && row.site_id === s.siteId) return true;
  if (deptScoped && row.department_id === s.departmentId) return true;
  return false;
}

function canReadAssessment(
  row: { created_by_user_id: UUID; risk_assessor_user_id?: UUID | null; site_id?: UUID | null; department_id?: UUID | null },
  actor: { userId: UUID; role: CompanyRole | null; scope?: MembershipScope | null }
): boolean {
  const role = actor.role;
  if (role === 'owner' || role === 'admin') return true;
  if (role === 'manager' || role === 'supervisor') return isInScope(row, actor.scope);
  if (role === 'consultant' || role === 'auditor') return isInScope(row, actor.scope);
  if (role === 'employee') {
    return row.created_by_user_id === actor.userId || row.risk_assessor_user_id === actor.userId;
  }
  return row.created_by_user_id === actor.userId;
}

function canWriteAssessment(
  row: { created_by_user_id: UUID; risk_assessor_user_id?: UUID | null; site_id?: UUID | null; department_id?: UUID | null },
  actor: { userId: UUID; role: CompanyRole | null; scope?: MembershipScope | null }
): boolean {
  const role = actor.role;
  if (role === 'owner' || role === 'admin') return true;
  if (role === 'manager' || role === 'supervisor') return isInScope(row, actor.scope);
  if (role === 'consultant') return isInScope(row, actor.scope);
  if (role === 'employee') return row.created_by_user_id === actor.userId || row.risk_assessor_user_id === actor.userId;
  return false;
}

function mapAssessment(row: any): RiskAssessment {
  const status = normalizeStatus(row.status_v2 ?? row.status);
  return {
    id: row.id,
    company_id: row.company_id,
    type: normalizeType(row.type ?? row.assessment_type),
    title: String(row.title ?? row.assessment_number ?? 'Risk Assessment'),
    heading: row.heading ?? null,
    area: row.area ?? row.location ?? null,
    activity: row.activity ?? row.process_involved ?? null,
    department_id: row.department_id ?? null,
    site_id: row.site_id ?? null,
    risk_assessor_user_id: row.risk_assessor_user_id ?? null,
    risk_assessor_name: row.risk_assessor_name ?? null,
    assessment_date: row.assessment_date ?? null,
    next_review_date: row.next_review_date ?? null,
    reference: row.reference ?? null,
    status,
    doc_url: row.doc_url ?? null,
    doc_id: parseDocId(row.doc_url ?? null),
    baseline_spreadsheet_bucket: row.baseline_spreadsheet_bucket ?? null,
    baseline_spreadsheet_key: row.baseline_spreadsheet_key ?? null,
    created_by_user_id: row.created_by_user_id,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function mapStatusToLegacy(status: RiskAssessmentStatus): string {
  if (status === 'submitted') return 'approved';
  if (status === 'closed') return 'closed';
  return 'draft';
}

export function computeRR(severity?: number | null, likelihood?: number | null): number | null {
  if (!severity || !likelihood) return null;
  const s = Math.max(1, Math.min(5, Math.round(Number(severity))));
  const l = Math.max(1, Math.min(5, Math.round(Number(likelihood))));
  return s * l;
}

export function riskIndexFromRR(rr?: number | null): RiskIndex | null {
  if (!rr || rr < 1) return null;
  if (rr <= 5) return 'Low';
  if (rr <= 12) return 'Medium';
  return 'High';
}

export function withCalculatedRowFields(input: {
  severity?: number | null;
  likelihood?: number | null;
  residual_severity?: number | null;
  residual_likelihood?: number | null;
}): Pick<RiskAssessmentRow, 'raw_rr' | 'raw_index' | 'residual_rr' | 'residual_index'> {
  const rawRR = computeRR(input.severity ?? null, input.likelihood ?? null);
  const residualRR = computeRR(input.residual_severity ?? null, input.residual_likelihood ?? null);
  return {
    raw_rr: rawRR,
    raw_index: riskIndexFromRR(rawRR),
    residual_rr: residualRR,
    residual_index: riskIndexFromRR(residualRR)
  };
}

export async function listRiskAssessments(input: {
  companyId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole | null;
  scope?: MembershipScope | null;
  type?: RiskAssessmentType;
  status?: RiskAssessmentStatus;
  limit?: number;
}): Promise<RiskAssessment[]> {
  return withInsforgeSession('risk_assessments:list', async () => {
    let q = insforge.database.from('risk_assessments').select('*').eq('company_id', input.companyId);
    if (input.type) q = q.eq('type', input.type);
    if (input.status) q = q.eq('status_v2', input.status);
    const { data, error } = await q.order('updated_at', { ascending: false }).limit(input.limit ?? 500);
    if (error) throw new Error(getErrorMessage(error));

    return (data ?? [])
      .map(mapAssessment)
      .filter((row) => canReadAssessment(row, { userId: input.actorUserId, role: input.actorRole, scope: input.scope }));
  });
}

export async function getRiskAssessment(input: {
  companyId: UUID;
  assessmentId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole | null;
  scope?: MembershipScope | null;
  logView?: boolean;
}): Promise<RiskAssessment> {
  return withInsforgeSession('risk_assessments:get', async () => {
    const { data, error } = await insforge.database
      .from('risk_assessments')
      .select('*')
      .eq('id', input.assessmentId)
      .eq('company_id', input.companyId)
      .single();
    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Risk assessment not found');

    const mapped = mapAssessment(data);
    if (!canReadAssessment(mapped, { userId: input.actorUserId, role: input.actorRole, scope: input.scope })) {
      throw new Error('Access denied');
    }

    if (input.logView !== false) {
      await createActivityLog({
        companyId: input.companyId,
        actorUserId: input.actorUserId,
        action: 'risk_assessments.view',
        entityType: 'risk_assessment',
        entityId: input.assessmentId,
        metadata: { type: mapped.type }
      });
    }

    return mapped;
  });
}

export async function createRiskAssessment(input: {
  companyId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole | null;
  type: RiskAssessmentType;
  title: string;
  heading?: string | null;
  area?: string | null;
  activity?: string | null;
  departmentId?: UUID | null;
  siteId?: UUID | null;
  riskAssessorUserId?: UUID | null;
  riskAssessorName?: string | null;
  assessmentDate?: string | null;
  nextReviewDate?: string | null;
  reference?: string | null;
  status?: RiskAssessmentStatus;
  docUrl?: string | null;
}): Promise<RiskAssessment> {
  if (!['owner', 'admin', 'manager', 'supervisor', 'consultant', 'employee'].includes(String(input.actorRole))) {
    throw new Error('Access denied');
  }

  const status = input.status ?? 'draft';

  const { data, error } = await insforge.database
    .from('risk_assessments')
    .insert({
      company_id: input.companyId,
      type: input.type,
      assessment_type: mapTypeToLegacyAssessmentType(input.type),
      is_critical: input.type === 'critical',
      is_prework: input.type === 'prework',
      title: input.title,
      heading: input.heading ?? null,
      area: input.area ?? null,
      location: input.area ?? null,
      activity: input.activity ?? null,
      process_involved: input.activity ?? null,
      department_id: input.departmentId ?? null,
      site_id: input.siteId ?? null,
      risk_assessor_user_id: input.riskAssessorUserId ?? null,
      risk_assessor_name: input.riskAssessorName ?? null,
      assessment_date: input.assessmentDate ?? null,
      next_review_date: input.nextReviewDate ?? null,
      reference: input.reference ?? null,
      status_v2: status,
      status: mapStatusToLegacy(status),
      doc_url: input.docUrl ?? null,
      created_by_user_id: input.actorUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create risk assessment');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'risk_assessments.create',
    entityType: 'risk_assessment',
    entityId: data.id,
    metadata: { type: input.type }
  });

  const created = mapAssessment(data);

  if (created.risk_assessor_user_id && created.risk_assessor_user_id !== input.actorUserId) {
    const { notifyRelevantUsers } = await import('./notificationEventsService');
    await notifyRelevantUsers({
      companyId: input.companyId,
      eventKey: `risk-assessment-created:${created.id}`,
      eventType: 'risk_assessment_created',
      title: 'Risk assessment assigned',
      message: `You have been assigned as risk assessor for "${created.title}".`,
      recipientUserIds: [created.risk_assessor_user_id],
      emailTemplateKey: 'risk_assessment',
      emailVariables: {
        title: created.title,
        reference: created.reference ?? created.id,
        status: 'Draft',
        dueDate: created.next_review_date ?? undefined
      },
      actionUrl: '/dashboard/safety/risk-assessments',
      metadata: { itemType: 'risk_assessment', itemId: created.id }
    }).catch(() => undefined);
  }

  return created;
}

export async function updateRiskAssessment(input: {
  companyId: UUID;
  assessmentId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole | null;
  scope?: MembershipScope | null;
  patch: Partial<{
    type: RiskAssessmentType;
    title: string;
    heading: string | null;
    area: string | null;
    activity: string | null;
    department_id: UUID | null;
    site_id: UUID | null;
    risk_assessor_user_id: UUID | null;
    risk_assessor_name: string | null;
    assessment_date: string | null;
    next_review_date: string | null;
    reference: string | null;
    status: RiskAssessmentStatus;
    doc_url: string | null;
    baseline_spreadsheet_bucket: string | null;
    baseline_spreadsheet_key: string | null;
  }>;
}): Promise<RiskAssessment> {
  const current = await getRiskAssessment({
    companyId: input.companyId,
    assessmentId: input.assessmentId,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    scope: input.scope,
    logView: false
  });

  if (!canWriteAssessment(current, { userId: input.actorUserId, role: input.actorRole, scope: input.scope })) {
    throw new Error('Access denied');
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.patch.type !== undefined) {
    patch.type = input.patch.type;
    patch.assessment_type = mapTypeToLegacyAssessmentType(input.patch.type);
    patch.is_critical = input.patch.type === 'critical';
    patch.is_prework = input.patch.type === 'prework';
  }
  if (input.patch.title !== undefined) patch.title = input.patch.title;
  if (input.patch.heading !== undefined) patch.heading = input.patch.heading;
  if (input.patch.area !== undefined) {
    patch.area = input.patch.area;
    patch.location = input.patch.area;
  }
  if (input.patch.activity !== undefined) {
    patch.activity = input.patch.activity;
    patch.process_involved = input.patch.activity;
  }
  if (input.patch.department_id !== undefined) patch.department_id = input.patch.department_id;
  if (input.patch.site_id !== undefined) patch.site_id = input.patch.site_id;
  if (input.patch.risk_assessor_user_id !== undefined) patch.risk_assessor_user_id = input.patch.risk_assessor_user_id;
  if (input.patch.risk_assessor_name !== undefined) patch.risk_assessor_name = input.patch.risk_assessor_name;
  if (input.patch.assessment_date !== undefined) patch.assessment_date = input.patch.assessment_date;
  if (input.patch.next_review_date !== undefined) patch.next_review_date = input.patch.next_review_date;
  if (input.patch.reference !== undefined) patch.reference = input.patch.reference;
  if (input.patch.doc_url !== undefined) patch.doc_url = input.patch.doc_url;
  if (input.patch.status !== undefined) {
    patch.status_v2 = input.patch.status;
    patch.status = mapStatusToLegacy(input.patch.status);
    if (input.patch.status === 'submitted') {
      patch.submitted_at = new Date().toISOString();
      patch.submitted_by_user_id = input.actorUserId;
    }
  }
  if (input.patch.baseline_spreadsheet_bucket !== undefined) patch.baseline_spreadsheet_bucket = input.patch.baseline_spreadsheet_bucket;
  if (input.patch.baseline_spreadsheet_key !== undefined) patch.baseline_spreadsheet_key = input.patch.baseline_spreadsheet_key;

  const { data, error } = await insforge.database
    .from('risk_assessments')
    .update(patch)
    .eq('id', input.assessmentId)
    .eq('company_id', input.companyId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update risk assessment');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'risk_assessments.update',
    entityType: 'risk_assessment',
    entityId: input.assessmentId
  });

  const updated = mapAssessment(data);

  if (input.patch.status === 'submitted' && updated.created_by_user_id !== input.actorUserId) {
    const { notifyRelevantUsers } = await import('./notificationEventsService');
    await notifyRelevantUsers({
      companyId: input.companyId,
      eventKey: `risk-assessment-submitted:${input.assessmentId}`,
      eventType: 'risk_assessment_submitted',
      title: 'Risk assessment submitted for review',
      message: `"${updated.title}" was submitted for review.`,
      recipientUserIds: [updated.created_by_user_id],
      emailTemplateKey: 'risk_assessment',
      emailVariables: {
        title: updated.title,
        reference: updated.reference ?? input.assessmentId,
        status: 'Submitted for Review',
        dueDate: updated.next_review_date ?? undefined
      },
      actionUrl: '/dashboard/safety/risk-assessments',
      metadata: { itemType: 'risk_assessment', itemId: input.assessmentId }
    }).catch((err) => {
      console.warn('[risk-assessments] submitted notification failed', err);
    });
  }

  return updated;
}

export async function deleteRiskAssessment(input: {
  companyId: UUID;
  assessmentId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole | null;
  scope?: MembershipScope | null;
}): Promise<void> {
  const current = await getRiskAssessment({
    companyId: input.companyId,
    assessmentId: input.assessmentId,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    scope: input.scope,
    logView: false
  });
  if (!canWriteAssessment(current, { userId: input.actorUserId, role: input.actorRole, scope: input.scope })) {
    throw new Error('Access denied');
  }

  const { error } = await insforge.database
    .from('risk_assessments')
    .delete()
    .eq('id', input.assessmentId)
    .eq('company_id', input.companyId);
  if (error) throw new Error(getErrorMessage(error));

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'risk_assessments.delete',
    entityType: 'risk_assessment',
    entityId: input.assessmentId
  });
}

export async function listRiskAssessmentRows(input: {
  companyId: UUID;
  assessmentId: UUID;
}): Promise<RiskAssessmentRow[]> {
  return withInsforgeSession('risk_assessment_rows:list', async () => {
    const { data, error } = await insforge.database
      .from('risk_assessment_rows')
      .select('*')
      .eq('company_id', input.companyId)
      .eq('risk_assessment_id', input.assessmentId)
      .order('row_index', { ascending: true });
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? []) as RiskAssessmentRow[];
  });
}

export async function replaceRiskAssessmentRows(input: {
  companyId: UUID;
  assessmentId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole | null;
  scope?: MembershipScope | null;
  rows: Array<Partial<RiskAssessmentRow> & { json_data: Record<string, unknown> }>;
}): Promise<RiskAssessmentRow[]> {
  const current = await getRiskAssessment({
    companyId: input.companyId,
    assessmentId: input.assessmentId,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    scope: input.scope,
    logView: false
  });
  if (current.status === 'closed') throw new Error('Assessment is closed and cannot be edited.');
  if (!canWriteAssessment(current, { userId: input.actorUserId, role: input.actorRole, scope: input.scope })) {
    throw new Error('Access denied');
  }

  // Snapshot existing rows before deletion so we can restore on partial failure.
  const { data: snapshotData } = await insforge.database
    .from('risk_assessment_rows')
    .select('*')
    .eq('company_id', input.companyId)
    .eq('risk_assessment_id', input.assessmentId);
  const snapshot = snapshotData ?? [];

  const { error: deleteError } = await insforge.database
    .from('risk_assessment_rows')
    .delete()
    .eq('company_id', input.companyId)
    .eq('risk_assessment_id', input.assessmentId);
  if (deleteError) throw new Error(getErrorMessage(deleteError));

  if (!input.rows.length) return [];

  const payload = input.rows.map((row, idx) => {
    const calc = withCalculatedRowFields({
      severity: row.severity,
      likelihood: row.likelihood,
      residual_severity: row.residual_severity,
      residual_likelihood: row.residual_likelihood
    });
    return {
      company_id: input.companyId,
      risk_assessment_id: input.assessmentId,
      row_index: Number.isFinite(row.row_index) ? Number(row.row_index) : idx,
      json_data: row.json_data,
      severity: row.severity ?? null,
      likelihood: row.likelihood ?? null,
      raw_rr: calc.raw_rr,
      raw_index: calc.raw_index,
      residual_severity: row.residual_severity ?? null,
      residual_likelihood: row.residual_likelihood ?? null,
      residual_rr: calc.residual_rr,
      residual_index: calc.residual_index,
      responsible_person: row.responsible_person ?? null,
      target_date: row.target_date ?? null,
      completion_date: row.completion_date ?? null,
      created_by_user_id: input.actorUserId,
      updated_at: new Date().toISOString()
    };
  });

  const { data, error } = await insforge.database.from('risk_assessment_rows').insert(payload).select('*');
  if (error) {
    // Attempt to restore the snapshot so the assessment is not left with zero rows.
    if (snapshot.length > 0) {
      await insforge.database.from('risk_assessment_rows').insert(snapshot).select('id');
    }
    throw new Error('Row save failed; previous rows have been restored. Please try again.');
  }

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'risk_assessment_rows.replace',
    entityType: 'risk_assessment',
    entityId: input.assessmentId,
    metadata: { rows: payload.length }
  });

  return ((data ?? []) as RiskAssessmentRow[]).sort((a, b) => a.row_index - b.row_index);
}

export async function listRiskAssessmentQna(input: { companyId: UUID; assessmentId: UUID }): Promise<RiskAssessmentQna[]> {
  return withInsforgeSession('risk_assessment_qna:list', async () => {
    const { data, error } = await insforge.database
      .from('risk_assessment_qna')
      .select('*')
      .eq('company_id', input.companyId)
      .eq('risk_assessment_id', input.assessmentId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? []) as RiskAssessmentQna[];
  });
}

export async function createRiskAssessmentQna(input: {
  companyId: UUID;
  assessmentId: UUID;
  actorUserId: UUID;
  question: string;
  answer?: string | null;
}): Promise<RiskAssessmentQna> {
  const { data, error } = await insforge.database
    .from('risk_assessment_qna')
    .insert({
      company_id: input.companyId,
      risk_assessment_id: input.assessmentId,
      question: input.question,
      answer: input.answer ?? null,
      created_by_user_id: input.actorUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create Q&A item');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'risk_assessment_qna.create',
    entityType: 'risk_assessment',
    entityId: input.assessmentId
  });

  return data as RiskAssessmentQna;
}

export async function deleteRiskAssessmentQna(input: {
  companyId: UUID;
  qnaId: UUID;
  actorUserId: UUID;
}): Promise<void> {
  const { error } = await insforge.database.from('risk_assessment_qna').delete().eq('company_id', input.companyId).eq('id', input.qnaId);
  if (error) throw new Error(getErrorMessage(error));

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'risk_assessment_qna.delete',
    entityType: 'risk_assessment_qna',
    entityId: input.qnaId
  });
}

export async function listRiskAssessmentSignoffs(input: {
  companyId: UUID;
  assessmentId: UUID;
}): Promise<RiskAssessmentSignoff[]> {
  return withInsforgeSession('risk_assessment_signoffs:list', async () => {
    const { data, error } = await insforge.database
      .from('risk_assessment_signoffs')
      .select('*')
      .eq('company_id', input.companyId)
      .eq('risk_assessment_id', input.assessmentId)
      .order('signed_at', { ascending: true });
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? []) as RiskAssessmentSignoff[];
  });
}

export async function addRiskAssessmentSignoff(input: {
  companyId: UUID;
  assessmentId: UUID;
  actorUserId: UUID;
  employeeName: string;
  signature?: string | null;
}): Promise<RiskAssessmentSignoff> {
  const { data, error } = await insforge.database
    .from('risk_assessment_signoffs')
    .insert({
      company_id: input.companyId,
      risk_assessment_id: input.assessmentId,
      employee_user_id: input.actorUserId,
      employee_name: input.employeeName,
      signature: input.signature ?? null,
      signed_at: new Date().toISOString()
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to sign off');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'risk_assessment_signoffs.employee_sign',
    entityType: 'risk_assessment',
    entityId: input.assessmentId
  });

  return data as RiskAssessmentSignoff;
}

export async function supervisorSignoffRiskAssessment(input: {
  companyId: UUID;
  assessmentId: UUID;
  signoffId?: UUID;
  actorUserId: UUID;
}): Promise<void> {
  const assessment = await getRiskAssessment({
    companyId: input.companyId,
    assessmentId: input.assessmentId,
    actorUserId: input.actorUserId,
    actorRole: 'supervisor',
    logView: false
  });

  if (input.signoffId) {
    const { error } = await insforge.database
      .from('risk_assessment_signoffs')
      .update({ supervisor_user_id: input.actorUserId, supervisor_signed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('company_id', input.companyId)
      .eq('id', input.signoffId);
    if (error) throw new Error(getErrorMessage(error));
  }

  await updateRiskAssessment({
    companyId: input.companyId,
    assessmentId: input.assessmentId,
    actorUserId: input.actorUserId,
    actorRole: 'supervisor',
    patch: { status: 'closed' }
  });

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'risk_assessment_signoffs.supervisor_sign',
    entityType: 'risk_assessment',
    entityId: input.assessmentId
  });

  if (assessment.created_by_user_id !== input.actorUserId) {
    const { notifyRelevantUsers } = await import('./notificationEventsService');
    await notifyRelevantUsers({
      companyId: input.companyId,
      eventKey: `risk-assessment-supervisor-signoff:${input.assessmentId}`,
      eventType: 'risk_assessment_supervisor_signoff',
      title: 'Risk assessment approved and closed',
      message: `"${assessment.title}" was approved by a supervisor and closed.`,
      recipientUserIds: [assessment.created_by_user_id],
      emailTemplateKey: 'risk_assessment',
      emailVariables: {
        title: assessment.title,
        reference: assessment.reference ?? input.assessmentId,
        status: 'Supervisor Approved & Closed',
        dueDate: assessment.next_review_date ?? undefined
      },
      actionUrl: '/dashboard/safety/risk-assessments',
      metadata: { itemType: 'risk_assessment', itemId: input.assessmentId }
    }).catch((err) => {
      console.warn('[risk-assessments] supervisor signoff notification failed', err);
    });
  }
}

export async function listRiskAssessmentTemplates(input: {
  companyId: UUID;
  type?: RiskAssessmentType;
}): Promise<RiskAssessmentTemplate[]> {
  return withInsforgeSession('risk_assessment_templates:list', async () => {
    let q = insforge.database.from('risk_assessment_templates').select('*').eq('company_id', input.companyId);
    if (input.type) q = q.eq('type', input.type);
    const { data, error } = await q.order('updated_at', { ascending: false });
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? []) as RiskAssessmentTemplate[];
  });
}

export async function createRiskAssessmentTemplate(input: {
  companyId: UUID;
  actorUserId: UUID;
  name: string;
  type: RiskAssessmentType;
  headerJson?: Record<string, unknown>;
  rowsJson?: Array<Record<string, unknown>>;
}): Promise<RiskAssessmentTemplate> {
  const { data, error } = await insforge.database
    .from('risk_assessment_templates')
    .insert({
      company_id: input.companyId,
      name: input.name,
      type: input.type,
      header_json: input.headerJson ?? {},
      rows_json: input.rowsJson ?? [],
      created_by_user_id: input.actorUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create template');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'risk_assessment_templates.create',
    entityType: 'risk_assessment_template',
    entityId: data.id
  });

  return data as RiskAssessmentTemplate;
}

export async function deleteRiskAssessmentTemplate(input: {
  companyId: UUID;
  templateId: UUID;
  actorUserId: UUID;
}): Promise<void> {
  const { error } = await insforge.database
    .from('risk_assessment_templates')
    .delete()
    .eq('company_id', input.companyId)
    .eq('id', input.templateId);
  if (error) throw new Error(getErrorMessage(error));

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'risk_assessment_templates.delete',
    entityType: 'risk_assessment_template',
    entityId: input.templateId
  });
}

export async function createRiskAssessmentFromTemplate(input: {
  companyId: UUID;
  templateId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole | null;
  title?: string;
}): Promise<{ assessment: RiskAssessment; rows: RiskAssessmentRow[] }> {
  const { data, error } = await insforge.database
    .from('risk_assessment_templates')
    .select('*')
    .eq('company_id', input.companyId)
    .eq('id', input.templateId)
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Template not found');

  const template = data as RiskAssessmentTemplate;
  const assessment = await createRiskAssessment({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    type: normalizeType(template.type),
    title: input.title?.trim() || String(template.name),
    heading: (template.header_json?.heading as string | undefined) ?? null,
    area: (template.header_json?.area as string | undefined) ?? null,
    activity: (template.header_json?.activity as string | undefined) ?? null,
    reference: (template.header_json?.reference as string | undefined) ?? null,
    status: 'draft',
    docUrl: (template.header_json?.doc_url as string | undefined) ?? null
  });

  const rows = await replaceRiskAssessmentRows({
    companyId: input.companyId,
    assessmentId: assessment.id,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    rows: (template.rows_json ?? []).map((r, idx) => ({
      row_index: idx,
      json_data: r,
      severity: typeof r.severity === 'number' ? r.severity : null,
      likelihood: typeof r.likelihood === 'number' ? r.likelihood : null,
      residual_severity: typeof r.residual_severity === 'number' ? r.residual_severity : null,
      residual_likelihood: typeof r.residual_likelihood === 'number' ? r.residual_likelihood : null,
      responsible_person: (r.responsible_person as string | undefined) ?? null,
      target_date: (r.target_date as string | undefined) ?? null,
      completion_date: (r.completion_date as string | undefined) ?? null
    }))
  });

  return { assessment, rows };
}
