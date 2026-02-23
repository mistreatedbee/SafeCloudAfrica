import { insforge } from '../insforge/client';
import type { OperationalInputsMonthly, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';

export type ListOperationalInputsInput = {
  companyId: UUID;
  siteId?: UUID | null;
  year?: number;
  limit?: number;
};

export async function listOperationalInputsMonthly(input: ListOperationalInputsInput): Promise<OperationalInputsMonthly[]> {
  let q = insforge.database
    .from('operational_inputs_monthly')
    .select('*')
    .eq('company_id', input.companyId);
  if (input.siteId != null) q = q.eq('site_id', input.siteId);
  if (input.year != null) q = q.eq('year', input.year);
  const { data, error } = await q.order('year', { ascending: false }).order('month', { ascending: false }).limit(input.limit ?? 120);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as OperationalInputsMonthly[];
}

export async function getOperationalInputsForMonth(input: {
  companyId: UUID;
  year: number;
  month: number;
  siteId?: UUID | null;
}): Promise<OperationalInputsMonthly | null> {
  let q = insforge.database
    .from('operational_inputs_monthly')
    .select('*')
    .eq('company_id', input.companyId)
    .eq('year', input.year)
    .eq('month', input.month);
  if (input.siteId != null) q = q.eq('site_id', input.siteId);
  else q = q.is('site_id', null);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(getErrorMessage(error));
  return data as OperationalInputsMonthly | null;
}

export type UpsertOperationalInputsInput = {
  companyId: UUID;
  siteId?: UUID | null;
  year: number;
  month: number;
  totalDeliveries?: number | null;
  totalItemsInspected?: number | null;
  productionOutput?: number | null;
  totalEnergyUsed?: number | null;
  recycledWaste?: number | null;
  totalWasteGenerated?: number | null;
  ppeEmployeesObserved?: number | null;
  ppeEmployeesWearing?: number | null;
  createdByUserId?: UUID | null;
  id?: UUID | null;
};

export async function upsertOperationalInputsMonthly(input: UpsertOperationalInputsInput): Promise<OperationalInputsMonthly> {
  const now = new Date().toISOString();
  const payload = {
    company_id: input.companyId,
    site_id: input.siteId ?? null,
    year: input.year,
    month: input.month,
    total_deliveries: input.totalDeliveries ?? null,
    total_items_inspected: input.totalItemsInspected ?? null,
    production_output: input.productionOutput ?? null,
    total_energy_used: input.totalEnergyUsed ?? null,
    recycled_waste: input.recycledWaste ?? null,
    total_waste_generated: input.totalWasteGenerated ?? null,
    ppe_employees_observed: input.ppeEmployeesObserved ?? null,
    ppe_employees_wearing: input.ppeEmployeesWearing ?? null,
    created_by_user_id: input.createdByUserId ?? null,
    updated_at: now
  };

  const existing = await getOperationalInputsForMonth({
    companyId: input.companyId,
    year: input.year,
    month: input.month,
    siteId: input.siteId
  });

  if (existing) {
    const { data, error } = await insforge.database
      .from('operational_inputs_monthly')
      .update(payload)
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to update operational inputs');
    return data as OperationalInputsMonthly;
  }

  const { data, error } = await insforge.database
    .from('operational_inputs_monthly')
    .insert({ ...payload, created_at: now })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create operational inputs');
  return data as OperationalInputsMonthly;
}
