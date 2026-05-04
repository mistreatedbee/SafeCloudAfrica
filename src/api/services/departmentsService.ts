import { insforge } from '../insforge/client';
import { withInsforgeSession } from '../insforge/ensureSession';
import { getErrorMessage } from '../insforge/errors';
import type { Department, UUID } from '../models/entities';
import { createActivityLog } from './activityLogService';

export async function listDepartments(companyId: UUID, limit = 1000): Promise<Department[]> {
  return withInsforgeSession('departments:list', async () => {
  const { data, error } = await insforge.database
    .from('departments')
    .select('*')
    .eq('company_id', companyId)
    .order('name', { ascending: true })
    .limit(limit);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as Department[];
  });
}

export async function createDepartment(input: {
  companyId: UUID;
  name: string;
  siteId?: UUID | null;
  actorUserId: UUID;
}): Promise<Department> {
  const { data, error } = await insforge.database
    .from('departments')
    .insert({
      company_id: input.companyId,
      site_id: input.siteId ?? null,
      name: input.name,
      is_active: true,
      created_by_user_id: input.actorUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create department.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'departments.create',
    entityType: 'department',
    entityId: (data as any).id as UUID,
    metadata: { siteId: input.siteId ?? null }
  });

  return data as Department;
}

export async function updateDepartment(input: {
  companyId: UUID;
  departmentId: UUID;
  patch: { name?: string; site_id?: UUID | null; is_active?: boolean };
  actorUserId: UUID;
}): Promise<Department> {
  const { data, error } = await insforge.database
    .from('departments')
    .update({ ...input.patch, updated_at: new Date().toISOString() })
    .eq('company_id', input.companyId)
    .eq('id', input.departmentId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update department.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'departments.update',
    entityType: 'department',
    entityId: input.departmentId,
    metadata: input.patch as any
  });

  return data as Department;
}

export async function deleteDepartment(input: { companyId: UUID; departmentId: UUID; actorUserId: UUID }): Promise<void> {
  const { error } = await insforge.database.from('departments').delete().eq('company_id', input.companyId).eq('id', input.departmentId);
  if (error) throw new Error(getErrorMessage(error));

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'departments.delete',
    entityType: 'department',
    entityId: input.departmentId
  });
}

