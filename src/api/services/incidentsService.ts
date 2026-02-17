import { insforge } from '../insforge/client';
import type { Incident, UUID } from '../models/entities';
import type { IncidentCategory, IncidentStatus, ModuleKey, Severity } from '../models/core';
import { getErrorMessage } from '../insforge/errors';

export type ListIncidentsInput = {
  companyId: UUID;
  search?: string;
  limit?: number;
};

export async function listIncidents(input: ListIncidentsInput): Promise<Incident[]> {
  const q = insforge.database.from('incidents').select('*').eq('company_id', input.companyId).order('occurred_at', { ascending: false });

  const trimmed = input.search?.trim();
  const limit = input.limit ?? 50;

  // Simple search across title/category/subcategory.
  const finalQ = trimmed
    ? q.or(`title.ilike.%${trimmed}%,category.ilike.%${trimmed}%,subcategory.ilike.%${trimmed}%`).limit(limit)
    : q.limit(limit);

  const { data, error } = await finalQ;
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as Incident[];
}

export async function countIncidentsByStatus(companyId: UUID, status: IncidentStatus): Promise<number> {
  const { count, error } = await insforge.database
    .from('incidents')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', status);
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
}

export async function countIncidentsByStatusForModule(companyId: UUID, module: ModuleKey, status: IncidentStatus): Promise<number> {
  const { count, error } = await insforge.database
    .from('incidents')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('module', module)
    .eq('status', status);
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
}

export async function countNearMissesThisMonth(companyId: UUID): Promise<number> {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  const { count, error } = await insforge.database
    .from('incidents')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('category', 'Near Miss')
    .gte('occurred_at', start.toISOString());

  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
}

export async function countMyIncidents(companyId: UUID, userId: UUID): Promise<number> {
  const { count, error } = await insforge.database
    .from('incidents')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('created_by_user_id', userId);
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
}

export type CreateIncidentInput = {
  companyId: UUID;
  module: ModuleKey;
  category: IncidentCategory;
  subcategory: string;
  title: string;
  description?: string;
  severity: Severity;
  occurredAt: string; // ISO string
  location?: string;
  assigneeUserId?: UUID;
  createdByUserId: UUID;
  // New base fields
  incidentType?: string;
  typeOfIncident?: string;
  categoryId?: UUID;
  categoryName?: string;
  subcategoryId?: UUID;
  subcategoryName?: string;
  subcategoryCustomText?: string;
  causeOfIncident?: string;
  affectedPersonId?: UUID;
  affectedPersonName?: string;
  lossTypes?: string[];
  lossProductionValue?: number;
  lossFinancialValue?: number;
  riskCategory?: string;
  reportedByUserId?: UUID;
  reportedToUserIds?: UUID[];
  copyToUserIds?: UUID[];
  copyToEmails?: string[];
  investigationRequired?: boolean;
  projectClient?: string;
  area?: string;
  activity?: string;
  // Investigation fields
  instructionBreakdown?: string;
  taskSequence?: string;
  consequence?: string;
  incidentEventTimelines?: Array<{ timestamp: string; notes: string }>;
  immediateCausesUnsafeActs?: Record<string, Array<string | { other: string }>>;
  immediateCausesUnsafeConditions?: Record<string, Array<string | { other: string }>>;
  rootCauseHumanFactors?: Record<string, Array<string | { other: string }>>;
  rootCauseWorkplaceFactors?: Record<string, Array<string | { other: string }>>;
  systemFailure?: Array<string | { other: string }>;
  contributingFactors?: string;
  contributingFactorTags?: string[];
  lessonsLearnt?: string;
  investigationTeamUserIds?: UUID[];
  conclusion?: string;
  preparedByUserId?: UUID;
  distributionsToUserIds?: UUID[];
  distributionsToEmails?: string[];
};

export async function createIncident(input: CreateIncidentInput): Promise<Incident> {
  const insertData: any = {
    company_id: input.companyId,
    module: input.module,
    category: input.category,
    subcategory: input.subcategory,
    title: input.title,
    description: input.description ?? null,
    severity: input.severity,
    status: 'open' satisfies IncidentStatus,
    occurred_at: input.occurredAt,
    location: input.location ?? null,
    assignee_user_id: input.assigneeUserId ?? null,
    created_by_user_id: input.createdByUserId,
    // New base fields
    incident_type: input.incidentType ?? null,
    type_of_incident: input.typeOfIncident ?? null,
    category_id: input.categoryId ?? null,
    category_name: input.categoryName ?? null,
    subcategory_id: input.subcategoryId ?? null,
    subcategory_name: input.subcategoryName ?? null,
    subcategory_custom_text: input.subcategoryCustomText ?? null,
    cause_of_incident: input.causeOfIncident ?? null,
    affected_person_id: input.affectedPersonId ?? null,
    affected_person_name: input.affectedPersonName ?? null,
    loss_types: input.lossTypes ?? null,
    loss_production_value: input.lossProductionValue ?? null,
    loss_financial_value: input.lossFinancialValue ?? null,
    risk_category: input.riskCategory ?? null,
    reported_by_user_id: input.reportedByUserId ?? null,
    reported_to_user_ids: input.reportedToUserIds ?? null,
    copy_to_user_ids: input.copyToUserIds ?? null,
    copy_to_emails: input.copyToEmails ?? null,
    investigation_required: input.investigationRequired ?? false,
    project_client: input.projectClient ?? null,
    area: input.area ?? null,
    activity: input.activity ?? null,
    // Investigation fields
    instruction_breakdown: input.instructionBreakdown ?? null,
    task_sequence: input.taskSequence ?? null,
    consequence: input.consequence ?? null,
    incident_event_timelines: input.incidentEventTimelines ? JSON.stringify(input.incidentEventTimelines) : null,
    immediate_causes_unsafe_acts: input.immediateCausesUnsafeActs ? JSON.stringify(input.immediateCausesUnsafeActs) : null,
    immediate_causes_unsafe_conditions: input.immediateCausesUnsafeConditions ? JSON.stringify(input.immediateCausesUnsafeConditions) : null,
    root_cause_human_factors: input.rootCauseHumanFactors ? JSON.stringify(input.rootCauseHumanFactors) : null,
    root_cause_workplace_factors: input.rootCauseWorkplaceFactors ? JSON.stringify(input.rootCauseWorkplaceFactors) : null,
    system_failure: input.systemFailure ? JSON.stringify(input.systemFailure) : null,
    contributing_factors: input.contributingFactors ?? null,
    contributing_factor_tags: input.contributingFactorTags ?? null,
    lessons_learnt: input.lessonsLearnt ?? null,
    investigation_team_user_ids: input.investigationTeamUserIds ?? null,
    conclusion: input.conclusion ?? null,
    prepared_by_user_id: input.preparedByUserId ?? null,
    distributions_to_user_ids: input.distributionsToUserIds ?? null,
    distributions_to_emails: input.distributionsToEmails ?? null
  };

  const { data, error } = await insforge.database
    .from('incidents')
    .insert(insertData)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create incident.');

  // Lazy import to avoid circular dependency
  const { createActivityLog } = await import('./activityLogService');
  const { notifyIncidentCreated } = await import('./notificationsService');
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'incidents.create',
    entityType: 'incident',
    entityId: (data as any).id as UUID
  });

  const created = data as Incident;
  if (created.assignee_user_id) {
    await notifyIncidentCreated(
      input.companyId,
      created.assignee_user_id,
      created.title,
      created.severity as Severity
    );
  }

  const { evaluateIncidentTrigger } = await import('./riskAssessmentTriggersService');
  await evaluateIncidentTrigger(input.companyId, {
    id: created.id,
    company_id: created.company_id,
    area: (created as any).area ?? input.area ?? null,
    activity: (created as any).activity ?? input.activity ?? null,
    location: created.location ?? null,
    category: created.category ?? null,
    project_client: (created as any).project_client ?? null
  }).catch(() => {});

  if (created.investigation_required || created.severity === 'high' || created.severity === 'critical') {
    const { createTaskFromIncident } = await import('./tasksService');
    await createTaskFromIncident({
      id: created.id,
      company_id: created.company_id,
      module: created.module,
      title: created.title,
      description: created.description ?? null,
      severity: created.severity,
      assignee_user_id: created.assignee_user_id ?? null,
      site_id: (created as any).site_id ?? null,
      department_id: (created as any).department_id ?? null,
      created_by_user_id: created.created_by_user_id
    }).catch(() => {});
  }

  return data as Incident;
}

export async function getIncident(incidentId: UUID): Promise<Incident | null> {
  const { data, error } = await insforge.database
    .from('incidents')
    .select('*')
    .eq('id', incidentId)
    .single();

  if (error) throw new Error(getErrorMessage(error));
  return (data ?? null) as Incident | null;
}

export async function updateIncident(incidentId: UUID, patch: Partial<CreateIncidentInput>): Promise<Incident> {
  const updateData: any = {};
  
  if (patch.title !== undefined) updateData.title = patch.title;
  if (patch.description !== undefined) updateData.description = patch.description;
  if (patch.severity !== undefined) updateData.severity = patch.severity;
  if (patch.status !== undefined) updateData.status = patch.status;
  if (patch.occurredAt !== undefined) updateData.occurred_at = patch.occurredAt;
  if (patch.location !== undefined) updateData.location = patch.location;
  if (patch.assigneeUserId !== undefined) updateData.assignee_user_id = patch.assigneeUserId;
  if (patch.incidentType !== undefined) updateData.incident_type = patch.incidentType;
  if (patch.typeOfIncident !== undefined) updateData.type_of_incident = patch.typeOfIncident;
  if (patch.causeOfIncident !== undefined) updateData.cause_of_incident = patch.causeOfIncident;
  if (patch.affectedPersonId !== undefined) updateData.affected_person_id = patch.affectedPersonId;
  if (patch.affectedPersonName !== undefined) updateData.affected_person_name = patch.affectedPersonName;
  if (patch.lossTypes !== undefined) updateData.loss_types = patch.lossTypes;
  if (patch.lossProductionValue !== undefined) updateData.loss_production_value = patch.lossProductionValue;
  if (patch.lossFinancialValue !== undefined) updateData.loss_financial_value = patch.lossFinancialValue;
  if (patch.riskCategory !== undefined) updateData.risk_category = patch.riskCategory;
  if (patch.reportedByUserId !== undefined) updateData.reported_by_user_id = patch.reportedByUserId;
  if (patch.reportedToUserIds !== undefined) updateData.reported_to_user_ids = patch.reportedToUserIds;
  if (patch.copyToUserIds !== undefined) updateData.copy_to_user_ids = patch.copyToUserIds;
  if (patch.copyToEmails !== undefined) updateData.copy_to_emails = patch.copyToEmails;
  if (patch.investigationRequired !== undefined) updateData.investigation_required = patch.investigationRequired;
  if (patch.projectClient !== undefined) updateData.project_client = patch.projectClient;
  if (patch.instructionBreakdown !== undefined) updateData.instruction_breakdown = patch.instructionBreakdown;
  if (patch.taskSequence !== undefined) updateData.task_sequence = patch.taskSequence;
  if (patch.consequence !== undefined) updateData.consequence = patch.consequence;
  if (patch.incidentEventTimelines !== undefined) updateData.incident_event_timelines = patch.incidentEventTimelines ? JSON.stringify(patch.incidentEventTimelines) : null;
  if (patch.immediateCausesUnsafeActs !== undefined) updateData.immediate_causes_unsafe_acts = patch.immediateCausesUnsafeActs ? JSON.stringify(patch.immediateCausesUnsafeActs) : null;
  if (patch.immediateCausesUnsafeConditions !== undefined) updateData.immediate_causes_unsafe_conditions = patch.immediateCausesUnsafeConditions ? JSON.stringify(patch.immediateCausesUnsafeConditions) : null;
  if (patch.rootCauseHumanFactors !== undefined) updateData.root_cause_human_factors = patch.rootCauseHumanFactors ? JSON.stringify(patch.rootCauseHumanFactors) : null;
  if (patch.rootCauseWorkplaceFactors !== undefined) updateData.root_cause_workplace_factors = patch.rootCauseWorkplaceFactors ? JSON.stringify(patch.rootCauseWorkplaceFactors) : null;
  if (patch.systemFailure !== undefined) updateData.system_failure = patch.systemFailure ? JSON.stringify(patch.systemFailure) : null;
  if (patch.contributingFactors !== undefined) updateData.contributing_factors = patch.contributingFactors;
  if (patch.contributingFactorTags !== undefined) updateData.contributing_factor_tags = patch.contributingFactorTags;
  if (patch.lessonsLearnt !== undefined) updateData.lessons_learnt = patch.lessonsLearnt;
  if (patch.investigationTeamUserIds !== undefined) updateData.investigation_team_user_ids = patch.investigationTeamUserIds;
  if (patch.conclusion !== undefined) updateData.conclusion = patch.conclusion;
  if (patch.preparedByUserId !== undefined) updateData.prepared_by_user_id = patch.preparedByUserId;
  if (patch.distributionsToUserIds !== undefined) updateData.distributions_to_user_ids = patch.distributionsToUserIds;
  if (patch.distributionsToEmails !== undefined) updateData.distributions_to_emails = patch.distributionsToEmails;
  if (patch.area !== undefined) updateData.area = patch.area;
  if (patch.activity !== undefined) updateData.activity = patch.activity;

  updateData.updated_at = new Date().toISOString();

  const { data, error } = await insforge.database
    .from('incidents')
    .update(updateData)
    .eq('id', incidentId)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update incident.');

  const updated = data as Incident;
  const { evaluateIncidentTrigger } = await import('./riskAssessmentTriggersService');
  await evaluateIncidentTrigger(updated.company_id, {
    id: updated.id,
    company_id: updated.company_id,
    area: (updated as any).area ?? null,
    activity: (updated as any).activity ?? null,
    location: updated.location ?? null,
    category: updated.category ?? null,
    project_client: (updated as any).project_client ?? null
  }).catch(() => {});

  // Log activity
  const { createActivityLog } = await import('./activityLogService');
  await createActivityLog({
    companyId: (data as any).company_id,
    actorUserId: (data as any).updated_by_user_id || (data as any).created_by_user_id,
    action: 'incidents.update',
    entityType: 'incident',
    entityId: incidentId
  });

  return data as Incident;
}

export type ListIncidentsWithFiltersInput = {
  companyId: UUID;
  search?: string;
  category?: string;
  incidentType?: string;
  riskCategory?: string;
  status?: IncidentStatus;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
};

export async function listIncidentsWithFilters(input: ListIncidentsWithFiltersInput): Promise<Incident[]> {
  let q = insforge.database.from('incidents').select('*').eq('company_id', input.companyId);

  if (input.search?.trim()) {
    const trimmed = input.search.trim();
    q = q.or(`title.ilike.%${trimmed}%,category.ilike.%${trimmed}%,subcategory.ilike.%${trimmed}%,project_client.ilike.%${trimmed}%`);
  }

  if (input.category) q = q.eq('category', input.category);
  if (input.incidentType) q = q.eq('type_of_incident', input.incidentType);
  if (input.riskCategory) q = q.eq('risk_category', input.riskCategory);
  if (input.status) q = q.eq('status', input.status);
  if (input.dateFrom) q = q.gte('occurred_at', input.dateFrom);
  if (input.dateTo) q = q.lte('occurred_at', input.dateTo);

  q = q.order('occurred_at', { ascending: false }).limit(input.limit ?? 100);

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/0b6fab05-6c3e-43f5-9c91-57b342f42891', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: `log_${Date.now()}_inc_list_filters`,
      timestamp: Date.now(),
      location: 'src/api/services/incidentsService.ts:listIncidentsWithFilters',
      message: 'listIncidentsWithFilters input',
      hypothesisId: 'H1',
      runId: 'pre-fix',
      data: input
    })
  }).catch(() => {});
  // #endregion agent log

  const { data, error } = await q;
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as Incident[];
}

export async function saveIncidentDraft(incidentId: UUID, draftData: Partial<CreateIncidentInput>): Promise<Incident> {
  return updateIncident(incidentId, draftData);
}

export async function submitIncidentInvestigation(incidentId: UUID, investigationData: Partial<CreateIncidentInput>): Promise<Incident> {
  const updateData = {
    ...investigationData,
    investigation_required: true,
    status: 'investigating' as IncidentStatus
  };
  return updateIncident(incidentId, updateData);
}

// Optionally raise an NCR from an incident (non-conformance from investigation)
export async function raiseNcrFromIncident(input: {
  companyId: UUID;
  incidentId: UUID;
  actorUserId: UUID;
}): Promise<void> {
  const incident = await getIncident(input.incidentId);
  if (!incident) throw new Error('Incident not found.');

  const { createQualityNcrFromIncident } = await import('./qualityNcrsService');

  const severity = (incident.severity as any) ?? 'medium';
  const riskRating = (incident as any).risk_category ?? null;

  await createQualityNcrFromIncident({
    companyId: input.companyId,
    incidentId: incident.id,
    siteId: (incident as any).site_id ?? null,
    departmentId: (incident as any).department_id ?? null,
    severity,
    riskRating,
    title: incident.title,
    description: incident.description ?? null,
    location: incident.location ?? null,
    detectedByUserId: input.actorUserId
  });
}

