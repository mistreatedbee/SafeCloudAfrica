import { insforge } from '../insforge/client';
import type { Incident, UUID } from '../models/entities';
import type { IncidentCategory, IncidentStatus, ModuleKey, Severity } from '../models/core';
import { getErrorMessage } from '../insforge/errors';

export type ListIncidentsInput = {
  companyId: UUID;
  search?: string;
  limit?: number;
};

export async function listIncidents(input: ListIncidentsInput): Promise<Incident[]> {
  const q = insforge.database.from('incidents').select('*').eq('company_id', input.companyId).order('occurred_at', { ascending: false });

  const trimmed = input.search?.trim();
  const limit = input.limit ?? 50;

  // Simple search across title/category/subcategory.
  const finalQ = trimmed
    ? q.or(`title.ilike.%${trimmed}%,category.ilike.%${trimmed}%,subcategory.ilike.%${trimmed}%`).limit(limit)
    : q.limit(limit);

  const { data, error } = await finalQ;
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as Incident[];
}

export async function countIncidentsByStatus(companyId: UUID, status: IncidentStatus): Promise<number> {
  const { count, error } = await insforge.database
    .from('incidents')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', status);
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
}

export async function countIncidentsByStatusForModule(companyId: UUID, module: ModuleKey, status: IncidentStatus): Promise<number> {
  const { count, error } = await insforge.database
    .from('incidents')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('module', module)
    .eq('status', status);
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
}

export async function countNearMissesThisMonth(companyId: UUID): Promise<number> {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  const { count, error } = await insforge.database
    .from('incidents')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('category', 'Near Miss')
    .gte('occurred_at', start.toISOString());

  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
}

export async function countMyIncidents(companyId: UUID, userId: UUID): Promise<number> {
  const { count, error } = await insforge.database
    .from('incidents')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('created_by_user_id', userId);
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
}

export type CreateIncidentInput = {
  companyId: UUID;
  module: ModuleKey;
  category: IncidentCategory;
  subcategory: string;
  title: string;
  description?: string;
  severity: Severity;
  occurredAt: string; // ISO string
  location?: string;
  assigneeUserId?: UUID;
  createdByUserId: UUID;
};

export async function createIncident(input: CreateIncidentInput): Promise<Incident> {
  const { data, error } = await insforge.database
    .from('incidents')
    .insert({
      company_id: input.companyId,
      module: input.module,
      category: input.category,
      subcategory: input.subcategory,
      title: input.title,
      description: input.description ?? null,
      severity: input.severity,
      status: 'open' satisfies IncidentStatus,
      occurred_at: input.occurredAt,
      location: input.location ?? null,
      assignee_user_id: input.assigneeUserId ?? null,
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create incident.');

  // Lazy import to avoid circular dependency
  const { createActivityLog } = await import('./activityLogService');
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'incidents.create',
    entityType: 'incident',
    entityId: (data as any).id as UUID
  });

  return data as Incident;
}

