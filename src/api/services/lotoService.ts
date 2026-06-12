import { insforge } from '../insforge/client';
import { withInsforgeSession } from '../insforge/ensureSession';
import { getErrorMessage } from '../insforge/errors';
import type { UUID } from '../models/entities';
import { createActivityLog } from './activityLogService';

export type LotoRecord = {
  id: UUID;
  company_id: UUID;
  equipment_name: string;
  location: string | null;
  site_id: UUID | null;
  lock_applied_by_user_id: UUID | null;
  lock_applied_at: string | null;
  lock_removed_by_user_id: UUID | null;
  lock_removed_at: string | null;
  reason: string | null;
  isolation_points: string[];
  status: 'LOCKED' | 'RELEASED';
  created_at: string;
  updated_at: string;
};

export async function listLotoRecords(companyId: UUID): Promise<LotoRecord[]> {
  return withInsforgeSession('loto_records:list', async () => {
    const { data, error } = await insforge.database
      .from('loto_records')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? []) as LotoRecord[];
  });
}

export async function createLotoRecord(input: {
  companyId: UUID;
  equipmentName: string;
  location?: string | null;
  siteId?: UUID | null;
  lockAppliedByUserId?: UUID | null;
  reason?: string | null;
  isolationPoints?: string[];
  actorUserId: UUID;
}): Promise<LotoRecord> {
  return withInsforgeSession('loto_records:create', async () => {
    const { data, error } = await insforge.database
      .from('loto_records')
      .insert({
        company_id: input.companyId,
        equipment_name: input.equipmentName,
        location: input.location ?? null,
        site_id: input.siteId ?? null,
        lock_applied_by_user_id: input.lockAppliedByUserId ?? null,
        lock_applied_at: new Date().toISOString(),
        reason: input.reason ?? null,
        isolation_points: input.isolationPoints ?? [],
        status: 'LOCKED'
      })
      .select('*')
      .single();
    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to create LOTO record.');

    await createActivityLog({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'loto_records.create',
      entityType: 'loto_record',
      entityId: (data as any).id as UUID
    });

    return data as LotoRecord;
  });
}

export async function updateLotoRecord(input: {
  companyId: UUID;
  recordId: UUID;
  patch: Partial<Pick<LotoRecord, 'equipment_name' | 'location' | 'site_id' | 'lock_removed_by_user_id' | 'lock_removed_at' | 'reason' | 'isolation_points' | 'status'>>;
  actorUserId: UUID;
}): Promise<LotoRecord> {
  return withInsforgeSession('loto_records:update', async () => {
    const { data, error } = await insforge.database
      .from('loto_records')
      .update({ ...input.patch, updated_at: new Date().toISOString() })
      .eq('company_id', input.companyId)
      .eq('id', input.recordId)
      .select('*')
      .single();
    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to update LOTO record.');

    await createActivityLog({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'loto_records.update',
      entityType: 'loto_record',
      entityId: input.recordId,
      metadata: input.patch as any
    });

    return data as LotoRecord;
  });
}

export async function deleteLotoRecord(input: { companyId: UUID; recordId: UUID; actorUserId: UUID }): Promise<void> {
  return withInsforgeSession('loto_records:delete', async () => {
    const { error } = await insforge.database
      .from('loto_records')
      .delete()
      .eq('company_id', input.companyId)
      .eq('id', input.recordId);
    if (error) throw new Error(getErrorMessage(error));

    await createActivityLog({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'loto_records.delete',
      entityType: 'loto_record',
      entityId: input.recordId
    });
  });
}
