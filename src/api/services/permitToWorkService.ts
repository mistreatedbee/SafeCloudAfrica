import { insforge } from '../insforge/client';
import { withInsforgeSession } from '../insforge/ensureSession';
import { getErrorMessage } from '../insforge/errors';
import type { UUID } from '../models/entities';
import { createActivityLog } from './activityLogService';

export type PermitToWork = {
  id: UUID;
  company_id: UUID;
  permit_number: string | null;
  work_description: string;
  location: string | null;
  site_id: UUID | null;
  requested_by_user_id: UUID | null;
  approved_by_user_id: UUID | null;
  valid_from: string | null;
  valid_to: string | null;
  hazards: string[];
  precautions: string[];
  status: 'PENDING' | 'APPROVED' | 'ACTIVE' | 'CLOSED' | 'CANCELLED';
  created_at: string;
  updated_at: string;
};

export async function listPermitsToWork(companyId: UUID): Promise<PermitToWork[]> {
  return withInsforgeSession('permits_to_work:list', async () => {
    const { data, error } = await insforge.database
      .from('permits_to_work')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? []) as PermitToWork[];
  });
}

export async function createPermitToWork(input: {
  companyId: UUID;
  permitNumber?: string | null;
  workDescription: string;
  location?: string | null;
  siteId?: UUID | null;
  requestedByUserId?: UUID | null;
  validFrom?: string | null;
  validTo?: string | null;
  hazards?: string[];
  precautions?: string[];
  actorUserId: UUID;
}): Promise<PermitToWork> {
  return withInsforgeSession('permits_to_work:create', async () => {
    const { data, error } = await insforge.database
      .from('permits_to_work')
      .insert({
        company_id: input.companyId,
        permit_number: input.permitNumber ?? null,
        work_description: input.workDescription,
        location: input.location ?? null,
        site_id: input.siteId ?? null,
        requested_by_user_id: input.requestedByUserId ?? null,
        valid_from: input.validFrom ?? null,
        valid_to: input.validTo ?? null,
        hazards: input.hazards ?? [],
        precautions: input.precautions ?? [],
        status: 'PENDING'
      })
      .select('*')
      .single();
    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to create permit to work.');

    await createActivityLog({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'permits_to_work.create',
      entityType: 'permit_to_work',
      entityId: (data as any).id as UUID
    });

    return data as PermitToWork;
  });
}

// Valid permit status transitions:
//   PENDING   → APPROVED  (manager/admin approves)
//   APPROVED  → ACTIVE    (work commences)
//   ACTIVE    → CLOSED    (work completed)
//   any       → CANCELLED (permit cancelled before completion)
export async function updatePermitToWork(input: {
  companyId: UUID;
  permitId: UUID;
  patch: Partial<Pick<PermitToWork, 'permit_number' | 'work_description' | 'location' | 'site_id' | 'approved_by_user_id' | 'valid_from' | 'valid_to' | 'hazards' | 'precautions' | 'status'>>;
  actorUserId: UUID;
}): Promise<PermitToWork> {
  return withInsforgeSession('permits_to_work:update', async () => {
    const { data, error } = await insforge.database
      .from('permits_to_work')
      .update({ ...input.patch, updated_at: new Date().toISOString() })
      .eq('company_id', input.companyId)
      .eq('id', input.permitId)
      .select('*')
      .single();
    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to update permit to work.');

    await createActivityLog({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'permits_to_work.update',
      entityType: 'permit_to_work',
      entityId: input.permitId,
      metadata: input.patch as any
    });

    return data as PermitToWork;
  });
}

export async function deletePermitToWork(input: { companyId: UUID; permitId: UUID; actorUserId: UUID }): Promise<void> {
  return withInsforgeSession('permits_to_work:delete', async () => {
    const { error } = await insforge.database
      .from('permits_to_work')
      .delete()
      .eq('company_id', input.companyId)
      .eq('id', input.permitId);
    if (error) throw new Error(getErrorMessage(error));

    await createActivityLog({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'permits_to_work.delete',
      entityType: 'permit_to_work',
      entityId: input.permitId
    });
  });
}
