import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import type { Contractor, UUID } from '../models/entities';
import { createActivityLog } from './activityLogService';

export async function listContractors(companyId: UUID, limit = 200): Promise<Contractor[]> {
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
  status?: Contractor['status'];
  createdByUserId: UUID;
}): Promise<Contractor> {
  const { data, error } = await insforge.database
    .from('contractors')
    .insert({
      company_id: input.companyId,
      name: input.name,
      status: input.status ?? 'pending',
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

