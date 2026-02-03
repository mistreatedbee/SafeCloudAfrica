import { insforge } from '../insforge/client';
import type { Inspection, UUID } from '../models/entities';
import type { ModuleKey } from '../models/core';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';

export type ListInspectionsInput = {
  companyId: UUID;
  module?: ModuleKey;
  limit?: number;
};

export async function listInspections(input: ListInspectionsInput): Promise<Inspection[]> {
  const base = insforge.database.from('inspections').select('*').eq('company_id', input.companyId);
  const q = input.module ? base.eq('module', input.module) : base;
  const { data, error } = await q.order('scheduled_at', { ascending: false }).limit(input.limit ?? 200);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as Inspection[];
}

export async function countInspections(companyId: UUID, input?: { module?: ModuleKey; status?: Inspection['status'] }): Promise<number> {
  const base = insforge.database.from('inspections').select('*', { count: 'exact', head: true }).eq('company_id', companyId);
  const q1 = input?.module ? base.eq('module', input.module) : base;
  const q2 = input?.status ? q1.eq('status', input.status) : q1;
  const { count, error } = await q2;
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
}

export type CreateInspectionInput = {
  companyId: UUID;
  module: ModuleKey;
  title: string;
  scheduledAt?: string;
  location?: string;
  assigneeUserId?: UUID;
  createdByUserId: UUID;
};

export async function createInspection(input: CreateInspectionInput): Promise<Inspection> {
  const { data, error } = await insforge.database
    .from('inspections')
    .insert({
      company_id: input.companyId,
      module: input.module,
      title: input.title,
      status: 'scheduled',
      scheduled_at: input.scheduledAt ?? null,
      location: input.location ?? null,
      assignee_user_id: input.assigneeUserId ?? null,
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create inspection.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'inspections.create',
    entityType: 'inspection',
    entityId: (data as any).id as UUID
  });

  return data as Inspection;
}

