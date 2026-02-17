import { insforge } from '../insforge/client';
import type { QualityNcr, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';
import { getMyProfile } from './profilesService';
import { createNotification } from './notificationsService';

// Generate a unique, human-friendly NCR number per company and year.
// Format: NCR-YYYY-000001
async function generateNextNcNumber(companyId: UUID): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `NCR-${year}-`;

  const { data, error } = await insforge.database
    .from('quality_ncrs')
    .select('nc_number')
    .eq('company_id', companyId)
    .like('nc_number', `${prefix}%`)
    .order('nc_number', { ascending: false })
    .limit(1);

  if (error) throw new Error(getErrorMessage(error));

  let nextSeq = 1;
  const last = data?.[0]?.nc_number as string | undefined;
  if (last && last.startsWith(prefix)) {
    const suffix = last.slice(prefix.length);
    const parsed = parseInt(suffix, 10);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      nextSeq = parsed + 1;
    }
  }

  const padded = String(nextSeq).padStart(6, '0');
  return `${prefix}${padded}`;
}

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

  // Filter by identification / occurrence date; prefer explicit date_identified when present
  const q5 = input.fromDate ? q4.gte('date_identified', input.fromDate) : q4;
  const q6 = input.toDate ? q5.lte('date_identified', input.toDate) : q5;

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

  const { data, error } = await q7.order('occurrence_date', { ascending: false }).limit(input.limit ?? 200);
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
  // nc_number is intentionally ignored by the API – numbers are auto-generated.
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

  // Default date_identified to today if not explicitly provided
  const dateIdentified =
    input.date_identified && String(input.date_identified).length > 0
      ? input.date_identified
      : new Date().toISOString().slice(0, 10);

  // Always auto-generate NCR number if not already set on the record
  const ncNumber = await generateNextNcNumber(input.companyId);

  const { data, error } = await insforge.database
    .from('quality_ncrs')
    .insert({
      company_id: input.companyId,
      module: input.module ?? 'quality',
      nc_number: ncNumber,
      site_id: siteId ?? null,
      department_id: departmentId ?? null,
      date_identified: dateIdentified,
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

  const created = data as QualityNcr;
  const { createTaskFromNcr } = await import('./tasksService');
  await createTaskFromNcr({
    id: created.id,
    company_id: created.company_id,
    title: created.title,
    description: created.description ?? null,
    severity: created.severity ?? null,
    risk_rating: (created as any).risk_rating ?? null,
    site_id: created.site_id ?? null,
    department_id: created.department_id ?? null,
    corrective_action_due_date: (created as any).corrective_action_due_date ?? null,
    corrective_action_owner_user_id: (created as any).corrective_action_owner_user_id ?? null,
    created_by_user_id: created.created_by_user_id
  }).catch(() => {});

  // Notify key participants (auditee and department manager) if present
  const { notifyNcrCreated } = await import('./notificationsService');
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

  const { evaluateNcrTrigger } = await import('./riskAssessmentTriggersService');
  await evaluateNcrTrigger(input.companyId, {
    id: created.id,
    company_id: created.company_id,
    process_involved: created.process_involved ?? null,
    activity_involved: created.activity_involved ?? null,
    department_id: created.department_id ?? null,
    location: created.location ?? null,
    nc_number: created.nc_number ?? null
  }).catch(() => {});

  // Immediate escalation for high/critical risk NCRs
  const isHighRisk =
    String(created.severity).toLowerCase() === 'critical' ||
    String(created.severity).toLowerCase() === 'high' ||
    String((created as any).risk_rating ?? '').toLowerCase() === 'high' ||
    String((created as any).risk_rating ?? '').toLowerCase() === 'critical';

  if (isHighRisk) {
    try {
      const { buildEscalationChain } = await import('../../../scripts/insforge-functions/escalationUtils');
      const chain = await buildEscalationChain(insforge, input.companyId, created.department_manager_user_id || created.auditee_user_id || created.created_by_user_id);
      const recipients = [...(chain.primary || []), ...(chain.managers || []), ...(chain.admins || [])];

      await Promise.all(
        recipients.map((userId: any) =>
          createNotification(
            input.companyId,
            userId as UUID,
            'high',
            'High risk NCR created',
            `NCR "${created.title}" has been created with high/critical risk and requires immediate attention.`
          )
        )
      );
    } catch {
      // Best-effort; do not block NCR creation on escalation
    }
  }

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
  signatureMethod?: string;
  comment?: string | null;
}): Promise<QualityNcr> {
  const nowIso = new Date().toISOString();
  const { data, error } = await insforge.database
    .from('quality_ncrs')
    .update({
      manager_signoff_user_id: input.actorUserId,
      manager_signoff_at: nowIso,
      manager_signature_method: input.signatureMethod ?? 'password-reprompt',
      manager_signoff_comment: input.comment ?? null,
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
  effectivenessVerified: boolean;
  comment?: string | null;
}): Promise<QualityNcr> {
  const nowIso = new Date().toISOString();
  const { data, error } = await insforge.database
    .from('quality_ncrs')
    .update({
      auditor_verify_user_id: input.actorUserId,
      auditor_verify_at: nowIso,
      effectiveness_verified: input.effectivenessVerified,
      auditor_comment: input.comment ?? null,
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

export async function reopenQualityNcr(input: {
  companyId: UUID;
  ncrId: UUID;
  actorUserId: UUID;
  reason?: string | null;
}): Promise<QualityNcr> {
  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);

  const { data, error } = await insforge.database
    .from('quality_ncrs')
    .update({
      status: 'in-progress',
      date_closed: null,
      closed_at: null,
      closed_by_user_id: null,
      reopen_reason: input.reason ?? null,
      reopen_at: nowIso,
      updated_at: nowIso
    })
    .eq('company_id', input.companyId)
    .eq('id', input.ncrId)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to reopen NCR.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'quality_ncrs.reopen',
    entityType: 'quality_ncr',
    entityId: input.ncrId,
    metadata: { reason: input.reason ?? null }
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

  // Require at least one form of evidence before closure
  const hasEvidence =
    !!(current as any).evidence_document_url ||
    !!(current as any).evidence_uploads ||
    !!(current as any).evidence_documents ||
    !!(current as any).evidence_photos;
  if (!hasEvidence) {
    throw new Error('Evidence (documents or photos) must be uploaded before closing this NCR.');
  }

  // Require corrective action to be completed if a due date was set
  if ((current as any).corrective_action_due_date && !(current as any).corrective_action_completed_date) {
    throw new Error('Corrective actions must be marked complete before closing this NCR.');
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
  const today = new Date().toISOString().slice(0, 10);

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
    date_identified: today,
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

// Helper: create an NCR from an incident (investigation outcome)
export async function createQualityNcrFromIncident(input: {
  companyId: UUID;
  incidentId: UUID;
  siteId?: UUID | null;
  departmentId?: UUID | null;
  severity: QualityNcr['severity'];
  riskRating?: string | null;
  title: string;
  description?: string | null;
  location?: string | null;
  detectedByUserId: UUID;
}): Promise<QualityNcr> {
  const today = new Date().toISOString().slice(0, 10);

  return createQualityNcr({
    companyId: input.companyId,
    module: 'safety',
    title: input.title,
    description: input.description ?? null ?? undefined,
    severity: input.severity,
    status: 'open',
    createdByUserId: input.detectedByUserId,
    site_id: input.siteId ?? null,
    department_id: input.departmentId ?? null,
    date_identified: today,
    location: input.location ?? null,
    process_involved: null,
    activity_involved: null,
    responsible_role: null,
    linked_requirement: null,
    risk_classification: input.riskRating ?? null,
    risk_rating: input.riskRating ?? null,
    source_entity_type: 'incident',
    source_entity_id: input.incidentId,
    metadata: {
      source: 'incident',
      incident_id: input.incidentId
    }
  });
}

