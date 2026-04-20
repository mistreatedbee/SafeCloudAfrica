import { insforge } from '../insforge/client';
import type { PreAuditSubmission, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';
import { updateAudit } from './auditsService';

export async function getPreAuditSubmission(auditId: UUID): Promise<PreAuditSubmission | null> {
  const { data, error } = await insforge.database
    .from('audit_pre_submissions')
    .select('*')
    .eq('audit_id', auditId)
    .single();

  if (error && error.code !== 'PGRST116') throw new Error(getErrorMessage(error));
  return (data as PreAuditSubmission) || null;
}

export async function upsertPreAuditSubmission(input: {
  auditId: UUID;
  companyId: UUID;
  status: PreAuditSubmission['status'];
  uploadedDocs?: PreAuditSubmission['uploaded_docs'];
  missingDocs?: PreAuditSubmission['missing_docs'];
  submittedAt?: string | null;
  approvedForAuditAt?: string | null;
  approvedByUserId?: UUID | null;
  actorUserId: UUID;
}): Promise<PreAuditSubmission> {
  const existing = await getPreAuditSubmission(input.auditId);
  const row = {
    audit_id: input.auditId,
    company_id: input.companyId,
    status: input.status,
    uploaded_docs: input.uploadedDocs ?? existing?.uploaded_docs ?? null,
    missing_docs: input.missingDocs ?? existing?.missing_docs ?? null,
    submitted_at: input.submittedAt ?? existing?.submitted_at ?? null,
    approved_for_audit_at: input.approvedForAuditAt ?? existing?.approved_for_audit_at ?? null,
    approved_by_user_id: input.approvedByUserId ?? existing?.approved_by_user_id ?? null,
    updated_at: new Date().toISOString()
  };

  if (existing) {
    const { data, error } = await insforge.database
      .from('audit_pre_submissions')
      .update(row)
      .eq('company_id', input.companyId)
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to update pre-audit submission.');
    await createActivityLog({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'audits.pre_submission_updated',
      entityType: 'audit_pre_submission',
      entityId: existing.id,
      metadata: { status: input.status }
    });
    return data as PreAuditSubmission;
  }

  const { data, error } = await insforge.database
    .from('audit_pre_submissions')
    .insert({
      ...row,
      created_at: new Date().toISOString()
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create pre-audit submission.');
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'audits.pre_submission_created',
    entityType: 'audit_pre_submission',
    entityId: (data as PreAuditSubmission).id,
    metadata: { audit_id: input.auditId }
  });
  return data as PreAuditSubmission;
}

export async function approvePreAuditSubmissionForAudit(
  auditId: UUID,
  companyId: UUID,
  approvedByUserId: UUID
): Promise<PreAuditSubmission> {
  const now = new Date().toISOString();
  const sub = await upsertPreAuditSubmission({
    auditId,
    companyId,
    status: 'approved_for_audit',
    approvedForAuditAt: now,
    approvedByUserId,
    actorUserId: approvedByUserId
  });
  await updateAudit(auditId, companyId, { status: 'ready-for-audit' as any }, approvedByUserId);
  return sub;
}

export async function addPreAuditUploadedDoc(
  auditId: UUID,
  companyId: UUID,
  requirementKey: string,
  storageBucket: string,
  storageKey: string,
  actorUserId: UUID
): Promise<PreAuditSubmission> {
  const existing = await getPreAuditSubmission(auditId);
  const uploaded = existing?.uploaded_docs ?? [];
  const updated = [
    ...uploaded.filter((u: any) => u.requirementKey !== requirementKey),
    { requirementKey, storageBucket, storageKey, uploadedAt: new Date().toISOString() }
  ];
  return upsertPreAuditSubmission({
    auditId,
    companyId,
    status: existing?.status ?? 'pending',
    uploadedDocs: updated,
    missingDocs: null,
    actorUserId
  });
}

export async function submitPreAuditSubmission(
  auditId: UUID,
  companyId: UUID,
  requiredDocLabels: string[],
  actorUserId: UUID
): Promise<PreAuditSubmission> {
  const existing = await getPreAuditSubmission(auditId);
  const uploadedKeys = (existing?.uploaded_docs ?? []).map((u: any) => u.requirementKey);
  const missing = requiredDocLabels.filter((l) => !uploadedKeys.includes(l));
  return upsertPreAuditSubmission({
    auditId,
    companyId,
    status: 'submitted',
    missingDocs: missing.length > 0 ? missing : null,
    submittedAt: new Date().toISOString(),
    actorUserId
  });
}
