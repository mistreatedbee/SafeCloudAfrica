import { insforge } from './insforge/client';
import { getErrorMessage } from './insforge/errors';
import type { ImprovementAction, ImprovementStatus, ModuleKey, UUID } from '../models/entities';

export async function listImprovementActions(input: {
  companyId: UUID;
  module?: ModuleKey;
  status?: ImprovementStatus;
  limit?: number;
}): Promise<ImprovementAction[]> {
  let q = insforge.database
    .from('improvement_actions')
    .select('*')
    .eq('company_id', input.companyId)
    .order('updated_at', { ascending: false })
    .limit(input.limit ?? 300);

  if (input.module) q = q.eq('module', input.module);
  if (input.status) q = q.eq('status', input.status);

  const { data, error } = await q;
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as ImprovementAction[];
}

export async function createImprovementAction(input: {
  companyId: UUID;
  module: ModuleKey;
  title: string;
  description?: string | null;
  ownerUserId?: UUID | null;
  status?: ImprovementStatus;
  targetDate?: string | null;
  createdByUserId: UUID;
}): Promise<ImprovementAction> {
  const payload = {
    company_id: input.companyId,
    module: input.module,
    title: input.title,
    description: input.description ?? null,
    owner_user_id: input.ownerUserId ?? null,
    status: input.status ?? 'planned',
    target_date: input.targetDate ?? null,
    created_by_user_id: input.createdByUserId
  };

  const { data, error } = await insforge.database
    .from('improvement_actions')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  return data as ImprovementAction;
}

export async function updateImprovementActionStatus(input: {
  companyId: UUID;
  actionId: UUID;
  status: ImprovementStatus;
}): Promise<ImprovementAction> {
  const { data, error } = await insforge.database
    .from('improvement_actions')
    .update({ status: input.status })
    .eq('company_id', input.companyId)
    .eq('id', input.actionId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Improvement action not found.');
  return data as ImprovementAction;
}

