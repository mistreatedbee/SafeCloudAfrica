import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import type { Department, UUID } from '../models/entities';
import { createActivityLog } from './activityLogService';

export async function listDepartments(companyId: UUID, limit = 1000): Promise<Department[]> {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/0b6fab05-6c3e-43f5-9c91-57b342f42891', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: `log_${Date.now()}_listDepts`,
      timestamp: Date.now(),
      location: 'departmentsService.ts:listDepartments:before',
      message: 'departments list request',
      hypothesisId: 'H3',
      data: { companyId, limit }
    })
  }).catch(() => {});
  // #endregion agent log
  const { data, error } = await insforge.database
    .from('departments')
    .select('*')
    .eq('company_id', companyId)
    .order('name', { ascending: true })
    .limit(limit);
  // #region agent log
  if (error) {
    fetch('http://127.0.0.1:7242/ingest/0b6fab05-6c3e-43f5-9c91-57b342f42891', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: `log_${Date.now()}_listDeptsErr`,
        timestamp: Date.now(),
        location: 'departmentsService.ts:listDepartments:error',
        message: 'departments list error',
        hypothesisId: 'H3',
        data: { errorMessage: getErrorMessage(error), errorRaw: typeof error === 'object' && error !== null ? JSON.stringify(error) : String(error) }
      })
    }).catch(() => {});
  }
  // #endregion agent log
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as Department[];
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

