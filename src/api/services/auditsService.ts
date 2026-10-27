import { insforge } from '../insforge/client';
import { withInsforgeSession } from '../insforge/ensureSession';
import type { Audit, AuditInvitationToken, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { getAuditChecklistTemplate } from './auditChecklistTemplatesService';
import { sendTemplatedNotificationEmail } from './emailService';
import { createActivityLog } from './activityLogService';
import { createCorrectiveAction } from './correctiveActionsService';

export type AuditComplianceStatus = 'C' | 'PC' | 'NC' | 'Obs' | 'N/A';

export interface AuditSection {
  id: UUID;
  company_id: UUID;
  audit_id: UUID;
  parent_section_id: UUID | null;
  section_order: number;
  iso_clause: string | null;
  section_title: string;
  created_by_user_id: UUID | null;
  created_at: string;
  updated_at: string;
}

export interface AuditQuestion {
  id: UUID;
  audit_id: UUID;
  question: string;
  section?: string | null;
  section_ref_id?: UUID | null;
  expected_evidence?: string | null;
  allocated_score?: number | null;
  question_order: number;
  created_by_user_id: UUID;
  created_at: string;
}

export interface AuditResponse {
  id: UUID;
  company_id?: UUID;
  audit_question_id: UUID;
  is_compliant: boolean;
  finding: string | null;
  deviation_type?: 'observation' | 'finding' | 'non_conformance' | 'opportunity_for_improvement' | null;
  compliance_status?: AuditComplianceStatus | null;
  corrective_action_id?: UUID | null;
  evidence_document_url: string | null;
  achieved_score?: number | null;
  allocated_score?: number | null;
  evidence_files?: unknown[] | null;
  risk_rating: 'low' | 'medium' | 'high';
  answered_by_user_id: UUID;
  answered_at: string;
}

/** Maps the 4-state ISO compliance status onto the legacy boolean/deviation_type fields for back-compat. */
function deriveLegacyComplianceFields(status: AuditComplianceStatus): {
  is_compliant: boolean;
  deviation_type: 'observation' | 'finding' | 'non_conformance' | null;
} {
  switch (status) {
    case 'C':
    case 'N/A':
      return { is_compliant: true, deviation_type: null };
    case 'Obs':
      return { is_compliant: false, deviation_type: 'observation' };
    case 'PC':
      return { is_compliant: false, deviation_type: 'observation' };
    case 'NC':
      return { is_compliant: false, deviation_type: 'non_conformance' };
  }
}

function generateAuditNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `AUDIT-${year}${month}-${random}`;
}

// SHA-256 hex digest, matching api/audits/_shared.ts's hashAuditInvitationToken()
// exactly -- the server endpoint that resolves these tokens (api/audits/respond-invitation.ts)
// hashes with Node's crypto the same way, so a token hashed here at invite-creation
// time resolves there at response time.
async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token.trim());
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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
  /** The specific organization/sub-contractor being audited (optional — e.g. a parent company's sub-contractor audited separately). */
  auditedOrganization?: string | null;
  auditorUserIds: UUID[];
  proposedDates: string[];
  createdByUserId: UUID;
  requiredDocumentList?: Array<{ key: string; label: string }>;
  documentSubmissionDeadline?: string;
  departmentsAuditeeIds?: UUID[];
  companyRepresentativeUserIds?: UUID[];
  leadAuditorUserId?: UUID;
  leadAuditorHrEmployeeId?: UUID | null;
  leadAuditorName?: string | null;
  auditeeHrEmployeeId?: UUID | null;
  auditeeName?: string | null;
  checklistTemplateId?: UUID;
  inviteeEmail?: string | null;
}): Promise<Audit> {
  return withInsforgeSession('audits:create', async () => {
  const auditNumber = generateAuditNumber();
  const fullPayload = {
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
    audited_organization: input.auditedOrganization?.trim() || null,
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
    lead_auditor_hr_employee_id: input.leadAuditorHrEmployeeId ?? null,
    lead_auditor_name: input.leadAuditorName ?? null,
    auditee_hr_employee_id: input.auditeeHrEmployeeId ?? null,
    auditee_name: input.auditeeName ?? null,
    checklist_template_id: input.checklistTemplateId ?? null,
    date_approval_status: 'pending',
    invitee_email: input.inviteeEmail ?? null,
    created_by_user_id: input.createdByUserId
  };

  const payload: Record<string, unknown> = { ...fullPayload };
  let data: Audit | null = null;
  let error: { message?: string } | null = null;

  for (let attempt = 0; attempt < 14; attempt += 1) {
    const result = await insforge.database.from('audits').insert(payload).select('*').single();
    data = (result.data as Audit | null) ?? null;
    error = result.error;
    if (!error) break;
    const message = String(error.message ?? '').toLowerCase();
    if (!message.includes('column')) throw new Error(getErrorMessage(error));
    if (message.includes('required_document_list')) delete payload.required_document_list;
    else if (message.includes('departments_auditee_ids')) delete payload.departments_auditee_ids;
    else if (message.includes('company_representative_user_ids')) delete payload.company_representative_user_ids;
    else if (message.includes('checklist_template_id')) delete payload.checklist_template_id;
    else if (message.includes('invitee_email')) delete payload.invitee_email;
    else if (message.includes('date_approval_status')) delete payload.date_approval_status;
    else if (message.includes('lead_auditor_user_id')) delete payload.lead_auditor_user_id;
    else if (message.includes('document_submission_deadline')) delete payload.document_submission_deadline;
    else if (message.includes('lead_auditor_hr_employee_id')) delete payload.lead_auditor_hr_employee_id;
    else if (message.includes('lead_auditor_name')) delete payload.lead_auditor_name;
    else if (message.includes('auditee_hr_employee_id')) delete payload.auditee_hr_employee_id;
    else if (message.includes('auditee_name')) delete payload.auditee_name;
    else if (message.includes('audited_organization')) delete payload.audited_organization;
    else throw new Error(getErrorMessage(error));
  }

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create audit.');
  const audit = data;

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

  if (input.checklistTemplateId) {
    try {
      await importAuditChecklistFromTemplate({
        companyId: input.companyId,
        auditId: audit.id,
        templateId: input.checklistTemplateId,
        createdByUserId: input.createdByUserId
      });
    } catch (err) {
      console.warn('[audits] checklist template import failed', err);
    }
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
    const tokenHash = await hashToken(plainToken);
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

/**
 * Called by an external auditee responding to an audit-date invitation from
 * their invite link -- they aren't expected to have an account or be a
 * member of the inviting company, so this can't go through the normal
 * authenticated database client (audit_invitation_tokens' RLS policies
 * correctly restrict that to company staff). It goes through a dedicated,
 * unauthenticated server endpoint instead (api/audits/respond-invitation.ts),
 * which validates the token itself using the service role, mirroring how
 * server/invites/acceptHandler.ts resolves invite tokens for signed-out users.
 */
export async function respondToAuditInvitation(input: {
  token: string;
  responseStatus: 'accepted' | 'declined';
  selectedDate?: string | null;
  declineReason?: string | null;
}): Promise<{ audit: Audit; invitation: AuditInvitationToken }> {
  const response = await fetch('/api/audits/respond-invitation', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: input.token,
      responseStatus: input.responseStatus,
      selectedDate: input.selectedDate ?? null,
      declineReason: input.declineReason ?? null
    })
  });

  const data = await response.json().catch(() => null as any);
  if (!response.ok || !data || data.ok === false) {
    throw new Error(data?.error || 'Failed to respond to audit invitation.');
  }

  return { audit: data.audit as Audit, invitation: data.invitation as AuditInvitationToken };
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

// ---------------------------
// Sections (ISO clause + title, optional sub-sections)
// ---------------------------

/** Display label for a section: "8.1 — Risk Management", sub-sections as "Parent / Sub-section"
    (the same format the checklist template builder stores on each question). */
export function auditSectionLabel(section: AuditSection, all: AuditSection[]): string {
  const own = section.iso_clause ? `${section.iso_clause} — ${section.section_title}` : section.section_title;
  if (!section.parent_section_id) return own;
  const parent = all.find((s) => s.id === section.parent_section_id);
  return parent && parent.id !== section.id ? `${auditSectionLabel(parent, all)} / ${section.section_title}` : own;
}

/** Links questions that only carry a free-text section label to a real section with that label. */
export async function linkAuditQuestionsToSection(input: {
  auditId: UUID;
  sectionId: UUID;
  sectionLabel: string;
}): Promise<void> {
  return withInsforgeSession('audit_questions:link-section', async () => {
    const { error } = await insforge.database
      .from('audit_questions')
      .update({ section_ref_id: input.sectionId })
      .eq('audit_id', input.auditId)
      .eq('section', input.sectionLabel)
      .is('section_ref_id', null);
    if (error) throw new Error(getErrorMessage(error));
  });
}

/**
 * Creates audit sections from a list (parents before children), returning old id -> new section.
 * Used to carry sections over when duplicating an audit or importing a template.
 */
async function copySectionsIntoAudit(input: {
  companyId: UUID;
  auditId: UUID;
  createdByUserId: UUID;
  startingOrder: number;
  sections: Array<{ id: string; isoClause: string | null; title: string; parentId: string | null }>;
}): Promise<Map<string, AuditSection>> {
  const created = new Map<string, AuditSection>();
  let pending = input.sections.filter((s) => s.title.trim());
  let order = input.startingOrder;
  while (pending.length > 0) {
    const ready = pending.filter((s) => !s.parentId || created.has(s.parentId) || !pending.some((p) => p.id === s.parentId));
    if (ready.length === 0) break; // circular parents: stop rather than loop forever
    for (const s of ready) {
      const section = await createAuditSection({
        companyId: input.companyId,
        auditId: input.auditId,
        sectionTitle: s.title.trim(),
        isoClause: s.isoClause?.trim() || null,
        parentSectionId: s.parentId ? (created.get(s.parentId)?.id ?? null) : null,
        sectionOrder: order,
        createdByUserId: input.createdByUserId
      });
      order += 1;
      created.set(s.id, section);
    }
    pending = pending.filter((s) => !ready.includes(s));
  }
  return created;
}

export async function listAuditSections(auditId: UUID): Promise<AuditSection[]> {
  return withInsforgeSession('audit_sections:list', async () => {
    const { data, error } = await insforge.database
      .from('audit_sections')
      .select('*')
      .eq('audit_id', auditId)
      .order('section_order', { ascending: true });
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? []) as AuditSection[];
  });
}

export async function createAuditSection(input: {
  companyId: UUID;
  auditId: UUID;
  sectionTitle: string;
  isoClause?: string | null;
  parentSectionId?: UUID | null;
  sectionOrder: number;
  createdByUserId: UUID;
}): Promise<AuditSection> {
  return withInsforgeSession('audit_sections:create', async () => {
    const { data, error } = await insforge.database
      .from('audit_sections')
      .insert({
        company_id: input.companyId,
        audit_id: input.auditId,
        section_title: input.sectionTitle,
        iso_clause: input.isoClause ?? null,
        parent_section_id: input.parentSectionId ?? null,
        section_order: input.sectionOrder,
        created_by_user_id: input.createdByUserId
      })
      .select('*')
      .single();
    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to create audit section.');
    return data as AuditSection;
  });
}

export async function deleteAuditSection(sectionId: UUID): Promise<void> {
  return withInsforgeSession('audit_sections:delete', async () => {
    const { error } = await insforge.database.from('audit_sections').delete().eq('id', sectionId);
    if (error) throw new Error(getErrorMessage(error));
  });
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
  companyId: UUID;
  auditId: UUID;
  question: string;
  section?: string | null;
  sectionRefId?: UUID | null;
  expectedEvidence?: string;
  questionOrder: number;
  allocatedScore?: number | null;
  createdByUserId: UUID;
}): Promise<AuditQuestion> {
  const payload: Record<string, unknown> = {
    company_id: input.companyId,
    audit_id: input.auditId,
    question: input.question,
    section: input.section ?? null,
    section_ref_id: input.sectionRefId ?? null,
    expected_evidence: input.expectedEvidence ?? null,
    allocated_score: input.allocatedScore ?? 1,
    question_order: input.questionOrder,
    created_by_user_id: input.createdByUserId
  };
  let data: AuditQuestion | null = null;
  let error: { message?: string } | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await insforge.database.from('audit_questions').insert(payload).select('*').single();
    data = (result.data as AuditQuestion | null) ?? null;
    error = result.error;
    if (!error) break;
    const message = String(error.message ?? '').toLowerCase();
    if (message.includes('column') && message.includes('section_ref_id')) delete payload.section_ref_id;
    else throw new Error(getErrorMessage(error));
  }
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create audit question.');
  return data as AuditQuestion;
}

export async function importAuditChecklistFromTemplate(input: {
  companyId: UUID;
  auditId: UUID;
  templateId: UUID;
  createdByUserId: UUID;
  startingOrder?: number;
}): Promise<number> {
  const template = await getAuditChecklistTemplate(input.companyId, input.templateId);
  if (!template) throw new Error('Checklist template not found.');

  const rawQuestions = template.questions;
  const questionRows = Array.isArray(rawQuestions) ? rawQuestions : [];
  const startOrder = input.startingOrder ?? 1;
  let imported = 0;

  // Create real audit sections (with sub-sections) for the template, reusing any section
  // the audit already has with the same label, so questions can be grouped and added to later.
  const existingSections = await listAuditSections(input.auditId);
  const sectionIdByLabel = new Map(existingSections.map((s) => [auditSectionLabel(s, existingSections), s.id as UUID]));
  const templateSections = (Array.isArray(template.sections) ? (template.sections as any[]) : [])
    .filter((s) => s && String(s.title ?? '').trim())
    .map((s) => ({
      id: String(s.id ?? crypto.randomUUID()),
      isoClause: s.iso_clause ? String(s.iso_clause) : null,
      title: String(s.title),
      parentId: s.parent_section_id ? String(s.parent_section_id) : null
    }));
  const templateLabel = (sec: (typeof templateSections)[number]): string => {
    const own = sec.isoClause ? `${sec.isoClause} — ${sec.title}` : sec.title;
    const parent = sec.parentId ? templateSections.find((p) => p.id === sec.parentId) : undefined;
    return parent && parent !== sec ? `${templateLabel(parent)} / ${sec.title}` : own;
  };
  const toCreate = templateSections.filter((sec) => !sectionIdByLabel.has(templateLabel(sec)));
  const createdSections = await copySectionsIntoAudit({
    companyId: input.companyId,
    auditId: input.auditId,
    createdByUserId: input.createdByUserId,
    startingOrder: existingSections.length + 1,
    sections: toCreate
  });
  for (const sec of templateSections) {
    const made = createdSections.get(sec.id);
    if (made) sectionIdByLabel.set(templateLabel(sec), made.id as UUID);
  }
  let nextSectionOrder = existingSections.length + createdSections.size + 1;

  for (let i = 0; i < questionRows.length; i++) {
    const row = questionRows[i] as Record<string, unknown>;
    const text = String(row.question ?? row.text ?? '').trim();
    if (!text) continue;
    const label = row.section ? String(row.section).trim() : '';
    let sectionRefId: UUID | null = label ? (sectionIdByLabel.get(label) ?? null) : null;
    if (label && !sectionRefId) {
      // Older templates only stored a label per question: give that label a real section.
      const made = await createAuditSection({
        companyId: input.companyId,
        auditId: input.auditId,
        sectionTitle: label,
        sectionOrder: nextSectionOrder,
        createdByUserId: input.createdByUserId
      });
      nextSectionOrder += 1;
      sectionRefId = made.id as UUID;
      sectionIdByLabel.set(label, sectionRefId);
    }
    await createAuditQuestion({
      companyId: input.companyId,
      auditId: input.auditId,
      question: text,
      section: label || null,
      sectionRefId,
      expectedEvidence: row.expected_evidence ? String(row.expected_evidence) : undefined,
      questionOrder: startOrder + imported,
      allocatedScore: Number(row.allocated_score ?? row.score ?? 1) || 1,
      createdByUserId: input.createdByUserId
    });
    imported += 1;
  }

  if (imported === 0) throw new Error('Template has no valid questions to import.');
  return imported;
}

/** Removes trailing "(copy)" markers left by earlier duplications, e.g. "EMS (copy) (copy)" -> "EMS". */
export function stripCopySuffix(title: string): string {
  return title.replace(/(\s*\(copy\))+\s*$/i, '').trim() || title.trim();
}

/** Creates a new draft audit that reuses another audit's setup and question list, so a recurring audit (e.g. the same sub-contractor, next quarter) doesn't need to be rebuilt from scratch. Scores/responses are not carried over. */
export async function duplicateAudit(input: {
  sourceAuditId: UUID;
  companyId: UUID;
  createdByUserId: UUID;
}): Promise<Audit> {
  const source = await getAudit(input.sourceAuditId);
  if (!source) throw new Error('Source audit not found.');
  const sourceQuestions = await listAuditQuestions(input.sourceAuditId);
  const sourceSections = await listAuditSections(input.sourceAuditId);

  const created = await createAudit({
    companyId: input.companyId,
    module: source.module,
    // Same title as the original (minus any old "(copy)" markers); the new audit number
    // tells them apart, and the auditor can rename it on the audit page.
    title: source.title ? stripCopySuffix(source.title) : undefined,
    auditType: source.audit_type,
    objectives: source.objectives ?? '',
    auditCriteria: source.audit_criteria ?? '',
    scopeOfAudit: source.scope_of_audit ?? '',
    location: source.location ?? undefined,
    auditedOrganization: source.audited_organization ?? undefined,
    auditorUserIds: source.auditor_user_ids && source.auditor_user_ids.length > 0 ? source.auditor_user_ids : [input.createdByUserId],
    proposedDates: [],
    createdByUserId: input.createdByUserId,
    requiredDocumentList: source.required_document_list ?? undefined,
    departmentsAuditeeIds: source.departments_auditee_ids ?? undefined,
    companyRepresentativeUserIds: source.company_representative_user_ids ?? undefined,
    leadAuditorUserId: source.lead_auditor_user_id ?? undefined,
    leadAuditorHrEmployeeId: source.lead_auditor_hr_employee_id ?? undefined,
    leadAuditorName: source.lead_auditor_name ?? undefined,
    auditeeHrEmployeeId: source.auditee_hr_employee_id ?? undefined,
    auditeeName: source.auditee_name ?? undefined
  });

  // Carry the section structure over so the copy keeps its sections and sub-sections.
  const sectionMap = await copySectionsIntoAudit({
    companyId: input.companyId,
    auditId: created.id as UUID,
    createdByUserId: input.createdByUserId,
    startingOrder: 1,
    sections: sourceSections.map((s) => ({
      id: s.id,
      isoClause: s.iso_clause,
      title: s.section_title,
      parentId: s.parent_section_id
    }))
  });

  let order = 1;
  for (const q of sourceQuestions) {
    const sourceRef = (q as any).section_ref_id as string | null | undefined;
    await createAuditQuestion({
      companyId: input.companyId,
      auditId: created.id,
      question: q.question,
      section: q.section ?? null,
      sectionRefId: sourceRef ? ((sectionMap.get(sourceRef)?.id as UUID | undefined) ?? null) : null,
      expectedEvidence: q.expected_evidence ?? undefined,
      questionOrder: order,
      allocatedScore: q.allocated_score ?? 1,
      createdByUserId: input.createdByUserId
    });
    order += 1;
  }

  return created;
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

export async function reorderAuditQuestions(auditId: UUID, orderedQuestionIds: UUID[]): Promise<void> {
  return withInsforgeSession('audit_questions:reorder', async () => {
    for (let i = 0; i < orderedQuestionIds.length; i++) {
      const { error } = await insforge.database
        .from('audit_questions')
        .update({ question_order: i + 1 })
        .eq('id', orderedQuestionIds[i])
        .eq('audit_id', auditId);
      if (error) throw new Error(getErrorMessage(error));
    }
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
  companyId: UUID;
  auditQuestionId: UUID;
  isCompliant: boolean;
  finding?: string;
  evidenceDocumentUrl?: string;
  achievedScore?: number | null;
  riskRating: 'low' | 'medium' | 'high';
  answeredByUserId: UUID;
  deviationType?: string | null;
  complianceStatus?: AuditComplianceStatus | null;
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

    const legacy = input.complianceStatus ? deriveLegacyComplianceFields(input.complianceStatus) : null;

    const payload: Record<string, unknown> = {
      is_compliant: legacy ? legacy.is_compliant : input.isCompliant,
      finding: input.finding ?? null,
      evidence_document_url: input.evidenceDocumentUrl ?? null,
      achieved_score: input.achievedScore ?? null,
      risk_rating: input.riskRating,
      answered_at: new Date().toISOString()
    };
    if (input.complianceStatus !== undefined) payload.compliance_status = input.complianceStatus;
    if (input.deviationType !== undefined) payload.deviation_type = input.deviationType;
    else if (legacy) payload.deviation_type = legacy.deviation_type;
    if (input.allocatedScore !== undefined) payload.allocated_score = input.allocatedScore;
    if (input.evidenceFiles !== undefined) payload.evidence_files = input.evidenceFiles;

    let query = existing
      ? insforge.database.from('audit_responses').update(payload).eq('id', (existing as AuditResponse).id)
      : insforge.database.from('audit_responses').insert({
          company_id: input.companyId,
          audit_question_id: input.auditQuestionId,
          answered_by_user_id: input.answeredByUserId,
          ...payload
        });

    let { data, error } = await query.select('*').single();
    // Only fall back when the column itself is missing (older schema). A check-constraint
    // violation must surface as an error, not silently drop the chosen status.
    const errorText = String(error?.message ?? '').toLowerCase();
    if (
      error &&
      errorText.includes('compliance_status') &&
      !errorText.includes('check constraint') &&
      !errorText.includes('violates')
    ) {
      delete payload.compliance_status;
      query = existing
        ? insforge.database.from('audit_responses').update(payload).eq('id', (existing as AuditResponse).id)
        : insforge.database.from('audit_responses').insert({
            company_id: input.companyId,
            audit_question_id: input.auditQuestionId,
            answered_by_user_id: input.answeredByUserId,
            ...payload
          });
      ({ data, error } = await query.select('*').single());
    }
    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to submit audit response.');
    return data as AuditResponse;
  });
}

/** SUM(achieved_score) / SUM(allocated_score) * 100 across all answered questions on the audit. */
export async function calculateAuditScore(auditId: UUID): Promise<{
  overallScore: number;
  maxScore: number;
  compliancePercent: number;
}> {
  const responses = await listAuditResponses(auditId);
  let overallScore = 0;
  let maxScore = 0;
  for (const response of responses) {
    overallScore += Number(response.achieved_score ?? 0);
    maxScore += Number(response.allocated_score ?? 0);
  }
  const compliancePercent = maxScore > 0 ? Math.round((overallScore / maxScore) * 1000) / 10 : 0;
  return { overallScore, maxScore, compliancePercent };
}

export async function refreshAuditScore(auditId: UUID, companyId: UUID, actorUserId: UUID): Promise<void> {
  const score = await calculateAuditScore(auditId);
  await updateAudit(
    auditId,
    companyId,
    {
      overall_score: score.overallScore,
      max_score: score.maxScore,
      compliance_percent: score.compliancePercent
    },
    actorUserId
  );
}

/** Creates a CAPA record linked to a specific NC audit question/response, and stamps the link back onto the response. */
export async function createCorrectiveActionForAuditResponse(input: {
  companyId: UUID;
  auditId: UUID;
  auditTitle: string;
  responseId: UUID;
  questionText: string;
  description?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate: string;
  assignedToUserId?: UUID;
  createdByUserId: UUID;
}): Promise<UUID> {
  return withInsforgeSession('audit_responses:create_capa', async () => {
    const capa = await createCorrectiveAction({
      companyId: input.companyId,
      title: `Audit NC: ${input.questionText}`.slice(0, 255),
      description: input.description ?? `Non-conformance raised during audit: ${input.auditTitle}`,
      actionType: 'corrective',
      sourceType: 'audit_finding',
      sourceId: input.responseId,
      priority: input.priority,
      dueDate: input.dueDate,
      assignedToUserId: input.assignedToUserId,
      createdByUserId: input.createdByUserId
    });

    const { error } = await insforge.database
      .from('audit_responses')
      .update({ corrective_action_id: capa.id })
      .eq('id', input.responseId);
    if (error) throw new Error(getErrorMessage(error));

    return capa.id as UUID;
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
