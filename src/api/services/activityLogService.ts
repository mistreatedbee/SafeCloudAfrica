import { insforge } from '../insforge/client';
import type { ActivityLog, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';

export type ActivityLogCreate = {
  companyId: UUID;
  actorUserId: UUID;
  action: string;
  entityType?: string;
  entityId?: UUID;
  metadata?: Record<string, unknown>;
};

export async function createActivityLog(input: ActivityLogCreate): Promise<ActivityLog> {
  const { data, error } = await insforge.database
    .from('activity_logs')
    .insert({
      company_id: input.companyId,
      actor_user_id: input.actorUserId,
      action: input.action,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      metadata: input.metadata ?? null
    })
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create activity log.');
  return data as ActivityLog;
}

export async function listActivityLogs(input: {
  companyId: UUID;
  limit?: number;
  actionPrefix?: string;
}): Promise<ActivityLog[]> {
  const base = insforge.database
    .from('activity_logs')
    .select('*')
    .eq('company_id', input.companyId)
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 50);

  const q = input.actionPrefix ? base.ilike('action', `${input.actionPrefix}%`) : base;

  const { data, error } = await q;
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as ActivityLog[];
}

