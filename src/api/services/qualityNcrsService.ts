import { insforge } from '../insforge/client';
import type { QualityNcr, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';

// Auto-generate NCR number
function generateNCRNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `NCR-${year}${month}-${random}`;
}

export async function listQualityNcrs(input: { companyId: UUID; limit?: number; status?: string }): Promise<QualityNcr[]> {
  let query = insforge.database
    .from('quality_ncrs')
    .select('*')
    .eq('company_id', input.companyId);

  if (input.status) {
    query = query.eq('status', input.status);
  }

  const { data, error } = await query
    .order('occurrence_date', { ascending: false })
    .limit(input.limit ?? 200);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as QualityNcr[];
}

export async function countOpenQualityNcrs(companyId: UUID): Promise<number> {
  const { count, error } = await insforge.database
    .from('quality_ncrs')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .neq('status', 'closed');
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
}

export async function getQualityNcr(ncrId: UUID): Promise<QualityNcr | null> {
  const { data, error } = await insforge.database
    .from('quality_ncrs')
    .select('*')
    .eq('id', ncrId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(getErrorMessage(error));
  }
  return (data as QualityNcr) || null;
}

export async function createQualityNcr(input: {
  companyId: UUID;
  title: string;
  description?: string;
  location?: string;
  process_involved?: string;
  activity_involved?: string;
  responsible_role?: string;
  linked_requirement?: string;
  risk_classification?: string;
  root_cause?: string;
  corrective_action?: string;
  corrective_action_due_date?: string;
  severity: QualityNcr['severity'];
  createdByUserId: UUID;
  source_entity_type?: string;
  source_entity_id?: UUID;
}): Promise<QualityNcr> {
  const nc_number = generateNCRNumber();

  const { data, error } = await insforge.database
    .from('quality_ncrs')
    .insert({
      company_id: input.companyId,
      nc_number,
      title: input.title,
      description: input.description ?? null,
      occurrence_date: new Date().toISOString(),
      location: input.location ?? null,
      process_involved: input.process_involved ?? null,
      activity_involved: input.activity_involved ?? null,
      responsible_role: input.responsible_role ?? null,
      linked_requirement: input.linked_requirement ?? null,
      risk_classification: input.risk_classification ?? null,
      root_cause: input.root_cause ?? null,
      corrective_action: input.corrective_action ?? null,
      corrective_action_due_date: input.corrective_action_due_date ?? null,
      severity: input.severity,
      status: 'open',
      raised_by_user_id: input.createdByUserId,
      created_by_user_id: input.createdByUserId,
      source_entity_type: input.source_entity_type ?? null,
      source_entity_id: input.source_entity_id ?? null
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create NCR.');

  const ncr = data as QualityNcr;

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'quality_ncrs.create',
    entityType: 'quality_ncr',
    entityId: ncr.id,
    metadata: { nc_number }
  });

  return ncr;
}

export async function updateQualityNcr(
  ncrId: UUID,
  companyId: UUID,
  updates: Partial<QualityNcr>,
  actorUserId: UUID
): Promise<QualityNcr | null> {
  const { data, error } = await insforge.database
    .from('quality_ncrs')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', ncrId)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update NCR.');

  const ncr = data as QualityNcr;

  await createActivityLog({
    companyId,
    actorUserId,
    action: 'quality_ncrs.update',
    entityType: 'quality_ncr',
    entityId: ncrId,
    metadata: { status: ncr.status }
  });

  return ncr;
}

export async function closeQualityNcr(
  ncrId: UUID,
  companyId: UUID,
  signedByUserId: UUID,
  actorUserId: UUID
): Promise<QualityNcr | null> {
  return updateQualityNcr(
    ncrId,
    companyId,
    {
      status: 'closed',
      signed_by_user_id: signedByUserId,
      signed_at: new Date().toISOString()
    },
    actorUserId
  );
}

export async function createQualityNcrFromInspectionItem(input: {
  companyId: UUID;
  title: string;
  description?: string;
  location?: string;
  severity: QualityNcr['severity'];
  createdByUserId: UUID;
  sourceEntityId?: UUID;
}): Promise<QualityNcr> {
  return await createQualityNcr({
    companyId: input.companyId,
    title: input.title,
    description: input.description,
    location: input.location,
    severity: input.severity,
    createdByUserId: input.createdByUserId,
    source_entity_type: 'inspection_item',
    source_entity_id: input.sourceEntityId
  });
}

