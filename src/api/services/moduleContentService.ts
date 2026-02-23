import { insforge } from '../insforge/client';
import type { UUID } from '../models/entities';
import type { ModuleKey } from '../models/core';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';
import { requireModuleEnabled } from './orgModulesService';

export interface ModuleContent {
  id: UUID;
  company_id: UUID;
  module_key: ModuleKey;
  content_type: 'procedure' | 'policy' | 'template' | 'checklist' | 'guideline' | 'training_material';
  title: string;
  description: string | null;
  content_url: string;
  file_size_kb: number | null;
  file_type: string | null;
  version: string;
  is_published: boolean;
  published_date: string | null;
  published_by_user_id: UUID | null;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
}

export type CreateModuleContentInput = {
  companyId: UUID;
  moduleKey: ModuleKey;
  contentType: ModuleContent['content_type'];
  title: string;
  description?: string;
  contentUrl: string;
  fileSizeKb?: number;
  fileType?: string;
  version?: string;
  createdByUserId: UUID;
};

export async function createModuleContent(input: CreateModuleContentInput): Promise<ModuleContent> {
  await requireModuleEnabled(input.companyId, input.moduleKey);
  const { data, error } = await insforge.database
    .from('module_content')
    .insert({
      company_id: input.companyId,
      module_key: input.moduleKey,
      content_type: input.contentType,
      title: input.title,
      description: input.description ?? null,
      content_url: input.contentUrl,
      file_size_kb: input.fileSizeKb ?? null,
      file_type: input.fileType ?? null,
      version: input.version ?? '1.0',
      is_published: false,
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create module content');
  
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'module_content.create',
    entityType: 'module_content',
    entityId: (data as any).id as UUID,
    details: { module: input.moduleKey, contentType: input.contentType }
  });
  
  return data as ModuleContent;
}

export type ListModuleContentInput = {
  companyId: UUID;
  moduleKey?: ModuleKey;
  contentType?: ModuleContent['content_type'];
  isPublished?: boolean;
  limit?: number;
};

export async function listModuleContent(input: ListModuleContentInput): Promise<ModuleContent[]> {
  if (input.moduleKey) await requireModuleEnabled(input.companyId, input.moduleKey);
  let query = insforge.database
    .from('module_content')
    .select('*')
    .eq('company_id', input.companyId);
  
  if (input.moduleKey) {
    query = query.eq('module_key', input.moduleKey);
  }
  
  if (input.contentType) {
    query = query.eq('content_type', input.contentType);
  }
  
  if (input.isPublished !== undefined) {
    query = query.eq('is_published', input.isPublished);
  }
  
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 500);
  
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as ModuleContent[];
}

export async function getModuleContent(contentId: UUID): Promise<ModuleContent> {
  const { data, error } = await insforge.database
    .from('module_content')
    .select('*')
    .eq('id', contentId)
    .single();
  
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Module content not found');
  
  return data as ModuleContent;
}

export type UpdateModuleContentInput = {
  contentId: UUID;
  companyId: UUID;
  title?: string;
  description?: string;
  contentUrl?: string;
  fileSizeKb?: number;
  fileType?: string;
  version?: string;
  updatedByUserId: UUID;
};

export async function updateModuleContent(input: UpdateModuleContentInput): Promise<ModuleContent> {
  const updateData: any = {
    updated_at: new Date().toISOString()
  };
  
  if (input.title !== undefined) updateData.title = input.title;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.contentUrl !== undefined) updateData.content_url = input.contentUrl;
  if (input.fileSizeKb !== undefined) updateData.file_size_kb = input.fileSizeKb;
  if (input.fileType !== undefined) updateData.file_type = input.fileType;
  if (input.version !== undefined) updateData.version = input.version;
  
  const { data, error } = await insforge.database
    .from('module_content')
    .update(updateData)
    .eq('id', input.contentId)
    .select('*')
    .single();
  
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update module content');
  
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.updatedByUserId,
    action: 'module_content.update',
    entityType: 'module_content',
    entityId: input.contentId
  });
  
  return data as ModuleContent;
}

export async function publishModuleContent(
  contentId: UUID,
  companyId: UUID,
  publishedByUserId: UUID
): Promise<ModuleContent> {
  const today = new Date().toISOString().split('T')[0];
  
  const { data, error } = await insforge.database
    .from('module_content')
    .update({
      is_published: true,
      published_date: today,
      published_by_user_id: publishedByUserId,
      updated_at: new Date().toISOString()
    })
    .eq('id', contentId)
    .select('*')
    .single();
  
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to publish module content');
  
  await createActivityLog({
    companyId: companyId,
    actorUserId: publishedByUserId,
    action: 'module_content.publish',
    entityType: 'module_content',
    entityId: contentId
  });
  
  return data as ModuleContent;
}

export async function unpublishModuleContent(
  contentId: UUID,
  companyId: UUID,
  unpublishedByUserId: UUID
): Promise<ModuleContent> {
  const { data, error } = await insforge.database
    .from('module_content')
    .update({
      is_published: false,
      published_date: null,
      published_by_user_id: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', contentId)
    .select('*')
    .single();
  
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to unpublish module content');
  
  await createActivityLog({
    companyId: companyId,
    actorUserId: unpublishedByUserId,
    action: 'module_content.unpublish',
    entityType: 'module_content',
    entityId: contentId
  });
  
  return data as ModuleContent;
}

export async function deleteModuleContent(
  contentId: UUID,
  companyId: UUID,
  deletedByUserId: UUID
): Promise<void> {
  const { error } = await insforge.database
    .from('module_content')
    .delete()
    .eq('id', contentId);
  
  if (error) throw new Error(getErrorMessage(error));
  
  await createActivityLog({
    companyId: companyId,
    actorUserId: deletedByUserId,
    action: 'module_content.delete',
    entityType: 'module_content',
    entityId: contentId
  });
}

export async function getPublishedContent(
  companyId: UUID,
  moduleKey: ModuleKey,
  contentType?: ModuleContent['content_type']
): Promise<ModuleContent[]> {
  let query = insforge.database
    .from('module_content')
    .select('*')
    .eq('company_id', companyId)
    .eq('module_key', moduleKey)
    .eq('is_published', true);
  
  if (contentType) {
    query = query.eq('content_type', contentType);
  }
  
  const { data, error } = await query.order('created_at', { ascending: false });
  
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as ModuleContent[];
}
