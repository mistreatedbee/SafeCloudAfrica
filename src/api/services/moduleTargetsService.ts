import { insforge } from '../insforge/client';
import type { ModuleTarget, UUID } from '../models/entities';
import type { ModuleKey } from '../models/core';
import { getErrorMessage } from '../insforge/errors';

export async function listModuleTargets(input: { companyId: UUID; module?: ModuleKey; limit?: number }): Promise<ModuleTarget[]> {
  const base = insforge.database.from('module_targets').select('*').eq('company_id', input.companyId);
  const q = input.module ? base.eq('module', input.module) : base;
  const { data, error } = await q.order('updated_at', { ascending: false }).limit(input.limit ?? 50);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as ModuleTarget[];
}

export async function createModuleTarget(input: {
  companyId: UUID;
  module: ModuleKey;
  name: string;
  currentValue?: number;
  targetValue?: number;
  unit?: string | null;
  achieved?: boolean;
  createdByUserId: UUID;
}): Promise<ModuleTarget> {
  const { data, error } = await insforge.database
    .from('module_targets')
    .insert({
      company_id: input.companyId,
      module: input.module,
      name: input.name,
      current_value: input.currentValue ?? 0,
      target_value: input.targetValue ?? 0,
      unit: input.unit ?? null,
      achieved: input.achieved ?? false,
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create module target.');
  return data as ModuleTarget;
}

export async function updateModuleTarget(input: {
  id: UUID;
  name?: string;
  currentValue?: number;
  targetValue?: number;
  unit?: string | null;
  achieved?: boolean;
}): Promise<ModuleTarget> {
  const patch: any = {};
  if (typeof input.name !== 'undefined') patch.name = input.name;
  if (typeof input.currentValue !== 'undefined') patch.current_value = input.currentValue;
  if (typeof input.targetValue !== 'undefined') patch.target_value = input.targetValue;
  if (typeof input.unit !== 'undefined') patch.unit = input.unit;
  if (typeof input.achieved !== 'undefined') patch.achieved = input.achieved;
  patch.updated_at = new Date().toISOString();

  const { data, error } = await insforge.database.from('module_targets').update(patch).eq('id', input.id).select('*').single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update module target.');
  return data as ModuleTarget;
}

