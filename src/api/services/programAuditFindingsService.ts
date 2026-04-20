import { insforge } from '../insforge/client';
import type { ProgramAuditFinding, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';
import { createQualityNcr } from './qualityNcrsService';
import { createTaskFromProgramAuditFinding } from './tasksService';

export type ProgramAuditFindingStatus =
  | 'open'
  | 'in-progress'
  | 'awaiting-evidence'
  | 'under-review'
  | 'approved'
  | 'closed';

export type CreateProgramAuditFindingInput = {
  companyId: UUID;
  auditId: UUID;
  auditQuestionId?: UUID | null;
  title: string;
  deviationType: 'observation' | 'finding' | 'non_conformance' | 'opportunity_for_improvement';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  requiredAction?: string;
  responsibleUserId?: UUID;
  dueDate?: string; // ISO date
  evidenceRequirements?: string;
  createdByUserId: UUID;
};

export async function createProgramAuditFinding(
  input: CreateProgramAuditFindingInput
): Promise<ProgramAuditFinding> {
  const { data, error } = await insforge.database
    .from('program_audit_findings')
    .insert({
      company_id: input.companyId,
      audit_id: input.auditId,
      audit_question_id: input.auditQuestionId ?? null,
      title: input.title,
      deviation_type: input.deviationType,
      risk_level: input.riskLevel,
      required_action: input.requiredAction ?? null,
      responsible_user_id: input.responsibleUserId ?? null,
      due_date: input.dueDate ? input.dueDate.split('T')[0] : null,
      evidence_requirements: input.evidenceRequirements ?? null,
      status: 'open',
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create program audit finding.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'program_audit_findings.create',
    entityType: 'program_audit_finding',
    entityId: (data as any).id as UUID,
    metadata: {
      audit_id: input.auditId,
      audit_question_id: input.auditQuestionId ?? null,
      deviation_type: input.deviationType,
      risk_level: input.riskLevel
    }
  });

  const created = data as ProgramAuditFinding;
  await createTaskFromProgramAuditFinding({
    id: created.id,
    company_id: created.company_id,
    audit_id: created.audit_id,
    title: created.title,
    risk_level: created.risk_level,
    required_action: created.action_plan ?? created.required_action ?? null,
    responsible_user_id: created.responsible_user_id ?? null,
    due_date: created.due_date ?? null,
    created_by_user_id: created.created_by_user_id,
    deviation_type: (created as any).deviation_type ?? null
  }).catch(() => undefined);

  // Authoritative NCR integration: non-conformance findings auto-generate NCR.
  if (created.deviation_type === 'non_conformance') {
    await createQualityNcr({
      companyId: input.companyId,
      module: 'quality',
      title: `Audit Finding NCR: ${created.title}`,
      description: created.required_action ?? created.title,
      severity:
        created.risk_level === 'critical'
          ? 'critical'
          : created.risk_level === 'high'
            ? 'high'
            : created.risk_level === 'medium'
              ? 'medium'
              : 'low',
      createdByUserId: input.createdByUserId,
      source_entity_type: 'audit_finding',
      source_entity_id: created.id,
      risk_rating: created.risk_level,
      metadata: { auditId: input.auditId, findingId: created.id }
    });
  }

  return data as ProgramAuditFinding;
}

export async function listProgramAuditFindings(input: {
  companyId: UUID;
  auditId: UUID;
  status?: ProgramAuditFindingStatus;
}): Promise<ProgramAuditFinding[]> {
  let query = insforge.database
    .from('program_audit_findings')
    .select('*')
    .eq('company_id', input.companyId)
    .eq('audit_id', input.auditId);

  if (input.status) {
    query = query.eq('status', input.status);
  }

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as ProgramAuditFinding[];
}

export async function updateProgramAuditFindingStatus(input: {
  companyId: UUID;
  id: UUID;
  status: ProgramAuditFindingStatus;
  actorUserId: UUID;
  closureEvidenceUrl?: string | null;
  managerSignoffUserId?: UUID | null;
  auditorVerifyUserId?: UUID | null;
}): Promise<ProgramAuditFinding> {
  const patch: Partial<ProgramAuditFinding> = {
    status: input.status
  } as any;

  if (input.closureEvidenceUrl !== undefined) {
    (patch as any).closure_evidence_url = input.closureEvidenceUrl;
  }
  const nowIso = new Date().toISOString();
  if (input.status === 'approved' || input.status === 'closed') {
    (patch as any).closed_at = nowIso;
  }
  if (input.managerSignoffUserId) {
    (patch as any).manager_signoff_user_id = input.managerSignoffUserId;
    (patch as any).manager_signoff_at = nowIso;
  }
  if (input.auditorVerifyUserId) {
    (patch as any).auditor_verify_user_id = input.auditorVerifyUserId;
    (patch as any).auditor_verify_at = nowIso;
  }

  const { data, error } = await insforge.database
    .from('program_audit_findings')
    .update({
      ...(patch as any),
      updated_at: nowIso
    })
    .eq('company_id', input.companyId)
    .eq('id', input.id)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update program audit finding.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'program_audit_findings.update_status',
    entityType: 'program_audit_finding',
    entityId: input.id,
    metadata: { status: input.status }
  });

  return data as ProgramAuditFinding;
}

export async function updateProgramAuditFinding(input: {
  companyId: UUID;
  id: UUID;
  actorUserId: UUID;
  status?: ProgramAuditFindingStatus;
  actionPlan?: string | null;
  progressUpdates?: unknown;
  evidenceUploads?: unknown;
  closureEvidenceUrl?: string | null;
}): Promise<ProgramAuditFinding> {
  const patch: any = { updated_at: new Date().toISOString() };
  if (input.status !== undefined) patch.status = input.status;
  if (input.actionPlan !== undefined) patch.action_plan = input.actionPlan;
  if (input.progressUpdates !== undefined) patch.progress_updates = input.progressUpdates;
  if (input.evidenceUploads !== undefined) patch.evidence_uploads = input.evidenceUploads;
  if (input.closureEvidenceUrl !== undefined) patch.closure_evidence_url = input.closureEvidenceUrl;

  const { data, error } = await insforge.database
    .from('program_audit_findings')
    .update(patch)
    .eq('company_id', input.companyId)
    .eq('id', input.id)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update program audit finding.');
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'program_audit_findings.update',
    entityType: 'program_audit_finding',
    entityId: input.id,
    metadata: {}
  });
  return data as ProgramAuditFinding;
}

export async function managerSignOffProgramAuditFinding(
  companyId: UUID,
  findingId: UUID,
  managerUserId: UUID
): Promise<ProgramAuditFinding> {
  return updateProgramAuditFindingStatus({
    companyId,
    id: findingId,
    status: 'under-review',
    actorUserId: managerUserId,
    managerSignoffUserId: managerUserId
  });
}

export async function auditorVerifyAndCloseProgramAuditFinding(
  companyId: UUID,
  findingId: UUID,
  auditorUserId: UUID
): Promise<ProgramAuditFinding> {
  return updateProgramAuditFindingStatus({
    companyId,
    id: findingId,
    status: 'closed',
    actorUserId: auditorUserId,
    auditorVerifyUserId: auditorUserId
  });
}
