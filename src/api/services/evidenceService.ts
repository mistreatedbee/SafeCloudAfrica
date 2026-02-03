import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import type { EvidenceAttachment, UUID } from '../models/entities';
import { createActivityLog } from './activityLogService';

export async function listEvidence(companyId: UUID, input: { entityType: string; entityId: UUID; limit?: number }): Promise<EvidenceAttachment[]> {
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
}

export async function listEvidenceForEntityType(companyId: UUID, entityType: string, limit = 2000): Promise<EvidenceAttachment[]> {
  const { data, error } = await insforge.database
    .from('evidence_attachments')
    .select('*')
    .eq('company_id', companyId)
    .eq('entity_type', entityType)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as EvidenceAttachment[];
}

export async function createEvidence(input: {
  companyId: UUID;
  entityType: string;
  entityId: UUID;
  title?: string;
  storageBucket: string;
  storageKey: string;
  createdByUserId: UUID;
}): Promise<EvidenceAttachment> {
  const { data, error } = await insforge.database
    .from('evidence_attachments')
    .insert({
      company_id: input.companyId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      title: input.title ?? null,
      storage_bucket: input.storageBucket,
      storage_key: input.storageKey,
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create evidence.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'evidence_attachments.create',
    entityType: 'evidence_attachment',
    entityId: (data as any).id as UUID,
    metadata: { entityType: input.entityType }
  });

  return data as EvidenceAttachment;
}

