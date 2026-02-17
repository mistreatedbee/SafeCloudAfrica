import { insforge } from '../insforge/client';
import type {
  Inspection,
  InspectionChecklistItem,
  InspectionChecklistTemplate,
  InspectionRun,
  InspectionRunComplianceStatus,
  InspectionRunItem,
  UUID
} from '../models/entities';
import type { ModuleKey } from '../models/core';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';
import { getMyProfile } from './profilesService';
import { createQualityNcrFromInspectionItem } from './qualityNcrsService';
import { createPpeIssueTracker } from './ppeIssueTrackerService';
import { createCorrectiveAction } from './correctiveActionsService';
import { createNotification } from './notificationsService';
import { sendTemplatedEmail } from './emailService';

export type ListInspectionsInput = {
  companyId: UUID;
  module?: ModuleKey;
  status?: Inspection['status'];
  templateId?: UUID;
  siteId?: UUID;
  departmentId?: UUID;
  inspectorUserId?: UUID;
  fromDate?: string;
  toDate?: string;
  limit?: number;
};

export async function listInspections(input: ListInspectionsInput): Promise<Inspection[]> {
  const base = insforge.database.from('inspections').select('*').eq('company_id', input.companyId);
  const q1 = input.module ? base.eq('module', input.module) : base;
  const q2 = input.status ? q1.eq('status', input.status) : q1;
  const q3 = input.siteId ? q2.eq('site_id', input.siteId) : q2;
  const q4 = input.departmentId ? q3.eq('department_id', input.departmentId) : q3;

  // Template and inspector are stored in inspection_runs; we keep listInspections scoped to inspections table for now.
  const q5 = input.fromDate ? q4.gte('scheduled_at', `${input.fromDate}T00:00:00.000Z`) : q4;
  const q6 = input.toDate ? q5.lte('scheduled_at', `${input.toDate}T23:59:59.999Z`) : q5;

  const { data, error } = await q6.order('scheduled_at', { ascending: false }).limit(input.limit ?? 200);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as Inspection[];
}

export async function countInspections(
  companyId: UUID,
  input?: { module?: ModuleKey; status?: Inspection['status'] }
): Promise<number> {
  const base = insforge.database
    .from('inspections')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId);
  const q1 = input?.module ? base.eq('module', input.module) : base;
  const q2 = input?.status ? q1.eq('status', input.status) : q1;
  const { count, error } = await q2;
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
}

export type CreateInspectionInput = {
  companyId: UUID;
  module: ModuleKey;
  title: string;
  scheduledAt?: string;
  location?: string;
  assigneeUserId?: UUID;
  createdByUserId: UUID;
  templateId?: UUID;
  inspectorUserId?: UUID | null;
  auditorUserId?: UUID | null;
  auditeeUserId?: UUID | null;
  inspectionMethod?: 'physical-observation' | 'record-review' | 'interview' | 'other';
  inspectionDate?: string;
};

export async function createInspection(input: CreateInspectionInput): Promise<Inspection> {
  const profile = await getMyProfile(input.companyId, input.createdByUserId);
  const { data, error } = await insforge.database
    .from('inspections')
    .insert({
      company_id: input.companyId,
      module: input.module,
      site_id: (profile as any)?.site_id ?? null,
      department_id: (profile as any)?.department_id ?? null,
      title: input.title,
      status: 'scheduled',
      scheduled_at: input.scheduledAt ?? null,
      location: input.location ?? null,
      assignee_user_id: input.assigneeUserId ?? null,
      inspector_user_id: input.inspectorUserId ?? input.assigneeUserId ?? input.createdByUserId,
      auditor_user_id: input.auditorUserId ?? null,
      auditee_user_id: input.auditeeUserId ?? null,
      inspection_method: input.inspectionMethod ?? 'physical-observation',
      inspection_date: input.inspectionDate ?? null,
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create inspection.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'inspections.create',
    entityType: 'inspection',
    entityId: (data as any).id as UUID
  });

  const inspection = data as Inspection;

  // Optionally create an initial run from a selected template
  if (input.templateId) {
    await createInspectionRunFromTemplate({
      companyId: input.companyId,
      inspectionId: inspection.id,
      templateId: input.templateId,
      inspectorUserId: input.inspectorUserId ?? input.assigneeUserId ?? input.createdByUserId,
      auditeeUserId: input.auditeeUserId ?? null
    });
  }

  return inspection;
}

// ---------------------------
// Checklist templates
// ---------------------------

export type ListInspectionChecklistTemplatesInput = {
  companyId: UUID;
  module?: ModuleKey;
  scope?: 'global' | 'site' | 'department';
  siteId?: UUID | null;
  departmentId?: UUID | null;
  search?: string;
  includeInactive?: boolean;
};

export async function listInspectionChecklistTemplates(
  input: ListInspectionChecklistTemplatesInput
): Promise<InspectionChecklistTemplate[]> {
  let q = insforge.database
    .from('inspection_checklist_templates')
    .select('*')
    .eq('company_id', input.companyId);

  if (input.module) q = q.eq('module', input.module);
  if (!input.includeInactive) q = q.eq('is_active', true);
  if (input.scope) q = q.eq('scope', input.scope);
  if (input.siteId) q = q.eq('site_id', input.siteId);
  if (input.departmentId) q = q.eq('department_id', input.departmentId);
  if (input.search) q = q.ilike('name', `%${input.search}%`);

  const { data, error } = await q.order('name', { ascending: true });
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as InspectionChecklistTemplate[];
}

export async function getInspectionChecklistTemplateById(
  companyId: UUID,
  templateId: UUID
): Promise<InspectionChecklistTemplate | null> {
  const { data, error } = await insforge.database
    .from('inspection_checklist_templates')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', templateId)
    .maybeSingle();
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? null) as InspectionChecklistTemplate | null;
}

export async function createInspectionChecklistTemplate(input: {
  companyId: UUID;
  module: ModuleKey;
  name: string;
  description?: string;
  scope?: 'global' | 'site' | 'department';
  siteId?: UUID | null;
  departmentId?: UUID | null;
  isActive?: boolean;
  createdByUserId: UUID;
  googleDocId?: string | null;
  googleDocUrl?: string | null;
  defaultSector?: string | null;
  frequency?: 'ad-hoc' | 'daily' | 'monthly' | 'quarterly';
}): Promise<InspectionChecklistTemplate> {
  const { data, error } = await insforge.database
    .from('inspection_checklist_templates')
    .insert({
      company_id: input.companyId,
      module: input.module,
      name: input.name,
      description: input.description ?? null,
      scope: input.scope ?? 'global',
      site_id: input.siteId ?? null,
      department_id: input.departmentId ?? null,
      is_active: input.isActive ?? true,
      google_doc_id: input.googleDocId ?? null,
      google_doc_url: input.googleDocUrl ?? null,
      default_sector: input.defaultSector ?? null,
      frequency: input.frequency ?? 'ad-hoc',
      created_by_user_id: input.createdByUserId,
      updated_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  return data as InspectionChecklistTemplate;
}

export async function updateInspectionChecklistTemplate(input: {
  companyId: UUID;
  templateId: UUID;
  name?: string;
  description?: string | null;
  scope?: 'global' | 'site' | 'department';
  siteId?: UUID | null;
  departmentId?: UUID | null;
  isActive?: boolean;
  updatedByUserId: UUID;
  googleDocId?: string | null;
  googleDocUrl?: string | null;
  defaultSector?: string | null;
  frequency?: 'ad-hoc' | 'daily' | 'monthly' | 'quarterly';
}): Promise<InspectionChecklistTemplate> {
  const patch: Record<string, unknown> = {
    updated_by_user_id: input.updatedByUserId,
    updated_at: new Date().toISOString()
  };
  if (typeof input.name !== 'undefined') patch.name = input.name;
  if (typeof input.description !== 'undefined') patch.description = input.description;
  if (typeof input.scope !== 'undefined') patch.scope = input.scope;
  if (typeof input.siteId !== 'undefined') patch.site_id = input.siteId;
  if (typeof input.departmentId !== 'undefined') patch.department_id = input.departmentId;
  if (typeof input.isActive !== 'undefined') patch.is_active = input.isActive;
   if (typeof input.googleDocId !== 'undefined') patch.google_doc_id = input.googleDocId;
   if (typeof input.googleDocUrl !== 'undefined') patch.google_doc_url = input.googleDocUrl;
   if (typeof input.defaultSector !== 'undefined') patch.default_sector = input.defaultSector;
   if (typeof input.frequency !== 'undefined') patch.frequency = input.frequency;

  const { data, error } = await insforge.database
    .from('inspection_checklist_templates')
    .update(patch)
    .eq('company_id', input.companyId)
    .eq('id', input.templateId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  return data as InspectionChecklistTemplate;
}

export async function archiveInspectionChecklistTemplate(
  companyId: UUID,
  templateId: UUID,
  updatedByUserId: UUID
): Promise<InspectionChecklistTemplate> {
  return updateInspectionChecklistTemplate({
    companyId,
    templateId,
    isActive: false,
    updatedByUserId
  });
}

export async function listInspectionChecklistItems(
  companyId: UUID,
  templateId: UUID
): Promise<InspectionChecklistItem[]> {
  const { data, error } = await insforge.database
    .from('inspection_checklist_items')
    .select('*')
    .eq('company_id', companyId)
    .eq('template_id', templateId)
    .order('item_order', { ascending: true });
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as InspectionChecklistItem[];
}

export async function upsertInspectionChecklistItems(input: {
  companyId: UUID;
  templateId: UUID;
  items: Array<{
    id?: UUID;
    item_order: number;
    section?: string | null;
    question: string;
    expected_evidence?: string | null;
    risk_area?: string | null;
    default_risk_rating?: string | null;
    default_nc_severity?: string | null;
    is_mandatory?: boolean;
  }>;
}): Promise<InspectionChecklistItem[]> {
  const rows = input.items.map((item) => ({
    id: item.id ?? undefined,
    company_id: input.companyId,
    template_id: input.templateId,
    item_order: item.item_order,
    section: item.section ?? null,
    question: item.question,
    expected_evidence: item.expected_evidence ?? null,
    risk_area: item.risk_area ?? null,
    default_risk_rating: item.default_risk_rating ?? null,
    default_nc_severity: item.default_nc_severity ?? null,
    is_mandatory: item.is_mandatory ?? false
  }));

  const { data, error } = await insforge.database
    .from('inspection_checklist_items')
    .upsert(rows, { onConflict: 'id' })
    .select('*')
    .order('item_order', { ascending: true });
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as InspectionChecklistItem[];
}

// ---------------------------
// Inspection runs
// ---------------------------

export async function getInspectionById(companyId: UUID, inspectionId: UUID): Promise<Inspection | null> {
  const { data, error } = await insforge.database
    .from('inspections')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', inspectionId)
    .maybeSingle();
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? null) as Inspection | null;
}

export async function createInspectionRunFromTemplate(input: {
  companyId: UUID;
  inspectionId: UUID;
  templateId: UUID;
  inspectorUserId?: UUID | null;
  auditeeUserId?: UUID | null;
}): Promise<{ run: InspectionRun; items: InspectionRunItem[] }> {
  // Determine next run number
  const { data: existingRuns, error: runsError } = await insforge.database
    .from('inspection_runs')
    .select('run_number')
    .eq('company_id', input.companyId)
    .eq('inspection_id', input.inspectionId)
    .order('run_number', { ascending: false })
    .limit(1);
  if (runsError) throw new Error(getErrorMessage(runsError));
  const nextRunNumber = (existingRuns?.[0]?.run_number ?? 0) + 1;

  const nowIso = new Date().toISOString();

  // Fetch template + items
  const [template, templateItems] = await Promise.all([
    getInspectionChecklistTemplateById(input.companyId, input.templateId),
    listInspectionChecklistItems(input.companyId, input.templateId)
  ]);
  if (!template) throw new Error('Checklist template not found.');

  // Create run
  const { data: runData, error: runError } = await insforge.database
    .from('inspection_runs')
    .insert({
      company_id: input.companyId,
      inspection_id: input.inspectionId,
      template_id: input.templateId,
      module: template.module,
      site_id: template.site_id ?? null,
      department_id: template.department_id ?? null,
      run_number: nextRunNumber,
      started_at: nowIso,
      status: 'in-progress',
      inspector_user_id: input.inspectorUserId ?? null,
      auditee_user_id: input.auditeeUserId ?? null,
      items_total: templateItems.length,
      items_nc: 0,
      ncrs_created_count: 0
    })
    .select('*')
    .single();
  if (runError) throw new Error(getErrorMessage(runError));
  const run = runData as unknown as InspectionRun;

  // Clone items
  const runItemsPayload = templateItems.map((item) => ({
    company_id: input.companyId,
    run_id: run.id,
    template_item_id: item.id,
    item_order: item.item_order,
    section: item.section,
    audit_section_or_category: (item as any).audit_section_or_category ?? item.section,
    question: item.question,
    expected_evidence: item.expected_evidence,
    risk_area: item.risk_area,
    risk_rating: item.default_risk_rating,
    nc_severity: item.default_nc_severity,
    inspection_method: (item as any).inspection_method_default ?? template.default_inspection_method ?? 'physical-observation',
    evidence_required: (item as any).evidence_required_default ?? false,
    risk_level: (item as any).risk_level_default ?? null,
    question_fingerprint: (item as any).question_fingerprint ?? null,
    compliance_status: 'C' as InspectionRunComplianceStatus,
    inspection_rating: 'C',
    score: 2,
    max_score: 2,
    comments: null,
    auditor_comments: null,
    evidence_document_url: null,
    photo_url: null,
    nonconformance_flag: false,
    corrective_action_required: false,
    auto_ncr_id: null
  }));

  const { data: itemsData, error: itemsError } = await insforge.database
    .from('inspection_run_items')
    .insert(runItemsPayload)
    .select('*')
    .order('item_order', { ascending: true });
  if (itemsError) throw new Error(getErrorMessage(itemsError));

  return {
    run,
    items: (itemsData ?? []) as unknown as InspectionRunItem[]
  };
}

export async function getInspectionRunById(
  companyId: UUID,
  runId: UUID
): Promise<{ run: InspectionRun; items: InspectionRunItem[] } | null> {
  const { data: runData, error: runError } = await insforge.database
    .from('inspection_runs')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', runId)
    .maybeSingle();
  if (runError) throw new Error(getErrorMessage(runError));
  if (!runData) return null;

  const { data: itemsData, error: itemsError } = await insforge.database
    .from('inspection_run_items')
    .select('*')
    .eq('company_id', companyId)
    .eq('run_id', runId)
    .order('item_order', { ascending: true });
  if (itemsError) throw new Error(getErrorMessage(itemsError));

  return {
    run: runData as unknown as InspectionRun,
    items: (itemsData ?? []) as unknown as InspectionRunItem[]
  };
}

export async function updateInspectionRunItem(
  companyId: UUID,
  runItemId: UUID,
  patch: Partial<{
    compliance_status: InspectionRunComplianceStatus;
    inspection_rating: 'C' | 'PC' | 'NC';
    risk_level: 'low' | 'medium' | 'high';
    evidence_required: boolean;
    evidence_notes: string | null;
    comments: string | null;
    auditor_comments: string | null;
    inspection_method: 'physical-observation' | 'record-review' | 'interview' | 'other';
    nonconformance_flag: boolean;
    corrective_action_required: boolean;
    responsible_person_id: UUID | null;
    responsible_person_name: string | null;
    due_date: string | null;
    status: InspectionRunItem['status'];
    evidence_document_url: string | null;
    photo_url: string | null;
    closure_requested_at: string | null;
    closure_evidence_submitted_at: string | null;
    manager_approved_by_user_id: UUID | null;
    manager_approved_at: string | null;
    auditor_verified_by_user_id: UUID | null;
    auditor_verified_at: string | null;
  }>
): Promise<InspectionRunItem> {
  const updatePatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof patch.compliance_status !== 'undefined') {
    updatePatch.compliance_status = patch.compliance_status;
    updatePatch.nonconformance_flag = patch.compliance_status === 'NC';
  }
  if (typeof patch.inspection_rating !== 'undefined') {
    updatePatch.inspection_rating = patch.inspection_rating;
    // Map rating to numeric score: C=2, PC=1, NC=0
    const rating = patch.inspection_rating;
    const score = rating === 'C' ? 2 : rating === 'PC' ? 1 : 0;
    updatePatch.score = score;
    updatePatch.max_score = 2;
  }
  if (typeof patch.risk_level !== 'undefined') updatePatch.risk_level = patch.risk_level;
  if (typeof patch.evidence_required !== 'undefined') updatePatch.evidence_required = patch.evidence_required;
  if ('evidence_notes' in patch) updatePatch.evidence_notes = patch.evidence_notes;
  if ('comments' in patch) updatePatch.comments = patch.comments;
  if ('auditor_comments' in patch) updatePatch.auditor_comments = patch.auditor_comments;
  if (typeof patch.inspection_method !== 'undefined') updatePatch.inspection_method = patch.inspection_method;
  if (typeof patch.nonconformance_flag !== 'undefined') updatePatch.nonconformance_flag = patch.nonconformance_flag;
  if (typeof patch.corrective_action_required !== 'undefined')
    updatePatch.corrective_action_required = patch.corrective_action_required;
  if ('responsible_person_id' in patch) updatePatch.responsible_person_id = patch.responsible_person_id;
  if ('responsible_person_name' in patch) updatePatch.responsible_person_name = patch.responsible_person_name;
  if ('due_date' in patch) updatePatch.due_date = patch.due_date;
  if ('status' in patch) updatePatch.status = patch.status;
  if ('evidence_document_url' in patch) updatePatch.evidence_document_url = patch.evidence_document_url;
  if ('photo_url' in patch) updatePatch.photo_url = patch.photo_url;
  if ('closure_requested_at' in patch) updatePatch.closure_requested_at = patch.closure_requested_at;
  if ('closure_evidence_submitted_at' in patch)
    updatePatch.closure_evidence_submitted_at = patch.closure_evidence_submitted_at;
  if ('manager_approved_by_user_id' in patch)
    updatePatch.manager_approved_by_user_id = patch.manager_approved_by_user_id;
  if ('manager_approved_at' in patch) updatePatch.manager_approved_at = patch.manager_approved_at;
  if ('auditor_verified_by_user_id' in patch)
    updatePatch.auditor_verified_by_user_id = patch.auditor_verified_by_user_id;
  if ('auditor_verified_at' in patch) updatePatch.auditor_verified_at = patch.auditor_verified_at;

  const { data, error } = await insforge.database
    .from('inspection_run_items')
    .update(updatePatch)
    .eq('company_id', companyId)
    .eq('id', runItemId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  return data as unknown as InspectionRunItem;
}

export async function completeInspectionRun(input: {
  companyId: UUID;
  runId: UUID;
  actorUserId: UUID;
}): Promise<{ run: InspectionRun; items: InspectionRunItem[] }> {
  const runWithItems = await getInspectionRunById(input.companyId, input.runId);
  if (!runWithItems) throw new Error('Inspection run not found.');

  const { run, items } = runWithItems;

  const ncItems = items.filter((i) => i.compliance_status === 'NC' || i.inspection_rating === 'NC');

  // Auto-create NCRs and CAPAs for NC items that don't yet have them
  let ncrsCreatedCount = 0;
  for (const item of ncItems) {
    let autoNcrId = item.auto_ncr_id as UUID | null | undefined;

    if (!autoNcrId) {
      const ncr = await createQualityNcrFromInspectionItem({
        companyId: input.companyId,
        inspectionId: run.inspection_id,
        runId: run.id,
        runItemId: item.id,
        siteId: run.site_id ?? null,
        departmentId: run.department_id ?? null,
        severity: (item.nc_severity as any) ?? 'medium',
        riskRating: item.risk_rating ?? null,
        description: item.comments ?? item.question,
        detectedByUserId: input.actorUserId
      });

      ncrsCreatedCount += 1;
      autoNcrId = ncr.id as UUID;

      await insforge.database
        .from('inspection_run_items')
        .update({
          auto_ncr_id: autoNcrId,
          updated_at: new Date().toISOString()
        })
        .eq('company_id', input.companyId)
        .eq('id', item.id);
    }

    // Auto-generate CAPA when NC or corrective action explicitly required
    const needsCapa = item.corrective_action_required || item.compliance_status === 'NC' || item.inspection_rating === 'NC';
    if (needsCapa && !item.corrective_action_id) {
      const dueDate =
        (item.due_date as string | null | undefined) ??
        new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const priority: 'low' | 'medium' | 'high' | 'urgent' =
        item.risk_level === 'high' ? 'high' : item.risk_level === 'low' ? 'low' : 'medium';

      const capa = await createCorrectiveAction({
        companyId: input.companyId,
        title: item.question,
        description: item.comments ?? item.auditor_comments ?? null ?? undefined,
        actionType: 'corrective',
        sourceType: 'inspection',
        sourceId: item.id as UUID,
        priority,
        dueDate,
        assignedToUserId: (item.responsible_person_id as UUID | null | undefined) ?? undefined,
        rootCause: undefined,
        proposedSolution: undefined,
        createdByUserId: input.actorUserId
      });

      await insforge.database
        .from('inspection_run_items')
        .update({
          corrective_action_id: capa.id,
          updated_at: new Date().toISOString()
        })
        .eq('company_id', input.companyId)
        .eq('id', item.id);
    }

    // Auto-create a linked PPE issue when checklist item clearly relates to PPE
    const questionLower = (item.question ?? '').toLowerCase();
    const riskAreaLower = (item.risk_area ?? '').toLowerCase();
    const isPpeRelated =
      questionLower.includes('ppe') ||
      questionLower.includes('personal protective') ||
      questionLower.includes('helmet') ||
      questionLower.includes('glove') ||
      questionLower.includes('boots') ||
      questionLower.includes('respirator') ||
      questionLower.includes('mask') ||
      riskAreaLower.includes('ppe');

    if (isPpeRelated) {
      try {
        await createPpeIssueTracker({
          companyId: input.companyId,
          createdByUserId: input.actorUserId,
          reportedByUserId: input.actorUserId,
          reportedByName: null,
          siteId: run.site_id ?? null,
          departmentId: run.department_id ?? null,
          contractorOrEmployeeName: null,
          employeeNumber: null,
          jobRoleOrTask: item.question,
          ppeType: 'other',
          ppeTypeOther: (item.risk_area as string | null) ?? null,
          issueCategory: 'ppe_not_worn',
          descriptionOfIssue: item.comments || item.auditor_comments || item.question,
          riskLevel: (item.risk_level as any) ?? 'medium',
          checklistInstanceId: run.id,
          checklistItemId: item.id,
          correctiveActionRequired: item.corrective_action_required,
          responsibleUserId: item.responsible_person_id ?? undefined,
          responsibleUserName: item.responsible_person_name ?? undefined,
          targetCompletionDate: item.due_date ?? undefined
        });
      } catch {
        // Best effort; do not block inspection completion if PPE issue auto-creation fails.
      }
    }
  }

  const nowIso = new Date().toISOString();

  const { data: updatedRunData, error: runError } = await insforge.database
    .from('inspection_runs')
    .update({
      status: 'completed',
      completed_at: nowIso,
      items_total: items.length,
      items_nc: ncItems.length,
      ncrs_created_count: (run.ncrs_created_count ?? 0) + ncrsCreatedCount,
      updated_at: nowIso
    })
    .eq('company_id', input.companyId)
    .eq('id', run.id)
    .select('*')
    .single();
  if (runError) throw new Error(getErrorMessage(runError));

  // Update parent inspection summary counts
  await insforge.database
    .from('inspections')
    .update({
      findings_count: (items.length ?? 0),
      nonconformances_count: ncItems.length,
      completed_at: nowIso,
      status: 'completed',
      updated_at: nowIso
    })
    .eq('company_id', input.companyId)
    .eq('id', run.inspection_id);

  // Escalation: notify on high-risk findings
  const highRiskItems = items.filter((i) => i.risk_level === 'high');
  if (highRiskItems.length > 0) {
    const { data: profiles, error: profilesError } = await insforge.database
      .from('user_profiles')
      .select('*')
      .eq('company_id', input.companyId);
    if (!profilesError && profiles) {
      const byUserId = new Map<string, any>();
      for (const p of profiles as any[]) {
        if (p.user_id) byUserId.set(String(p.user_id), p);
      }

      const recipientUserIds = new Set<string>();
      for (const item of highRiskItems) {
        if (item.responsible_person_id) recipientUserIds.add(String(item.responsible_person_id));
        if (run.department_id) {
          // Best-effort: notify all managers in this tenant as department managers are not modeled directly
          // This can be tightened later if department-manager mapping is added.
        }
      }

      const link = `${window.location.origin}/inspections/${run.inspection_id}`;
      const emails: string[] = [];
      for (const userId of recipientUserIds) {
        const profile = byUserId.get(userId);
        if (profile?.email) emails.push(profile.email as string);
        await createNotification(
          input.companyId,
          userId as unknown as UUID,
          'high',
          'High risk inspection finding',
          `One or more checklist items were rated high risk in inspection "${run.inspection_id}".`
        );
      }
      if (emails.length > 0) {
        await sendTemplatedEmail(emails, 'incident_created', {
          incidentTitle: 'High risk inspection finding',
          severity: 'high',
          category: run.module,
          location: (run as any).location ?? '',
          link
        });
      }
    }
  }

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'inspections.complete_run',
    entityType: 'inspection_run',
    entityId: run.id
  });

  const refreshed = await getInspectionRunById(input.companyId, input.runId);
  if (!refreshed) throw new Error('Failed to reload inspection run after completion.');
  return refreshed;
}

