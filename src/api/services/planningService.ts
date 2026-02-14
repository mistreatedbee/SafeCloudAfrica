import { insforge } from '../insforge/client';
import type { PlanningKpi, PlanningPlan, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';

export async function listPlans(companyId: UUID): Promise<PlanningPlan[]> {
  const { data, error } = await insforge.database
    .from('planning_plans')
    .select('*')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as PlanningPlan[];
}

export async function countKpis(companyId: UUID, planId: UUID): Promise<number> {
  const { count, error } = await insforge.database
    .from('planning_kpis')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('plan_id', planId);
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
}

export async function listKpis(companyId: UUID, planId: UUID): Promise<PlanningKpi[]> {
  const { data, error } = await insforge.database
    .from('planning_kpis')
    .select('*')
    .eq('company_id', companyId)
    .eq('plan_id', planId)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as PlanningKpi[];
}

export async function createPlan(input: {
  companyId: UUID;
  name: string;
  period: PlanningPlan['period'];
  status?: PlanningPlan['status'];
  createdByUserId: UUID;
}): Promise<PlanningPlan> {
  const { data, error } = await insforge.database
    .from('planning_plans')
    .insert({
      company_id: input.companyId,
      name: input.name,
      period: input.period,
      status: input.status ?? 'draft',
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create plan.');  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'planning_plans.create',
    entityType: 'planning_plan',
    entityId: (data as any).id as UUID
  });

  return data as PlanningPlan;
}

export async function createKpi(input: {
  companyId: UUID;
  planId: UUID;
  name: string;
  currentValue?: number;
  targetValue?: number;
  unit?: string | null;
  status?: PlanningKpi['status'];
  actorUserId: UUID;
}): Promise<PlanningKpi> {
  const { data, error } = await insforge.database
    .from('planning_kpis')
    .insert({
      company_id: input.companyId,
      plan_id: input.planId,
      name: input.name,
      current_value: input.currentValue ?? 0,
      target_value: input.targetValue ?? 0,
      unit: input.unit ?? null,
      status: input.status ?? 'on-track'
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create KPI.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'planning_kpis.create',
    entityType: 'planning_kpi',
    entityId: (data as any).id as UUID,
    metadata: { planId: input.planId }
  });

  return data as PlanningKpi;
}
