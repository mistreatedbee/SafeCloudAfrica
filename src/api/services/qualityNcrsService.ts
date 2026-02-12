import { insforge } from '../insforge/client';
import type { QualityNcr, UUID } from '../models.entities';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';
import { getMyProfile } from './profilesService';

export async function listQualityNcrs(input: {
  companyId: UUID;
  status?: QualityNcr['status'];
  sourceEntityType?: string;
  fromDate?: string; // YYYY-MM-DD
  toDate?: string; // YYYY-MM-DD
  siteId?: UUID;
  departmentId?: UUID;
  personUserId?: UUID;
  limit?: number;
}): Promise<QualityNcr[]> {
  const base = insforge.database.from('quality_ncrs').select('*').eq('company_id', input.companyId);
  const q1 = input.status ? base.eq('status', input.status) : base;
  const q2 = input.sourceEntityType ? q1.eq('source_entity_type', input.sourceEntityType) : q1;
  const q3 = input.siteId ? q2.eq('site_id', input.siteId) : q2;
  const q4 = input.departmentId ? q3.eq('department_id', input.departmentId) : q3;

  const q5 = input.fromDate ? q4.gte('occurred_at', `${input.fromDate}T00:00:00.000Z`) : q4;
  const q6 = input.toDate ? q5.lte('occurred_at', `${input.toDate}T23:59:59.999Z`) : q5;

  const q7 = input.personUserId
    ? q6.or(
      [
        `created_by_user_id.eq.${input.personUserId}`,
        `auditee_user_id.eq.${input.personUserId}`,
        `auditor_user_id.eq.${input.personUserId}`,
        `department_manager_user_id.eq.${input.personUserId}`
      ].join(',')
    )
    : q6;

  const { data, error } = await q7.order('occurred_at', { ascending: false }).limit(input.limit ?? 200);
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

export async function getQualityNcrById(companyId: UUID, ncrId: UUID): Promise<QualityNcr | null> {
  const { data, error } = await insforge.database
    .from('quality_ncrs')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', ncrId)
    .maybeSingle();
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? null) as QualityNcr | null;
}

export async function createQualityNcr(input: {
  companyId: UUID;
  module?: string;
  nc_number?: string;
  site_id?: UUID | null;
  department_id?: UUID | null;
  date_identified?: string | null;
  ncr_type?: string;
  ncr_category?: string;
  requirement_reference_type?: string;
  requirement_reference_text?: string;
  project_client?: string;
  auditor_user_id?: UUID | null;
  auditee_user_id?: UUID | null;
  department_manager_user_id?: UUID | null;
  title: string;
  description?: string;
  severity: QualityNcr['severity'];
  status?: QualityNcr['status'];
  createdByUserId: UUID;
  location?: string;
  process_involved?: string;
  activity_involved?: string;
  responsible_role?: string;
  linked_requirement?: string;
  risk_classification?: string;
  risk_rating?: string;
  root_cause?: string;
  corrective_action?: string;
  corrective_action_due_date?: string;
  source_entity_type?: string;
  source_entity_id?: UUID;
  metadata?: Record<string, unknown> | null;
}): Promise<QualityNcr> {
  let siteId = input.site_id;
  let departmentId = input.department_id;
  if (typeof siteId === 'undefined' || typeof departmentId === 'undefined') {
    const profile = await getMyProfile(input.companyId, input.createdByUserId);
    if (typeof siteId === 'undefined') siteId = ((profile as any)?.site_id as UUID | null) ?? null;
    if (typeof departmentId === 'undefined') departmentId = ((profile as any)?.department_id as UUID | null) ?? null;
  }

  const { data, error } = await insforge.database
    .from('quality_ncrs')
    .insert({
      company_id: input.companyId,
      module: input.module ?? 'quality',
      nc_number: input.nc_number ?? null,
      site_id: siteId ?? null,
      department_id: departmentId ?? null,
      date_identified: input.date_identified ?? null,
      ncr_type: input.ncr_type ?? null,
      ncr_category: input.ncr_category ?? null,
      requirement_reference_type: input.requirement_reference_type ?? null,
      requirement_reference_text: input.requirement_reference_text ?? null,
      project_client: input.project_client ?? null,
      auditor_user_id: input.auditor_user_id ?? null,
      auditee_user_id: input.auditee_user_id ?? null,
      department_manager_user_id: input.department_manager_user_id ?? null,
      title: input.title,
      description: input.description ?? null,
      location: input.location ?? null,
      process_involved: input.process_involved ?? null,
      activity_involved: input.activity_involved ?? null,
      responsible_role: input.responsible_role ?? null,
      linked_requirement: input.linked_requirement ?? null,
      risk_classification: input.risk_classification ?? null,
      risk_rating: input.risk_rating ?? null,
      root_cause: input.root_cause ?? null,
      corrective_action: input.corrective_action ?? null,
      corrective_action_due_date: input.corrective_action_due_date ?? null,
      source_entity_type: input.source_entity_type ?? null,
      source_entity_id: input.source_entity_id ?? null,
      metadata: input.metadata ?? null,
      severity: input.severity,
      status: input.status ?? 'open',
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create NCR.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'quality_ncrs.create',
    entityType: 'quality_ncr',
    entityId: (data as any).id as UUID
  });

  // Notify key participants (auditee and department manager) if present
  const { notifyNcrCreated } = await import('./notificationsService');
  const created = data as QualityNcr;

  const notifyTargets: UUID[] = [];
  if (created.auditee_user_id) {
    notifyTargets.push(created.auditee_user_id as UUID);
  }
  if (created.department_manager_user_id) {
    notifyTargets.push(created.department_manager_user_id as UUID);
  }

  await Promise.all(
    notifyTargets.map((userId) =>
      notifyNcrCreated(input.companyId, userId, created.title, created.severity)
    )
  );

  return data as QualityNcr;
}

export async function setQualityNcrStatus(input: {
  companyId: UUID;
  ncrId: UUID;
  actorUserId: UUID;
  status: QualityNcr['status'];
}): Promise<QualityNcr> {
  const { data, error } = await insforge.database
    .from('quality_ncrs')
    .update({
      status: input.status,
      updated_at: new Date().toISOString()
    })
    .eq('company_id', input.companyId)
    .eq('id', input.ncrId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update NCR status.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'quality_ncrs.set_status',
    entityType: 'quality_ncr',
    entityId: input.ncrId,
    metadata: { status: input.status }
  });

  return data as QualityNcr;
}

export async function managerApproveQualityNcr(input: {
  companyId: UUID;
  ncrId: UUID;
  actorUserId: UUID;
}): Promise<QualityNcr> {
  const nowIso = new Date().toISOString();
  const { data, error } = await insforge.database
    .from('quality_ncrs')
    .update({
      manager_signoff_user_id: input.actorUserId,
      manager_signoff_at: nowIso,
      status: 'approved',
      updated_at: nowIso
    })
    .eq('company_id', input.companyId)
    .eq('id', input.ncrId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to sign off NCR.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'quality_ncrs.manager_approve',
    entityType: 'quality_ncr',
    entityId: input.ncrId
  });

  return data as QualityNcr;
}

export async function auditorVerifyQualityNcr(input: {
  companyId: UUID;
  ncrId: UUID;
  actorUserId: UUID;
}): Promise<QualityNcr> {
  const nowIso = new Date().toISOString();
  const { data, error } = await insforge.database
    .from('quality_ncrs')
    .update({
      auditor_verify_user_id: input.actorUserId,
      auditor_verify_at: nowIso,
      updated_at: nowIso
    })
    .eq('company_id', input.companyId)
    .eq('id', input.ncrId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to verify NCR.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'quality_ncrs.auditor_verify',
    entityType: 'quality_ncr',
    entityId: input.ncrId
  });

  return data as QualityNcr;
}

export async function closeQualityNcr(ncrId: UUID, companyId: UUID, actorUserId: UUID, closedByUserId: UUID): Promise<QualityNcr> {
  const current = await getQualityNcrById(companyId, ncrId);
  if (!current) throw new Error('NCR not found.');
  if (!current.manager_signoff_user_id) {
    throw new Error('Manager sign-off is required before closing this NCR.');
  }
  if ((current as any).auditor_user_id && !(current as any).auditor_verify_user_id) {
    throw new Error('Auditor verification is required before closing this NCR.');
  }

  const today = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();

  const { data, error } = await insforge.database
    .from('quality_ncrs')
    .update({
      status: 'closed',
      date_closed: today,
      closed_at: nowIso,
      closed_by_user_id: closedByUserId,
      updated_at: nowIso
    })
    .eq('company_id', companyId)
    .eq('id', ncrId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to close NCR.');

  await createActivityLog({
    companyId,
    actorUserId,
    action: 'quality_ncrs.close',
    entityType: 'quality_ncr',
    entityId: ncrId
  });

  return data as QualityNcr;
}

// Helper: create an NCR from an inspection run item (auto-generated NC)
export async function createQualityNcrFromInspectionItem(input: {
  companyId: UUID;
  inspectionId: UUID;
  runId: UUID;
  runItemId: UUID;
  siteId?: UUID | null;
  departmentId?: UUID | null;
  severity: QualityNcr['severity'];
  riskRating?: string | null;
  description: string;
  requirementRef?: string;
  detectedByUserId: UUID;
}): Promise<QualityNcr> {
  return createQualityNcr({
    companyId: input.companyId,
    module: 'quality',
    title: input.description,
    description: input.description,
    severity: input.severity,
    status: 'open',
    createdByUserId: input.detectedByUserId,
    site_id: input.siteId ?? null,
    department_id: input.departmentId ?? null,
    location: null,
    process_involved: null,
    activity_involved: null,
    responsible_role: null,
    linked_requirement: input.requirementRef ?? null,
    risk_classification: input.riskRating ?? null,
    risk_rating: input.riskRating ?? null,
    source_entity_type: 'inspection',
    source_entity_id: input.inspectionId,
    metadata: {
      source: 'inspection_run_item',
      inspection_run_id: input.runId,
      inspection_run_item_id: input.runItemId
    }
  });
}

