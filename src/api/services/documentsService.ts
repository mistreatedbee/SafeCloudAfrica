import { insforge } from '../insforge/client';
import type { Document, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';

export async function listDocuments(companyId: UUID): Promise<Document[]> {
  const { data, error } = await insforge.database
    .from('documents')
    .select('*')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as Document[];
}

export async function createDocument(input: {
  companyId: UUID;
  module: Document['module'];
  title: string;
  category: string;
  ownerUserId?: UUID | null;
  storageBucket?: string | null;
  storageKey?: string | null;
  reviewDueAt?: string | null;
}): Promise<Document> {
  const { data, error } = await insforge.database
    .from('documents')
    .insert({
      company_id: input.companyId,
      module: input.module,
      title: input.title,
      category: input.category,
      version: 'v1',
      status: 'draft',
      owner_user_id: input.ownerUserId ?? null,
      review_due_at: input.reviewDueAt ?? null,
      storage_bucket: input.storageBucket ?? null,
      storage_key: input.storageKey ?? null
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create document.');
  return data as Document;
}

