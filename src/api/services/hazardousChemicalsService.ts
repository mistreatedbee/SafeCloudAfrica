import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import type { HazardousChemical, UUID } from '../models/entities';
import { createActivityLog } from './activityLogService';
import { requireSellableFeatureAccess } from './sellableFeaturesService';

export async function listHazardousChemicals(companyId: UUID, limit = 200): Promise<HazardousChemical[]> {
  await requireSellableFeatureAccess(companyId, 'hazardousChemicals');
  const { data, error } = await insforge.database
    .from('hazardous_chemicals')
    .select('*')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as HazardousChemical[];
}

export async function createHazardousChemical(input: {
  companyId: UUID;
  chemicalName: string;
  casNumber?: string | null;
  storageLocation?: string | null;
  quantity?: string | null;
  hazardClass?: string | null;
  sdsStatus?: HazardousChemical['sds_status'];
  approvalStatus?: HazardousChemical['approval_status'];
  notes?: string | null;
  createdByUserId: UUID;
}): Promise<HazardousChemical> {
  await requireSellableFeatureAccess(input.companyId, 'hazardousChemicals');
  const { data, error } = await insforge.database
    .from('hazardous_chemicals')
    .insert({
      company_id: input.companyId,
      chemical_name: input.chemicalName,
      cas_number: input.casNumber ?? null,
      storage_location: input.storageLocation ?? null,
      quantity: input.quantity ?? null,
      hazard_class: input.hazardClass ?? null,
      sds_status: input.sdsStatus ?? 'missing',
      approval_status: input.approvalStatus ?? 'pending',
      notes: input.notes ?? null,
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create chemical record.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'hazardous_chemicals.create',
    entityType: 'hazardous_chemical',
    entityId: (data as HazardousChemical).id
  });

  return data as HazardousChemical;
}

export async function getHazardousChemicalSummary(companyId: UUID): Promise<{
  registered: number;
  sdsOnFile: number;
  approved: number;
  complianceGaps: number;
}> {
  const rows = await listHazardousChemicals(companyId, 500);
  return {
    registered: rows.length,
    sdsOnFile: rows.filter((row) => row.sds_status === 'on_file').length,
    approved: rows.filter((row) => row.approval_status === 'approved').length,
    complianceGaps: rows.filter((row) => row.sds_status !== 'on_file' || row.approval_status !== 'approved').length
  };
}
