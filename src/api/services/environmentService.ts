import { insforge } from '../insforge/client';
import type { EnvironmentAspect, EnvironmentMonitoring, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';

export async function listEnvironmentAspects(companyId: UUID): Promise<EnvironmentAspect[]> {
  const { data, error } = await insforge.database
    .from('environment_aspects')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as EnvironmentAspect[];
}

export async function countActiveEnvironmentAspects(companyId: UUID): Promise<number> {
  const { count, error } = await insforge.database
    .from('environment_aspects')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'active');
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
}

export async function listEnvironmentMonitoring(companyId: UUID, limit = 50): Promise<EnvironmentMonitoring[]> {
  const { data, error } = await insforge.database
    .from('environment_monitoring')
    .select('*')
    .eq('company_id', companyId)
    .order('measured_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as EnvironmentMonitoring[];
}

export async function createEnvironmentMonitoring(input: {
  companyId: UUID;
  type: string;
  location?: string;
  result: string;
  measuredAt?: string;
  createdByUserId: UUID;
}): Promise<EnvironmentMonitoring> {
  const { data, error } = await insforge.database
    .from('environment_monitoring')
    .insert({
      company_id: input.companyId,
      type: input.type,
      location: input.location ?? null,
      result: input.result,
      measured_at: input.measuredAt ?? new Date().toISOString(),
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create monitoring record.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'environment.monitoring.create',
    entityType: 'environment_monitoring',
    entityId: (data as any).id as UUID
  });

  return data as EnvironmentMonitoring;
}

