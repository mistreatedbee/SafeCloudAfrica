import { insforge } from '../insforge/client';
import type { CompanyRole } from '../models/core';
import type { UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';
import { createQualityNcr } from './qualityNcrsService';

export type EnvironmentAspectStatus = 'active' | 'closed';
export type EnvironmentAspect = {
  id: UUID;
  company_id: UUID;
  aspect: string;
  impact: string;
  controls: string | null;
  status: EnvironmentAspectStatus;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};
export type EnvironmentMonitoring = {
  id: UUID;
  company_id: UUID;
  type: string;
  location: string | null;
  result: string;
  measured_at: string;
  created_by_user_id: UUID;
  created_at: string;
};

export type EnvMonitoringParameter = {
  parameterName: string;
  unitOfMeasure: string;
  testMethodOrStandard?: string;
  resultValue: string;
  complianceLimit: string;
  complianceStatus: 'Pass' | 'Fail';
};
export type EnvAirQualityResult = { parameter: string; resultValue: string; limitValue: string; status: 'Pass' | 'Fail' };
export type EnvDashboardStats = {
  openEnvironmentalNcrs: number;
  overdueCorrectiveActions: number;
  latestWaterComplianceStatus: 'Pass' | 'Fail' | 'No data';
  latestAirComplianceStatus: 'Pass' | 'Fail' | 'No data';
  wasteDisposalEntriesThisMonth: number;
  waterComplianceTrend: Array<{ month: string; pass: number; fail: number }>;
  airExceedanceTrend: Array<{ month: string; exceedances: number }>;
  wasteQuantityTrend: Array<{ month: string; category: string; quantity: number }>;
};

const WRITE_ROLES: CompanyRole[] = ['owner', 'admin', 'manager', 'supervisor', 'consultant', 'employee'];
const APPROVE_ROLES: CompanyRole[] = ['owner', 'admin'];
const yes = (r: CompanyRole | null, roles: CompanyRole[]) => !!r && roles.includes(r);
const score = (v: number, n: string) => {
  const x = Number(v);
  if (!Number.isFinite(x) || x < 1 || x > 5) throw new Error(`${n} must be between 1 and 5.`);
  return Math.round(x);
};

function monthKey(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function rolling12Months(): string[] {
  const now = new Date();
  return Array.from({ length: 12 }).map((_, idx) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - idx), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}

export async function listEnvironmentAspects(companyId: UUID): Promise<EnvironmentAspect[]> {
  const { data, error } = await insforge.database.from('environment_aspects').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(500);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as EnvironmentAspect[];
}
export async function countActiveEnvironmentAspects(companyId: UUID): Promise<number> {
  const { count, error } = await insforge.database.from('environment_aspects').select('*', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'active');
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
}
export async function listEnvironmentMonitoring(companyId: UUID, limit = 50): Promise<EnvironmentMonitoring[]> {
  const { data, error } = await insforge.database.from('environment_monitoring').select('*').eq('company_id', companyId).order('measured_at', { ascending: false }).limit(limit);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as EnvironmentMonitoring[];
}
export async function createEnvironmentMonitoring(input: { companyId: UUID; type: string; location?: string; result: string; measuredAt?: string; createdByUserId: UUID; }): Promise<EnvironmentMonitoring> {
  const { data, error } = await insforge.database.from('environment_monitoring').insert({ company_id: input.companyId, type: input.type, location: input.location ?? null, result: input.result, measured_at: input.measuredAt ?? new Date().toISOString(), created_by_user_id: input.createdByUserId }).select('*').single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create monitoring record.');
  await createActivityLog({ companyId: input.companyId, actorUserId: input.createdByUserId, action: 'environment.monitoring.create', entityType: 'environment_monitoring', entityId: (data as any).id as UUID });
  return data as EnvironmentMonitoring;
}

export async function listLegalRequirementOptions(companyId: UUID): Promise<Array<{ id: UUID; label: string }>> {
  const { data, error } = await insforge.database.from('legal_requirements').select('id, requirement_standard').eq('company_id', companyId).is('deleted_at', null).order('updated_at', { ascending: false }).limit(500);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []).map((r: any) => ({ id: r.id as UUID, label: String(r.requirement_standard ?? '') }));
}
export async function listRiskAssessmentOptions(companyId: UUID): Promise<Array<{ id: UUID; label: string }>> {
  const { data, error } = await insforge.database.from('risk_assessments').select('id, assessment_number, title').eq('company_id', companyId).order('created_at', { ascending: false }).limit(500);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []).map((r: any) => ({ id: r.id as UUID, label: `${r.assessment_number ?? 'RA'} - ${r.title ?? 'Untitled'}` }));
}

export async function listEnvImpactAssessments(companyId: UUID, filters?: any): Promise<any[]> {
  let q = insforge.database.from('env_impact_assessments').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(2000);
  if (filters?.fromDate) q = q.gte('created_at', filters.fromDate);
  if (filters?.toDate) q = q.lte('created_at', filters.toDate);
  if (filters?.responsibleUserId) q = q.eq('responsible_user_id', filters.responsibleUserId);
  if (filters?.search?.trim()) { const s = filters.search.trim(); q = q.or(`ref_number.ilike.%${s}%,activity_or_process.ilike.%${s}%,environmental_aspect_cause.ilike.%${s}%`); }
  const { data, error } = await q;
  if (error) throw new Error(getErrorMessage(error));
  const rows = data ?? [];
  return filters?.year ? rows.filter((r: any) => new Date(r.created_at).getFullYear() === filters.year) : rows;
}
export async function upsertEnvImpactAssessment(input: any): Promise<any> {
  if (!yes(input.actorRole ?? null, WRITE_ROLES)) throw new Error('You do not have permission to save EIA records.');
  const payload = {
    company_id: input.companyId, ref_number: String(input.refNumber ?? '').trim(), activity_or_process: String(input.activityOrProcess ?? '').trim(),
    environmental_aspect_cause: String(input.environmentalAspectCause ?? '').trim(), potential_impact_effect: String(input.potentialImpactEffect ?? '').trim(),
    legal_requirement_id: input.legalRequirementId ?? null, legal_requirement_label_snapshot: input.legalRequirementLabelSnapshot?.trim() || null, existing_controls: input.existingControls?.trim() || null,
    severity: score(input.severity, 'Severity'), likelihood: score(input.likelihood, 'Likelihood'), additional_controls: input.additionalControls?.trim() || null,
    responsible_user_id: input.responsibleUserId ?? null, responsible_external_name: input.responsibleExternalName?.trim() || null, review_date: input.reviewDate || null,
    linked_risk_assessment_ids: input.linkedRiskAssessmentIds ?? []
  };
  const query = input.id ? insforge.database.from('env_impact_assessments').update(payload).eq('company_id', input.companyId).eq('id', input.id) : insforge.database.from('env_impact_assessments').insert({ ...payload, created_by_user_id: input.actorUserId });
  const { data, error } = await query.select('*').single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to save EIA record.');
  await createActivityLog({ companyId: input.companyId, actorUserId: input.actorUserId, action: input.id ? 'environment.eia.update' : 'environment.eia.create', entityType: 'env_impact_assessment', entityId: (data as any).id as UUID });
  return data;
}

export async function listEnvRiskOpportunity(companyId: UUID, filters?: any): Promise<any[]> {
  let q = insforge.database.from('env_risk_opportunity').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(2000);
  if (filters?.status && filters.status !== 'all') q = q.eq('status', filters.status);
  if (filters?.fromDate) q = q.gte('created_at', filters.fromDate);
  if (filters?.toDate) q = q.lte('created_at', filters.toDate);
  if (filters?.responsibleUserId) q = q.eq('responsible_user_id', filters.responsibleUserId);
  if (filters?.search?.trim()) { const s = filters.search.trim(); q = q.or(`reference_number.ilike.%${s}%,risk_or_opportunity.ilike.%${s}%,description.ilike.%${s}%`); }
  const { data, error } = await q;
  if (error) throw new Error(getErrorMessage(error));
  const rows = data ?? [];
  return filters?.year ? rows.filter((r: any) => new Date(r.created_at).getFullYear() === filters.year) : rows;
}
export async function upsertEnvRiskOpportunity(input: any): Promise<any> {
  if (!yes(input.actorRole ?? null, WRITE_ROLES)) throw new Error('You do not have permission to save environmental risk/opportunity records.');
  const payload = {
    company_id: input.companyId, reference_number: String(input.referenceNumber ?? '').trim(), category: String(input.category ?? '').trim(),
    type: input.type, risk_or_opportunity: String(input.riskOrOpportunity ?? '').trim(), description: input.description?.trim() || null, cause: input.cause?.trim() || null,
    potential_impact: input.potentialImpact?.trim() || null, likelihood: score(input.likelihood, 'Likelihood'), severity_or_benefit: score(input.severityOrBenefit, 'Severity/Benefit'),
    existing_controls: input.existingControls?.trim() || null, action_required: input.actionRequired?.trim() || null, responsible_user_id: input.responsibleUserId ?? null,
    responsible_external_name: input.responsibleExternalName?.trim() || null, target_date: input.targetDate || null, status: input.status?.trim() || 'Open',
    linked_legal_requirement_id: input.linkedLegalRequirementId ?? null, linked_eia_id: input.linkedEiaId ?? null, linked_risk_assessment_ids: input.linkedRiskAssessmentIds ?? []
  };
  const query = input.id ? insforge.database.from('env_risk_opportunity').update(payload).eq('company_id', input.companyId).eq('id', input.id) : insforge.database.from('env_risk_opportunity').insert({ ...payload, created_by_user_id: input.actorUserId });
  const { data, error } = await query.select('*').single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to save environmental risk/opportunity record.');
  await createActivityLog({ companyId: input.companyId, actorUserId: input.actorUserId, action: input.id ? 'environment.risk_opportunity.update' : 'environment.risk_opportunity.create', entityType: 'env_risk_opportunity', entityId: (data as any).id as UUID });
  return data;
}

export async function listEnvWasteDisposal(companyId: UUID, filters?: any): Promise<any[]> {
  let q = insforge.database.from('env_waste_disposal').select('*').eq('company_id', companyId).order('date', { ascending: false }).limit(2000);
  if (filters?.status && filters.status !== 'all') q = q.eq('status', filters.status);
  if (filters?.fromDate) q = q.gte('date', filters.fromDate);
  if (filters?.toDate) q = q.lte('date', filters.toDate);
  if (filters?.responsibleUserId) q = q.eq('responsible_user_id', filters.responsibleUserId);
  if (filters?.search?.trim()) { const s = filters.search.trim(); q = q.or(`ref_no.ilike.%${s}%,waste_category.ilike.%${s}%,waste_type_name.ilike.%${s}%,site_department.ilike.%${s}%`); }
  const { data, error } = await q;
  if (error) throw new Error(getErrorMessage(error));
  const rows = data ?? [];
  return filters?.year ? rows.filter((r: any) => new Date(r.date).getFullYear() === filters.year) : rows;
}
export async function upsertEnvWasteDisposal(input: any): Promise<any> {
  if (!yes(input.actorRole ?? null, WRITE_ROLES)) throw new Error('You do not have permission to save waste disposal records.');
  if (input.status === 'Approved' && !yes(input.actorRole ?? null, APPROVE_ROLES)) throw new Error('Only owner/admin can approve waste disposal records.');
  const payload = {
    company_id: input.companyId, ref_no: String(input.refNo ?? '').trim(), date: input.date, site_department: String(input.siteDepartment ?? '').trim(),
    waste_category: String(input.wasteCategory ?? '').trim(), waste_type_name: String(input.wasteTypeName ?? '').trim(), waste_classification: input.wasteClassification,
    quantity_value: Number(input.quantityValue), quantity_unit: String(input.quantityUnit ?? '').trim(), storage_location: input.storageLocation?.trim() || null,
    disposal_method: input.disposalMethod?.trim() || null, disposal_site: input.disposalSite?.trim() || null, contractor_name: input.contractorName?.trim() || null,
    contractor_licence_file_ids: input.contractorLicenceFileIds ?? [], contractor_licence_expiry_date: input.contractorLicenceExpiryDate || null,
    facility_name: input.facilityName?.trim() || null, facility_permit_file_ids: input.facilityPermitFileIds ?? [], facility_permit_expiry_date: input.facilityPermitExpiryDate || null,
    responsible_user_id: input.responsibleUserId ?? null, responsible_external_name: input.responsibleExternalName?.trim() || null, remarks: input.remarks?.trim() || null,
    non_conformances_deviations: input.nonConformancesDeviations ?? [], reviewed_by_user_id: input.reviewedByUserId ?? null, approved_by_user_id: input.approvedByUserId ?? null,
    approved_at: input.approvedAt || null, status: input.status ?? 'Draft', escalation_flag: false
  };
  const query = input.id ? insforge.database.from('env_waste_disposal').update(payload).eq('company_id', input.companyId).eq('id', input.id) : insforge.database.from('env_waste_disposal').insert({ ...payload, created_by_user_id: input.actorUserId });
  const { data, error } = await query.select('*').single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to save waste disposal record.');
  await createActivityLog({ companyId: input.companyId, actorUserId: input.actorUserId, action: input.id ? 'environment.waste.update' : 'environment.waste.create', entityType: 'env_waste_disposal', entityId: (data as any).id as UUID });
  return data;
}

async function createNcrFromEnv(input: { companyId: UUID; actorUserId: UUID; source: 'env_water_monitoring' | 'env_air_quality'; referenceId: UUID; summary: string; riskLevel?: string | null; legalReference?: string | null; }): Promise<UUID> {
  const level = String(input.riskLevel ?? '').toLowerCase();
  const severity = level.includes('critical') ? 'critical' : level.includes('high') ? 'high' : level.includes('low') ? 'low' : 'medium';
  const ncr = await createQualityNcr({
    companyId: input.companyId,
    title: input.summary.slice(0, 180),
    description: `${input.summary}${input.legalReference ? `\nLegal reference: ${input.legalReference}` : ''}`,
    severity: severity as any,
    createdByUserId: input.actorUserId,
    source_entity_type: input.source,
    source_entity_id: input.referenceId
  });
  await createActivityLog({ companyId: input.companyId, actorUserId: input.actorUserId, action: 'environment.ncr.auto_create', entityType: 'quality_ncr', entityId: ncr.id });
  return ncr.id;
}

export async function createNcrFromEnvironmentalNonCompliance(input: { companyId: UUID; actorUserId: UUID; sourceType: 'Environmental Water Monitoring' | 'Environmental Air Quality'; referenceId: UUID; summary: string; riskLevel?: string | null; legalReference?: string | null; }): Promise<{ ncrId: UUID }> {
  const source = input.sourceType === 'Environmental Water Monitoring' ? 'env_water_monitoring' : 'env_air_quality';
  const ncrId = await createNcrFromEnv({ companyId: input.companyId, actorUserId: input.actorUserId, source, referenceId: input.referenceId, summary: input.summary, riskLevel: input.riskLevel, legalReference: input.legalReference });
  return { ncrId };
}

export async function listEnvWaterMonitoring(companyId: UUID, filters?: any): Promise<any[]> {
  let q = insforge.database.from('env_water_monitoring').select('*').eq('company_id', companyId).order('sampling_date', { ascending: false }).limit(2000);
  if (filters?.status && filters.status !== 'all') q = q.eq('overall_compliance_status', filters.status);
  if (filters?.fromDate) q = q.gte('sampling_date', filters.fromDate);
  if (filters?.toDate) q = q.lte('sampling_date', filters.toDate);
  if (filters?.responsibleUserId) q = q.eq('reviewed_by_user_id', filters.responsibleUserId);
  if (filters?.search?.trim()) { const s = filters.search.trim(); q = q.or(`reference_number.ilike.%${s}%,site_facility_name.ilike.%${s}%,gps_location_or_sampling_point_id.ilike.%${s}%`); }
  const { data, error } = await q;
  if (error) throw new Error(getErrorMessage(error));
  const rows = data ?? [];
  return filters?.year ? rows.filter((r: any) => new Date(r.sampling_date).getFullYear() === filters.year) : rows;
}

export async function upsertEnvWaterMonitoring(input: any): Promise<any> {
  if (!yes(input.actorRole ?? null, WRITE_ROLES)) throw new Error('You do not have permission to save water monitoring records.');
  if (!Array.isArray(input.parameters) || input.parameters.length < 1) throw new Error('At least one monitoring parameter is required.');
  const parameters: EnvMonitoringParameter[] = input.parameters.map((p: any) => ({
    parameterName: String(p.parameterName ?? '').trim(),
    unitOfMeasure: String(p.unitOfMeasure ?? '').trim(),
    testMethodOrStandard: String(p.testMethodOrStandard ?? '').trim(),
    resultValue: String(p.resultValue ?? '').trim(),
    complianceLimit: String(p.complianceLimit ?? '').trim(),
    complianceStatus: String(p.complianceStatus ?? 'Pass').toLowerCase() === 'fail' ? 'Fail' : 'Pass'
  }));
  const overall = parameters.some((p) => p.complianceStatus === 'Fail') ? 'Fail' : 'Pass';

  const payload = {
    company_id: input.companyId, reference_number: String(input.referenceNumber ?? '').trim(), site_facility_name: String(input.siteFacilityName ?? '').trim(),
    gps_location_or_sampling_point_id: String(input.gpsLocationOrSamplingPointId ?? '').trim(), water_type: String(input.waterType ?? '').trim(),
    sampling_date: input.samplingDate, sampling_time: input.samplingTime || null, purpose: input.purpose?.trim() || null, scope: input.scope?.trim() || null,
    legal_requirement_id: input.legalRequirementId ?? null, legal_reference_snapshot: input.legalReferenceSnapshot?.trim() || null, sample_type: input.sampleType?.trim() || null,
    sampling_method_used: input.samplingMethodUsed?.trim() || null, weather_conditions: input.weatherConditions?.trim() || null, sampler_name: input.samplerName?.trim() || null,
    sampler_company: input.samplerCompany?.trim() || null, laboratory_used: input.laboratoryUsed?.trim() || null, visual_condition: input.visualCondition?.trim() || null,
    odour: input.odour?.trim() || null, oil_sheen: input.oilSheen?.trim() || null, sediment_presence: input.sedimentPresence?.trim() || null,
    blocked_drains_or_overflows: input.blockedDrainsOrOverflows?.trim() || null, photo_file_ids: input.photoFileIds ?? [], parameters,
    overall_compliance_status: overall, breached_legislation_or_permit_reference: input.breachedLegislationOrPermitReference?.trim() || null,
    assessed_environmental_risk: input.assessedEnvironmentalRisk ?? null, potential_cause: input.potentialCause?.trim() || null,
    controls_effectiveness_review: input.controlsEffectivenessReview?.trim() || null, conclusion_compliance_statement: input.conclusionComplianceStatement?.trim() || null,
    reviewed_by_user_id: input.reviewedByUserId ?? null, approved_by_user_id: input.approvedByUserId ?? null, approved_at: input.approvedAt || null,
    laboratory_reports_file_ids: input.laboratoryReportsFileIds ?? [], calibration_certificates_file_ids: input.calibrationCertificatesFileIds ?? [],
    permits_licences_file_ids: input.permitsLicencesFileIds ?? [], sampling_locations_file_ids: input.samplingLocationsFileIds ?? []
  };

  const query = input.id ? insforge.database.from('env_water_monitoring').update(payload).eq('company_id', input.companyId).eq('id', input.id) : insforge.database.from('env_water_monitoring').insert({ ...payload, created_by_user_id: input.actorUserId });
  const { data, error } = await query.select('*').single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to save water monitoring record.');
  const saved = data as any;

  if (overall === 'Fail') {
    const failed = parameters.filter((p) => p.complianceStatus === 'Fail').map((p) => `${p.parameterName} ${p.resultValue} > ${p.complianceLimit}`).join('; ');
    const ncrId = await createNcrFromEnv({ companyId: input.companyId, actorUserId: input.actorUserId, source: 'env_water_monitoring', referenceId: saved.id, summary: `Water monitoring ${saved.reference_number} failed: ${failed}`, riskLevel: input.assessedEnvironmentalRisk, legalReference: input.legalReferenceSnapshot || input.breachedLegislationOrPermitReference });
    await insforge.database.from('env_water_monitoring').update({ system_generated_capa_id: ncrId, updated_at: new Date().toISOString() }).eq('company_id', input.companyId).eq('id', saved.id);
    saved.system_generated_capa_id = ncrId;
  }

  await createActivityLog({ companyId: input.companyId, actorUserId: input.actorUserId, action: input.id ? 'environment.water.update' : 'environment.water.create', entityType: 'env_water_monitoring', entityId: saved.id });
  return saved;
}

export async function listEnvAirQuality(companyId: UUID, filters?: any): Promise<any[]> {
  let q = insforge.database.from('env_air_quality').select('*').eq('company_id', companyId).order('monitoring_date', { ascending: false }).limit(2000);
  if (filters?.status && filters.status !== 'all') q = q.eq('overall_status', filters.status);
  if (filters?.fromDate) q = q.gte('monitoring_date', filters.fromDate);
  if (filters?.toDate) q = q.lte('monitoring_date', filters.toDate);
  if (filters?.responsibleUserId) q = q.eq('reviewed_by_user_id', filters.responsibleUserId);
  if (filters?.search?.trim()) { const s = filters.search.trim(); q = q.or(`reference_number.ilike.%${s}%,monitoring_location.ilike.%${s}%,method_used.ilike.%${s}%`); }
  const { data, error } = await q;
  if (error) throw new Error(getErrorMessage(error));
  const rows = data ?? [];
  return filters?.year ? rows.filter((r: any) => new Date(r.monitoring_date).getFullYear() === filters.year) : rows;
}

export async function upsertEnvAirQuality(input: any): Promise<any> {
  if (!yes(input.actorRole ?? null, WRITE_ROLES)) throw new Error('You do not have permission to save air quality records.');
  if (!Array.isArray(input.results) || input.results.length < 1) throw new Error('At least one result row is required.');
  const results: EnvAirQualityResult[] = input.results.map((r: any) => ({ parameter: String(r.parameter ?? '').trim(), resultValue: String(r.resultValue ?? '').trim(), limitValue: String(r.limitValue ?? '').trim(), status: String(r.status ?? 'Pass').toLowerCase() === 'fail' ? 'Fail' : 'Pass' }));
  const overall = results.some((r) => r.status === 'Fail') ? 'Fail' : 'Pass';

  const payload = {
    company_id: input.companyId, reference_number: String(input.referenceNumber ?? '').trim(), emission_source_categories: (input.emissionSourceCategories ?? []).map((x: any) => String(x).trim()).filter(Boolean),
    legal_requirement_ids: input.legalRequirementIds ?? [], legal_references_snapshot: input.legalReferencesSnapshot ?? [], monitoring_frequency: String(input.monitoringFrequency ?? '').trim(),
    monitoring_date: input.monitoringDate, monitoring_time: input.monitoringTime || null, monitoring_location: String(input.monitoringLocation ?? '').trim(),
    method_used: String(input.methodUsed ?? '').trim(), equipment_id: input.equipmentId?.trim() || null, calibration_status: input.calibrationStatus?.trim() || null,
    weather_conditions: input.weatherConditions?.trim() || null, conducted_by_name: input.conductedByName?.trim() || null, conducted_by_company: input.conductedByCompany?.trim() || null,
    results, auto_flag_exceedances: true, overall_status: overall, non_conformance_notes: input.nonConformanceNotes?.trim() || null,
    trend_analysis_notes: input.trendAnalysisNotes?.trim() || null, attachment_file_ids: input.attachmentFileIds ?? [], reviewed_by_user_id: input.reviewedByUserId ?? null,
    approved_by_user_id: input.approvedByUserId ?? null, approved_at: input.approvedAt || null
  };

  const query = input.id ? insforge.database.from('env_air_quality').update(payload).eq('company_id', input.companyId).eq('id', input.id) : insforge.database.from('env_air_quality').insert({ ...payload, created_by_user_id: input.actorUserId });
  const { data, error } = await query.select('*').single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to save air quality record.');
  const saved = data as any;

  if (overall === 'Fail') {
    const failed = results.filter((r) => r.status === 'Fail').map((r) => `${r.parameter} ${r.resultValue} > ${r.limitValue}`).join('; ');
    const ncrId = await createNcrFromEnv({ companyId: input.companyId, actorUserId: input.actorUserId, source: 'env_air_quality', referenceId: saved.id, summary: `Air quality ${saved.reference_number} exceedances: ${failed}`, riskLevel: 'high', legalReference: (input.legalReferencesSnapshot ?? []).join('; ') });
    await insforge.database.from('env_air_quality').update({ system_generated_capa_id: ncrId, updated_at: new Date().toISOString() }).eq('company_id', input.companyId).eq('id', saved.id);
    saved.system_generated_capa_id = ncrId;
  }

  await createActivityLog({ companyId: input.companyId, actorUserId: input.actorUserId, action: input.id ? 'environment.air.update' : 'environment.air.create', entityType: 'env_air_quality', entityId: saved.id });
  return saved;
}

export async function getEnvironmentDashboardStats(companyId: UUID): Promise<EnvDashboardStats> {
  const monthStart = new Date(); monthStart.setDate(1);
  const trendFrom = new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1).toISOString().slice(0, 10);
  const [ncr, overdue, waterLatest, airLatest, wasteMonth, waterTrend, airTrend, wasteTrend] = await Promise.all([
    insforge.database.from('quality_ncrs').select('*', { count: 'exact', head: true }).eq('company_id', companyId).in('source_entity_type', ['env_water_monitoring', 'env_air_quality']).neq('status', 'closed'),
    insforge.database.from('tasks').select('*', { count: 'exact', head: true }).eq('company_id', companyId).eq('category', 'capa').eq('status', 'overdue'),
    insforge.database.from('env_water_monitoring').select('overall_compliance_status, sampling_date').eq('company_id', companyId).order('sampling_date', { ascending: false }).limit(1),
    insforge.database.from('env_air_quality').select('overall_status, monitoring_date').eq('company_id', companyId).order('monitoring_date', { ascending: false }).limit(1),
    insforge.database.from('env_waste_disposal').select('*', { count: 'exact', head: true }).eq('company_id', companyId).gte('date', monthStart.toISOString().slice(0, 10)),
    insforge.database.from('env_water_monitoring').select('sampling_date, overall_compliance_status').eq('company_id', companyId).gte('sampling_date', trendFrom).limit(5000),
    insforge.database.from('env_air_quality').select('monitoring_date, overall_status').eq('company_id', companyId).gte('monitoring_date', trendFrom).limit(5000),
    insforge.database.from('env_waste_disposal').select('date, waste_category, quantity_value').eq('company_id', companyId).gte('date', trendFrom).limit(5000)
  ]);
  if (ncr.error || overdue.error || waterLatest.error || airLatest.error || wasteMonth.error || waterTrend.error || airTrend.error || wasteTrend.error) throw new Error(getErrorMessage(ncr.error || overdue.error || waterLatest.error || airLatest.error || wasteMonth.error || waterTrend.error || airTrend.error || wasteTrend.error as any));
  const months = rolling12Months();
  const wm = new Map<string, { pass: number; fail: number }>(months.map((m) => [m, { pass: 0, fail: 0 }]));
  ((waterTrend.data ?? []) as any[]).forEach((r) => { const m = monthKey(r.sampling_date); const b = wm.get(m); if (!b) return; if (String(r.overall_compliance_status) === 'Fail') b.fail += 1; else b.pass += 1; });
  const am = new Map<string, number>(months.map((m) => [m, 0]));
  ((airTrend.data ?? []) as any[]).forEach((r) => { if (String(r.overall_status) !== 'Fail') return; const m = monthKey(r.monitoring_date); am.set(m, (am.get(m) ?? 0) + 1); });
  const wasteQuantityTrend = ((wasteTrend.data ?? []) as any[]).map((r) => ({ month: monthKey(r.date), category: String(r.waste_category ?? 'Unknown'), quantity: Number(r.quantity_value ?? 0) }));
  const latestW = ((waterLatest.data ?? [])[0] as any)?.overall_compliance_status ?? 'No data';
  const latestA = ((airLatest.data ?? [])[0] as any)?.overall_status ?? 'No data';
  return { openEnvironmentalNcrs: ncr.count ?? 0, overdueCorrectiveActions: overdue.count ?? 0, latestWaterComplianceStatus: latestW, latestAirComplianceStatus: latestA, wasteDisposalEntriesThisMonth: wasteMonth.count ?? 0, waterComplianceTrend: months.map((m) => ({ month: m, ...(wm.get(m) ?? { pass: 0, fail: 0 }) })), airExceedanceTrend: months.map((m) => ({ month: m, exceedances: am.get(m) ?? 0 })), wasteQuantityTrend };
}

export async function runEnvironmentReminderSweep(companyId: UUID): Promise<void> {
  const { data, error } = await insforge.database.rpc('get_env_expiry_reminders', { p_company_id: companyId });
  if (error) throw new Error(getErrorMessage(error));
  const reminders = (data ?? []) as Array<{ message: string; days_remaining: number }>;
  if (!reminders.length) return;

  const { data: members, error: membersErr } = await insforge.database.from('company_memberships').select('user_id').eq('company_id', companyId).in('role', ['owner', 'admin', 'manager', 'supervisor']);
  if (membersErr) throw new Error(getErrorMessage(membersErr));
  const userIds = Array.from(new Set((members ?? []).map((m: any) => m.user_id as UUID)));
  if (!userIds.length) return;

  const payload: any[] = [];
  reminders.forEach((r) => userIds.forEach((uid) => payload.push({ company_id: companyId, user_id: uid, title: 'Environmental Reminder', message: r.message, severity: r.days_remaining < 0 ? 'high' : r.days_remaining <= 7 ? 'medium' : 'low' })));
  const { error: insertErr } = await insforge.database.from('notifications').insert(payload);
  if (insertErr) throw new Error(getErrorMessage(insertErr));
}
