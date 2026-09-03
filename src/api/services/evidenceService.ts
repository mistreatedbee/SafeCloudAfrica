import { insforge } from '../insforge/client';
import { ensureInsforgeSession, withInsforgeSession } from '../insforge/ensureSession';
import { getErrorMessage } from '../insforge/errors';
import type { EvidenceAttachment, UUID } from '../models/entities';
import { createActivityLog } from './activityLogService';
import { uploadFile, type StorageBucket } from './storageService';

export const EVIDENCE_STORAGE_BUCKET: StorageBucket = 'sca-evidence';

function isMissingObjectError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('not found') || message.includes('404');
}

export async function listEvidence(companyId: UUID, input: { entityType: string; entityId: UUID; limit?: number }): Promise<EvidenceAttachment[]> {
  return withInsforgeSession('evidence:list', async () => {
    const { data, error } = await insforge.database
      .from('evidence_attachments')
      .select('*')
      .eq('company_id', companyId)
      .eq('entity_type', input.entityType)
      .eq('entity_id', input.entityId)
      .order('created_at', { ascending: false })
      .limit(input.limit ?? 200);
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? []) as EvidenceAttachment[];
  });
}

export async function listEvidenceForEntityType(companyId: UUID, entityType: string, limit = 2000): Promise<EvidenceAttachment[]> {
  return withInsforgeSession('evidence:list-by-type', async () => {
    const { data, error } = await insforge.database
      .from('evidence_attachments')
      .select('*')
      .eq('company_id', companyId)
      .eq('entity_type', entityType)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? []) as EvidenceAttachment[];
  });
}

export async function createEvidence(input: {
  companyId: UUID;
  entityType: string;
  entityId: UUID;
  title?: string;
  storageBucket: string;
  storageKey: string;
  createdByUserId: UUID;
  originalFilename?: string;
  displayTitle?: string;
  fileKind?: 'image' | 'document' | string;
}): Promise<EvidenceAttachment> {
  return withInsforgeSession('evidence:create', async () => {
    const { userId } = await ensureInsforgeSession({ reason: 'evidence:create' });
    const createdByUserId = (userId ?? input.createdByUserId) as UUID;

    const insertPayload: Record<string, unknown> = {
      company_id: input.companyId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      title: input.displayTitle ?? input.title ?? input.originalFilename ?? null,
      storage_bucket: input.storageBucket,
      storage_key: input.storageKey,
      created_by_user_id: createdByUserId,
      original_filename: input.originalFilename ?? null,
      display_title: input.displayTitle ?? null,
      file_kind: input.fileKind ?? null
    };

    let data: EvidenceAttachment | null = null;
    let error: { message?: string } | null = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await insforge.database.from('evidence_attachments').insert([insertPayload]).select('*').single();
      data = (result.data as EvidenceAttachment | null) ?? null;
      error = result.error;
      if (!error) break;
      const message = String(error.message ?? '').toLowerCase();
      if (message.includes('file_kind')) delete insertPayload.file_kind;
      else if (message.includes('original_filename')) delete insertPayload.original_filename;
      else if (message.includes('display_title')) delete insertPayload.display_title;
      else throw new Error(getErrorMessage(error));
    }

    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to create evidence.');

    await createActivityLog({
      companyId: input.companyId,
      actorUserId: createdByUserId,
      action: 'evidence_attachments.create',
      entityType: 'evidence_attachment',
      entityId: data.id,
      metadata: { entityType: input.entityType, fileKind: input.fileKind ?? null }
    });

    return data;
  });
}

export async function uploadEntityEvidenceFiles(input: {
  companyId: UUID;
  entityType: string;
  entityId: UUID;
  actorUserId: UUID;
  files: File[];
  title?: string;
  fileKind?: string;
}): Promise<EvidenceAttachment[]> {
  if (input.files.length < 1) return [];

  return withInsforgeSession('evidence:upload-files', async () => {
    const { userId } = await ensureInsforgeSession({ reason: 'evidence:upload-files' });
    const createdByUserId = (userId ?? input.actorUserId) as UUID;
    const created: EvidenceAttachment[] = [];

    for (const file of input.files) {
      const key = `${input.companyId}/${input.entityType}/${input.entityId}/${Date.now()}-${file.name}`.replace(/\s+/g, '_');
      const uploaded = await uploadFile(EVIDENCE_STORAGE_BUCKET, file, { key });
      const displayTitle =
        input.files.length === 1 && input.title?.trim() ? input.title.trim() : file.name;

      created.push(
        await createEvidence({
          companyId: input.companyId,
          entityType: input.entityType,
          entityId: input.entityId,
          title: displayTitle,
          displayTitle,
          originalFilename: file.name,
          fileKind: input.fileKind ?? (file.type.startsWith('image/') ? 'image' : 'document'),
          storageBucket: uploaded.bucket,
          storageKey: uploaded.key,
          createdByUserId
        })
      );
    }

    return created;
  });
}

export async function updateEvidence(
  evidenceId: UUID,
  patch: { displayTitle?: string | null }
): Promise<EvidenceAttachment> {
  return withInsforgeSession('evidence:update', async () => {
    const updateData: Record<string, unknown> = {};
    if (patch.displayTitle !== undefined) updateData.display_title = patch.displayTitle;

    if (Object.keys(updateData).length === 0) {
      const { data, error } = await insforge.database
        .from('evidence_attachments')
        .select('*')
        .eq('id', evidenceId)
        .single();
      if (error) throw new Error(getErrorMessage(error));
      if (!data) throw new Error('Evidence not found.');
      return data as EvidenceAttachment;
    }

    const { data, error } = await insforge.database
      .from('evidence_attachments')
      .update(updateData)
      .eq('id', evidenceId)
      .select('*')
      .single();
    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to update evidence.');
    return data as EvidenceAttachment;
  });
}

export async function deleteEvidence(
  evidenceId: UUID,
  input: { companyId: UUID; actorUserId: UUID; storageBucket: string; storageKey: string; entityType?: string }
): Promise<void> {
  return withInsforgeSession('evidence:delete', async () => {
    const { error: removeError } = await insforge.storage.from(input.storageBucket).remove(input.storageKey);
    if (removeError && !isMissingObjectError(removeError)) throw new Error(getErrorMessage(removeError));

    const { error } = await insforge.database
      .from('evidence_attachments')
      .delete()
      .eq('id', evidenceId)
      .eq('company_id', input.companyId);
    if (error) throw new Error(getErrorMessage(error));

    await createActivityLog({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'evidence_attachments.delete',
      entityType: 'evidence_attachment',
      entityId: evidenceId,
      metadata: input.entityType ? { entityType: input.entityType } : undefined
    });
  });
}
