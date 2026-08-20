import { insforge } from '../insforge/client';
import type { DocumentFolder, ModuleKey, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';

const DMS_MIGRATION_REQUIRED_MESSAGE = 'Document folder setup is incomplete. Please run the latest document migration.';
const DUPLICATE_FOLDER_MESSAGE = 'Folder already exists';

function normalizeFolderName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function isSchemaMismatchError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('schema cache') ||
    message.includes('could not find the') ||
    (message.includes('column') && message.includes('document_folders')) ||
    message.includes('is_restricted') ||
    message.includes('does not exist')
  );
}

function isDuplicateError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('duplicate key') || message.includes('unique') || message.includes('already exists');
}

async function findExistingFolder(input: {
  companyId: UUID;
  module: ModuleKey;
  name: string;
  parentId?: UUID | null;
}): Promise<DocumentFolder | null> {
  const normalizedName = normalizeFolderName(input.name);
  let query: any = insforge.database
    .from('document_folders')
    .select('*')
    .eq('company_id', input.companyId)
    .eq('module', input.module)
    .ilike('name', normalizedName)
    .limit(1);

  query = input.parentId ? query.eq('parent_id', input.parentId) : query.is('parent_id', null);

  const { data, error } = await query.maybeSingle();
  if (error) {
    if (isSchemaMismatchError(error)) throw new Error(DMS_MIGRATION_REQUIRED_MESSAGE);
    throw new Error(getErrorMessage(error));
  }
  return (data as DocumentFolder | null) ?? null;
}

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
  const normalizedName = normalizeFolderName(input.name);
  if (!normalizedName) throw new Error('Folder name is required.');

  const existing = await findExistingFolder({
    companyId: input.companyId,
    module: input.module,
    name: normalizedName,
    parentId: input.parentId ?? null
  });
  if (existing) throw new Error(DUPLICATE_FOLDER_MESSAGE);

  const { data, error } = await insforge.database
    .from('document_folders')
    .insert({
      company_id: input.companyId,
      module: input.module,
      name: normalizedName,
      parent_id: input.parentId ?? null,
      is_restricted: input.isRestricted ?? false,
      sort_order: input.sortOrder ?? 0,
      created_by_user_id: input.createdByUserId ?? null
    })
    .select('*')
    .single();
  if (error) {
    if (isDuplicateError(error)) throw new Error(DUPLICATE_FOLDER_MESSAGE);
    if (isSchemaMismatchError(error)) throw new Error(DMS_MIGRATION_REQUIRED_MESSAGE);
    throw new Error(getErrorMessage(error));
  }
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
