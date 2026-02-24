import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import type { Visitor, UUID } from '../models/entities';
import { createActivityLog } from './activityLogService';
import { requireSellableFeatureAccess } from './sellableFeaturesService';

export async function listVisitors(companyId: UUID, limit = 200): Promise<Visitor[]> {
  await requireSellableFeatureAccess(companyId, 'contractorsVisitors');
  const { data, error } = await insforge.database
    .from('visitors')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as Visitor[];
}

export async function createVisitor(input: {
  companyId: UUID;
  name: string;
  status?: Visitor['status'];
  briefing?: Visitor['briefing'];
  createdByUserId: UUID;
}): Promise<Visitor> {
  await requireSellableFeatureAccess(input.companyId, 'contractorsVisitors');
  const { data, error } = await insforge.database
    .from('visitors')
    .insert({
      company_id: input.companyId,
      name: input.name,
      status: input.status ?? 'scheduled',
      briefing: input.briefing ?? 'pending',
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create visitor.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'visitors.create',
    entityType: 'visitor',
    entityId: (data as any).id as UUID
  });

  return data as Visitor;
}

