import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import type { BbsObservation, UUID } from '../models/entities';
import { createActivityLog } from './activityLogService';
import { requireSellableFeatureAccess } from './sellableFeaturesService';

export async function listBbsObservations(companyId: UUID, limit = 200): Promise<BbsObservation[]> {
  await requireSellableFeatureAccess(companyId, 'bbs');
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
  behaviourCategory?: string;
  observationOutcome?: string;
  status?: BbsObservation['status'];
  linkedTrainingRecordId?: UUID | null;
  linkedNcrId?: UUID | null;
  ownerUserId?: UUID | null;
  dueDate?: string | null;
  notes?: string | null;
  createdByUserId: UUID;
}): Promise<BbsObservation> {
  await requireSellableFeatureAccess(input.companyId, 'bbs');
  const { data, error } = await insforge.database
    .from('bbs_observations')
    .insert({
      company_id: input.companyId,
      type: input.type,
      title: input.title,
      area: input.area ?? null,
      behaviour_category: input.behaviourCategory ?? null,
      observation_outcome: input.observationOutcome ?? null,
      status: input.status ?? 'logged',
      linked_training_record_id: input.linkedTrainingRecordId ?? null,
      linked_ncr_id: input.linkedNcrId ?? null,
      owner_user_id: input.ownerUserId ?? null,
      due_date: input.dueDate ?? null,
      notes: input.notes ?? null,
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

export async function getBbsTrendSummary(companyId: UUID): Promise<{
  total: number;
  positive: number;
  unsafeActs: number;
  nearMisses: number;
  actionRequired: number;
}> {
  const rows = await listBbsObservations(companyId, 500);
  return {
    total: rows.length,
    positive: rows.filter((row) => row.type === 'positive').length,
    unsafeActs: rows.filter((row) => row.type === 'unsafe_act').length,
    nearMisses: rows.filter((row) => row.type === 'near_miss').length,
    actionRequired: rows.filter((row) => row.status === 'action_required').length
  };
}

