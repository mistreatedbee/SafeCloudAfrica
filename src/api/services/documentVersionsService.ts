import { insforge } from '../insforge/client';
import type { Document, DocumentVersion, DocumentVersionStatus, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { createApproval } from './approvalsService';

export async function getDocumentVersion(versionId: UUID): Promise<DocumentVersion | null> {
  const { data, error } = await insforge.database.from('document_versions').select('*').eq('id', versionId).maybeSingle();
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? null) as DocumentVersion | null;
}

export async function listDocumentVersions(companyId: UUID, documentId: UUID, limit = 50): Promise<DocumentVersion[]> {
  const { data, error } = await insforge.database
    .from('document_versions')
    .select('*')
    .eq('company_id', companyId)
    .eq('document_id', documentId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as DocumentVersion[];
}

export async function listDocumentVersionsByIds(companyId: UUID, versionIds: UUID[]): Promise<DocumentVersion[]> {
  const ids = Array.from(new Set(versionIds.filter(Boolean))) as UUID[];
  if (ids.length === 0) return [];
  const { data, error } = await insforge.database
    .from('document_versions')
    .select('*')
    .eq('company_id', companyId)
    .in('id', ids)
    .limit(Math.min(500, ids.length));
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as DocumentVersion[];
}

function nextVersionLabel(current: string | null | undefined): string {
  const raw = String(current || '').trim();
  const m = /^v(\d+)$/i.exec(raw);
  if (!m) return `v${Date.now()}`;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return `v${Date.now()}`;
  return `v${n + 1}`;
}

export async function createDraftVersionFrom(input: {
  companyId: UUID;
  documentId: UUID;
  supersedesVersionId?: UUID | null;
  baseVersionLabel?: string | null;
  storageBucket: string | null;
  storageKey: string | null;
  originalFilename?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  createdByUserId: UUID;
  setCurrent: boolean;
  unpublish: boolean;
}): Promise<DocumentVersion> {
  const versionLabel = nextVersionLabel(input.baseVersionLabel ?? undefined);

  const { data, error } = await insforge.database.rpc('create_document_version', {
    p_company_id: input.companyId,
    p_document_id: input.documentId,
    p_version_label: versionLabel,
    p_status: 'draft' as DocumentVersionStatus,
    p_storage_bucket: input.storageBucket,
    p_storage_key: input.storageKey,
    p_original_filename: input.originalFilename ?? null,
    p_mime_type: input.mimeType ?? null,
    p_file_size: input.fileSize ?? null,
    p_created_by_user_id: input.createdByUserId,
    p_supersedes_version_id: input.supersedesVersionId ?? null,
    p_set_current: input.setCurrent,
    p_unpublish: input.unpublish
  });
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create document version.');
  return data as DocumentVersion;
}

export async function markVersionInReview(input: { companyId: UUID; versionId: UUID }): Promise<void> {
  const { error } = await insforge.database
    .from('document_versions')
    .update({ status: 'in_review' as DocumentVersionStatus, updated_at: new Date().toISOString() })
    .eq('company_id', input.companyId)
    .eq('id', input.versionId);
  if (error) throw new Error(getErrorMessage(error));
}

export async function setDocumentReviewDueAt(input: { companyId: UUID; documentId: UUID; reviewDueAt: string | null }): Promise<void> {
  const { error } = await insforge.database
    .from('documents')
    .update({ review_due_at: input.reviewDueAt, updated_at: new Date().toISOString() })
    .eq('company_id', input.companyId)
    .eq('id', input.documentId);
  if (error) throw new Error(getErrorMessage(error));
}

export function resolvePublishedVersionId(document: Pick<Document, 'published_version_id' | 'current_version_id'>): UUID | null {
  return (document.published_version_id ?? null) as UUID | null;
}

export async function requestApprovalForDocumentVersion(input: {
  companyId: UUID;
  documentId: UUID;
  versionId: UUID;
  requestedByUserId: UUID;
  approverUserId: UUID;
  nextReviewDueAt?: string | null;
}): Promise<void> {
  // Move version to in_review, then create an approval request.
  await markVersionInReview({ companyId: input.companyId, versionId: input.versionId });

  if (typeof input.nextReviewDueAt !== 'undefined') {
    await setDocumentReviewDueAt({ companyId: input.companyId, documentId: input.documentId, reviewDueAt: input.nextReviewDueAt ?? null });
  }

  await createApproval({
    companyId: input.companyId,
    entityType: 'document_version',
    entityId: input.versionId,
    requestedByUserId: input.requestedByUserId,
    approverUserId: input.approverUserId
  });
}
