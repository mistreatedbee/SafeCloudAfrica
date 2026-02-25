import { insforge } from '../insforge/client';
import type { Incident, UUID } from '../models/entities';
import type { IncidentCategory, IncidentStatus, ModuleKey, Severity } from '../models/core';
import { getErrorMessage } from '../insforge/errors';

export type ListIncidentsInput = {
  companyId: UUID;
  search?: string;
  limit?: number;
};

export type ListIncidentsWithFiltersInput = ListIncidentsInput & {
  status?: IncidentStatus;
  severity?: Severity;
  category?: IncidentCategory;
  from?: string;
  to?: string;
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

export async function listIncidentsWithFilters(input: ListIncidentsWithFiltersInput): Promise<Incident[]> {
  let q = insforge.database
    .from('incidents')
    .select('*')
    .eq('company_id', input.companyId)
    .order('occurred_at', { ascending: false })
    .limit(input.limit ?? 200);

  if (input.status) q = q.eq('status', input.status);
  if (input.severity) q = q.eq('severity', input.severity);
  if (input.category) q = q.eq('category', input.category);
  if (input.from) q = q.gte('occurred_at', input.from);
  if (input.to) q = q.lte('occurred_at', input.to);
  if (input.search?.trim()) {
    const term = input.search.trim();
    q = q.or(`title.ilike.%${term}%,category.ilike.%${term}%,subcategory.ilike.%${term}%`);
  }

  const { data, error } = await q;
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

export type GetIncidentCountsForKpiInput = {
  companyId: UUID;
  dateFrom: string;
  dateTo: string;
  siteId?: UUID | null;
  departmentId?: UUID | null;
};

export type IncidentCountsForKpi = {
  recordableInjuries: number;
  lostTimeInjuries: number;
  fatalities: number;
  totalLostDays: number;
  nearMisses: number;
  accidents: number;
  spills: number;
  environmentalIncidents: number;
  totalIncidents: number;
};

export async function getIncidentCountsForKpi(input: GetIncidentCountsForKpiInput): Promise<IncidentCountsForKpi> {
  let q = insforge.database
    .from('incidents')
    .select('id, lost_days, is_recordable_injury, is_lost_time_injury, is_fatality, is_near_miss, is_accident, is_spill, is_environmental_incident')
    .eq('company_id', input.companyId)
    .gte('occurred_at', input.dateFrom)
    .lte('occurred_at', input.dateTo);

  if (input.siteId != null) q = q.eq('site_id', input.siteId);
  if (input.departmentId != null) q = q.eq('department_id', input.departmentId);

  const { data, error } = await q;
  if (error) throw new Error(getErrorMessage(error));

  const rows = (data ?? []) as Array<{
    id: UUID;
    lost_days: number | null;
    is_recordable_injury?: boolean | null;
    is_lost_time_injury?: boolean | null;
    is_fatality?: boolean | null;
    is_near_miss?: boolean | null;
    is_accident?: boolean | null;
    is_spill?: boolean | null;
    is_environmental_incident?: boolean | null;
  }>;

  const totals: IncidentCountsForKpi = {
    recordableInjuries: 0,
    lostTimeInjuries: 0,
    fatalities: 0,
    totalLostDays: 0,
    nearMisses: 0,
    accidents: 0,
    spills: 0,
    environmentalIncidents: 0,
    totalIncidents: rows.length
  };

  for (const row of rows) {
    if (row.is_recordable_injury) totals.recordableInjuries += 1;
    if (row.is_lost_time_injury) totals.lostTimeInjuries += 1;
    if (row.is_fatality) totals.fatalities += 1;
    if (row.is_near_miss) totals.nearMisses += 1;
    if (row.is_accident) totals.accidents += 1;
    if (row.is_spill) totals.spills += 1;
    if (row.is_environmental_incident) totals.environmentalIncidents += 1;
    totals.totalLostDays += Number(row.lost_days) || 0;
  }

  return totals;
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
