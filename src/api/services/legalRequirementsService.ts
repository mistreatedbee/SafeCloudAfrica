import { insforge } from '../insforge/client';
import type { LegalRequirement, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';

export async function listLegalRequirements(companyId: UUID): Promise<LegalRequirement[]> {
  const { data, error } = await insforge.database
    .from('legal_requirements')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as LegalRequirement[];
}

export async function createLegalRequirement(input: {
  companyId: UUID;
  requirement: string;
  reference?: string;
  status?: LegalRequirement['status'];
  createdByUserId: UUID;
}): Promise<LegalRequirement> {
  const { data, error } = await insforge.database
    .from('legal_requirements')
    .insert({
      company_id: input.companyId,
      requirement: input.requirement,
      reference: input.reference ?? null,
      status: input.status ?? 'in-progress',
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create legal requirement.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'legal_requirements.create',
    entityType: 'legal_requirement',
    entityId: (data as any).id as UUID
  });

  return data as LegalRequirement;
}

export async function updateLegalRequirement(input: {
  companyId: UUID;
  id: UUID;
  requirement?: string;
  reference?: string | null;
  status?: LegalRequirement['status'];
  actorUserId: UUID;
}): Promise<LegalRequirement> {
  const patch: any = {};
  if (typeof input.requirement === 'string') patch.requirement = input.requirement;
  if (typeof input.reference !== 'undefined') patch.reference = input.reference;
  if (typeof input.status !== 'undefined') patch.status = input.status;

  const { data, error } = await insforge.database.from('legal_requirements').update(patch).eq('id', input.id).select('*').single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update legal requirement.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'legal_requirements.update',
    entityType: 'legal_requirement',
    entityId: input.id
  });

  return data as LegalRequirement;
}

