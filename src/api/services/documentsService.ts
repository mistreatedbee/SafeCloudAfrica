import { insforge } from '../insforge/client';
import type { Document, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';

const DMS_MIGRATION_REQUIRED_MESSAGE = 'Document management database updates are missing. Please run the latest migration.';

function escapeIlike(input: string): string {
  return input.replace(/[%_,]/g, ' ').trim();
}

function getDocumentMigrationError(error: unknown): string | null {
  const message = getErrorMessage(error).toLowerCase();
  if (
    message.includes('schema cache') ||
    message.includes('could not find the') ||
    message.includes('function public.create_document_with_initial_version') ||
    message.includes('function public.create_document_version') ||
    message.includes('is_restricted') ||
    message.includes('document_number') ||
    message.includes('document_owner_name') ||
    message.includes('does not exist')
  ) {
    return DMS_MIGRATION_REQUIRED_MESSAGE;
  }
  return null;
}

export async function listDocuments(
  companyId: UUID,
  filters?: {
    search?: string;
    module?: Document['module'] | null;
    includeRestricted?: boolean;
  }
): Promise<Document[]> {
  let query = insforge.database
    .from('documents')
    .select('*')
    .eq('company_id', companyId);

  if (filters?.module) {
    query = query.eq('module', filters.module);
  }

  if (filters?.includeRestricted === false) {
    query = query.eq('is_restricted', false);
  }

  const search = filters?.search?.trim();
  if (search) {
    const q = escapeIlike(search);
    query = query.or(
      `title.ilike.%${q}%,document_number.ilike.%${q}%,document_owner_name.ilike.%${q}%`
    );
  }

  const { data, error } = await query.order('updated_at', { ascending: false }).limit(500);
  if (error) throw new Error(getDocumentMigrationError(error) ?? getErrorMessage(error));
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

export async function createDocumentWithInitialVersion(input: {
  companyId: UUID;
  module: Document['module'];
  title: string;
  category: string;
  description?: string | null;
  folderId?: UUID | null;
  ownerUserId?: UUID | null;
  createdByUserId: UUID;
  storageBucket: string;
  storageKey: string;
  originalFilename?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  effectiveDate?: string | null;
  documentOwnerName?: string | null;
  approvingOfficerName?: string | null;
  documentNumber?: string | null;
  revisionNumber?: string | null;
  revisionDate?: string | null;
  approvedDate?: string | null;
  expiryDate?: string | null;
  isRestricted?: boolean | null;
}): Promise<Document> {
  const { data, error } = await insforge.database.rpc('create_document_with_initial_version', {
    p_company_id: input.companyId,
    p_module: input.module,
    p_title: input.title,
    p_category: input.category,
    p_description: input.description ?? null,
    p_folder_id: input.folderId ?? null,
    p_owner_user_id: input.ownerUserId ?? null,
    p_created_by_user_id: input.createdByUserId,
    p_storage_bucket: input.storageBucket,
    p_storage_key: input.storageKey,
    p_original_filename: input.originalFilename ?? null,
    p_mime_type: input.mimeType ?? null,
    p_file_size: input.fileSize ?? null,
    p_effective_date: input.effectiveDate ?? null,
    p_document_owner_name: input.documentOwnerName ?? null,
    p_approving_officer_name: input.approvingOfficerName ?? null,
    p_document_number: input.documentNumber ?? null,
    p_revision_number: input.revisionNumber ?? null,
    p_revision_date: input.revisionDate ?? null,
    p_approved_date: input.approvedDate ?? null,
    p_expiry_date: input.expiryDate ?? null,
    p_is_restricted: typeof input.isRestricted === 'boolean' ? input.isRestricted : null
  });
  if (error) throw new Error(getDocumentMigrationError(error) ?? getErrorMessage(error));
  if (!data) throw new Error('Failed to create document.');
  return data as Document;
}

export async function updateDocument(input: {
  companyId: UUID;
  documentId: UUID;
  patch: Partial<Pick<
    Document,
    | 'title'
    | 'category'
    | 'description'
    | 'folder_id'
    | 'effective_date'
    | 'document_owner_name'
    | 'approving_officer_name'
    | 'document_number'
    | 'revision_number'
    | 'revision_date'
    | 'approved_date'
    | 'expiry_date'
    | 'is_restricted'
  >>;
}): Promise<Document> {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  };
  const allowedKeys = [
    'title',
    'category',
    'description',
    'folder_id',
    'effective_date',
    'document_owner_name',
    'approving_officer_name',
    'document_number',
    'revision_number',
    'revision_date',
    'approved_date',
    'expiry_date',
    'is_restricted'
  ] as const;

  for (const key of allowedKeys) {
    if (key in input.patch) patch[key] = (input.patch as any)[key] ?? null;
  }

  const { data, error } = await insforge.database
    .from('documents')
    .update(patch)
    .eq('company_id', input.companyId)
    .eq('id', input.documentId)
    .select('*')
    .single();
  if (error) throw new Error(getDocumentMigrationError(error) ?? getErrorMessage(error));
  if (!data) throw new Error('Failed to update document.');
  return data as Document;
}

