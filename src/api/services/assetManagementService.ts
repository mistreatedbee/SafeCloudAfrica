import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import type { Asset, UUID } from '../models/entities';
import { createActivityLog } from './activityLogService';
import { requireSellableFeatureAccess } from './sellableFeaturesService';

export async function listAssets(companyId: UUID, limit = 200): Promise<Asset[]> {
  await requireSellableFeatureAccess(companyId, 'assetManagement');
  const { data, error } = await insforge.database
    .from('assets')
    .select('*')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as Asset[];
}

export async function createAsset(input: {
  companyId: UUID;
  name: string;
  assetTag?: string | null;
  category?: string | null;
  status?: Asset['status'];
  location?: string | null;
  assignedUserId?: UUID | null;
  maintenanceDueDate?: string | null;
  inspectionDueDate?: string | null;
  notes?: string | null;
  createdByUserId: UUID;
}): Promise<Asset> {
  await requireSellableFeatureAccess(input.companyId, 'assetManagement');
  const { data, error } = await insforge.database
    .from('assets')
    .insert({
      company_id: input.companyId,
      name: input.name,
      asset_tag: input.assetTag ?? null,
      category: input.category ?? null,
      status: input.status ?? 'active',
      location: input.location ?? null,
      assigned_user_id: input.assignedUserId ?? null,
      maintenance_due_date: input.maintenanceDueDate ?? null,
      inspection_due_date: input.inspectionDueDate ?? null,
      notes: input.notes ?? null,
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create asset.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'assets.create',
    entityType: 'asset',
    entityId: (data as Asset).id
  });

  return data as Asset;
}

function isDueOnOrBeforeToday(value: string | null | undefined, today: string): boolean {
  if (!value) return false;
  return value <= today;
}

export async function getAssetManagementSummary(companyId: UUID): Promise<{
  total: number;
  maintenanceDue: number;
  inspectionsDue: number;
  assigned: number;
}> {
  const rows = await listAssets(companyId, 500);
  const today = new Date().toISOString().slice(0, 10);
  return {
    total: rows.length,
    maintenanceDue: rows.filter((row) => isDueOnOrBeforeToday(row.maintenance_due_date, today)).length,
    inspectionsDue: rows.filter((row) => isDueOnOrBeforeToday(row.inspection_due_date, today)).length,
    assigned: rows.filter((row) => Boolean(row.assigned_user_id)).length
  };
}
