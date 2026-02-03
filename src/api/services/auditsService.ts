import { insforge } from '../insforge/client';
import type { UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';

export interface Audit {
  id: UUID;
  company_id: UUID;
  audit_number: string;
  audit_type: 'internal' | 'external' | 'client' | 'supplier' | 'certification';
  objectives: string;
  audit_criteria: string;
  scope_of_audit: string;
  location: string;
  auditor_user_ids: UUID[];
  proposed_dates: string[];
  selected_date: string | null;
  approved_by_user_id: UUID | null;
  approved_at: string | null;
  status: 'planned' | 'scheduled' | 'in-progress' | 'completed' | 'reported';
  planning_inputs?: {
    organogram_document_url?: string;
    process_maps_document_url?: string;
    procedures_policies_document_url?: string;
    risk_assessments_document_url?: string;
    legal_register_document_url?: string;
    previous_audit_reports_document_url?: string;
    incident_reports_document_url?: string;
    training_records_document_url?: string;
    permits_registers_document_url?: string;
    client_requirements_document_url?: string;
  };
  findings_count: number;
  nonconformances_count: number;
  observations_count: number;
  report_document_url: string | null;
  report_submitted_at: string | null;
  related_ncr_ids: UUID[];
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
}

export interface AuditQuestion {
  id: UUID;
  audit_id: UUID;
  question: string;
  expected_evidence?: string;
  question_order: number;
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
  auditType: 'internal' | 'external' | 'client' | 'supplier' | 'certification';
  objectives: string;
  auditCriteria: string;
  scopeOfAudit: string;
  location: string;
  auditorUserIds: UUID[];
  proposedDates: string[];
  createdByUserId: UUID;
  planningInputs?: Record<string, any>;
}): Promise<Audit> {
  const auditNumber = generateAuditNumber();

  const { data, error } = await insforge.database
    .from('audits')
    .insert({
      company_id: input.companyId,
      audit_number: auditNumber,
      audit_type: input.auditType,
      objectives: input.objectives,
      audit_criteria: input.auditCriteria,
      scope_of_audit: input.scopeOfAudit,
      location: input.location,
      auditor_user_ids: input.auditorUserIds,
      proposed_dates: input.proposedDates,
      status: 'planned',
      findings_count: 0,
      nonconformances_count: 0,
      observations_count: 0,
      related_ncr_ids: [],
      planning_inputs: input.planningInputs || {},
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
      status: 'completed',
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
      status: 'reported',
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
  question: string;
  expectedEvidence?: string;
  questionOrder: number;
  createdByUserId: UUID;
}): Promise<AuditQuestion> {
  const { data, error } = await insforge.database
    .from('audit_questions')
    .insert({
      audit_id: input.auditId,
      question: input.question,
      expected_evidence: input.expectedEvidence || null,
      question_order: input.questionOrder,
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
  answeredByUserId: UUID;
}): Promise<AuditResponse> {
  // First try to get existing response
  const existing = await getOrCreateAuditResponse(
    input.auditQuestionId,
    input.answeredByUserId
  );

  if (existing) {
    // Update existing
    const { data, error } = await insforge.database
      .from('audit_responses')
      .update({
        is_compliant: input.isCompliant,
        finding: input.finding || null,
        evidence_document_url: input.evidenceDocumentUrl || null,
        risk_rating: input.riskRating,
        answered_at: new Date().toISOString()
      })
      .eq('id', existing.id)
      .select('*')
      .single();

    if (error) throw new Error(getErrorMessage(error));
    return data as AuditResponse;
  }

  // Create new
  const { data, error } = await insforge.database
    .from('audit_responses')
    .insert({
      audit_question_id: input.auditQuestionId,
      is_compliant: input.isCompliant,
      finding: input.finding || null,
      evidence_document_url: input.evidenceDocumentUrl || null,
      risk_rating: input.riskRating,
      answered_by_user_id: input.answeredByUserId,
      answered_at: new Date().toISOString()
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
    if (!r.is_compliant && r.finding) {
      findings++;
      if (r.risk_rating === 'high') {
        nonconformances++;
      } else {
        observations++;
      }
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
