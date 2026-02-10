import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import type { Site, UUID } from '../models/entities';
import { createActivityLog } from './activityLogService';

export async function listSites(companyId: UUID, limit = 500): Promise<Site[]> {
  const { data, error } = await insforge.database
    .from('sites')
    .select('*')
    .eq('company_id', companyId)
    .order('name', { ascending: true })
    .limit(limit);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as Site[];
}

export async function createSite(input: {
  companyId: UUID;
  name: string;
  address?: string | null;
  actorUserId: UUID;
}): Promise<Site> {
  const { data, error } = await insforge.database
    .from('sites')
    .insert({
      company_id: input.companyId,
      name: input.name,
      address: input.address ?? null,
      is_active: true,
      created_by_user_id: input.actorUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create site.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'sites.create',
    entityType: 'site',
    entityId: (data as any).id as UUID
  });

  return data as Site;
}

export async function updateSite(input: {
  companyId: UUID;
  siteId: UUID;
  patch: { name?: string; address?: string | null; is_active?: boolean };
  actorUserId: UUID;
}): Promise<Site> {
  const { data, error } = await insforge.database
    .from('sites')
    .update({ ...input.patch, updated_at: new Date().toISOString() })
    .eq('company_id', input.companyId)
    .eq('id', input.siteId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update site.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'sites.update',
    entityType: 'site',
    entityId: input.siteId,
    metadata: input.patch as any
  });

  return data as Site;
}

export async function deleteSite(input: { companyId: UUID; siteId: UUID; actorUserId: UUID }): Promise<void> {
  const { error } = await insforge.database.from('sites').delete().eq('company_id', input.companyId).eq('id', input.siteId);
  if (error) throw new Error(getErrorMessage(error));

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'sites.delete',
    entityType: 'site',
    entityId: input.siteId
  });
}

