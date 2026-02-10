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
      inspectorUserId: input.assigneeUserId ?? input.createdByUserId
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
    question: item.question,
    expected_evidence: item.expected_evidence,
    risk_area: item.risk_area,
    risk_rating: item.default_risk_rating,
    nc_severity: item.default_nc_severity,
    compliance_status: 'C' as InspectionRunComplianceStatus,
    comments: null,
    evidence_document_url: null,
    photo_url: null,
    nonconformance_flag: false,
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
    comments: string | null;
    evidence_document_url: string | null;
    photo_url: string | null;
  }>
): Promise<InspectionRunItem> {
  const updatePatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof patch.compliance_status !== 'undefined') {
    updatePatch.compliance_status = patch.compliance_status;
    updatePatch.nonconformance_flag = patch.compliance_status === 'NC';
  }
  if ('comments' in patch) updatePatch.comments = patch.comments;
  if ('evidence_document_url' in patch) updatePatch.evidence_document_url = patch.evidence_document_url;
  if ('photo_url' in patch) updatePatch.photo_url = patch.photo_url;

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

  const ncItems = items.filter((i) => i.compliance_status === 'NC');

  // Auto-create NCRs for NC items that don't yet have one
  let ncrsCreatedCount = 0;
  for (const item of ncItems) {
    if (item.auto_ncr_id) continue;

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

    await insforge.database
      .from('inspection_run_items')
      .update({
        auto_ncr_id: ncr.id,
        updated_at: new Date().toISOString()
      })
      .eq('company_id', input.companyId)
      .eq('id', item.id);
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

