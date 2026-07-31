import { insforge } from '../insforge/client';
import { withInsforgeSession } from '../insforge/ensureSession';
import type { Audit, AuditInvitationToken, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';
import { sendTemplatedNotificationEmail } from './emailService';

export interface AuditQuestion {
  id: UUID;
  audit_id: UUID;
  question: string;
  expected_evidence?: string | null;
  allocated_score?: number | null;
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
  achieved_score?: number | null;
  risk_rating: 'low' | 'medium' | 'high';
  answered_by_user_id: UUID;
  answered_at: string;
}

function generateAuditNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `AUDIT-${year}${month}-${random}`;
}

function hashToken(token: string): string {
  let hash = 0;
  for (let i = 0; i < token.length; i += 1) {
    hash = (hash << 5) - hash + token.charCodeAt(i);
    hash |= 0;
  }
  return `audit-${Math.abs(hash)}`;
}

export async function listAudits(input: {
  companyId: UUID;
  module?: string;
  status?: string;
  auditType?: string;
  limit?: number;
}): Promise<Audit[]> {
  return withInsforgeSession('audits:list', async () => {
  let query = insforge.database
    .from('audits')
    .select('*')
    .eq('company_id', input.companyId);

  if (input.module) query = query.eq('module', input.module);
  if (input.status) query = query.eq('status', input.status);
  if (input.auditType) query = query.eq('audit_type', input.auditType);

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 200);

  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as Audit[];
  });
}

async function getAuditEmails(companyId: UUID, userIds: Array<UUID | null | undefined>, extraEmails?: Array<string | null | undefined>): Promise<string[]> {
  const emails = new Set<string>((extraEmails ?? []).map((email) => String(email ?? '').trim()).filter(Boolean));
  const ids = Array.from(new Set(userIds.filter(Boolean).map(String)));
  if (ids.length > 0) {
    const { data } = await insforge.database
      .from('user_profiles')
      .select('user_id, email')
      .eq('company_id', companyId)
      .in('user_id', ids);
    for (const row of data ?? []) {
      const email = String((row as unknown as { email?: string }).email ?? '').trim();
      if (email) emails.add(email);
    }
  }
  return Array.from(emails);
}

export async function getAudit(auditId: UUID): Promise<Audit | null> {
  return withInsforgeSession('audits:get', async () => {
    const { data, error } = await insforge.database
      .from('audits')
      .select('*')
      .eq('id', auditId)
      .maybeSingle();
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? null) as Audit | null;
  });
}

export async function createAudit(input: {
  companyId: UUID;
  module: Audit['module'];
  title?: string;
  description?: string | null;
  auditType: Audit['audit_type'];
  objectives: string;
  auditCriteria: string;
  scopeOfAudit: string;
  location?: string;
  auditorUserIds: UUID[];
  proposedDates: string[];
  createdByUserId: UUID;
  requiredDocumentList?: Array<{ key: string; label: string }>;
  documentSubmissionDeadline?: string;
  departmentsAuditeeIds?: UUID[];
  companyRepresentativeUserIds?: UUID[];
  leadAuditorUserId?: UUID;
  checklistTemplateId?: UUID;
  inviteeEmail?: string | null;
}): Promise<Audit> {
  return withInsforgeSession('audits:create', async () => {
  const auditNumber = generateAuditNumber();
  const { data, error } = await insforge.database
    .from('audits')
    .insert({
      company_id: input.companyId,
      module: input.module,
      audit_number: auditNumber,
      title: input.title?.trim() || input.objectives.trim(),
      description: input.description ?? null,
      audit_type: input.auditType,
      objectives: input.objectives,
      audit_criteria: input.auditCriteria,
      scope_of_audit: input.scopeOfAudit,
      location: input.location ?? null,
      auditor_user_ids: input.auditorUserIds,
      proposed_dates: input.proposedDates,
      status: 'draft',
      findings_count: 0,
      nonconformances_count: 0,
      observations_count: 0,
      related_ncr_ids: [],
      required_document_list: input.requiredDocumentList ?? null,
      document_submission_deadline: input.documentSubmissionDeadline ?? null,
      departments_auditee_ids: input.departmentsAuditeeIds ?? null,
      company_representative_user_ids: input.companyRepresentativeUserIds ?? null,
      lead_auditor_user_id: input.leadAuditorUserId ?? null,
      checklist_template_id: input.checklistTemplateId ?? null,
      date_approval_status: 'pending',
      invitee_email: input.inviteeEmail ?? null,
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
    metadata: {
      auditNumber,
      module: input.module,
      auditType: input.auditType
    }
  });

  try {
    const emails = await getAuditEmails(
      input.companyId,
      [input.leadAuditorUserId, ...input.auditorUserIds, ...(input.companyRepresentativeUserIds ?? [])],
      [input.inviteeEmail]
    );
    if (emails.length > 0) {
      await sendTemplatedNotificationEmail({
        to: emails,
        templateKey: 'audits',
        variables: {
          title: audit.title ?? audit.objectives,
          status: audit.status,
          owner: input.leadAuditorUserId ?? input.auditorUserIds[0],
          dueDate: input.proposedDates[0] ?? input.documentSubmissionDeadline
        },
        actionUrl: '/dashboard/operations/audits',
        meta: { companyId: input.companyId, auditId: audit.id }
      });
    }
  } catch (err) {
    console.warn('[audits] notification failed', err);
  }

  return audit;
  }); // end withInsforgeSession
}

async function notifyAuditTransition(input: {
  companyId: UUID;
  audit: Audit;
  actorUserId: UUID;
  eventType: string;
  title: string;
  message: string;
  status: string;
}): Promise<void> {
  const recipientUserIds = new Set<UUID>();
  if (input.audit.lead_auditor_user_id) recipientUserIds.add(input.audit.lead_auditor_user_id as UUID);
  for (const id of input.audit.auditor_user_ids ?? []) {
    if (id) recipientUserIds.add(id as UUID);
  }
  if (input.audit.created_by_user_id) recipientUserIds.add(input.audit.created_by_user_id as UUID);
  recipientUserIds.delete(input.actorUserId);
  if (recipientUserIds.size === 0) return;

  const { notifyRelevantUsers } = await import('./notificationEventsService');
  await notifyRelevantUsers({
    companyId: input.companyId,
    eventKey: `${input.eventType}:${input.audit.id}`,
    eventType: input.eventType,
    title: input.title,
    message: input.message,
    recipientUserIds: Array.from(recipientUserIds),
    emailTemplateKey: 'audits',
    emailVariables: {
      title: input.audit.title ?? input.audit.objectives,
      status: input.status
    },
    actionUrl: '/dashboard/operations/audits',
    metadata: { itemType: 'audit', itemId: input.audit.id }
  }).catch(() => undefined);
}

export async function updateAudit(
  auditId: UUID,
  companyId: UUID,
  updates: Partial<Audit>,
  actorUserId: UUID
): Promise<Audit> {
  return withInsforgeSession('audits:update', async () => {
    const { data, error } = await insforge.database
      .from('audits')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', auditId)
      .eq('company_id', companyId)
      .select('*')
      .single();

    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to update audit.');

    await createActivityLog({
      companyId,
      actorUserId,
      action: 'audits.update',
      entityType: 'audit',
      entityId: auditId,
      metadata: {
        status: (data as Audit).status
      }
    });

    return data as Audit;
  });
}

export async function scheduleAudit(
  auditId: UUID,
  companyId: UUID,
  selectedDate: string,
  approvedByUserId: UUID,
  actorUserId: UUID
): Promise<Audit> {
  return updateAudit(
    auditId,
    companyId,
    {
      selected_date: selectedDate,
      status: 'scheduled',
      approved_by_user_id: approvedByUserId,
      approved_at: new Date().toISOString(),
      date_approval_status: 'approved',
      date_decline_reason: null
    },
    actorUserId
  );
}

export async function startAudit(auditId: UUID, companyId: UUID, actorUserId: UUID): Promise<Audit> {
  return updateAudit(auditId, companyId, { status: 'in-progress' }, actorUserId);
}

export async function completeAudit(
  auditId: UUID,
  companyId: UUID,
  reportDocumentUrl: string | null,
  actorUserId: UUID
): Promise<Audit> {
  const updated = await updateAudit(
    auditId,
    companyId,
    {
      status: 'completed',
      report_document_url: reportDocumentUrl,
      report_submitted_at: new Date().toISOString()
    },
    actorUserId
  );
  await notifyAuditTransition({
    companyId,
    audit: updated,
    actorUserId,
    eventType: 'audit_completed',
    title: 'Audit completed',
    message: `Audit "${updated.title ?? updated.audit_number}" has been completed.`,
    status: 'Completed'
  });
  return updated;
}

export async function submitAuditReport(
  auditId: UUID,
  companyId: UUID,
  reportDocumentUrl: string,
  actorUserId: UUID
): Promise<Audit> {
  const updated = await updateAudit(
    auditId,
    companyId,
    {
      status: 'completed',
      report_document_url: reportDocumentUrl,
      report_submitted_at: new Date().toISOString()
    },
    actorUserId
  );
  await notifyAuditTransition({
    companyId,
    audit: updated,
    actorUserId,
    eventType: 'audit_report_submitted',
    title: 'Audit report submitted',
    message: `The audit report for "${updated.title ?? updated.audit_number}" has been submitted.`,
    status: 'Submitted'
  });
  return updated;
}

export async function createAuditInvitationTokens(input: {
  auditId: UUID;
  companyId: UUID;
  inviteeEmails: string[];
  proposedDates: string[];
  expiresAt: string;
  createdByUserId: UUID;
}): Promise<Array<AuditInvitationToken & { plainToken: string }>> {
  const created: Array<AuditInvitationToken & { plainToken: string }> = [];
  for (const email of input.inviteeEmails) {
    const plainToken = crypto.randomUUID();
    const tokenHash = hashToken(plainToken);
    const { data, error } = await insforge.database
      .from('audit_invitation_tokens')
      .insert({
        audit_id: input.auditId,
        company_id: input.companyId,
        invitee_email: email.trim().toLowerCase(),
        token_hash: tokenHash,
        proposed_dates: input.proposedDates,
        expires_at: input.expiresAt,
        created_by_user_id: input.createdByUserId
      })
      .select('*')
      .single();
    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to create audit invitation token.');
    created.push({ ...(data as AuditInvitationToken), plainToken });
  }

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'audits.invites.create',
    entityType: 'audit',
    entityId: input.auditId,
    metadata: {
      inviteeCount: created.length
    }
  });

  return created;
}

export async function respondToAuditInvitation(input: {
  token: string;
  responseStatus: 'accepted' | 'declined';
  selectedDate?: string | null;
  declineReason?: string | null;
  respondedByUserId?: UUID | null;
}): Promise<{ audit: Audit; invitation: AuditInvitationToken }> {
  const tokenHash = hashToken(input.token);
  const { data, error } = await insforge.database
    .from('audit_invitation_tokens')
    .select('*')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Audit invitation token not found.');

  const invitation = data as AuditInvitationToken;
  if (new Date(invitation.expires_at).getTime() < Date.now()) {
    await insforge.database
      .from('audit_invitation_tokens')
      .update({ response_status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', invitation.id);
    throw new Error('This audit invitation token has expired.');
  }

  const { data: invitationData, error: updateError } = await insforge.database
    .from('audit_invitation_tokens')
    .update({
      invitee_user_id: input.respondedByUserId ?? invitation.invitee_user_id ?? null,
      response_status: input.responseStatus,
      selected_date: input.responseStatus === 'accepted' ? input.selectedDate ?? null : null,
      decline_reason: input.responseStatus === 'declined' ? input.declineReason ?? null : null,
      responded_date: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', invitation.id)
    .select('*')
    .single();

  if (updateError) throw new Error(getErrorMessage(updateError));
  if (!invitationData) throw new Error('Failed to store audit invitation response.');

  let audit = await getAudit(invitation.audit_id);
  if (!audit) throw new Error('Linked audit not found.');

  if (input.responseStatus === 'accepted' && input.selectedDate) {
    audit = await scheduleAudit(
      invitation.audit_id,
      invitation.company_id,
      input.selectedDate,
      input.respondedByUserId ?? audit.approved_by_user_id ?? audit.created_by_user_id,
      input.respondedByUserId ?? audit.created_by_user_id
    );
  } else if (input.responseStatus === 'declined') {
    audit = await updateAudit(
      invitation.audit_id,
      invitation.company_id,
      {
        date_approval_status: 'declined',
        date_decline_reason: input.declineReason ?? null
      },
      input.respondedByUserId ?? audit.created_by_user_id
    );
  }

  return {
    audit,
    invitation: invitationData as AuditInvitationToken
  };
}

export async function expireAuditInvitationTokens(nowIso = new Date().toISOString()): Promise<number> {
  const { data, error } = await insforge.database
    .from('audit_invitation_tokens')
    .update({
      response_status: 'expired',
      updated_at: nowIso
    })
    .eq('response_status', 'pending')
    .lt('expires_at', nowIso)
    .select('id');
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []).length;
}

export async function listAuditInvitationTokens(auditId: UUID): Promise<AuditInvitationToken[]> {
  const { data, error } = await insforge.database
    .from('audit_invitation_tokens')
    .select('*')
    .eq('audit_id', auditId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as AuditInvitationToken[];
}

export async function listAuditQuestions(auditId: UUID): Promise<AuditQuestion[]> {
  return withInsforgeSession('audit_questions:list', async () => {
    const { data, error } = await insforge.database
      .from('audit_questions')
      .select('*')
      .eq('audit_id', auditId)
      .order('question_order', { ascending: true });
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? []) as AuditQuestion[];
  });
}

export async function createAuditQuestion(input: {
  auditId: UUID;
  question: string;
  expectedEvidence?: string;
  questionOrder: number;
  allocatedScore?: number | null;
  createdByUserId: UUID;
}): Promise<AuditQuestion> {
  const { data, error } = await insforge.database
    .from('audit_questions')
    .insert({
      audit_id: input.auditId,
      question: input.question,
      expected_evidence: input.expectedEvidence ?? null,
      allocated_score: input.allocatedScore ?? 1,
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
  return withInsforgeSession('audit_questions:delete', async () => {
    const { error: responsesError } = await insforge.database
      .from('audit_responses')
      .delete()
      .eq('audit_question_id', questionId);
    if (responsesError) throw new Error(getErrorMessage(responsesError));

    const { error } = await insforge.database
      .from('audit_questions')
      .delete()
      .eq('id', questionId);
    if (error) throw new Error(getErrorMessage(error));
  });
}

export async function listAuditResponses(auditId: UUID): Promise<AuditResponse[]> {
  const questions = await listAuditQuestions(auditId);
  if (questions.length === 0) return [];
  const { data, error } = await insforge.database
    .from('audit_responses')
    .select('*')
    .in('audit_question_id', questions.map((question) => question.id))
    .order('answered_at', { ascending: false });
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as AuditResponse[];
}

export async function submitAuditResponse(input: {
  auditQuestionId: UUID;
  isCompliant: boolean;
  finding?: string;
  evidenceDocumentUrl?: string;
  achievedScore?: number | null;
  riskRating: 'low' | 'medium' | 'high';
  answeredByUserId: UUID;
  deviationType?: string | null;
  allocatedScore?: number | null;
  evidenceFiles?: unknown[] | null;
}): Promise<AuditResponse> {
  return withInsforgeSession('audit_responses:submit', async () => {
    const { data: existing, error: existingError } = await insforge.database
      .from('audit_responses')
      .select('*')
      .eq('audit_question_id', input.auditQuestionId)
      .eq('answered_by_user_id', input.answeredByUserId)
      .maybeSingle();
    if (existingError) throw new Error(getErrorMessage(existingError));

    const payload: Record<string, unknown> = {
      is_compliant: input.isCompliant,
      finding: input.finding ?? null,
      evidence_document_url: input.evidenceDocumentUrl ?? null,
      achieved_score: input.achievedScore ?? null,
      risk_rating: input.riskRating,
      answered_at: new Date().toISOString()
    };
    if (input.deviationType !== undefined) payload.deviation_type = input.deviationType;
    if (input.allocatedScore !== undefined) payload.allocated_score = input.allocatedScore;
    if (input.evidenceFiles !== undefined) payload.evidence_files = input.evidenceFiles;

    const query = existing
      ? insforge.database.from('audit_responses').update(payload).eq('id', (existing as AuditResponse).id)
      : insforge.database.from('audit_responses').insert({
          audit_question_id: input.auditQuestionId,
          answered_by_user_id: input.answeredByUserId,
          ...payload
        });

    const { data, error } = await query.select('*').single();
    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to submit audit response.');
    return data as AuditResponse;
  });
}

export async function calculateAuditFindings(auditId: UUID): Promise<{
  findings_count: number;
  nonconformances_count: number;
  observations_count: number;
}> {
  const responses = await listAuditResponses(auditId);
  let findings = 0;
  let nonconformances = 0;
  let observations = 0;

  for (const response of responses) {
    if (!response.is_compliant && response.finding) {
      findings += 1;
      if (response.risk_rating === 'high') nonconformances += 1;
      else observations += 1;
    }
  }

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

export async function approveAuditDate(
  auditId: UUID,
  companyId: UUID,
  selectedDate: string,
  actorUserId: UUID
): Promise<Audit> {
  return withInsforgeSession('audits:approve_date', async () => {
    const updated = await updateAudit(
      auditId,
      companyId,
      {
        selected_date: selectedDate,
        status: 'scheduled',
        date_approval_status: 'approved',
        date_decline_reason: null
      },
      actorUserId
    );
    await notifyAuditTransition({
      companyId,
      audit: updated,
      actorUserId,
      eventType: 'audit_date_approved',
      title: 'Audit date approved',
      message: `The proposed date for audit "${updated.title ?? updated.audit_number}" was approved: ${selectedDate}.`,
      status: 'Date Approved'
    });
    return updated;
  });
}

export async function declineAuditDate(
  auditId: UUID,
  companyId: UUID,
  declineReason: string,
  actorUserId: UUID
): Promise<Audit> {
  return withInsforgeSession('audits:decline_date', async () => {
    const updated = await updateAudit(
      auditId,
      companyId,
      {
        date_approval_status: 'declined',
        date_decline_reason: declineReason || null
      },
      actorUserId
    );
    await notifyAuditTransition({
      companyId,
      audit: updated,
      actorUserId,
      eventType: 'audit_date_declined',
      title: 'Audit date declined',
      message: declineReason
        ? `The proposed date for audit "${updated.title ?? updated.audit_number}" was declined: ${declineReason}`
        : `The proposed date for audit "${updated.title ?? updated.audit_number}" was declined.`,
      status: 'Date Declined'
    });
    return updated;
  });
}
