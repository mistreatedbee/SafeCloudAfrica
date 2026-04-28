import { insforge } from '../insforge/client';
import type { DocumentFolder, ModuleKey, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';

export async function listDocumentFolders(companyId: UUID): Promise<DocumentFolder[]> {
  const { data, error } = await insforge.database
    .from('document_folders')
    .select('*')
    .eq('company_id', companyId)
    .order('module', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
    .limit(2000);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as DocumentFolder[];
}

export async function createDocumentFolder(input: {
  companyId: UUID;
  module: ModuleKey;
  name: string;
  parentId?: UUID | null;
  isRestricted?: boolean;
  sortOrder?: number;
  createdByUserId?: UUID | null;
}): Promise<DocumentFolder> {
  const { data, error } = await insforge.database
    .from('document_folders')
    .insert({
      company_id: input.companyId,
      module: input.module,
      name: input.name,
      parent_id: input.parentId ?? null,
      is_restricted: input.isRestricted ?? false,
      sort_order: input.sortOrder ?? 0,
      created_by_user_id: input.createdByUserId ?? null
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create folder.');
  return data as DocumentFolder;
}

export async function renameDocumentFolder(input: { companyId: UUID; folderId: UUID; name: string }): Promise<void> {
  const { error } = await insforge.database
    .from('document_folders')
    .update({ name: input.name, updated_at: new Date().toISOString() })
    .eq('company_id', input.companyId)
    .eq('id', input.folderId);
  if (error) throw new Error(getErrorMessage(error));
}

export async function deleteDocumentFolder(input: { companyId: UUID; folderId: UUID }): Promise<void> {
  const { error } = await insforge.database.from('document_folders').delete().eq('company_id', input.companyId).eq('id', input.folderId);
  if (error) throw new Error(getErrorMessage(error));
}

export async function seedDefaultDocumentFolders(input: { companyId: UUID; actorUserId: UUID }): Promise<void> {
  const { error } = await insforge.database.rpc('seed_default_document_folders', {
    p_company_id: input.companyId,
    p_actor_user_id: input.actorUserId
  });
  if (error) throw new Error(getErrorMessage(error));
}
