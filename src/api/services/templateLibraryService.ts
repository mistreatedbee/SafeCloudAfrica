import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import type { TemplateLibraryItem, UUID } from '../models/entities';
import { createActivityLog } from './activityLogService';

export const TEMPLATES_BUCKET = 'sca-templates';

export async function listTemplateLibrary(companyId: UUID, limit = 200): Promise<TemplateLibraryItem[]> {
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
  createdByUserId: UUID;
}): Promise<TemplateLibraryItem> {
  const { data, error } = await insforge.database
    .from('template_library_items')
    .insert({
      company_id: input.companyId,
      name: input.name,
      type: input.type,
      category: input.category,
      storage_bucket: input.storageBucket ?? null,
      storage_key: input.storageKey ?? null,
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

