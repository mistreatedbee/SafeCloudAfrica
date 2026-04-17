import { insforge } from '../insforge/client';
import type { Incident, UUID } from '../models/entities';
import type { IncidentCategory, IncidentStatus, ModuleKey, Severity, IncidentRiskCategory } from '../models/core';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';

export type ListIncidentsInput = {
  companyId: UUID;
  search?: string;
  limit?: number;
};

export type ListIncidentsWithFiltersInput = ListIncidentsInput & {
  status?: IncidentStatus;
  severity?: Severity;
  category?: IncidentCategory;
  from?: string;
  to?: string;
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

export async function listIncidentsWithFilters(input: ListIncidentsWithFiltersInput): Promise<Incident[]> {
  let q = insforge.database
    .from('incidents')
    .select('*')
    .eq('company_id', input.companyId)
    .order('occurred_at', { ascending: false })
    .limit(input.limit ?? 200);

  if (input.status) q = q.eq('status', input.status);
  if (input.severity) q = q.eq('severity', input.severity);
  if (input.category) q = q.eq('category', input.category);
  if (input.from) q = q.gte('occurred_at', input.from);
  if (input.to) q = q.lte('occurred_at', input.to);
  if (input.search?.trim()) {
    const term = input.search.trim();
    q = q.or(`title.ilike.%${term}%,category.ilike.%${term}%,subcategory.ilike.%${term}%`);
  }

  const { data, error } = await q;
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as Incident[];
}

export async function countIncidentsByStatus(companyId: UUID, status: IncidentStatus): Promise<number> {
  const { count, error } = await insforge.database
    .from('incidents')
    .select('*', { count: 'planned', head: true })
    .eq('company_id', companyId)
    .eq('status', status);
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
}

export async function countIncidentsByStatusForModule(companyId: UUID, module: ModuleKey, status: IncidentStatus): Promise<number> {
  const { count, error } = await insforge.database
    .from('incidents')
    .select('*', { count: 'planned', head: true })
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
    .select('*', { count: 'planned', head: true })
    .eq('company_id', companyId)
    .eq('category', 'Near Miss')
    .gte('occurred_at', start.toISOString());

  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
}

export async function countMyIncidents(companyId: UUID, userId: UUID): Promise<number> {
  const { count, error } = await insforge.database
    .from('incidents')
    .select('*', { count: 'planned', head: true })
    .eq('company_id', companyId)
    .eq('created_by_user_id', userId);
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
}

export type GetIncidentCountsForKpiInput = {
  companyId: UUID;
  dateFrom: string;
  dateTo: string;
  siteId?: UUID | null;
  departmentId?: UUID | null;
};

export type IncidentCountsForKpi = {
  recordableInjuries: number;
  lostTimeInjuries: number;
  fatalities: number;
  totalLostDays: number;
  nearMisses: number;
  accidents: number;
  spills: number;
  environmentalIncidents: number;
  totalIncidents: number;
};

export async function getIncidentCountsForKpi(input: GetIncidentCountsForKpiInput): Promise<IncidentCountsForKpi> {
  let q = insforge.database
    .from('incidents')
    .select('id, lost_days, is_recordable_injury, is_lost_time_injury, is_fatality, is_near_miss, is_accident, is_spill, is_environmental_incident')
    .eq('company_id', input.companyId)
    .gte('occurred_at', input.dateFrom)
    .lte('occurred_at', input.dateTo);

  if (input.siteId != null) q = q.eq('site_id', input.siteId);
  if (input.departmentId != null) q = q.eq('department_id', input.departmentId);

  const { data, error } = await q;
  if (error) throw new Error(getErrorMessage(error));

  const rows = (data ?? []) as Array<{
    id: UUID;
    lost_days: number | null;
    is_recordable_injury?: boolean | null;
    is_lost_time_injury?: boolean | null;
    is_fatality?: boolean | null;
    is_near_miss?: boolean | null;
    is_accident?: boolean | null;
    is_spill?: boolean | null;
    is_environmental_incident?: boolean | null;
  }>;

  const totals: IncidentCountsForKpi = {
    recordableInjuries: 0,
    lostTimeInjuries: 0,
    fatalities: 0,
    totalLostDays: 0,
    nearMisses: 0,
    accidents: 0,
    spills: 0,
    environmentalIncidents: 0,
    totalIncidents: rows.length
  };

  for (const row of rows) {
    if (row.is_recordable_injury) totals.recordableInjuries += 1;
    if (row.is_lost_time_injury) totals.lostTimeInjuries += 1;
    if (row.is_fatality) totals.fatalities += 1;
    if (row.is_near_miss) totals.nearMisses += 1;
    if (row.is_accident) totals.accidents += 1;
    if (row.is_spill) totals.spills += 1;
    if (row.is_environmental_incident) totals.environmentalIncidents += 1;
    totals.totalLostDays += Number(row.lost_days) || 0;
  }

  return totals;
}

export type CreateIncidentInput = {
  companyId: UUID;
  module: ModuleKey;
  category: IncidentCategory;
  subcategory: string;
  title: string;
  description?: string;
  incidentType?: string;
  projectClient?: string;
  natureOfIncident?: string;
  causeOfIncident?: string;
  affectedPerson?: string;
  affectedUserId?: UUID | null;
  affectedPersonName?: string | null;
  affectedEmployeeId?: UUID | null;
  reportedBy?: string;
  reportedTo?: string;
  copyToEmails?: string[];
  investigationRequired?: boolean;
  unsafeActs?: Array<{ group: string; item: string; note?: string }>;
  unsafeConditions?: Array<{ group: string; item: string; note?: string }>;
  losses?: {
    productionLoss?: number | null;
    financialLoss?: number | null;
    reputationalLoss?: number | null;
    damageAssetLoss?: number | null;
    illnessInjuryImpact?: number | null;
    illnessLoss?: number | null;
    injuryLoss?: number | null;
    civilLiabilityLoss?: number | null;
    criminalLiabilityLoss?: number | null;
    vicariousLiabilityLoss?: number | null;
    substandardQualityLoss?: number | null;
    types?: string[] | null;
    other?: string | null;
    notes?: string | null;
  };
  riskSeverity1To5?: number | null;
  riskLikelihood1To5?: number | null;
  riskRatingProduct?: number | null;
  riskClassification?: IncidentRiskCategory | null;
  riskCategorySimple?: 'Low' | 'Medium' | 'High' | null;
  severity: Severity;
  occurredAt: string; // ISO string
  location?: string;
  assigneeUserId?: UUID;
  createdByUserId: UUID;
  autoGenerateNcr?: boolean;
  metadata?: Record<string, unknown> | null;
};

function getMissingColumnFromSchemaError(error: unknown): string | null {
  const message = getErrorMessage(error);
  const singleQuoteMatch = message.match(/Could not find the '([^']+)' column/i);
  if (singleQuoteMatch?.[1]) return singleQuoteMatch[1];
  const doubleQuoteMatch = message.match(/Could not find the "([^"]+)" column/i);
  if (doubleQuoteMatch?.[1]) return doubleQuoteMatch[1];
  const plainMatch = message.match(/column\s+([a-zA-Z0-9_]+)\s+/i);
  return plainMatch?.[1] ?? null;
}

async function insertIncidentWithSchemaFallback(payload: Record<string, unknown>): Promise<Incident> {
  const { data, error } = await insforge.database
    .from('incidents')
    .insert(payload)
    .select('*')
    .single();
  if (!error && data) return data as Incident;

  const missingColumn = getMissingColumnFromSchemaError(error);
  if (missingColumn && Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
    throw new Error(
      `The incidents table is missing the "${missingColumn}" column required by the latest application build. Apply the latest database migrations before creating incidents.`
    );
  }

  throw new Error(getErrorMessage(error));
}

async function updateIncidentWithSchemaFallback(companyId: UUID, incidentId: UUID, payload: Record<string, unknown>): Promise<Incident> {
  const { data, error } = await insforge.database
    .from('incidents')
    .update(payload)
    .eq('company_id', companyId)
    .eq('id', incidentId)
    .select('*')
    .single();
  if (!error && data) return data as Incident;

  const missingColumn = getMissingColumnFromSchemaError(error);
  if (missingColumn && Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
    throw new Error(
      `The incidents table is missing the "${missingColumn}" column required by the latest application build. Apply the latest database migrations before updating incidents.`
    );
  }

  throw new Error(getErrorMessage(error));
}

export async function createIncident(input: CreateIncidentInput): Promise<Incident> {
  const losses = input.losses ?? {};
  const insertPayload: Record<string, unknown> = {
    company_id: input.companyId,
    module: input.module,
    category: input.category,
    subcategory: input.subcategory,
    title: input.title,
    description: input.description ?? null,
    incident_type: input.incidentType ?? null,
    project_client: input.projectClient ?? null,
    nature_of_incident: input.natureOfIncident ?? null,
    cause_of_incident: input.causeOfIncident ?? null,
    affected_person: input.affectedPerson ?? null,
    affected_person_id: input.affectedEmployeeId ?? null,
    affected_user_id: input.affectedUserId ?? null,
    affected_person_name: input.affectedPersonName ?? null,
    reported_by: input.reportedBy ?? null,
    reported_to: input.reportedTo ?? null,
    copy_to_emails: input.copyToEmails ?? null,
    investigation_required: input.investigationRequired ?? false,
    immediate_causes_unsafe_acts: input.unsafeActs ?? null,
    immediate_causes_unsafe_conditions: input.unsafeConditions ?? null,
    loss_production_value: losses.productionLoss ?? null,
    loss_financial_value: losses.financialLoss ?? null,
    loss_reputational_value: losses.reputationalLoss ?? null,
    loss_damage_asset_value: losses.damageAssetLoss ?? null,
    loss_illness_injury_value: losses.illnessInjuryImpact ?? null,
    loss_illness_value: losses.illnessLoss ?? null,
    loss_injury_value: losses.injuryLoss ?? null,
    loss_civil_liability_value: losses.civilLiabilityLoss ?? null,
    loss_criminal_liability_value: losses.criminalLiabilityLoss ?? null,
    loss_vicarious_liability_value: losses.vicariousLiabilityLoss ?? null,
    loss_substandard_quality_value: losses.substandardQualityLoss ?? null,
    loss_types: losses.types ?? null,
    loss_other_text: losses.other ?? null,
    loss_notes: losses.notes ?? null,
    risk_severity_1_5: input.riskSeverity1To5 ?? null,
    risk_likelihood_1_5: input.riskLikelihood1To5 ?? null,
    risk_rating_product: input.riskRatingProduct ?? null,
    risk_classification: input.riskClassification ?? null,
    risk_category: input.riskCategorySimple ?? null,
    severity: input.severity,
    status: 'open' satisfies IncidentStatus,
    occurred_at: input.occurredAt,
    location: input.location ?? null,
    assignee_user_id: input.assigneeUserId ?? null,
    created_by_user_id: input.createdByUserId,
    metadata: input.metadata ?? null
  };

  const data = await insertIncidentWithSchemaFallback(insertPayload);

  // Lazy import to avoid circular dependency
  const { createActivityLog } = await import('./activityLogService');
  const { createQualityNcr } = await import('./qualityNcrsService');
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'incidents.create',
    entityType: 'incident',
    entityId: (data as any).id as UUID
  });

  if (input.autoGenerateNcr === true) {
    const createdIncident = data as Incident;
    await createQualityNcr({
      companyId: input.companyId,
      module: input.module,
      title: `Incident NCR: ${input.title}`,
      description: input.description ?? undefined,
      location: input.location ?? undefined,
      process_involved: input.natureOfIncident ?? undefined,
      activity_involved: input.subcategory ?? undefined,
      responsible_role: input.reportedTo ?? undefined,
      risk_classification: String(input.riskClassification ?? '').toLowerCase() || undefined,
      risk_rating:
        String(input.riskClassification ?? '').toLowerCase() === 'critical'
          ? 'critical'
          : String(input.riskClassification ?? '').toLowerCase() === 'high'
            ? 'high'
            : String(input.riskClassification ?? '').toLowerCase() === 'medium'
              ? 'medium'
              : 'low',
      severity: input.severity,
      createdByUserId: input.createdByUserId,
      source_entity_type: 'incident',
      source_entity_id: createdIncident.id
    });
  }

  return data as Incident;
}

export type UpdateIncidentPatch = Partial<{
  module: ModuleKey;
  category: IncidentCategory;
  subcategory: string;
  title: string;
  description: string | null;
  severity: Severity;
  status: IncidentStatus;
  occurredAt: string;
  location: string | null;
  incidentType: string | null;
  projectClient: string | null;
  natureOfIncident: string | null;
  causeOfIncident: string | null;
  affectedPerson: string | null;
  affectedUserId: UUID | null;
  affectedPersonName: string | null;
  affectedEmployeeId: UUID | null;
  reportedBy: string | null;
  reportedTo: string | null;
  copyToEmails: string[] | null;
  investigationRequired: boolean;
  unsafeActs: Array<{ group: string; item: string; note?: string }> | null;
  unsafeConditions: Array<{ group: string; item: string; note?: string }> | null;
  lossProductionValue: number | null;
  lossFinancialValue: number | null;
  lossReputationalValue: number | null;
  lossDamageAssetValue: number | null;
  lossIllnessInjuryValue: number | null;
  lossIllnessValue: number | null;
  lossInjuryValue: number | null;
  lossCivilLiabilityValue: number | null;
  lossCriminalLiabilityValue: number | null;
  lossVicariousLiabilityValue: number | null;
  lossSubstandardQualityValue: number | null;
  lossTypes: string[] | null;
  lossOtherText: string | null;
  lossNotes: string | null;
  riskSeverity1To5: number | null;
  riskLikelihood1To5: number | null;
  riskRatingProduct: number | null;
  riskClassification: IncidentRiskCategory | null;
  riskCategorySimple: 'Low' | 'Medium' | 'High' | null;
  metadata: Record<string, unknown> | null;
}>;

export async function updateIncident(incidentId: UUID, patch: UpdateIncidentPatch): Promise<Incident> {
  const { data: current, error: currentError } = await insforge.database
    .from('incidents')
    .select('id,company_id')
    .eq('id', incidentId)
    .maybeSingle();
  if (currentError) throw new Error(getErrorMessage(currentError));
  if (!current) throw new Error('Incident not found.');

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  };

  if (patch.category !== undefined) updateData.category = patch.category;
  if (patch.module !== undefined) updateData.module = patch.module;
  if (patch.subcategory !== undefined) updateData.subcategory = patch.subcategory;
  if (patch.title !== undefined) updateData.title = patch.title;
  if (patch.description !== undefined) updateData.description = patch.description;
  if (patch.severity !== undefined) updateData.severity = patch.severity;
  if (patch.status !== undefined) updateData.status = patch.status;
  if (patch.occurredAt !== undefined) updateData.occurred_at = patch.occurredAt;
  if (patch.location !== undefined) updateData.location = patch.location;
  if (patch.incidentType !== undefined) updateData.incident_type = patch.incidentType;
  if (patch.projectClient !== undefined) updateData.project_client = patch.projectClient;
  if (patch.natureOfIncident !== undefined) updateData.nature_of_incident = patch.natureOfIncident;
  if (patch.causeOfIncident !== undefined) updateData.cause_of_incident = patch.causeOfIncident;
  if (patch.affectedPerson !== undefined) updateData.affected_person = patch.affectedPerson;
  if (patch.affectedEmployeeId !== undefined) updateData.affected_person_id = patch.affectedEmployeeId;
  if (patch.affectedUserId !== undefined) updateData.affected_user_id = patch.affectedUserId;
  if (patch.affectedPersonName !== undefined) updateData.affected_person_name = patch.affectedPersonName;
  if (patch.reportedBy !== undefined) updateData.reported_by = patch.reportedBy;
  if (patch.reportedTo !== undefined) updateData.reported_to = patch.reportedTo;
  if (patch.copyToEmails !== undefined) updateData.copy_to_emails = patch.copyToEmails;
  if (patch.investigationRequired !== undefined) updateData.investigation_required = patch.investigationRequired;
  if (patch.unsafeActs !== undefined) updateData.immediate_causes_unsafe_acts = patch.unsafeActs;
  if (patch.unsafeConditions !== undefined) updateData.immediate_causes_unsafe_conditions = patch.unsafeConditions;
  if (patch.lossProductionValue !== undefined) updateData.loss_production_value = patch.lossProductionValue;
  if (patch.lossFinancialValue !== undefined) updateData.loss_financial_value = patch.lossFinancialValue;
  if (patch.lossReputationalValue !== undefined) updateData.loss_reputational_value = patch.lossReputationalValue;
  if (patch.lossDamageAssetValue !== undefined) updateData.loss_damage_asset_value = patch.lossDamageAssetValue;
  if (patch.lossIllnessInjuryValue !== undefined) updateData.loss_illness_injury_value = patch.lossIllnessInjuryValue;
  if (patch.lossIllnessValue !== undefined) updateData.loss_illness_value = patch.lossIllnessValue;
  if (patch.lossInjuryValue !== undefined) updateData.loss_injury_value = patch.lossInjuryValue;
  if (patch.lossCivilLiabilityValue !== undefined) updateData.loss_civil_liability_value = patch.lossCivilLiabilityValue;
  if (patch.lossCriminalLiabilityValue !== undefined) updateData.loss_criminal_liability_value = patch.lossCriminalLiabilityValue;
  if (patch.lossVicariousLiabilityValue !== undefined) updateData.loss_vicarious_liability_value = patch.lossVicariousLiabilityValue;
  if (patch.lossSubstandardQualityValue !== undefined) updateData.loss_substandard_quality_value = patch.lossSubstandardQualityValue;
  if (patch.lossTypes !== undefined) updateData.loss_types = patch.lossTypes;
  if (patch.lossOtherText !== undefined) updateData.loss_other_text = patch.lossOtherText;
  if (patch.lossNotes !== undefined) updateData.loss_notes = patch.lossNotes;
  if (patch.riskSeverity1To5 !== undefined) updateData.risk_severity_1_5 = patch.riskSeverity1To5;
  if (patch.riskLikelihood1To5 !== undefined) updateData.risk_likelihood_1_5 = patch.riskLikelihood1To5;
  if (patch.riskRatingProduct !== undefined) updateData.risk_rating_product = patch.riskRatingProduct;
  if (patch.riskClassification !== undefined) updateData.risk_classification = patch.riskClassification;
  if (patch.riskCategorySimple !== undefined) updateData.risk_category = patch.riskCategorySimple;
  if (patch.metadata !== undefined) updateData.metadata = patch.metadata;

  if (patch.status === 'closed') {
    const [{ count: openNcrCount, error: openNcrError }, { count: openActionCount, error: openActionError }] = await Promise.all([
      insforge.database
        .from('quality_ncrs')
        .select('*', { count: 'planned', head: true })
        .eq('source_entity_type', 'incident')
        .eq('source_entity_id', incidentId)
        .neq('status', 'closed'),
      insforge.database
        .from('incident_corrective_actions')
        .select('*', { count: 'planned', head: true })
        .eq('incident_id', incidentId)
        .neq('status', 'Closed')
    ]);
    if (openNcrError) throw new Error(getErrorMessage(openNcrError));
    if (openActionError) throw new Error(getErrorMessage(openActionError));
    if ((openNcrCount ?? 0) > 0) {
      throw new Error('Incident cannot be closed while linked NCRs are still open.');
    }
    if ((openActionCount ?? 0) > 0) {
      throw new Error('Incident cannot be closed while corrective actions are still open.');
    }
  }

  const data = await updateIncidentWithSchemaFallback((current as any).company_id as UUID, incidentId, updateData);
  return data;
}

export async function syncIncidentClosureFromLinks(incidentId: UUID): Promise<void> {
  const [{ data: incidentRow, error: incidentError }, { count: openNcrCount, error: openNcrError }, { count: openActionCount, error: openActionError }] = await Promise.all([
    insforge.database.from('incidents').select('id,company_id,status').eq('id', incidentId).maybeSingle(),
    insforge.database
      .from('quality_ncrs')
      .select('*', { count: 'planned', head: true })
      .eq('source_entity_type', 'incident')
      .eq('source_entity_id', incidentId)
      .neq('status', 'closed'),
    insforge.database
      .from('incident_corrective_actions')
      .select('*', { count: 'planned', head: true })
      .eq('incident_id', incidentId)
      .neq('status', 'Closed')
  ]);

  if (incidentError) throw new Error(getErrorMessage(incidentError));
  if (!incidentRow) return;
  if (openNcrError) throw new Error(getErrorMessage(openNcrError));
  if (openActionError) throw new Error(getErrorMessage(openActionError));

  const hasOpenLinks = (openNcrCount ?? 0) > 0 || (openActionCount ?? 0) > 0;
  const current = String((incidentRow as any).status ?? 'open');
  const next = hasOpenLinks ? 'investigating' : 'closed';
  if (current === next) return;

  const { error: updateError } = await insforge.database
    .from('incidents')
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq('company_id', (incidentRow as any).company_id)
    .eq('id', incidentId);
  if (updateError) throw new Error(getErrorMessage(updateError));
}

export async function deleteIncident(input: {
  companyId: UUID;
  incidentId: UUID;
  actorUserId: UUID;
}): Promise<void> {
  const { error } = await insforge.database
    .from('incidents')
    .delete()
    .eq('company_id', input.companyId)
    .eq('id', input.incidentId);
  if (error) throw new Error(getErrorMessage(error));

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'incidents.delete',
    entityType: 'incident',
    entityId: input.incidentId
  });
}

export const incidentsService = {
  listIncidents,
  listIncidentsWithFilters,
  createIncident,
  updateIncident,
  syncIncidentClosureFromLinks,
  deleteIncident
};
