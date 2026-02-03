import { insforge } from '../insforge/client';
import type { Risk, UUID } from '../models/entities';
import type { ModuleKey } from '../models/core';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';

export type ListRisksInput = {
  companyId: UUID;
  module?: ModuleKey;
  status?: 'open' | 'mitigated' | 'closed';
  limit?: number;
};

export async function listRisks(input: ListRisksInput): Promise<Risk[]> {
  const base = insforge.database.from('risks').select('*').eq('company_id', input.companyId);
  const q1 = input.module ? base.eq('module', input.module) : base;
  const q2 = input.status ? q1.eq('status', input.status) : q1;
  const { data, error } = await q2.order('created_at', { ascending: false }).limit(input.limit ?? 200);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as Risk[];
}

export async function countRisks(companyId: UUID, input?: { module?: ModuleKey; status?: Risk['status'] }): Promise<number> {
  const base = insforge.database.from('risks').select('*', { count: 'exact', head: true }).eq('company_id', companyId);
  const q1 = input?.module ? base.eq('module', input.module) : base;
  const q2 = input?.status ? q1.eq('status', input.status) : q1;
  const { count, error } = await q2;
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
}

export type CreateRiskInput = {
  companyId: UUID;
  module: ModuleKey;
  title: string;
  description?: string;
  hazard?: string;
  controls?: string;
  likelihood: number;
  consequence: number;
  createdByUserId: UUID;
};

export async function createRisk(input: CreateRiskInput): Promise<Risk> {
  const riskRating = Math.max(1, Number(input.likelihood || 1) * Number(input.consequence || 1));
  const { data, error } = await insforge.database
    .from('risks')
    .insert({
      company_id: input.companyId,
      module: input.module,
      title: input.title,
      description: input.description ?? null,
      hazard: input.hazard ?? null,
      controls: input.controls ?? null,
      likelihood: input.likelihood,
      consequence: input.consequence,
      risk_rating: riskRating,
      status: 'open',
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create risk.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'risks.create',
    entityType: 'risk',
    entityId: (data as any).id as UUID
  });

  return data as Risk;
}

