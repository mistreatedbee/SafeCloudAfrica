import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import type { BbsObservation, UUID } from '../models/entities';
import { createActivityLog } from './activityLogService';

export async function listBbsObservations(companyId: UUID, limit = 200): Promise<BbsObservation[]> {
  const { data, error } = await insforge.database
    .from('bbs_observations')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as BbsObservation[];
}

export async function createBbsObservation(input: {
  companyId: UUID;
  type: BbsObservation['type'];
  title: string;
  area?: string;
  status?: BbsObservation['status'];
  createdByUserId: UUID;
}): Promise<BbsObservation> {
  const { data, error } = await insforge.database
    .from('bbs_observations')
    .insert({
      company_id: input.companyId,
      type: input.type,
      title: input.title,
      area: input.area ?? null,
      status: input.status ?? 'logged',
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create observation.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'bbs_observations.create',
    entityType: 'bbs_observation',
    entityId: (data as any).id as UUID
  });

  return data as BbsObservation;
}

