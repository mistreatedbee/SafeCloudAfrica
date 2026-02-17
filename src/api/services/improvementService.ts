import { insforge } from '../insforge/client';
import type { ImprovementAction, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';

export async function listImprovements(companyId: UUID): Promise<ImprovementAction[]> {
  const { data, error } = await insforge.database
    .from('improvement_actions')
    .select('*')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as ImprovementAction[];
}

export async function createImprovement(input: {
  companyId: UUID;
  module: ImprovementAction['module'];
  title: string;
  description?: string | null;
  ownerUserId?: UUID | null;
  status?: ImprovementAction['status'];
  targetDate?: string | null;
  createdByUserId: UUID;
}): Promise<ImprovementAction> {
  const { data, error } = await insforge.database
    .from('improvement_actions')
    .insert({
      company_id: input.companyId,
      module: input.module,
      title: input.title,
      description: input.description ?? null,
      owner_user_id: input.ownerUserId ?? null,
      status: input.status ?? 'planned',
      target_date: input.targetDate ?? null,
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create improvement action.');  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'improvement_actions.create',
    entityType: 'improvement_action',
    entityId: (data as any).id as UUID
  });  return data as ImprovementAction;
}