import { insforge } from '../insforge/client';
import type { NcrEvidenceReference, QualityNcr, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';
import { listEvidence } from './evidenceService';
import { getPublicUrl } from './storageService';

// Auto-generate NCR number
function generateNCRNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `NCR-${year}${month}-${random}`;
}

export async function listQualityNcrs(input: {
  companyId: UUID;
  limit?: number;
  status?: string;
  sourceEntityType?: string;
  sourceEntityId?: UUID;
}): Promise<QualityNcr[]> {
  let query = insforge.database
    .from('quality_ncrs')
    .select('*')
    .eq('company_id', input.companyId);

  if (input.status) {
    query = query.eq('status', input.status);
  }
  if (input.sourceEntityType) {
    query = query.eq('source_entity_type', input.sourceEntityType);
  }
  if (input.sourceEntityId) {
    query = query.eq('source_entity_id', input.sourceEntityId);
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

export async function getQualityNcr(ncrId: UUID, companyId?: UUID): Promise<QualityNcr | null> {
  const query = insforge.database
    .from('quality_ncrs')
    .select('*')
    .eq('id', ncrId);

  if (companyId) query.eq('company_id', companyId);

  const { data, error } = await query.single();

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
  linked_requirement_type?: 'STANDARD' | 'POLICY' | 'PROCEDURE';
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
      linked_requirement_type: input.linked_requirement_type ?? null,
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
    .eq('company_id', companyId)
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
  const { evidenceAfter } = await listNcrEvidence(companyId, ncrId);
  if (evidenceAfter.length < 1) {
    throw new Error('Evidence of Closure is required before closing this NCR.');
  }

  const closedAt = new Date().toISOString();
  const updated = await updateQualityNcr(
    ncrId,
    companyId,
    {
      status: 'closed',
      signed_by_user_id: signedByUserId,
      signed_at: closedAt,
      closed_by_user_id: actorUserId,
      closed_at: closedAt,
      date_closed: closedAt
    },
    actorUserId
  );

  await createActivityLog({
    companyId,
    actorUserId,
    action: 'quality_ncrs.closed_with_closure_evidence',
    entityType: 'quality_ncr',
    entityId: ncrId,
    metadata: { evidenceAfterCount: evidenceAfter.length }
  });

  return updated;
}

function mapEvidenceRef(row: any): NcrEvidenceReference {
  return {
    fileId: row.id as UUID,
    url: getPublicUrl(row.storage_bucket as any, row.storage_key),
    name: String(row.display_title ?? row.title ?? row.original_filename ?? row.storage_key.split('/').pop() ?? 'file'),
    uploadedAt: row.created_at as string,
    uploadedBy: row.created_by_user_id as UUID,
    storageBucket: row.storage_bucket as string,
    storageKey: row.storage_key as string
  };
}

function isFileKind(row: any, kind: 'BEFORE' | 'AFTER'): boolean {
  return String(row.file_kind ?? '').toUpperCase() === kind;
}

export async function listNcrEvidence(companyId: UUID, ncrId: UUID): Promise<{
  evidenceBefore: NcrEvidenceReference[];
  evidenceAfter: NcrEvidenceReference[];
}> {
  const evidence = await listEvidence(companyId, { entityType: 'ncr', entityId: ncrId, limit: 500 });
  const evidenceBefore = evidence.filter((row) => isFileKind(row, 'BEFORE')).map(mapEvidenceRef);
  const evidenceAfter = evidence.filter((row) => isFileKind(row, 'AFTER')).map(mapEvidenceRef);
  return { evidenceBefore, evidenceAfter };
}

export async function syncNcrEvidenceFromAttachments(companyId: UUID, ncrId: UUID): Promise<QualityNcr> {
  const { evidenceBefore, evidenceAfter } = await listNcrEvidence(companyId, ncrId);
  const { data, error } = await insforge.database
    .from('quality_ncrs')
    .update({
      evidence_before: evidenceBefore,
      evidence_after: evidenceAfter,
      updated_at: new Date().toISOString()
    })
    .eq('id', ncrId)
    .eq('company_id', companyId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to sync NCR evidence.');
  return data as QualityNcr;
}

export async function createQualityNcrFromInspectionItem(input: {
  companyId: UUID;
  title: string;
  description?: string;
  location?: string;
  severity: QualityNcr['severity'];
  createdByUserId: UUID;
  sourceEntityType?: string;
  sourceEntityId?: UUID;
}): Promise<QualityNcr> {
  return await createQualityNcr({
    companyId: input.companyId,
    title: input.title,
    description: input.description,
    location: input.location,
    severity: input.severity,
    createdByUserId: input.createdByUserId,
    source_entity_type: input.sourceEntityType ?? 'inspection_item',
    source_entity_id: input.sourceEntityId
  });
}
