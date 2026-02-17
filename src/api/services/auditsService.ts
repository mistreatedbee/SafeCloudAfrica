import { insforge } from '../insforge/client';
import type { Audit, UUID } from '../models/entities';
import type { ModuleKey } from '../models/core';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';

export interface AuditQuestion {
  id: UUID;
  audit_id: UUID;
  section?: string | null;
  section_id?: string | null;
  subheading_id?: string | null;
  question: string;
  expected_evidence?: string;
  question_order: number;
  allocated_score?: number | null;
  achieved_score?: number | null;
  checklist_template_id?: UUID | null;
  created_by_user_id: UUID;
  created_at: string;
}

export interface AuditResponse {
  id: UUID;
  audit_question_id: UUID;
  is_compliant: boolean;
  finding: string | null;
  evidence_document_url: string | null;
  risk_rating: 'low' | 'medium' | 'high';
  deviation_type?: 'observation' | 'finding' | 'non_conformance' | 'opportunity_for_improvement' | null;
  allocated_score?: number | null;
  achieved_score?: number | null;
  evidence_files?: { storageBucket: string; storageKey: string; fileName: string }[] | null;
  answered_by_user_id: UUID;
  answered_at: string;
}

// Auto-generate audit number
function generateAuditNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `AUDIT-${year}${month}-${random}`;
}

export async function listAudits(input: {
  companyId: UUID;
  status?: string;
  auditType?: string;
  limit?: number;
}): Promise<Audit[]> {
  let query = insforge.database
    .from('audits')
    .select('*')
    .eq('company_id', input.companyId);

  if (input.status) {
    query = query.eq('status', input.status);
  }
  if (input.auditType) {
    query = query.eq('audit_type', input.auditType);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 200);

  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as Audit[];
}

export async function getAudit(auditId: UUID): Promise<Audit | null> {
  const { data, error } = await insforge.database
    .from('audits')
    .select('*')
    .eq('id', auditId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(getErrorMessage(error));
  }
  return (data as Audit) || null;
}

export async function createAudit(input: {
  companyId: UUID;
  module?: ModuleKey;
  auditType: 'internal' | 'external' | 'client' | 'supplier' | 'certification';
  title?: string;
  objectives: string;
  auditCriteria: string;
  scopeOfAudit: string;
  location: string;
  auditorUserIds: UUID[];
  proposedDates: string[];
  createdByUserId: UUID;
  requiredDocumentList?: { key: string; label: string }[];
  documentSubmissionDeadline?: string | null;
  departmentsAuditeeIds?: UUID[];
  companyRepresentativeUserIds?: UUID[];
  leadAuditorUserId?: UUID | null;
  checklistTemplateId?: UUID | null;
}): Promise<Audit> {
  const auditNumber = generateAuditNumber();

  const { data, error } = await insforge.database
    .from('audits')
    .insert({
      company_id: input.companyId,
      module: input.module ?? 'safety',
      audit_number: auditNumber,
      title: input.title ?? input.objectives?.slice(0, 255) ?? 'Audit',
      audit_type: input.auditType,
      objectives: input.objectives,
      audit_criteria: input.auditCriteria,
      scope_of_audit: input.scopeOfAudit,
      location: input.location,
      auditor_user_ids: input.auditorUserIds,
      proposed_dates: input.proposedDates,
      status: 'draft',
      date_approval_status: 'pending',
      required_document_list: input.requiredDocumentList ?? null,
      document_submission_deadline: input.documentSubmissionDeadline ?? null,
      departments_auditee_ids: input.departmentsAuditeeIds ?? null,
      company_representative_user_ids: input.companyRepresentativeUserIds ?? null,
      lead_auditor_user_id: input.leadAuditorUserId ?? null,
      checklist_template_id: input.checklistTemplateId ?? null,
      findings_count: 0,
      nonconformances_count: 0,
      observations_count: 0,
      related_ncr_ids: [],
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create audit.');

  const audit = data as Audit;

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'audits.create',
    entityType: 'audit',
    entityId: audit.id,
    metadata: { audit_number: auditNumber }
  });

  return audit;
}

export async function updateAudit(
  auditId: UUID,
  companyId: UUID,
  updates: Partial<Audit>,
  actorUserId: UUID
): Promise<Audit | null> {
  const { data, error } = await insforge.database
    .from('audits')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', auditId)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update audit.');

  const audit = data as Audit;

  await createActivityLog({
    companyId,
    actorUserId,
    action: 'audits.update',
    entityType: 'audit',
    entityId: auditId,
    metadata: { status: audit.status }
  });

  return audit;
}

export async function scheduleAudit(
  auditId: UUID,
  companyId: UUID,
  selectedDate: string,
  approvedByUserId: UUID,
  actorUserId: UUID
): Promise<Audit | null> {
  return updateAudit(
    auditId,
    companyId,
    {
      selected_date: selectedDate,
      status: 'scheduled',
      approved_by_user_id: approvedByUserId,
      approved_at: new Date().toISOString()
    },
    actorUserId
  );
}

export async function approveAuditDate(
  auditId: UUID,
  companyId: UUID,
  chosenDate: string,
  userId: UUID
): Promise<Audit | null> {
  const audit = await getAudit(auditId);
  if (!audit) throw new Error('Audit not found.');
  const auditeeIds = (audit as any).departments_auditee_ids as UUID[] | null;
  const isAuditee = auditeeIds?.includes(userId);
  if (!isAuditee) throw new Error('Only an assigned auditee can approve the audit date.');
  const updated = await updateAudit(
    auditId,
    companyId,
    {
      selected_date: chosenDate,
      approved_by_user_id: userId,
      approved_at: new Date().toISOString(),
      date_approval_status: 'approved',
      date_decline_reason: null,
      status: 'scheduled'
    },
    userId
  );
  await createActivityLog({
    companyId,
    actorUserId: userId,
    action: 'audits.date_approved',
    entityType: 'audit',
    entityId: auditId,
    metadata: { chosen_date: chosenDate }
  });
  return updated;
}

export async function declineAuditDate(
  auditId: UUID,
  companyId: UUID,
  reason: string,
  userId: UUID
): Promise<Audit | null> {
  const audit = await getAudit(auditId);
  if (!audit) throw new Error('Audit not found.');
  const auditeeIds = (audit as any).departments_auditee_ids as UUID[] | null;
  const isAuditee = auditeeIds?.includes(userId);
  if (!isAuditee) throw new Error('Only an assigned auditee can decline the audit date.');
  const updated = await updateAudit(
    auditId,
    companyId,
    {
      date_approval_status: 'declined',
      date_decline_reason: reason || null
    },
    userId
  );
  await createActivityLog({
    companyId,
    actorUserId: userId,
    action: 'audits.date_declined',
    entityType: 'audit',
    entityId: auditId,
    metadata: { reason }
  });
  return updated;
}

export async function startAudit(
  auditId: UUID,
  companyId: UUID,
  actorUserId: UUID
): Promise<Audit | null> {
  return updateAudit(
    auditId,
    companyId,
    { status: 'in-progress' },
    actorUserId
  );
}

export async function completeAudit(
  auditId: UUID,
  companyId: UUID,
  reportDocumentUrl: string | null,
  actorUserId: UUID
): Promise<Audit | null> {
  return updateAudit(
    auditId,
    companyId,
    {
      status: 'report-pending',
      report_document_url: reportDocumentUrl
    },
    actorUserId
  );
}

export async function submitAuditReport(
  auditId: UUID,
  companyId: UUID,
  reportDocumentUrl: string,
  actorUserId: UUID
): Promise<Audit | null> {
  return updateAudit(
    auditId,
    companyId,
    {
      status: 'completed',
      report_document_url: reportDocumentUrl,
      report_submitted_at: new Date().toISOString()
    },
    actorUserId
  );
}

// ===== AUDIT QUESTIONS =====

export async function listAuditQuestions(auditId: UUID): Promise<AuditQuestion[]> {
  const { data, error } = await insforge.database
    .from('audit_questions')
    .select('*')
    .eq('audit_id', auditId)
    .order('question_order', { ascending: true });

  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as AuditQuestion[];
}

export async function createAuditQuestion(input: {
  auditId: UUID;
  section?: string;
  question: string;
  expectedEvidence?: string;
  questionOrder: number;
  allocatedScore?: number;
  achievedScore?: number;
  createdByUserId: UUID;
}): Promise<AuditQuestion> {
  const { data, error } = await insforge.database
    .from('audit_questions')
    .insert({
      audit_id: input.auditId,
      section: input.section ?? null,
      question: input.question,
      expected_evidence: input.expectedEvidence || null,
      question_order: input.questionOrder,
      allocated_score: input.allocatedScore ?? null,
      achieved_score: input.achievedScore ?? null,
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create audit question.');

  return data as AuditQuestion;
}

export async function deleteAuditQuestion(questionId: UUID): Promise<void> {
  const { error } = await insforge.database
    .from('audit_questions')
    .delete()
    .eq('id', questionId);

  if (error) throw new Error(getErrorMessage(error));
}

// ===== AUDIT RESPONSES =====

export async function listAuditResponses(auditId: UUID): Promise<AuditResponse[]> {
  const { data: questions, error: qError } = await insforge.database
    .from('audit_questions')
    .select('id')
    .eq('audit_id', auditId);

  if (qError) throw new Error(getErrorMessage(qError));

  const questionIds = (questions ?? []).map((q: any) => q.id);
  if (questionIds.length === 0) return [];

  const { data, error } = await insforge.database
    .from('audit_responses')
    .select('*')
    .in('audit_question_id', questionIds)
    .order('answered_at', { ascending: false });

  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as AuditResponse[];
}

export async function getOrCreateAuditResponse(
  auditQuestionId: UUID,
  userId: UUID
): Promise<AuditResponse | null> {
  const { data, error } = await insforge.database
    .from('audit_responses')
    .select('*')
    .eq('audit_question_id', auditQuestionId)
    .eq('answered_by_user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(getErrorMessage(error));
  }

  return (data as AuditResponse) || null;
}

export async function submitAuditResponse(input: {
  auditQuestionId: UUID;
  isCompliant: boolean;
  finding?: string;
  evidenceDocumentUrl?: string;
  riskRating: 'low' | 'medium' | 'high';
  deviationType?: 'observation' | 'finding' | 'non_conformance' | 'opportunity_for_improvement';
  allocatedScore?: number | null;
  achievedScore?: number | null;
  evidenceFiles?: { storageBucket: string; storageKey: string; fileName: string }[] | null;
  answeredByUserId: UUID;
}): Promise<AuditResponse> {
  const existing = await getOrCreateAuditResponse(
    input.auditQuestionId,
    input.answeredByUserId
  );

  const payload = {
    is_compliant: input.isCompliant,
    finding: input.finding ?? existing?.finding ?? null,
    evidence_document_url: input.evidenceDocumentUrl ?? existing?.evidence_document_url ?? null,
    risk_rating: input.riskRating,
    deviation_type: input.deviationType ?? existing?.deviation_type ?? null,
    allocated_score: input.allocatedScore ?? (existing as any)?.allocated_score ?? null,
    achieved_score: input.achievedScore ?? (existing as any)?.achieved_score ?? null,
    evidence_files: input.evidenceFiles ?? (existing as any)?.evidence_files ?? null,
    answered_at: new Date().toISOString()
  };

  if (existing) {
    const { data, error } = await insforge.database
      .from('audit_responses')
      .update(payload)
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw new Error(getErrorMessage(error));
    return data as AuditResponse;
  }

  const { data, error } = await insforge.database
    .from('audit_responses')
    .insert({
      audit_question_id: input.auditQuestionId,
      ...payload,
      answered_by_user_id: input.answeredByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to submit audit response.');
  return data as AuditResponse;
}

// ===== AUDIT FINDINGS CALCULATION =====

export async function calculateAuditFindings(auditId: UUID): Promise<{
  findings_count: number;
  nonconformances_count: number;
  observations_count: number;
}> {
  const responses = await listAuditResponses(auditId);

  let findings = 0;
  let nonconformances = 0;
  let observations = 0;

  responses.forEach(r => {
    // Count any recorded finding text
    if (r.finding && r.finding.trim().length > 0) {
      findings++;
    }

    // Nonconformances: any non-compliant response OR high-risk rating
    if (!r.is_compliant || r.risk_rating === 'high') {
      nonconformances++;
      return;
    }

    // Observations: remaining findings with compliant response
    if (r.finding && r.finding.trim().length > 0 && r.is_compliant) {
      observations++;
    }
  });

  return {
    findings_count: findings,
    nonconformances_count: nonconformances,
    observations_count: observations
  };
}

export async function updateAuditFindingsCounts(
  auditId: UUID,
  companyId: UUID,
  actorUserId: UUID
): Promise<void> {
  const counts = await calculateAuditFindings(auditId);
  await updateAudit(
    auditId,
    companyId,
    {
      findings_count: counts.findings_count,
      nonconformances_count: counts.nonconformances_count,
      observations_count: counts.observations_count
    },
    actorUserId
  );
}
