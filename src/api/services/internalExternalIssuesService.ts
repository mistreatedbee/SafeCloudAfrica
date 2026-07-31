import { insforge } from '../insforge/client';
import { withInsforgeSession } from '../insforge/ensureSession';
import { getErrorMessage } from '../insforge/errors';
import type { CompanyRole, UUID } from '../models/core';
import type {
  InternalExternalIssueStatus,
  QualityInternalExternalIssue,
  QualityInternalExternalIssuesRegister
} from '../models/entities';
import { createActivityLog } from './activityLogService';
import { getMyProfile } from './profilesService';
import { listQualityNcrs } from './qualityNcrsService';
import { sendTemplatedNotificationEmail } from './emailService';

export const IE_DOC_NO_DEFAULT = 'XYZ-IEIRA-F-002';
export const IE_SCOPE_OPTIONS = ['Internal', 'External'] as const;
export const IE_RISK_OR_OPP_OPTIONS = ['Risk', 'Opp.', 'Risk/Opp.'] as const;
export const IE_STATUS_OPTIONS: InternalExternalIssueStatus[] = ['Open', 'In Progress', 'Closed'];

export async function listRiskAssessmentOptions(companyId: UUID): Promise<Array<{ id: UUID; label: string }>> {
  const { data, error } = await insforge.database
    .from('risk_assessments')
    .select('id, assessment_number, title')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(getErrorMessage(error));
  type RiskAssessmentRow = { id: UUID; assessment_number: string | null; title: string | null };
  return (data ?? []).map((row: RiskAssessmentRow) => ({
    id: row.id,
    label: `${row.assessment_number ?? 'RA'} - ${row.title ?? 'Untitled'}`
  }));
}

export async function listQualityNcrOptions(companyId: UUID): Promise<Array<{ id: UUID; label: string }>> {
  const rows = await listQualityNcrs({ companyId, limit: 500 });
  return rows.map((row) => ({
    id: row.id,
    label: `${row.nc_number ?? 'NCR'} - ${row.title ?? 'Untitled'}`
  }));
}

const READ_ROLES: CompanyRole[] = ['owner', 'admin', 'manager', 'supervisor', 'consultant', 'auditor'];
const WRITE_ROLES: CompanyRole[] = ['owner', 'admin', 'manager', 'supervisor'];
const APPROVE_ROLES: CompanyRole[] = ['owner', 'admin'];
const ISSUE_NO_EDIT_ROLES: CompanyRole[] = ['admin'];

const HIGH_SERIOUS_NATURE = new Set(['serious', 'critical', 'high']);

function hasRole(role: CompanyRole | null, allowed: CompanyRole[]): boolean {
  return !!role && allowed.includes(role);
}

function assertRead(role: CompanyRole | null): void {
  if (!hasRole(role, READ_ROLES)) {
    throw new Error('You do not have permission to view internal/external issues.');
  }
}

function assertWrite(role: CompanyRole | null): void {
  if (!hasRole(role, WRITE_ROLES)) {
    throw new Error('You do not have permission to modify internal/external issues.');
  }
}

function assertApprove(role: CompanyRole | null): void {
  if (!hasRole(role, APPROVE_ROLES)) {
    throw new Error('Only owner/admin can approve this register.');
  }
}

function canEditIssueNo(role: CompanyRole | null): boolean {
  return hasRole(role, ISSUE_NO_EDIT_ROLES);
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function normalizeDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.trim().slice(0, 10);
}

function scoreValue(value: number, label: 'L' | 'S'): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1 || n > 5) {
    throw new Error(`${label} must be between 1 and 5.`);
  }
  return Math.round(n);
}

function computeRiskRating(likelihood: number, severity: number): number {
  return scoreValue(likelihood, 'L') * scoreValue(severity, 'S');
}

export function mapIssueNature(rating: number): string {
  if (rating <= 3) return 'Low';
  if (rating <= 6) return 'Medium';
  if (rating <= 9) return 'Serious';
  return 'Critical';
}

function natureRank(value: string | null | undefined): number {
  const n = String(value ?? '').trim().toLowerCase();
  if (n === 'critical') return 4;
  if (n === 'serious' || n === 'high') return 3;
  if (n === 'medium') return 2;
  if (n === 'low') return 1;
  return 0;
}

function normalizeNature(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim();
  return raw ? raw : null;
}

async function getOwnersAndAdmins(companyId: UUID): Promise<UUID[]> {
  const { data, error } = await insforge.database
    .from('company_memberships')
    .select('user_id, role')
    .eq('company_id', companyId)
    .in('role', ['owner', 'admin']);
  if (error) throw new Error(getErrorMessage(error));
  return [...new Set((data ?? []).map((x: { user_id: UUID }) => x.user_id))];
}

async function getEmailsForUserIds(companyId: UUID, userIds: UUID[]): Promise<string[]> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return [];
  const { data } = await insforge.database
    .from('user_profiles')
    .select('user_id, email')
    .eq('company_id', companyId)
    .in('user_id', ids);
  return Array.from(new Set((data ?? []).map((row: { user_id: string; email: string | null }) => String(row.email ?? '').trim()).filter(Boolean)));
}

async function notifyHighSeriousIssue(input: {
  companyId: UUID;
  registerId: UUID;
  issueId: UUID;
  refNo: number;
  nature: string;
  riskRating: number;
}): Promise<void> {
  try {
    const userIds = await getOwnersAndAdmins(input.companyId);
    if (userIds.length === 0) return;
    const payload = userIds.map((userId) => ({
      company_id: input.companyId,
      user_id: userId,
      title: 'High/Serious Internal-External Issue',
      message: `Issue #${input.refNo} was rated ${input.nature} (R=${input.riskRating}).`,
      severity: 'high',
      metadata: {
        registerId: input.registerId,
        issueId: input.issueId,
        module: 'quality',
        route: '/dashboard/quality/issues'
      }
    }));
    await insforge.database.from('notifications').insert(payload);
    const emails = await getEmailsForUserIds(input.companyId, userIds);
    if (emails.length > 0) {
      await sendTemplatedNotificationEmail({
        to: emails,
        templateKey: 'quality_internal_external_issues',
        variables: {
          reference: `Issue #${input.refNo}`,
          severity: input.nature,
          riskRating: input.riskRating,
          status: 'High / serious rating'
        },
        actionUrl: '/dashboard/quality/issues',
        meta: {
          companyId: input.companyId,
          registerId: input.registerId,
          issueId: input.issueId
        }
      });
    }
  } catch (err) {
    console.warn('[issues] notification failed', err);
  }
}

async function getNextIssueNo(companyId: UUID, year: number): Promise<string> {
  const nowIso = new Date().toISOString();
  await insforge.database
    .from('quality_internal_external_issues_register_counters')
    .upsert({ company_id: companyId, year, last_number: 0, updated_at: nowIso }, { onConflict: 'company_id,year' });

  for (let i = 0; i < 8; i += 1) {
    const { data: counter, error: readError } = await insforge.database
      .from('quality_internal_external_issues_register_counters')
      .select('last_number')
      .eq('company_id', companyId)
      .eq('year', year)
      .single();
    if (readError) throw new Error(getErrorMessage(readError));
    const last = Number((counter as Record<string, unknown>)?.last_number ?? 0);
    const next = last + 1;

    const { data: updated, error: updateError } = await insforge.database
      .from('quality_internal_external_issues_register_counters')
      .update({ last_number: next, updated_at: nowIso })
      .eq('company_id', companyId)
      .eq('year', year)
      .eq('last_number', last)
      .select('last_number')
      .maybeSingle();
    if (updateError) throw new Error(getErrorMessage(updateError));
    if (updated) return String(next).padStart(2, '0');
  }

  return String(Math.floor(10 + Math.random() * 90));
}

async function getNextRefNo(companyId: UUID, registerId: UUID): Promise<number> {
  const { data, error } = await insforge.database
    .from('quality_internal_external_issues')
    .select('ref_no')
    .eq('company_id', companyId)
    .eq('register_id', registerId)
    .order('ref_no', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(getErrorMessage(error));
  return Number((data as Record<string, unknown>)?.ref_no ?? 0) + 1;
}

async function getRegisterById(companyId: UUID, registerId: UUID): Promise<QualityInternalExternalIssuesRegister | null> {
  const { data, error } = await insforge.database
    .from('quality_internal_external_issues_registers')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', registerId)
    .maybeSingle();
  if (error) throw new Error(getErrorMessage(error));
  return (data as QualityInternalExternalIssuesRegister | null) ?? null;
}

async function startRevisionIfApproved(input: {
  companyId: UUID;
  register: QualityInternalExternalIssuesRegister;
  actorUserId: UUID;
}): Promise<QualityInternalExternalIssuesRegister> {
  if (!input.register.approved_by_user_id) return input.register;
  const assessmentUpdatedOn = dateOnly(new Date());
  const nextRevision = Number(input.register.revision_number ?? 1) + 1;
  const { data, error } = await insforge.database
    .from('quality_internal_external_issues_registers')
    .update({
      approved_by_user_id: null,
      approved_at: null,
      approval_signature: null,
      assessment_updated_on: assessmentUpdatedOn,
      revision_number: nextRevision,
      updated_at: new Date().toISOString()
    })
    .eq('company_id', input.companyId)
    .eq('id', input.register.id)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  const revised = data as QualityInternalExternalIssuesRegister;
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'quality_ie_register.revision_started',
    entityType: 'quality_internal_external_issues_register',
    entityId: revised.id,
    metadata: {
      previousApprovedBy: input.register.approved_by_user_id,
      previousRevision: input.register.revision_number,
      nextRevision
    }
  });
  return revised;
}

export async function listInternalExternalIssueRegisters(input: {
  companyId: UUID;
  actorRole: CompanyRole | null;
  year?: number;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}): Promise<QualityInternalExternalIssuesRegister[]> {
  assertRead(input.actorRole);
  return withInsforgeSession('quality-ie:list-registers', async () => {
  let q = insforge.database
    .from('quality_internal_external_issues_registers')
    .select('*')
    .eq('company_id', input.companyId)
    .order('assessment_done_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 200);
  if (input.year) q = q.eq('assessment_year', input.year);
  if (input.dateFrom) q = q.gte('assessment_done_on', input.dateFrom);
  if (input.dateTo) q = q.lte('assessment_done_on', input.dateTo);
  const { data, error } = await q;
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as QualityInternalExternalIssuesRegister[];
  });
}

export async function createInternalExternalIssueRegister(input: {
  companyId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole | null;
  docNo?: string | null;
  issueNo?: string | null;
  assessmentDoneByUserId?: UUID | null;
  assessmentDoneByNameSnapshot?: string | null;
  assessmentDoneOn?: string | null;
}): Promise<QualityInternalExternalIssuesRegister> {
  assertWrite(input.actorRole);
  return withInsforgeSession('quality-ie:create-register', async () => {
  const assessmentDoneOn = normalizeDateOnly(input.assessmentDoneOn) ?? dateOnly(new Date());
  const assessmentYear = Number(new Date(assessmentDoneOn).getFullYear());
  if (!Number.isFinite(assessmentYear)) throw new Error('Invalid assessment done on date.');

  const issueNo = input.issueNo?.trim()
    ? canEditIssueNo(input.actorRole)
      ? input.issueNo.trim()
      : (() => {
          throw new Error('Only admin can manually edit ISSUE NO.');
        })()
    : await getNextIssueNo(input.companyId, assessmentYear);

  let doneByName = input.assessmentDoneByNameSnapshot?.trim() ?? '';
  if (!doneByName) {
    const profile = await getMyProfile(input.companyId, input.assessmentDoneByUserId ?? input.actorUserId);
    doneByName = profile?.full_name?.trim() || profile?.email?.trim() || 'Unknown';
  }

  const payload = {
    company_id: input.companyId,
    doc_no: input.docNo?.trim() || IE_DOC_NO_DEFAULT,
    issue_no: issueNo,
    assessment_year: assessmentYear,
    assessment_done_by_user_id: input.assessmentDoneByUserId ?? input.actorUserId,
    assessment_done_by_name_snapshot: doneByName,
    assessment_done_on: assessmentDoneOn,
    assessment_updated_on: assessmentDoneOn,
    created_by_user_id: input.actorUserId
  };

  const { data, error } = await insforge.database
    .from('quality_internal_external_issues_registers')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create internal/external issues register.');
  const created = data as QualityInternalExternalIssuesRegister;

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'quality_ie_register.create',
    entityType: 'quality_internal_external_issues_register',
    entityId: created.id,
    metadata: { docNo: created.doc_no, issueNo: created.issue_no }
  });
  return created;
  });
}

export async function updateInternalExternalIssueRegister(input: {
  companyId: UUID;
  registerId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole | null;
  patch: Partial<QualityInternalExternalIssuesRegister>;
}): Promise<QualityInternalExternalIssuesRegister> {
  assertWrite(input.actorRole);
  const existing = await getRegisterById(input.companyId, input.registerId);
  if (!existing) throw new Error('Register not found.');

  if (input.patch.issue_no && !canEditIssueNo(input.actorRole)) {
    throw new Error('Only admin can manually edit ISSUE NO.');
  }

  const revisionAware = await startRevisionIfApproved({
    companyId: input.companyId,
    register: existing,
    actorUserId: input.actorUserId
  });

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    assessment_updated_on: normalizeDateOnly((input.patch.assessment_updated_on as string | undefined) ?? dateOnly(new Date()))
  };
  if (input.patch.doc_no !== undefined) patch.doc_no = String(input.patch.doc_no ?? '').trim() || IE_DOC_NO_DEFAULT;
  if (input.patch.issue_no !== undefined) patch.issue_no = String(input.patch.issue_no ?? '').trim();
  if (input.patch.assessment_done_by_user_id !== undefined) patch.assessment_done_by_user_id = input.patch.assessment_done_by_user_id;
  if (input.patch.assessment_done_by_name_snapshot !== undefined) {
    patch.assessment_done_by_name_snapshot = String(input.patch.assessment_done_by_name_snapshot ?? '').trim();
  }
  if (input.patch.assessment_done_on !== undefined) patch.assessment_done_on = normalizeDateOnly(input.patch.assessment_done_on as string);
  if (input.patch.approval_signature !== undefined) patch.approval_signature = input.patch.approval_signature;

  const { data, error } = await insforge.database
    .from('quality_internal_external_issues_registers')
    .update(patch)
    .eq('company_id', input.companyId)
    .eq('id', revisionAware.id)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update register.');
  const updated = data as QualityInternalExternalIssuesRegister;

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'quality_ie_register.update',
    entityType: 'quality_internal_external_issues_register',
    entityId: updated.id,
    metadata: { fromRevision: existing.revision_number, toRevision: updated.revision_number }
  });
  return updated;
}

export async function approveInternalExternalIssueRegister(input: {
  companyId: UUID;
  registerId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole | null;
  approvalSignature?: string | null;
}): Promise<QualityInternalExternalIssuesRegister> {
  assertApprove(input.actorRole);
  const existing = await getRegisterById(input.companyId, input.registerId);
  if (!existing) throw new Error('Register not found.');

  const patch = {
    approved_by_user_id: input.actorUserId,
    approved_at: new Date().toISOString(),
    approval_signature: input.approvalSignature?.trim() || null,
    assessment_updated_on: dateOnly(new Date()),
    updated_at: new Date().toISOString()
  };
  const { data, error } = await insforge.database
    .from('quality_internal_external_issues_registers')
    .update(patch)
    .eq('company_id', input.companyId)
    .eq('id', input.registerId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to approve register.');
  const approved = data as QualityInternalExternalIssuesRegister;

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'quality_ie_register.approve',
    entityType: 'quality_internal_external_issues_register',
    entityId: approved.id,
    metadata: { issueNo: approved.issue_no, revisionNumber: approved.revision_number }
  });

  if (approved.assessment_done_by_user_id && approved.assessment_done_by_user_id !== input.actorUserId) {
    const { notifyRelevantUsers } = await import('./notificationEventsService');
    await notifyRelevantUsers({
      companyId: input.companyId,
      eventKey: `ie-register-approved:${approved.id}:${approved.revision_number}`,
      eventType: 'quality_ie_register_approved',
      title: 'Internal/external issues register approved',
      message: `Issue register #${approved.issue_no ?? ''} has been approved.`,
      recipientUserIds: [approved.assessment_done_by_user_id],
      emailTemplateKey: 'quality_internal_external_issues',
      emailVariables: {
        reference: `Register #${approved.issue_no ?? ''}`,
        status: 'Approved'
      },
      actionUrl: '/dashboard/quality/issues',
      metadata: { itemType: 'quality_internal_external_issues_register', itemId: approved.id }
    }).catch(() => undefined);
  }

  return approved;
}

export async function deleteInternalExternalIssueRegister(input: {
  companyId: UUID;
  registerId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole | null;
}): Promise<void> {
  assertApprove(input.actorRole);

  const existing = await getRegisterById(input.companyId, input.registerId);
  if (!existing) throw new Error('Register not found.');

  const { error: issuesError } = await insforge.database
    .from('quality_internal_external_issues')
    .delete()
    .eq('company_id', input.companyId)
    .eq('register_id', input.registerId);
  if (issuesError) throw new Error(getErrorMessage(issuesError));

  const { error: regError } = await insforge.database
    .from('quality_internal_external_issues_registers')
    .delete()
    .eq('company_id', input.companyId)
    .eq('id', input.registerId);
  if (regError) throw new Error(getErrorMessage(regError));

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'quality_ie_register.delete',
    entityType: 'quality_internal_external_issues_register',
    entityId: input.registerId,
    metadata: { issueNo: existing.issue_no, revisionNumber: existing.revision_number }
  }).catch(() => undefined);
}

export async function listInternalExternalIssues(input: {
  companyId: UUID;
  actorRole: CompanyRole | null;
  registerId?: UUID;
  dateFrom?: string;
  dateTo?: string;
  scope?: string;
  riskOrOpp?: string;
  nature?: string;
  responsibleUserId?: UUID;
  responsibleSearch?: string;
  issueSearch?: string;
  limit?: number;
}): Promise<QualityInternalExternalIssue[]> {
  assertRead(input.actorRole);
  return withInsforgeSession('quality-ie:list-issues', async () => {
  let q = insforge.database
    .from('quality_internal_external_issues')
    .select('*')
    .eq('company_id', input.companyId)
    .order('ref_no', { ascending: true })
    .limit(input.limit ?? 5000);
  if (input.registerId) q = q.eq('register_id', input.registerId);
  if (input.scope?.trim()) q = q.ilike('scope', `%${input.scope.trim()}%`);
  if (input.riskOrOpp?.trim()) q = q.ilike('risk_or_opp', `%${input.riskOrOpp.trim()}%`);
  if (input.nature?.trim()) q = q.ilike('nature', `%${input.nature.trim()}%`);
  if (input.responsibleUserId) q = q.eq('responsible_user_id', input.responsibleUserId);
  if (input.responsibleSearch?.trim()) q = q.ilike('responsible_name_snapshot', `%${input.responsibleSearch.trim()}%`);
  if (input.issueSearch?.trim()) q = q.ilike('issue_identification', `%${input.issueSearch.trim()}%`);
  const { data, error } = await q;
  if (error) throw new Error(getErrorMessage(error));
  let rows = (data ?? []) as QualityInternalExternalIssue[];

  if (input.dateFrom || input.dateTo) {
    const registerIds = [...new Set(rows.map((row) => row.register_id))];
    if (registerIds.length > 0) {
      let registerQuery = insforge.database
        .from('quality_internal_external_issues_registers')
        .select('id, assessment_done_on')
        .eq('company_id', input.companyId)
        .in('id', registerIds);
      if (input.dateFrom) registerQuery = registerQuery.gte('assessment_done_on', input.dateFrom);
      if (input.dateTo) registerQuery = registerQuery.lte('assessment_done_on', input.dateTo);
      const { data: dateFilteredRegisters, error: registerError } = await registerQuery;
      if (registerError) throw new Error(getErrorMessage(registerError));
      const allowed = new Set((dateFilteredRegisters ?? []).map((r: { id: UUID }) => r.id));
      rows = rows.filter((row) => allowed.has(row.register_id));
    }
  }

  return rows;
  });
}

export async function createInternalExternalIssue(input: {
  companyId: UUID;
  registerId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole | null;
  refNo?: number;
  scope: string;
  issueIdentification: string;
  riskOrOpp: string;
  likelihood: number;
  severity: number;
  nature?: string | null;
  natureOverride?: boolean;
  controlMeasure?: string | null;
  responsibleUserId?: UUID | null;
  responsibleNameSnapshot: string;
  targetDate?: string | null;
  status?: InternalExternalIssueStatus;
  closureDate?: string | null;
  closureEvidenceFileIds?: UUID[] | null;
  linkedRiskAssessmentId?: UUID | null;
  linkedNcrId?: UUID | null;
}): Promise<QualityInternalExternalIssue> {
  assertWrite(input.actorRole);
  return withInsforgeSession('quality-ie:create-issue', async () => {
  const register = await getRegisterById(input.companyId, input.registerId);
  if (!register) throw new Error('Register not found.');
  const registerRevision = await startRevisionIfApproved({
    companyId: input.companyId,
    register,
    actorUserId: input.actorUserId
  });

  const scope = input.scope.trim();
  const issueIdentification = input.issueIdentification.trim();
  const riskOrOpp = input.riskOrOpp.trim();
  const responsibleNameSnapshot = input.responsibleNameSnapshot.trim();
  if (!scope) throw new Error('Internal/External is required.');
  if (!issueIdentification) throw new Error('Issues Identification is required.');
  if (!riskOrOpp) throw new Error('Risk/ Opp. is required.');
  if (!responsibleNameSnapshot) throw new Error('Responsible person is required.');

  const likelihood = scoreValue(input.likelihood, 'L');
  const severity = scoreValue(input.severity, 'S');
  const riskRating = computeRiskRating(likelihood, severity);
  const mappedNature = mapIssueNature(riskRating);
  const manualNature = normalizeNature(input.nature);
  const nature = manualNature ?? mappedNature;
  const natureOverride = input.natureOverride ?? (!!manualNature && manualNature.toLowerCase() !== mappedNature.toLowerCase());

  const status = input.status ?? 'Open';
  if (!IE_STATUS_OPTIONS.includes(status)) throw new Error('Invalid status.');
  const controlMeasure = input.controlMeasure?.trim() || null;
  const shouldClose = status === 'Closed';
  if (shouldClose && !controlMeasure) throw new Error('Control Measure is required before closing.');

  const closureDate = shouldClose ? normalizeDateOnly(input.closureDate) ?? dateOnly(new Date()) : null;
  const refNo = input.refNo && Number(input.refNo) > 0 ? Math.round(input.refNo) : await getNextRefNo(input.companyId, registerRevision.id);

  const payload = {
    register_id: registerRevision.id,
    company_id: input.companyId,
    ref_no: refNo,
    scope,
    issue_identification: issueIdentification,
    risk_or_opp: riskOrOpp,
    likelihood,
    severity,
    risk_rating: riskRating,
    nature,
    nature_override: natureOverride,
    control_measure: controlMeasure,
    responsible_user_id: input.responsibleUserId ?? null,
    responsible_name_snapshot: responsibleNameSnapshot,
    target_date: normalizeDateOnly(input.targetDate),
    status,
    closure_date: closureDate,
    closure_evidence_file_ids: input.closureEvidenceFileIds ?? null,
    linked_risk_assessment_id: input.linkedRiskAssessmentId ?? null,
    linked_ncr_id: input.linkedNcrId ?? null,
    created_by_user_id: input.actorUserId,
    updated_by_user_id: input.actorUserId,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await insforge.database
    .from('quality_internal_external_issues')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create issue row.');
  const created = data as QualityInternalExternalIssue;

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'quality_ie_issue.create',
    entityType: 'quality_internal_external_issue',
    entityId: created.id,
    metadata: {
      registerId: created.register_id,
      refNo: created.ref_no,
      riskRating: created.risk_rating,
      nature: created.nature
    }
  });

  if (HIGH_SERIOUS_NATURE.has(String(created.nature).toLowerCase())) {
    await notifyHighSeriousIssue({
      companyId: input.companyId,
      registerId: created.register_id,
      issueId: created.id,
      refNo: created.ref_no,
      nature: String(created.nature),
      riskRating: created.risk_rating
    });
  }

  return created;
  }); // end withInsforgeSession
}

export async function updateInternalExternalIssue(input: {
  companyId: UUID;
  issueId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole | null;
  patch: Partial<QualityInternalExternalIssue>;
}): Promise<QualityInternalExternalIssue> {
  assertWrite(input.actorRole);
  return withInsforgeSession('quality-ie:update-issue', async () => {
  const { data: row, error: rowError } = await insforge.database
    .from('quality_internal_external_issues')
    .select('*')
    .eq('company_id', input.companyId)
    .eq('id', input.issueId)
    .maybeSingle();
  if (rowError) throw new Error(getErrorMessage(rowError));
  if (!row) throw new Error('Issue row not found.');
  const existing = row as QualityInternalExternalIssue;

  const register = await getRegisterById(input.companyId, existing.register_id);
  if (!register) throw new Error('Register not found.');
  await startRevisionIfApproved({
    companyId: input.companyId,
    register,
    actorUserId: input.actorUserId
  });

  const likelihood = input.patch.likelihood !== undefined ? scoreValue(Number(input.patch.likelihood), 'L') : existing.likelihood;
  const severity = input.patch.severity !== undefined ? scoreValue(Number(input.patch.severity), 'S') : existing.severity;
  const riskRating = computeRiskRating(likelihood, severity);
  const mappedNature = mapIssueNature(riskRating);
  let nature = existing.nature;
  let natureOverride = existing.nature_override;

  if (input.patch.nature !== undefined) {
    const maybeNature = normalizeNature(String(input.patch.nature));
    if (maybeNature) {
      nature = maybeNature;
      natureOverride = input.patch.nature_override ?? maybeNature.toLowerCase() !== mappedNature.toLowerCase();
    } else {
      nature = mappedNature;
      natureOverride = false;
    }
  } else if (input.patch.nature_override === false || (!natureOverride && input.patch.nature_override !== true)) {
    nature = mappedNature;
    natureOverride = false;
  } else if (input.patch.nature_override === true) {
    natureOverride = true;
  } else {
    nature = natureOverride ? existing.nature : mappedNature;
  }

  const nextStatus = (input.patch.status ?? existing.status) as InternalExternalIssueStatus;
  if (!IE_STATUS_OPTIONS.includes(nextStatus)) throw new Error('Invalid status.');
  const nextControlMeasure = (input.patch.control_measure ?? existing.control_measure)?.trim() || null;
  if (nextStatus === 'Closed' && !nextControlMeasure) throw new Error('Control Measure is required before closing.');

  const closureDate =
    nextStatus === 'Closed'
      ? normalizeDateOnly((input.patch.closure_date as string | undefined) ?? existing.closure_date) ?? dateOnly(new Date())
      : null;

  const dbPatch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by_user_id: input.actorUserId,
    likelihood,
    severity,
    risk_rating: riskRating,
    nature,
    nature_override: natureOverride,
    status: nextStatus,
    closure_date: closureDate,
    control_measure: nextControlMeasure
  };
  if (input.patch.scope !== undefined) dbPatch.scope = String(input.patch.scope ?? '').trim();
  if (input.patch.issue_identification !== undefined) dbPatch.issue_identification = String(input.patch.issue_identification ?? '').trim();
  if (input.patch.risk_or_opp !== undefined) dbPatch.risk_or_opp = String(input.patch.risk_or_opp ?? '').trim();
  if (input.patch.responsible_user_id !== undefined) dbPatch.responsible_user_id = input.patch.responsible_user_id;
  if (input.patch.responsible_name_snapshot !== undefined) {
    dbPatch.responsible_name_snapshot = String(input.patch.responsible_name_snapshot ?? '').trim();
  }
  if (input.patch.target_date !== undefined) dbPatch.target_date = normalizeDateOnly(input.patch.target_date as string);
  if (input.patch.closure_evidence_file_ids !== undefined) dbPatch.closure_evidence_file_ids = input.patch.closure_evidence_file_ids;
  if (input.patch.linked_risk_assessment_id !== undefined) dbPatch.linked_risk_assessment_id = input.patch.linked_risk_assessment_id;
  if (input.patch.linked_ncr_id !== undefined) dbPatch.linked_ncr_id = input.patch.linked_ncr_id;

  const { data, error } = await insforge.database
    .from('quality_internal_external_issues')
    .update(dbPatch)
    .eq('company_id', input.companyId)
    .eq('id', existing.id)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update issue.');
  const updated = data as QualityInternalExternalIssue;

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'quality_ie_issue.update',
    entityType: 'quality_internal_external_issue',
    entityId: updated.id,
    metadata: {
      riskRatingFrom: existing.risk_rating,
      riskRatingTo: updated.risk_rating,
      natureFrom: existing.nature,
      natureTo: updated.nature,
      natureOverride: updated.nature_override,
      statusFrom: existing.status,
      statusTo: updated.status
    }
  });

  const increasedSeverity = natureRank(updated.nature) > natureRank(existing.nature);
  if (increasedSeverity && HIGH_SERIOUS_NATURE.has(String(updated.nature).toLowerCase())) {
    await notifyHighSeriousIssue({
      companyId: input.companyId,
      registerId: updated.register_id,
      issueId: updated.id,
      refNo: updated.ref_no,
      nature: String(updated.nature),
      riskRating: updated.risk_rating
    });
  }

  return updated;
  }); // end withInsforgeSession
}

export async function deleteInternalExternalIssue(input: {
  companyId: UUID;
  issueId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole | null;
}): Promise<void> {
  assertWrite(input.actorRole);
  return withInsforgeSession('quality-ie:delete-issue', async () => {
  const { data: row, error: rowError } = await insforge.database
    .from('quality_internal_external_issues')
    .select('*')
    .eq('company_id', input.companyId)
    .eq('id', input.issueId)
    .maybeSingle();
  if (rowError) throw new Error(getErrorMessage(rowError));
  if (!row) throw new Error('Issue row not found.');
  const existing = row as QualityInternalExternalIssue;

  const { error } = await insforge.database
    .from('quality_internal_external_issues')
    .delete()
    .eq('company_id', input.companyId)
    .eq('id', input.issueId);
  if (error) throw new Error(getErrorMessage(error));

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'quality_ie_issue.delete',
    entityType: 'quality_internal_external_issue',
    entityId: input.issueId,
    metadata: { registerId: existing.register_id, refNo: existing.ref_no }
  });
  }); // end withInsforgeSession
}

export async function getInternalExternalIssuesSummary(input: {
  companyId: UUID;
  actorRole: CompanyRole | null;
  registerId?: UUID;
  dateFrom?: string;
  dateTo?: string;
  scope?: string;
  riskOrOpp?: string;
  nature?: string;
  responsibleUserId?: UUID;
  issueSearch?: string;
}): Promise<{
  totalIssues: number;
  internalCount: number;
  externalCount: number;
  highSeriousCount: number;
  overdueActions: number;
}> {
  const rows = await listInternalExternalIssues({
    companyId: input.companyId,
    actorRole: input.actorRole,
    registerId: input.registerId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    scope: input.scope,
    riskOrOpp: input.riskOrOpp,
    nature: input.nature,
    responsibleUserId: input.responsibleUserId,
    issueSearch: input.issueSearch,
    limit: 5000
  });
  const today = dateOnly(new Date());
  let internalCount = 0;
  let externalCount = 0;
  let highSeriousCount = 0;
  let overdueActions = 0;

  for (const row of rows) {
    const scope = String(row.scope ?? '').trim().toLowerCase();
    if (scope.includes('internal')) internalCount += 1;
    if (scope.includes('external')) externalCount += 1;
    if (HIGH_SERIOUS_NATURE.has(String(row.nature ?? '').trim().toLowerCase())) highSeriousCount += 1;
    if (row.status !== 'Closed' && row.target_date && row.target_date < today) overdueActions += 1;
  }

  return {
    totalIssues: rows.length,
    internalCount,
    externalCount,
    highSeriousCount,
    overdueActions
  };
}
