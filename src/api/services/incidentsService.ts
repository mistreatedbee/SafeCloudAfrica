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
  riskSeverity1To5?: number;
  riskLikelihood1To5?: number;
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
  requiredBehaviour?: string;
  affectedPersons?: Array<{
    userId?: UUID | null;
    displayName?: string | null;
    taskOperation?: string | null;
    machineryEquipmentTools?: string | null;
  }>;
  lostDays?: number | null;
  isRecordableInjury?: boolean | null;
  isLostTimeInjury?: boolean | null;
  isFatality?: boolean | null;
  isNearMiss?: boolean | null;
  isAccident?: boolean | null;
  isEnvironmentalIncident?: boolean | null;
  isSpill?: boolean | null;
  projectId?: UUID | null;
  clientId?: UUID | null;
};

function riskProductToClassification(product: number): 'Low' | 'Medium' | 'High' {
  if (product <= 5) return 'Low';
  if (product <= 12) return 'Medium';
  return 'High';
}

/** Derive KPI classification flags from category/subcategory/incident_type for TRIR, LTIFR, etc. */
export function deriveIncidentKpiClassification(input: {
  category: string;
  subcategory?: string | null;
  incidentType?: string | null;
  typeOfIncident?: string | null;
}): {
  is_fatality: boolean;
  is_lost_time_injury: boolean;
  is_recordable_injury: boolean;
  is_near_miss: boolean;
  is_accident: boolean;
  is_environmental_incident: boolean;
  is_spill: boolean;
} {
  const sub = trimLower(input.subcategory);
  const cat = trimLower(input.category);
  const it = trimLower(input.incidentType ?? input.typeOfIncident);
  return {
    is_fatality: sub === 'fatality',
    is_lost_time_injury: sub === 'lti',
    is_recordable_injury: sub === 'lti' || sub === 'nlti',
    is_near_miss: it === 'near miss',
    is_accident: it === 'accident',
    is_environmental_incident: cat === 'environmental' || (it && it.includes('environmental')),
    is_spill: cat === 'environmental' && (sub.includes('spill') || sub.includes('oil') || sub.includes('fuel'))
  };
}
function trimLower(s: string | undefined | null): string {
  return (s ?? '').trim().toLowerCase();
}

export async function createIncident(input: CreateIncidentInput): Promise<Incident> {
  const sev = input.riskSeverity1To5 ?? null;
  const like = input.riskLikelihood1To5 ?? null;
  const product = sev != null && like != null ? sev * like : null;
  const classification = product != null ? riskProductToClassification(product) : null;

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
    affected_person_id: input.affectedPersonId ?? input.affectedPersons?.[0]?.userId ?? null,
    affected_person_name: input.affectedPersonName ?? input.affectedPersons?.[0]?.displayName ?? null,
    loss_types: input.lossTypes ?? null,
    loss_production_value: input.lossProductionValue ?? null,
    loss_financial_value: input.lossFinancialValue ?? null,
    risk_category: input.riskCategory ?? classification ?? null,
    risk_severity_1_5: sev ?? null,
    risk_likelihood_1_5: like ?? null,
    risk_rating_product: product ?? null,
    risk_classification: classification ?? null,
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
    distributions_to_emails: input.distributionsToEmails ?? null,
    required_behaviour: input.requiredBehaviour ?? null
  };

  const kpi = deriveIncidentKpiClassification({
    category: input.category,
    subcategory: input.subcategory,
    incidentType: input.incidentType ?? input.typeOfIncident
  });
  insertData.lost_days = input.lostDays ?? null;
  insertData.is_recordable_injury = input.isRecordableInjury ?? kpi.is_recordable_injury;
  insertData.is_lost_time_injury = input.isLostTimeInjury ?? kpi.is_lost_time_injury;
  insertData.is_fatality = input.isFatality ?? kpi.is_fatality;
  insertData.is_near_miss = input.isNearMiss ?? kpi.is_near_miss;
  insertData.is_accident = input.isAccident ?? kpi.is_accident;
  insertData.is_environmental_incident = input.isEnvironmentalIncident ?? kpi.is_environmental_incident;
  insertData.is_spill = input.isSpill ?? kpi.is_spill;
  insertData.project_id = input.projectId ?? null;
  insertData.client_id = input.clientId ?? null;

  const { data, error } = await insforge.database
    .from('incidents')
    .insert(insertData)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create incident.');

  const created = data as Incident;
  if (input.affectedPersons && input.affectedPersons.length > 0) {
    const { upsertIncidentAffectedPersons } = await import('./incidentAffectedPersonsService');
    await upsertIncidentAffectedPersons(created.id, input.companyId, input.affectedPersons);
  }

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

  if (patch.riskSeverity1To5 !== undefined || patch.riskLikelihood1To5 !== undefined) {
    const current = await getIncident(incidentId);
    const sev = patch.riskSeverity1To5 ?? (current as any)?.risk_severity_1_5 ?? null;
    const like = patch.riskLikelihood1To5 ?? (current as any)?.risk_likelihood_1_5 ?? null;
    updateData.risk_severity_1_5 = sev;
    updateData.risk_likelihood_1_5 = like;
    if (sev != null && like != null) {
      const product = sev * like;
      updateData.risk_rating_product = product;
      updateData.risk_classification = riskProductToClassification(product);
    }
  }
  
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
  if (patch.requiredBehaviour !== undefined) updateData.required_behaviour = patch.requiredBehaviour;
  if (patch.area !== undefined) updateData.area = patch.area;
  if (patch.activity !== undefined) updateData.activity = patch.activity;
  if (patch.lostDays !== undefined) updateData.lost_days = patch.lostDays;
  if (patch.isRecordableInjury !== undefined) updateData.is_recordable_injury = patch.isRecordableInjury;
  if (patch.isLostTimeInjury !== undefined) updateData.is_lost_time_injury = patch.isLostTimeInjury;
  if (patch.isFatality !== undefined) updateData.is_fatality = patch.isFatality;
  if (patch.isNearMiss !== undefined) updateData.is_near_miss = patch.isNearMiss;
  if (patch.isAccident !== undefined) updateData.is_accident = patch.isAccident;
  if (patch.isEnvironmentalIncident !== undefined) updateData.is_environmental_incident = patch.isEnvironmentalIncident;
  if (patch.isSpill !== undefined) updateData.is_spill = patch.isSpill;
  if (patch.projectId !== undefined) updateData.project_id = patch.projectId;
  if (patch.clientId !== undefined) updateData.client_id = patch.clientId;
  if (patch.category !== undefined || patch.subcategory !== undefined || patch.incidentType !== undefined || patch.typeOfIncident !== undefined) {
    const current = await getIncident(incidentId);
    const kpi = deriveIncidentKpiClassification({
      category: patch.category ?? (current?.category ?? ''),
      subcategory: patch.subcategory ?? (current?.subcategory ?? ''),
      incidentType: patch.incidentType ?? patch.typeOfIncident ?? (current as any)?.incident_type ?? (current as any)?.type_of_incident
    });
    if (patch.isRecordableInjury === undefined) updateData.is_recordable_injury = kpi.is_recordable_injury;
    if (patch.isLostTimeInjury === undefined) updateData.is_lost_time_injury = kpi.is_lost_time_injury;
    if (patch.isFatality === undefined) updateData.is_fatality = kpi.is_fatality;
    if (patch.isNearMiss === undefined) updateData.is_near_miss = kpi.is_near_miss;
    if (patch.isAccident === undefined) updateData.is_accident = kpi.is_accident;
    if (patch.isEnvironmentalIncident === undefined) updateData.is_environmental_incident = kpi.is_environmental_incident;
    if (patch.isSpill === undefined) updateData.is_spill = kpi.is_spill;
  }

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
  if (patch.affectedPersons !== undefined) {
    const { upsertIncidentAffectedPersons } = await import('./incidentAffectedPersonsService');
    await upsertIncidentAffectedPersons(updated.id, updated.company_id, patch.affectedPersons);
  }
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

  const { data, error } = await q;
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as Incident[];
}

export type IncidentCountsForKpi = {
  totalIncidents: number;
  recordableInjuries: number;
  lostTimeInjuries: number;
  fatalities: number;
  nearMisses: number;
  accidents: number;
  environmentalIncidents: number;
  spills: number;
  totalLostDays: number;
};

export async function getIncidentCountsForKpi(input: {
  companyId: UUID;
  dateFrom: string;
  dateTo: string;
  siteId?: UUID | null;
  departmentId?: UUID | null;
}): Promise<IncidentCountsForKpi> {
  let q = insforge.database
    .from('incidents')
    .select('id, is_recordable_injury, is_lost_time_injury, is_fatality, is_near_miss, is_accident, is_environmental_incident, is_spill, lost_days')
    .eq('company_id', input.companyId)
    .gte('occurred_at', input.dateFrom)
    .lte('occurred_at', input.dateTo);
  if (input.siteId != null) q = q.eq('site_id', input.siteId);
  if (input.departmentId != null) q = q.eq('department_id', input.departmentId);
  const { data, error } = await q.limit(10000);
  if (error) throw new Error(getErrorMessage(error));
  const rows = (data ?? []) as Array<{
    id: UUID;
    is_recordable_injury?: boolean | null;
    is_lost_time_injury?: boolean | null;
    is_fatality?: boolean | null;
    is_near_miss?: boolean | null;
    is_accident?: boolean | null;
    is_environmental_incident?: boolean | null;
    is_spill?: boolean | null;
    lost_days?: number | null;
  }>;
  let recordableInjuries = 0;
  let lostTimeInjuries = 0;
  let fatalities = 0;
  let nearMisses = 0;
  let accidents = 0;
  let environmentalIncidents = 0;
  let spills = 0;
  let totalLostDays = 0;
  for (const r of rows) {
    if (r.is_recordable_injury) recordableInjuries++;
    if (r.is_lost_time_injury) lostTimeInjuries++;
    if (r.is_fatality) fatalities++;
    if (r.is_near_miss) nearMisses++;
    if (r.is_accident) accidents++;
    if (r.is_environmental_incident) environmentalIncidents++;
    if (r.is_spill) spills++;
    totalLostDays += Number(r.lost_days) || 0;
  }
  return {
    totalIncidents: rows.length,
    recordableInjuries,
    lostTimeInjuries,
    fatalities,
    nearMisses,
    accidents,
    environmentalIncidents,
    spills,
    totalLostDays
  };
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

