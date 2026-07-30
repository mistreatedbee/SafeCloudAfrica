import { insforge } from '../insforge/client';
import { withInsforgeSession } from '../insforge/ensureSession';
import type { NcrEvidenceReference, QualityNcr, UUID } from '../models/entities';
import type { CompanyRole } from '../models/core';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';
import { listEvidence } from './evidenceService';
import { getPublicUrl } from './storageService';
import { evaluateNcrTrigger } from './riskAssessmentTriggersService';
import { sendTemplatedNotificationEmail } from './emailService';

async function getNcrProfileEmails(companyId: UUID, userIds: Array<UUID | null | undefined>): Promise<string[]> {
  const ids = [...new Set(userIds.filter(Boolean).map(String))];
  if (ids.length === 0) return [];
  const { data } = await insforge.database
    .from('user_profiles')
    .select('user_id, email')
    .eq('company_id', companyId)
    .in('user_id', ids);
  return [...new Set((data ?? []).map((row: any) => String(row.email ?? '').trim()).filter(Boolean))];
}

// Auto-generate NCR number
function generateNCRNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const seed = String(Date.now()).slice(-6);
  const random = Math.floor(Math.random() * 100).toString().padStart(2, '0');
  return `NCR-${year}${month}-${seed}${random}`;
}

export async function listQualityNcrs(input: {
  companyId: UUID;
  limit?: number;
  status?: string;
  sourceEntityType?: string;
  sourceEntityId?: UUID;
  dateFrom?: string;
  dateTo?: string;
  assignedUserId?: UUID;
  departmentId?: UUID;
  riskRating?: 'low' | 'medium' | 'high' | 'critical';
  actorUserId?: UUID;
  actorRole?: CompanyRole | null;
}): Promise<QualityNcr[]> {
  return withInsforgeSession('quality-ncrs:list', async () => {
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
  if (input.dateFrom) {
    query = query.gte('occurrence_date', `${input.dateFrom}T00:00:00.000Z`);
  }
  if (input.dateTo) {
    query = query.lte('occurrence_date', `${input.dateTo}T23:59:59.999Z`);
  }
  if (input.assignedUserId) {
    query = query.or(
      [
        `auditor_user_id.eq.${input.assignedUserId}`,
        `auditee_user_id.eq.${input.assignedUserId}`,
        `corrective_action_owner_user_id.eq.${input.assignedUserId}`,
        `raised_by_user_id.eq.${input.assignedUserId}`,
        `created_by_user_id.eq.${input.assignedUserId}`
      ].join(',')
    );
  }
  if (input.departmentId) {
    query = query.eq('department_id', input.departmentId);
  }
  const { data, error } = await query
    .order('occurrence_date', { ascending: false })
    .limit(input.limit ?? 1000);
  if (error) throw new Error(getErrorMessage(error));
  let rows = (data ?? []) as QualityNcr[];
  if (input.riskRating) {
    rows = rows.filter((row) => {
      const r = row as QualityNcr & { risk_classification?: string };
      const rating = String(r.risk_rating ?? r.risk_classification ?? '').toLowerCase();
      return rating === input.riskRating;
    });
  }
  return await applyNcrRoleFilter(rows, input.companyId, input.actorUserId, input.actorRole);
  }); // end withInsforgeSession
}

export async function countOpenQualityNcrs(companyId: UUID): Promise<number> {
  const { count, error } = await insforge.database
    .from('quality_ncrs')
    .select('*', { count: 'planned', head: true })
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
  module?: string;
  title: string;
  description?: string;
  location?: string;
  department_id?: UUID | null;
  process_involved?: string;
  activity_involved?: string;
  responsible_role?: string;
  linked_requirement_type?: 'STANDARD' | 'POLICY' | 'PROCEDURE';
  linked_requirement?: string;
  risk_classification?: string;
  risk_rating?: 'low' | 'medium' | 'high' | 'critical' | string;
  ncr_type?: string;
  ncr_category?: string;
  requirement_reference_type?: string;
  requirement_reference_text?: string;
  root_cause?: string;
  root_cause_categories?: Record<string, unknown>[] | null;
  corrective_action?: string;
  corrective_action_due_date?: string;
  corrective_action_owner_user_id?: UUID;
  auditor_user_id?: UUID | null;
  auditee_user_id?: UUID | null;
  metadata?: Record<string, unknown> | null;
  severity: QualityNcr['severity'];
  createdByUserId: UUID;
  source_entity_type?: string;
  source_entity_id?: UUID;
}): Promise<QualityNcr> {
  return withInsforgeSession('quality-ncrs:create', async () => {
  const nc_number = generateNCRNumber();
  const sourceType = normalizeNcrSourceType(input.source_entity_type);
  const nowIso = new Date().toISOString();
  const insertPayload: Record<string, unknown> = {
    company_id: input.companyId,
    module: input.module ?? 'quality',
    nc_number,
    title: input.title,
    description: input.description ?? null,
    occurrence_date: nowIso,
    date_identified: nowIso,
    location: input.location ?? null,
    department_id: input.department_id ?? null,
    process_involved: input.process_involved ?? null,
    activity_involved: input.activity_involved ?? null,
    responsible_role: input.responsible_role ?? null,
    linked_requirement_type: input.linked_requirement_type ?? null,
    linked_requirement: input.linked_requirement ?? null,
    risk_classification: input.risk_classification ?? null,
    risk_rating: input.risk_rating ?? null,
    ncr_type: input.ncr_type ?? null,
    ncr_category: input.ncr_category ?? null,
    requirement_reference_type: input.requirement_reference_type ?? null,
    requirement_reference_text: input.requirement_reference_text ?? null,
    root_cause: input.root_cause ?? null,
    root_cause_categories: input.root_cause_categories ?? null,
    corrective_action: input.corrective_action ?? null,
    corrective_action_due_date: input.corrective_action_due_date ?? null,
    corrective_action_owner_user_id: input.corrective_action_owner_user_id ?? null,
    severity: input.severity,
    status: 'open',
    raised_by_user_id: input.createdByUserId,
    created_by_user_id: input.createdByUserId,
    auditor_user_id: input.auditor_user_id ?? null,
    auditee_user_id: input.auditee_user_id ?? null,
    source_entity_type: sourceType,
    source_entity_id: input.source_entity_id ?? null,
    source_type: sourceType,
    source_reference_id: input.source_entity_id ?? null,
    metadata: input.metadata ?? null
  };

  type InsertResult = { data: unknown; error: { message?: string; code?: string } | null };
  let result: InsertResult = await insforge.database.from('quality_ncrs').insert(insertPayload).select('*').single() as InsertResult;
  if (result.error && String(result.error.message ?? '').toLowerCase().includes('column')) {
    const fallback = { ...insertPayload };
    delete fallback.source_type;
    delete fallback.source_reference_id;
    delete fallback.date_identified;
    delete fallback.ncr_type;
    delete fallback.ncr_category;
    delete fallback.requirement_reference_type;
    delete fallback.requirement_reference_text;
    delete fallback.root_cause_categories;
    delete fallback.risk_rating;
    result = await insforge.database.from('quality_ncrs').insert(fallback).select('*').single() as InsertResult;
  }
  if (result.error) throw new Error(getErrorMessage(result.error));
  if (!result.data) throw new Error('Failed to create NCR.');

  const ncr = result.data as QualityNcr;

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'quality_ncrs.create',
    entityType: 'quality_ncr',
    entityId: ncr.id,
    metadata: { nc_number, sourceType, sourceEntityId: input.source_entity_id ?? null }
  });

  try {
    await evaluateNcrTrigger(input.companyId, {
      id: ncr.id,
      company_id: input.companyId,
      process_involved: ncr.process_involved ?? null,
      activity_involved: ncr.activity_involved ?? null,
      department_id: ncr.department_id ?? null,
      location: ncr.location ?? null,
      nc_number: ncr.nc_number ?? null
    });
  } catch {
    // Best-effort risk review trigger.
  }

  if (sourceType === 'incident' && input.source_entity_id) {
    const { syncIncidentClosureFromLinks } = await import('./incidentsService');
    await syncIncidentClosureFromLinks(input.source_entity_id).catch((syncError) => {
      void syncError;
    });
  }

  try {
    const recipients = await getNcrProfileEmails(input.companyId, [
      input.corrective_action_owner_user_id,
      input.auditor_user_id,
      input.auditee_user_id
    ]);
    if (recipients.length > 0) {
      await sendTemplatedNotificationEmail({
        to: recipients,
        templateKey: 'quality_ncr',
        variables: {
          reference: nc_number,
          title: input.title,
          severity: input.severity,
          status: 'Open',
          dueDate: input.corrective_action_due_date
        },
        actionUrl: '/dashboard/quality/ncrs',
        meta: { companyId: input.companyId, ncrId: ncr.id }
      });
    }
  } catch (err) {
    console.warn('[quality-ncrs] create notification failed', err);
  }

  return ncr;
  }); // end withInsforgeSession
}

export async function updateQualityNcr(
  ncrId: UUID,
  companyId: UUID,
  updates: Partial<QualityNcr>,
  actorUserId: UUID
): Promise<QualityNcr | null> {
  return withInsforgeSession('quality-ncrs:update', async () => {
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
  }); // end withInsforgeSession
}

export async function deleteQualityNcr(
  ncrId: UUID,
  companyId: UUID,
  actorUserId: UUID
): Promise<void> {
  return withInsforgeSession('quality-ncrs:delete', async () => {
  const existing = await getQualityNcr(ncrId, companyId);
  if (!existing) throw new Error('NCR not found.');

  const { error } = await insforge.database
    .from('quality_ncrs')
    .delete()
    .eq('id', ncrId)
    .eq('company_id', companyId);

  if (error) throw new Error(getErrorMessage(error));

  await createActivityLog({
    companyId,
    actorUserId,
    action: 'quality_ncrs.delete',
    entityType: 'quality_ncr',
    entityId: ncrId,
    metadata: {
      nc_number: existing.nc_number,
      status: existing.status,
      sourceEntityType: existing.source_entity_type ?? null,
      sourceEntityId: existing.source_entity_id ?? null
    }
  });
  }); // end withInsforgeSession
}

export async function closeQualityNcr(
  ncrId: UUID,
  companyId: UUID,
  signedByUserId: UUID,
  actorUserId: UUID
): Promise<QualityNcr | null> {
  const current = await getQualityNcr(ncrId, companyId);
  if (!current) throw new Error('NCR not found.');

  const { evidenceAfter } = await listNcrEvidence(companyId, ncrId);
  if (evidenceAfter.length < 1) {
    throw new Error('Evidence of Closure is required before closing this NCR.');
  }
  if (!current.manager_signoff_user_id || !current.manager_signoff_at) {
    throw new Error('Department manager sign-off is required before closing this NCR.');
  }
  if (!current.auditor_verify_user_id || !current.auditor_verify_at) {
    throw new Error('Auditor verification is required before closing this NCR.');
  }

  const closedAt = new Date().toISOString();
  const updated = await updateQualityNcr(
    ncrId,
    companyId,
    {
      status: 'closed',
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

  await syncLinkedEntitiesOnNcrClosed(companyId, ncrId, current);

  return updated;
}

type EvidenceRow = {
  id: UUID;
  storage_bucket: string;
  storage_key: string;
  display_title?: string | null;
  title?: string | null;
  original_filename?: string | null;
  created_at: string;
  created_by_user_id: UUID;
  file_kind?: string | null;
};

function mapEvidenceRef(row: EvidenceRow): NcrEvidenceReference {
  return {
    fileId: row.id,
    url: getPublicUrl(row.storage_bucket as Parameters<typeof getPublicUrl>[0], row.storage_key),
    name: String(row.display_title ?? row.title ?? row.original_filename ?? row.storage_key.split('/').pop() ?? 'file'),
    uploadedAt: row.created_at,
    uploadedBy: row.created_by_user_id,
    storageBucket: row.storage_bucket,
    storageKey: row.storage_key
  };
}

function isFileKind(row: EvidenceRow, kind: 'BEFORE' | 'AFTER'): boolean {
  return String(row.file_kind ?? '').toUpperCase() === kind;
}

export async function listNcrEvidence(companyId: UUID, ncrId: UUID): Promise<{
  evidenceBefore: NcrEvidenceReference[];
  evidenceAfter: NcrEvidenceReference[];
}> {
  const evidence = await listEvidence(companyId, { entityType: 'ncr', entityId: ncrId, limit: 500 });
  const evidenceRows = evidence as unknown as EvidenceRow[];
  const evidenceBefore = evidenceRows.filter((row) => isFileKind(row, 'BEFORE')).map(mapEvidenceRef);
  const evidenceAfter = evidenceRows.filter((row) => isFileKind(row, 'AFTER')).map(mapEvidenceRef);
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
    source_entity_type: input.sourceEntityType ?? 'inspection',
    source_entity_id: input.sourceEntityId
  });
}

export async function managerSignOffQualityNcr(input: {
  companyId: UUID;
  ncrId: UUID;
  managerUserId: UUID;
  comment?: string | null;
  signatureMethod?: string | null;
}): Promise<QualityNcr> {
  const nowIso = new Date().toISOString();
  try {
    const updated = await updateQualityNcr(
      input.ncrId,
      input.companyId,
      {
        status: 'under-review',
        manager_signoff_user_id: input.managerUserId,
        manager_signoff_at: nowIso,
        manager_signoff_comment: input.comment ?? null,
        manager_signature_method: input.signatureMethod ?? 'digital'
      } as Partial<QualityNcr>,
      input.managerUserId
    );
    if (!updated) throw new Error('Failed to sign off NCR.');
    return updated;
  } catch (signError: unknown) {
    if (!String((signError instanceof Error ? signError.message : '') ?? '').toLowerCase().includes('status')) throw signError;
    const fallback = await updateQualityNcr(
      input.ncrId,
      input.companyId,
      {
        status: 'in-progress',
        manager_signoff_user_id: input.managerUserId,
        manager_signoff_at: nowIso,
        manager_signoff_comment: input.comment ?? null,
        manager_signature_method: input.signatureMethod ?? 'digital'
      } as Partial<QualityNcr>,
      input.managerUserId
    );
    if (!fallback) throw new Error('Failed to sign off NCR.');
    try {
      const ncrRow = await getQualityNcr(input.ncrId, input.companyId);
      const emails = await getNcrProfileEmails(input.companyId, [ncrRow?.raised_by_user_id]);
      if (emails.length > 0 && ncrRow) {
        await sendTemplatedNotificationEmail({
          to: emails,
          templateKey: 'quality_ncr',
          variables: { reference: ncrRow.nc_number ?? input.ncrId, title: ncrRow.title, status: 'Manager Signed Off', severity: ncrRow.severity },
          actionUrl: '/dashboard/quality/ncrs',
          meta: { companyId: input.companyId, ncrId: input.ncrId }
        });
      }
    } catch (err) {
      console.warn('[quality-ncrs] manager-signoff notification failed', err);
    }
    return fallback;
  }
}

export async function auditorVerifyQualityNcr(input: {
  companyId: UUID;
  ncrId: UUID;
  auditorUserId: UUID;
  effective?: boolean;
  comment?: string | null;
}): Promise<QualityNcr> {
  const nowIso = new Date().toISOString();
  try {
    const updated = await updateQualityNcr(
      input.ncrId,
      input.companyId,
      {
        status: 'approved',
        auditor_verify_user_id: input.auditorUserId,
        auditor_verify_at: nowIso,
        effectiveness_verified: input.effective ?? true,
        auditor_comment: input.comment ?? null,
        effectiveness_check_date: nowIso
      } as Partial<QualityNcr>,
      input.auditorUserId
    );
    if (!updated) throw new Error('Failed to verify NCR.');
    return updated;
  } catch (verifyError: unknown) {
    if (!String((verifyError instanceof Error ? verifyError.message : '') ?? '').toLowerCase().includes('status')) throw verifyError;
    const fallback = await updateQualityNcr(
      input.ncrId,
      input.companyId,
      {
        status: 'in-progress',
        auditor_verify_user_id: input.auditorUserId,
        auditor_verify_at: nowIso,
        effectiveness_verified: input.effective ?? true,
        auditor_comment: input.comment ?? null,
        effectiveness_check_date: nowIso
      } as Partial<QualityNcr>,
      input.auditorUserId
    );
    if (!fallback) throw new Error('Failed to verify NCR.');
    return fallback;
  }
}

function normalizeNcrSourceType(source: string | null | undefined): string | null {
  if (!source) return null;
  const s = source.trim().toLowerCase();
  if (s === 'inspection_item' || s === 'inspection') return 'inspection';
  if (s === 'customer_complaint' || s === 'complaint') return 'complaint';
  if (s === 'risk_assessment' || s === 'risk') return 'risk';
  if (s === 'audit_finding' || s === 'program_audit_finding' || s === 'audit') return s;
  if (s === 'incident' || s === 'pjo') return s;
  return s;
}

type MembershipScope = {
  role: CompanyRole | null;
  site_id: UUID | null;
  department_id: UUID | null;
};

async function getMembershipScope(companyId: UUID, userId?: UUID | null): Promise<MembershipScope> {
  if (!userId) return { role: null, site_id: null, department_id: null };
  const { data, error } = await insforge.database
    .from('company_memberships')
    .select('role, site_id, department_id, created_at')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .eq('status', 'ACTIVE')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) return { role: null, site_id: null, department_id: null };
  const row = data as Record<string, unknown>;
  return {
    role: (row.role as CompanyRole) ?? null,
    site_id: (row.site_id as UUID | null) ?? null,
    department_id: (row.department_id as UUID | null) ?? null
  };
}

async function applyNcrRoleFilter(
  rows: QualityNcr[],
  companyId: UUID,
  actorUserId?: UUID,
  actorRole?: CompanyRole | null
): Promise<QualityNcr[]> {
  if (!actorUserId || !actorRole) return rows;
  if (actorRole === 'owner' || actorRole === 'admin') return rows;

  const membership = await getMembershipScope(companyId, actorUserId);
  const inScope = (ncr: QualityNcr): boolean => {
    const ncrRow = ncr as QualityNcr & { site_id?: UUID | null };
    const siteMatches = Boolean(membership.site_id) && !!ncrRow.site_id && membership.site_id === ncrRow.site_id;
    const deptMatches = Boolean(membership.department_id) && !!ncr.department_id && membership.department_id === ncr.department_id;
    return siteMatches || deptMatches;
  };
  const assigned = (ncr: QualityNcr): boolean =>
    ncr.auditor_user_id === actorUserId ||
    ncr.auditee_user_id === actorUserId ||
    ncr.corrective_action_owner_user_id === actorUserId ||
    ncr.created_by_user_id === actorUserId;

  if (actorRole === 'manager' || actorRole === 'supervisor') {
    if (!membership.site_id && !membership.department_id) return rows;
    return rows.filter((ncr) => inScope(ncr) || assigned(ncr));
  }
  if (actorRole === 'consultant' || actorRole === 'auditor') {
    return rows.filter((ncr) => assigned(ncr));
  }
  if (actorRole === 'employee') {
    return rows.filter((ncr) => assigned(ncr));
  }
  return [];
}

async function syncLinkedEntitiesOnNcrClosed(
  companyId: UUID,
  ncrId: UUID,
  ncr: QualityNcr
): Promise<void> {
  const nowIso = new Date().toISOString();

  await insforge.database
    .from('tasks')
    .update({
      status: 'closed',
      closure_date: nowIso,
      actual_completion_at: nowIso,
      final_status: 'closed',
      updated_at: nowIso
    })
    .eq('company_id', companyId)
    .in('source_entity_type', ['ncr', 'quality_ncr'])
    .eq('source_entity_id', ncrId);

  const sourceType = normalizeNcrSourceType(ncr.source_entity_type);
  const sourceId = ncr.source_entity_id;
  if (!sourceType || !sourceId) return;

  if (sourceType === 'pjo') {
    await insforge.database
      .from('pjo_responses')
      .update({
        closed: true,
        closed_at: nowIso,
        closed_by_user_id: ncr.closed_by_user_id ?? null,
        updated_at: nowIso
      })
      .eq('company_id', companyId)
      .eq('pjo_id', sourceId)
      .eq('ncr_id', ncrId);
    await insforge.database
      .from('pjo_observations')
      .update({
        status: 'closed',
        closed_at: nowIso,
        closed_by_user_id: ncr.closed_by_user_id ?? null,
        updated_at: nowIso
      })
      .eq('company_id', companyId)
      .eq('id', sourceId)
      .eq('status', 'open');
  }

  if (sourceType === 'audit_finding' || sourceType === 'program_audit_finding') {
    await insforge.database
      .from('program_audit_findings')
      .update({
        status: 'closed',
        closed_at: nowIso,
        auditor_verify_user_id: ncr.auditor_verify_user_id ?? null,
        auditor_verify_at: ncr.auditor_verify_at ?? nowIso,
        updated_at: nowIso
      })
      .eq('company_id', companyId)
      .eq('id', sourceId);
  }

  if (sourceType === 'incident') {
    const { syncIncidentClosureFromLinks } = await import('./incidentsService');
    await syncIncidentClosureFromLinks(sourceId).catch((syncError) => {
      void syncError;
    });
  }

  if (sourceType === 'complaint') {
    await insforge.database
      .from('quality_customer_complaints')
      .update({
        status: 'CLOSED',
        closed_at: nowIso,
        closed_by_user_id: ncr.closed_by_user_id ?? null,
        updated_at: nowIso
      })
      .eq('company_id', companyId)
      .eq('id', sourceId);
  }
}
