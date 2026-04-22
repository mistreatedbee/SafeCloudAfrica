import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import type { TemplateLibraryItem, UUID } from '../models/entities';
import { createActivityLog } from './activityLogService';
import { requireSellableFeatureAccess } from './sellableFeaturesService';

export const TEMPLATES_BUCKET = 'sca-templates';

export async function listTemplateLibrary(companyId: UUID, limit = 200): Promise<TemplateLibraryItem[]> {
  await requireSellableFeatureAccess(companyId, 'templateLibrary');
  const { data, error } = await insforge.database
    .from('template_library_items')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as TemplateLibraryItem[];
}

export async function createTemplateLibraryItem(input: {
  companyId: UUID;
  name: string;
  type: string;
  category: string;
  storageBucket?: string | null;
  storageKey?: string | null;
  isMasterTemplate?: boolean;
  latestVersionLabel?: string | null;
  createdByUserId: UUID;
}): Promise<TemplateLibraryItem> {
  await requireSellableFeatureAccess(input.companyId, 'templateLibrary');
  const { data, error } = await insforge.database
    .from('template_library_items')
    .insert({
      company_id: input.companyId,
      name: input.name,
      type: input.type,
      category: input.category,
      storage_bucket: input.storageBucket ?? null,
      storage_key: input.storageKey ?? null,
      is_master_template: input.isMasterTemplate ?? false,
      latest_version_label: input.latestVersionLabel ?? null,
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create template.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'template_library.create',
    entityType: 'template_library_item',
    entityId: (data as any).id as UUID
  });

  return data as TemplateLibraryItem;
}

export async function listTemplateVersions(templateItemId: UUID): Promise<Array<{ id: UUID; version_label: string; change_summary: string | null; created_at: string }>> {
  const { data, error } = await insforge.database
    .from('template_library_versions')
    .select('*')
    .eq('template_item_id', templateItemId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as Array<{ id: UUID; version_label: string; change_summary: string | null; created_at: string }>;
}

export async function createTemplateVersion(input: {
  templateItemId: UUID;
  companyId: UUID;
  versionLabel: string;
  storageBucket?: string | null;
  storageKey?: string | null;
  changeSummary?: string | null;
  createdByUserId: UUID;
}): Promise<{ id: UUID; version_label: string }> {
  const { data, error } = await insforge.database
    .from('template_library_versions')
    .insert({
      template_item_id: input.templateItemId,
      company_id: input.companyId,
      version_label: input.versionLabel,
      storage_bucket: input.storageBucket ?? null,
      storage_key: input.storageKey ?? null,
      change_summary: input.changeSummary ?? null,
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));

  await insforge.database
    .from('template_library_items')
    .update({
      latest_version_label: input.versionLabel,
      updated_at: new Date().toISOString()
    })
    .eq('id', input.templateItemId);

  return data as { id: UUID; version_label: string };
}

export async function copyTemplateIntoOrganisation(input: {
  companyId: UUID;
  sourceTemplateItemId: UUID;
  sourceVersionId?: UUID | null;
  targetDocumentId?: UUID | null;
  copiedByUserId: UUID;
}): Promise<{ id: UUID }> {
  const { data, error } = await insforge.database
    .from('template_org_copies')
    .insert({
      company_id: input.companyId,
      source_template_item_id: input.sourceTemplateItemId,
      source_version_id: input.sourceVersionId ?? null,
      target_document_id: input.targetDocumentId ?? null,
      copied_by_user_id: input.copiedByUserId
    })
    .select('id')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  return data as { id: UUID };
}

