import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import type { Contractor, UUID } from '../models/entities';
import { createActivityLog } from './activityLogService';
import { requireSellableFeatureAccess } from './sellableFeaturesService';

export async function listContractors(companyId: UUID, limit = 200): Promise<Contractor[]> {
  await requireSellableFeatureAccess(companyId, 'contractorsVisitors');
  const { data, error } = await insforge.database
    .from('contractors')
    .select('*')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as Contractor[];
}

export async function createContractor(input: {
  companyId: UUID;
  name: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  status?: Contractor['status'];
  documentsStatus?: Contractor['documents_status'];
  inductionStatus?: Contractor['induction_status'];
  portalExpiresAt?: string | null;
  notes?: string | null;
  createdByUserId: UUID;
}): Promise<Contractor> {
  await requireSellableFeatureAccess(input.companyId, 'contractorsVisitors');
  const { data, error } = await insforge.database
    .from('contractors')
    .insert({
      company_id: input.companyId,
      name: input.name,
      status: input.status ?? 'pending',
      contact_email: input.contactEmail ?? null,
      contact_phone: input.contactPhone ?? null,
      documents_status: input.documentsStatus ?? 'pending',
      induction_status: input.inductionStatus ?? 'pending',
      portal_expires_at: input.portalExpiresAt ?? null,
      notes: input.notes ?? null,
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create contractor.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'contractors.create',
    entityType: 'contractor',
    entityId: (data as any).id as UUID
  });

  return data as Contractor;
}

export async function getContractorPortalSummary(companyId: UUID): Promise<{
  total: number;
  pendingDocuments: number;
  completedInductions: number;
}> {
  const rows = await listContractors(companyId, 500);
  return {
    total: rows.length,
    pendingDocuments: rows.filter((row) => row.documents_status !== 'approved').length,
    completedInductions: rows.filter((row) => row.induction_status === 'completed').length
  };
}

