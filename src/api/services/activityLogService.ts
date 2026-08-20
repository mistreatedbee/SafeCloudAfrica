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
  details?: Record<string, unknown>;
};

// This is a fire-and-forget audit trail: every one of its ~220 call sites
// awaits it inline, immediately after the real record (incident, NCR, task,
// etc.) was already committed, without a surrounding try/catch. If this
// insert ever threw (RLS denial, transient network error, schema drift),
// the exception propagated up through the caller's await chain and made an
// otherwise-successful create/update look like it had failed entirely --
// the record existed in the database, but the UI reported an error and
// skipped its post-save steps (closing the modal, clearing the draft,
// refreshing the list). No caller reads the return value, so audit-log
// failures are swallowed here instead of ever being allowed to fail the
// operation they're merely recording.
export async function createActivityLog(input: ActivityLogCreate): Promise<ActivityLog | null> {
  try {
    const payloadMetadata = input.metadata ?? input.details ?? null;

    const { data, error } = await insforge.database
      .from('activity_logs')
      .insert({
        company_id: input.companyId,
        actor_user_id: input.actorUserId,
        action: input.action,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        metadata: payloadMetadata
      })
      .select('*')
      .single();

    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to create activity log.');
    return data as ActivityLog;
  } catch (err) {
    console.warn('[activity-log] failed to record activity (non-fatal)', input.action, err);
    return null;
  }
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

export async function listActivityLogsByEntity(input: {
  companyId: UUID;
  entityType: string;
  entityId: UUID;
  limit?: number;
}): Promise<ActivityLog[]> {
  const { data, error } = await insforge.database
    .from('activity_logs')
    .select('*')
    .eq('company_id', input.companyId)
    .eq('entity_type', input.entityType)
    .eq('entity_id', input.entityId)
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 100);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as ActivityLog[];
}

