import { insforge } from '../insforge/client';
import type { Risk, UUID } from '../models/entities';
import type { ModuleKey } from '../models/core';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';
import {
  DEFAULT_RISK_INDEX_LOW_MAX,
  DEFAULT_RISK_INDEX_MEDIUM_MAX,
  computeRawRisk,
  computeResidualRisk,
  type RiskIndex
} from '../../utils/riskScoring';

// Risk Assessment Types
export type RiskAssessmentSourceType = 'incident' | 'ncr' | 'change' | null;

export type RiskAssessmentStatus =
  | 'draft'
  | 'in-progress'
  | 'reviewed'
  | 'approved'
  | 'closed'
  | 'active'
  | 'review_required'
  | 'under_review'
  | 'archived';

export interface RiskAssessment {
  id: UUID;
  company_id: UUID;
  assessment_type: AssessmentType;
  assessment_number: string;
  title: string;
  description: string | null;
  process_involved: string | null;
  department_id: UUID | null;
  location: string | null;
  scope: string | null;
  objective: string | null;
  task_id: UUID | null;
  task_name: string | null;
  task_steps: string | null;
  is_critical: boolean;
  is_prework: boolean;
  source_entity_type: RiskAssessmentSourceType;
  source_entity_id: UUID | null;
  status: RiskAssessmentStatus;
  assessment_date: string | null;
  reviewed_by_user_id: UUID | null;
  reviewed_at: string | null;
  approved_by_user_id: UUID | null;
  approved_at: string | null;
  last_approved_at: string | null;
  next_review_date: string | null;
  reference: string | null;
  area_location: string | null;
  activity_process_operation: string | null;
  risk_assessor_user_id: UUID | null;
  risk_assessor_name: string | null;
  responsible_personnel_user_id: UUID | null;
  responsible_personnel_name: string | null;
  target_date: string | null;
  completion_date: string | null;
  total_risks: number;
  high_risks: number;
  medium_risks: number;
  low_risks: number;
  assessment_document_url: string | null;
  evidence_document_url: string | null;
  review_due_at: string | null;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
}

export type TypeOfRisk = 'Safety' | 'Health' | 'Environmental' | 'Quality' | 'Operational' | 'Financial';

export interface RiskAssessmentItem {
  id: UUID;
  risk_assessment_id: UUID;
  hazard_description: string;
  hazard_source: string | null;
  likelihood: number;
  consequence: number;
  risk_rating: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  affected_personnel: string | null;
  exposure_frequency: string | null;
  exposure_duration: string | null;
  existing_controls: string | null;
  control_effectiveness: string | null;
  residual_risk_rating: number | null;
  residual_risk_level: 'low' | 'medium' | 'high' | 'critical' | null;
  improvement_actions: string | null;
  responsible_user_id: UUID | null;
  action_due_date: string | null;
  action_status: 'pending' | 'in-progress' | 'completed';
  supporting_evidence_url: string | null;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
  // Extended spec fields
  hazard?: string | null;
  aspect_hazard_flaw?: string | null;
  potential_risk?: string | null;
  risk?: string | null;
  who_is_at_risk?: string | null;
  type_of_risk?: TypeOfRisk | null;
  severity_s?: number | null;
  likelihood_l?: number | null;
  raw_risk_rating_rr?: number | null;
  risk_index?: RiskIndex | null;
  residual_severity_s?: number | null;
  residual_likelihood_l?: number | null;
  residual_rr?: number | null;
  residual_risk_index?: RiskIndex | null;
  additional_controls?: string | null;
  current_year_non_conformances?: string | null;
  current_year_ncr_ids?: string[] | null;
  by_who?: string | null;
  by_when?: string | null;
  responsible_person?: string | null;
  due_date?: string | null;
  evidence_uploads?: unknown;
}

export type ListRisksInput = {
  companyId: UUID;
  module?: ModuleKey;
  status?: 'open' | 'mitigated' | 'closed';
  limit?: number;
};

export async function listRisks(input: ListRisksInput): Promise<Risk[]> {
  const base = insforge.database.from('risks').select('*').eq('company_id', input.companyId);
  const q1 = input.module ? base.eq('module', input.module) : base;
  const q2 = input.status ? q1.eq('status', input.status) : q1;
  const { data, error } = await q2.order('created_at', { ascending: false }).limit(input.limit ?? 200);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as Risk[];
}

export async function countRisks(companyId: UUID, input?: { module?: ModuleKey; status?: Risk['status'] }): Promise<number> {
  const base = insforge.database.from('risks').select('*', { count: 'exact', head: true }).eq('company_id', companyId);
  const q1 = input?.module ? base.eq('module', input.module) : base;
  const q2 = input?.status ? q1.eq('status', input.status) : q1;
  const { count, error } = await q2;
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
}

export type CreateRiskInput = {
  companyId: UUID;
  module: ModuleKey;
  title: string;
  description?: string;
  hazard?: string;
  controls?: string;
  likelihood: number;
  consequence: number;
  createdByUserId: UUID;
};

export async function createRisk(input: CreateRiskInput): Promise<Risk> {
  const riskRating = Math.max(1, Number(input.likelihood || 1) * Number(input.consequence || 1));
  const { data, error } = await insforge.database
    .from('risks')
    .insert({
      company_id: input.companyId,
      module: input.module,
      title: input.title,
      description: input.description ?? null,
      hazard: input.hazard ?? null,
      controls: input.controls ?? null,
      likelihood: input.likelihood,
      consequence: input.consequence,
      risk_rating: riskRating,
      status: 'open',
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create risk.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'risks.create',
    entityType: 'risk',
    entityId: (data as any).id as UUID
  });

  return data as Risk;
}

// Risk Assessment Functions

/** Fetch company risk index thresholds (defaults: low_max=6, medium_max=15). */
export async function getRiskAssessmentThresholds(companyId: UUID): Promise<{ lowMax: number; mediumMax: number }> {
  const { data, error } = await insforge.database
    .from('risk_assessment_settings')
    .select('key, value')
    .eq('company_id', companyId)
    .in('key', ['risk_index_low_max', 'risk_index_medium_max']);
  if (error) {
    return { lowMax: DEFAULT_RISK_INDEX_LOW_MAX, mediumMax: DEFAULT_RISK_INDEX_MEDIUM_MAX };
  }
  const rows = (data ?? []) as { key: string; value: number }[];
  const lowMax =
    rows.find((r) => r.key === 'risk_index_low_max')?.value ?? DEFAULT_RISK_INDEX_LOW_MAX;
  const mediumMax =
    rows.find((r) => r.key === 'risk_index_medium_max')?.value ?? DEFAULT_RISK_INDEX_MEDIUM_MAX;
  return { lowMax, mediumMax };
}

function calculateRiskLevel(likelihood: number, consequence: number): 'low' | 'medium' | 'high' | 'critical' {
  const rating = likelihood * consequence;
  if (rating <= 4) return 'low';
  if (rating <= 9) return 'medium';
  if (rating <= 15) return 'high';
  return 'critical';
}

export type AssessmentType = 'baseline' | 'task' | 'task-based' | 'critical_task' | 'pre_work';

function generateAssessmentNumber(type: AssessmentType): string {
  const prefix =
    type === 'baseline' ? 'RA-BL' : type === 'task' || type === 'task-based' ? 'RA-TB' : type === 'critical_task' ? 'RA-CT' : 'RA-PW';
  const date = new Date();
  const yyyymm = date.getFullYear().toString() + String(date.getMonth() + 1).padStart(2, '0');
  const random = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `${prefix}-${yyyymm}-${random}`;
}

export type CreateRiskAssessmentInput = {
  companyId: UUID;
  assessmentType: AssessmentType;
  title: string;
  description?: string;
  processInvolved?: string;
  departmentId?: UUID;
  location?: string;
  scope?: string;
  objective?: string;
  taskId?: UUID;
  taskName?: string;
  taskSteps?: string;
  isCritical?: boolean;
  isPrework?: boolean;
  sourceEntityType?: Exclude<RiskAssessmentSourceType, null>;
  sourceEntityId?: UUID;
  reviewDueAt?: string;
  createdByUserId: UUID;
  areaLocation?: string;
  activityProcessOperation?: string;
  nextReviewDate?: string;
  reference?: string;
  riskAssessorUserId?: UUID;
  riskAssessorName?: string;
  responsiblePersonnelUserId?: UUID;
  responsiblePersonnelName?: string;
  targetDate?: string;
  completionDate?: string;
};

export async function createRiskAssessment(input: CreateRiskAssessmentInput): Promise<RiskAssessment> {
  const assessmentNumber = generateAssessmentNumber(input.assessmentType);
  
  const { data, error } = await insforge.database
    .from('risk_assessments')
    .insert({
      company_id: input.companyId,
      assessment_type: input.assessmentType,
      assessment_number: assessmentNumber,
      title: input.title,
      description: input.description ?? null,
      process_involved: input.processInvolved ?? null,
      department_id: input.departmentId ?? null,
      location: input.location ?? null,
      scope: input.scope ?? null,
      objective: input.objective ?? null,
      task_id: input.taskId ?? null,
      task_name: input.taskName ?? null,
      task_steps: input.taskSteps ?? null,
      is_critical: !!input.isCritical,
      is_prework: !!input.isPrework,
      source_entity_type: input.sourceEntityType ?? null,
      source_entity_id: input.sourceEntityId ?? null,
      status: 'draft',
      review_due_at: input.reviewDueAt ?? null,
      total_risks: 0,
      high_risks: 0,
      medium_risks: 0,
      low_risks: 0,
      created_by_user_id: input.createdByUserId,
      area_location: input.areaLocation ?? null,
      activity_process_operation: input.activityProcessOperation ?? null,
      next_review_date: input.nextReviewDate ?? null,
      reference: input.reference ?? null,
      risk_assessor_user_id: input.riskAssessorUserId ?? null,
      risk_assessor_name: input.riskAssessorName ?? null,
      responsible_personnel_user_id: input.responsiblePersonnelUserId ?? null,
      responsible_personnel_name: input.responsiblePersonnelName ?? null,
      target_date: input.targetDate ?? null,
      completion_date: input.completionDate ?? null
    })
    .select('*')
    .single();
  
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create risk assessment');
  
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'risk_assessments.create',
    entityType: 'risk_assessment',
    entityId: (data as any).id as UUID
  });

  const created = data as RiskAssessment;

  // Notify the creator that the assessment has been logged
  const { notifyRiskAssessmentCreated } = await import('./notificationsService');
  await notifyRiskAssessmentCreated(
    input.companyId,
    input.createdByUserId,
    created.title,
    !!input.isCritical
  );

  return created;
}

export type ListRiskAssessmentsInput = {
  companyId: UUID;
  assessmentType?: AssessmentType;
  status?: RiskAssessmentStatus;
  limit?: number;
  area?: string;
  activity?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
};

export async function listRiskAssessments(input: ListRiskAssessmentsInput): Promise<RiskAssessment[]> {
  let query = insforge.database
    .from('risk_assessments')
    .select('*')
    .eq('company_id', input.companyId);

  if (input.assessmentType) {
    query = query.eq('assessment_type', input.assessmentType);
  }
  if (input.status) {
    query = query.eq('status', input.status);
  }
  if (input.area?.trim()) {
    query = query.ilike('area_location', `%${input.area.trim()}%`);
  }
  if (input.activity?.trim()) {
    query = query.ilike('activity_process_operation', `%${input.activity.trim()}%`);
  }
  if (input.fromDate) {
    query = query.gte('created_at', input.fromDate);
  }
  if (input.toDate) {
    query = query.lte('created_at', input.toDate);
  }
  if (input.search?.trim()) {
    const term = `%${input.search.trim()}%`;
    query = query.or(`title.ilike.${term},assessment_number.ilike.${term},reference.ilike.${term}`);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 200);

  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as RiskAssessment[];
}

export async function getRiskAssessment(assessmentId: UUID): Promise<RiskAssessment> {
  const { data, error } = await insforge.database
    .from('risk_assessments')
    .select('*')
    .eq('id', assessmentId)
    .single();
  
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Risk assessment not found');
  
  return data as RiskAssessment;
}

export type AddRiskAssessmentItemInput = {
  companyId: UUID;
  riskAssessmentId: UUID;
  hazardDescription: string;
  hazardSource?: string;
  likelihood: number;
  consequence: number;
  affectedPersonnel?: string;
  exposureFrequency?: string;
  exposureDuration?: string;
  existingControls?: string;
  controlEffectiveness?: string;
  improvementActions?: string;
  responsibleUserId?: UUID;
  actionDueDate?: string;
  supportingEvidenceUrl?: string;
  createdByUserId: UUID;
};

export type AddRiskAssessmentLineItemInput = {
  companyId: UUID;
  riskAssessmentId: UUID;
  createdByUserId: UUID;
  hazard?: string;
  aspectHazardFlaw?: string;
  potentialRisk?: string;
  risk?: string;
  whoIsAtRisk?: string;
  typeOfRisk?: TypeOfRisk;
  severityS: number;
  likelihoodL: number;
  existingControls?: string;
  additionalControls?: string;
  residualSeverityS?: number;
  residualLikelihoodL?: number;
  currentYearNonConformances?: string;
  currentYearNcrIds?: UUID[];
  byWho?: string;
  byWhen?: string;
  responsiblePerson?: string;
  dueDate?: string;
  hazardDescription?: string;
};

export async function addRiskAssessmentItem(input: AddRiskAssessmentItemInput): Promise<RiskAssessmentItem> {
  const riskRating = input.likelihood * input.consequence;
  const riskLevel = calculateRiskLevel(input.likelihood, input.consequence);
  
  const { data, error } = await insforge.database
    .from('risk_assessment_items')
    .insert({
      risk_assessment_id: input.riskAssessmentId,
      hazard_description: input.hazardDescription,
      hazard_source: input.hazardSource ?? null,
      likelihood: input.likelihood,
      consequence: input.consequence,
      risk_rating: riskRating,
      risk_level: riskLevel,
      affected_personnel: input.affectedPersonnel ?? null,
      exposure_frequency: input.exposureFrequency ?? null,
      exposure_duration: input.exposureDuration ?? null,
      existing_controls: input.existingControls ?? null,
      control_effectiveness: input.controlEffectiveness ?? null,
      residual_risk_rating: null,
      residual_risk_level: null,
      improvement_actions: input.improvementActions ?? null,
      responsible_user_id: input.responsibleUserId ?? null,
      action_due_date: input.actionDueDate ?? null,
      action_status: 'pending',
      supporting_evidence_url: input.supportingEvidenceUrl ?? null,
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to add risk assessment item');
  
  // Update risk assessment counts
  await updateRiskAssessmentCounts(input.riskAssessmentId);
  
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'risk_assessment_items.create',
    entityType: 'risk_assessment_item',
    entityId: (data as any).id as UUID
  });
  
  return data as RiskAssessmentItem;
}

export async function addRiskAssessmentLineItem(input: AddRiskAssessmentLineItemInput): Promise<RiskAssessmentItem> {
  const { lowMax, mediumMax } = await getRiskAssessmentThresholds(input.companyId);
  const { rr, riskIndex } = computeRawRisk(input.severityS, input.likelihoodL, lowMax, mediumMax);
  let residualRr: number | null = null;
  let residualRiskIndex: RiskIndex | null = null;
  if (input.residualSeverityS != null && input.residualLikelihoodL != null) {
    const res = computeResidualRisk(input.residualSeverityS, input.residualLikelihoodL, lowMax, mediumMax);
    residualRr = res.residualRR;
    residualRiskIndex = res.residualRiskIndex;
  }
  const { data, error } = await insforge.database
    .from('risk_assessment_items')
    .insert({
      risk_assessment_id: input.riskAssessmentId,
      hazard_description: input.hazardDescription ?? input.hazard ?? '',
      hazard: input.hazard ?? null,
      aspect_hazard_flaw: input.aspectHazardFlaw ?? null,
      potential_risk: input.potentialRisk ?? null,
      risk: input.risk ?? null,
      who_is_at_risk: input.whoIsAtRisk ?? null,
      type_of_risk: input.typeOfRisk ?? null,
      severity_s: input.severityS,
      likelihood_l: input.likelihoodL,
      likelihood: input.likelihoodL,
      consequence: input.severityS,
      raw_risk_rating_rr: rr,
      risk_rating: rr,
      risk_index: riskIndex,
      risk_level: riskIndex.toLowerCase(),
      existing_controls: input.existingControls ?? null,
      additional_controls: input.additionalControls ?? null,
      residual_severity_s: input.residualSeverityS ?? null,
      residual_likelihood_l: input.residualLikelihoodL ?? null,
      residual_rr: residualRr,
      residual_risk_rating: residualRr,
      residual_risk_index: residualRiskIndex,
      residual_risk_level: residualRiskIndex?.toLowerCase() ?? null,
      current_year_non_conformances: input.currentYearNonConformances ?? null,
      current_year_ncr_ids: input.currentYearNcrIds ?? null,
      by_who: input.byWho ?? null,
      by_when: input.byWhen ?? null,
      responsible_person: input.responsiblePerson ?? null,
      due_date: input.dueDate ?? null,
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to add line item');
  await updateRiskAssessmentCounts(input.riskAssessmentId);
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'risk_assessment_items.create',
    entityType: 'risk_assessment_item',
    entityId: (data as any).id as UUID
  });
  return data as RiskAssessmentItem;
}

export async function listRiskAssessmentItems(assessmentId: UUID): Promise<RiskAssessmentItem[]> {
  const { data, error } = await insforge.database
    .from('risk_assessment_items')
    .select('*')
    .eq('risk_assessment_id', assessmentId)
    .order('created_at', { ascending: false });
  
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as RiskAssessmentItem[];
}

export async function updateRiskAssessmentCounts(assessmentId: UUID): Promise<void> {
  const items = await listRiskAssessmentItems(assessmentId);
  
  const counts = {
    total: items.length,
    high: items.filter(i => i.risk_level === 'high' || i.risk_level === 'critical').length,
    medium: items.filter(i => i.risk_level === 'medium').length,
    low: items.filter(i => i.risk_level === 'low').length
  };
  
  const { error } = await insforge.database
    .from('risk_assessments')
    .update({
      total_risks: counts.total,
      high_risks: counts.high,
      medium_risks: counts.medium,
      low_risks: counts.low,
      updated_at: new Date().toISOString()
    })
    .eq('id', assessmentId);
  
  if (error) throw new Error(getErrorMessage(error));
}

export type UpdateRiskAssessmentStatusInput = {
  companyId: UUID;
  assessmentId: UUID;
  status: RiskAssessmentStatus;
  reviewedByUserId?: UUID;
  approvedByUserId?: UUID;
  clearReviewDueAt?: boolean;
  updatedByUserId: UUID;
};

export type UpdateRiskAssessmentInput = {
  assessmentId: UUID;
  companyId: UUID;
  updatedByUserId: UUID;
  title?: string;
  description?: string;
  areaLocation?: string;
  activityProcessOperation?: string;
  status?: RiskAssessmentStatus;
  nextReviewDate?: string | null;
  reference?: string | null;
  riskAssessorUserId?: UUID | null;
  riskAssessorName?: string | null;
  responsiblePersonnelUserId?: UUID | null;
  responsiblePersonnelName?: string | null;
  targetDate?: string | null;
  completionDate?: string | null;
};

export async function updateRiskAssessment(input: UpdateRiskAssessmentInput): Promise<RiskAssessment> {
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  };
  if (input.title !== undefined) updateData.title = input.title;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.areaLocation !== undefined) updateData.area_location = input.areaLocation;
  if (input.activityProcessOperation !== undefined) updateData.activity_process_operation = input.activityProcessOperation;
  if (input.status !== undefined) updateData.status = input.status;
  if (input.nextReviewDate !== undefined) updateData.next_review_date = input.nextReviewDate;
  if (input.reference !== undefined) updateData.reference = input.reference;
  if (input.riskAssessorUserId !== undefined) updateData.risk_assessor_user_id = input.riskAssessorUserId;
  if (input.riskAssessorName !== undefined) updateData.risk_assessor_name = input.riskAssessorName;
  if (input.responsiblePersonnelUserId !== undefined) updateData.responsible_personnel_user_id = input.responsiblePersonnelUserId;
  if (input.responsiblePersonnelName !== undefined) updateData.responsible_personnel_name = input.responsiblePersonnelName;
  if (input.targetDate !== undefined) updateData.target_date = input.targetDate;
  if (input.completionDate !== undefined) updateData.completion_date = input.completionDate;
  if (input.status === 'approved') updateData.last_approved_at = new Date().toISOString();

  const { data, error } = await insforge.database
    .from('risk_assessments')
    .update(updateData)
    .eq('id', input.assessmentId)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update risk assessment');
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.updatedByUserId,
    action: 'risk_assessments.update',
    entityType: 'risk_assessment',
    entityId: input.assessmentId
  });
  return data as RiskAssessment;
}

export async function updateRiskAssessmentStatus(input: UpdateRiskAssessmentStatusInput): Promise<RiskAssessment> {
  const updateData: any = {
    status: input.status,
    updated_at: new Date().toISOString()
  };
  
  if (input.status === 'reviewed' && input.reviewedByUserId) {
    updateData.reviewed_by_user_id = input.reviewedByUserId;
    updateData.reviewed_at = new Date().toISOString();
  }
  
  if (input.status === 'approved' && input.approvedByUserId) {
    updateData.approved_by_user_id = input.approvedByUserId;
    updateData.approved_at = new Date().toISOString();
  }

  if (input.clearReviewDueAt) {
    updateData.review_due_at = null;
  }
  
  const { data, error } = await insforge.database
    .from('risk_assessments')
    .update(updateData)
    .eq('id', input.assessmentId)
    .select('*')
    .single();
  
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update risk assessment');
  
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.updatedByUserId,
    action: `risk_assessments.status_change`,
    entityType: 'risk_assessment',
    entityId: input.assessmentId,
    details: { newStatus: input.status }
  });
  
  return data as RiskAssessment;
}

export type UpdateRiskAssessmentItemInput = {
  itemId: UUID;
  riskAssessmentId: UUID;
  companyId: UUID;
  likelihood?: number;
  consequence?: number;
  existingControls?: string;
  controlEffectiveness?: string;
  improvementActions?: string;
  responsibleUserId?: UUID;
  actionDueDate?: string;
  actionStatus?: 'pending' | 'in-progress' | 'completed';
  updatedByUserId: UUID;
};

export async function updateRiskAssessmentItem(input: UpdateRiskAssessmentItemInput): Promise<RiskAssessmentItem> {
  const updateData: any = {
    updated_at: new Date().toISOString()
  };
  
  if (input.likelihood && input.consequence) {
    const riskRating = input.likelihood * input.consequence;
    const riskLevel = calculateRiskLevel(input.likelihood, input.consequence);
    updateData.likelihood = input.likelihood;
    updateData.consequence = input.consequence;
    updateData.risk_rating = riskRating;
    updateData.risk_level = riskLevel;
  }
  
  if (input.existingControls !== undefined) updateData.existing_controls = input.existingControls;
  if (input.controlEffectiveness !== undefined) updateData.control_effectiveness = input.controlEffectiveness;
  if (input.improvementActions !== undefined) updateData.improvement_actions = input.improvementActions;
  if (input.responsibleUserId !== undefined) updateData.responsible_user_id = input.responsibleUserId;
  if (input.actionDueDate !== undefined) updateData.action_due_date = input.actionDueDate;
  if (input.actionStatus !== undefined) updateData.action_status = input.actionStatus;
  
  const { data, error } = await insforge.database
    .from('risk_assessment_items')
    .update(updateData)
    .eq('id', input.itemId)
    .select('*')
    .single();
  
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update risk assessment item');
  
  // Recalculate counts
  await updateRiskAssessmentCounts(input.riskAssessmentId);
  
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.updatedByUserId,
    action: 'risk_assessment_items.update',
    entityType: 'risk_assessment_item',
    entityId: input.itemId
  });
  
  return data as RiskAssessmentItem;
}

export async function deleteRiskAssessmentItem(
  itemId: UUID,
  assessmentId: UUID,
  companyId: UUID,
  deletedByUserId: UUID
): Promise<void> {
  const { error } = await insforge.database
    .from('risk_assessment_items')
    .delete()
    .eq('id', itemId);
  
  if (error) throw new Error(getErrorMessage(error));
  
  await updateRiskAssessmentCounts(assessmentId);
  
  await createActivityLog({
    companyId: companyId,
    actorUserId: deletedByUserId,
    action: 'risk_assessment_items.delete',
    entityType: 'risk_assessment_item',
    entityId: itemId
  });
}

// Helper: flag a risk assessment for review at a specific due date
export async function flagRiskAssessmentForReview(
  assessmentId: UUID,
  reviewDueAt: string
): Promise<void> {
  const { error } = await insforge.database
    .from('risk_assessments')
    .update({
      review_due_at: reviewDueAt,
      updated_at: new Date().toISOString()
    })
    .eq('id', assessmentId);

  if (error) throw new Error(getErrorMessage(error));
}

// Helper: generic function to flag all assessments linked to a source entity
export async function flagAssessmentsForReviewFromEvent(params: {
  sourceEntityType: Exclude<RiskAssessmentSourceType, null>;
  sourceEntityId: UUID;
  reviewDueAt: string;
}): Promise<void> {
  const { data, error } = await insforge.database
    .from('risk_assessments')
    .select('id')
    .eq('source_entity_type', params.sourceEntityType)
    .eq('source_entity_id', params.sourceEntityId);

  if (error) throw new Error(getErrorMessage(error));

  const assessments = (data ?? []) as { id: UUID }[];
  await Promise.all(
    assessments.map(a => flagRiskAssessmentForReview(a.id, params.reviewDueAt))
  );
}

// --- Linked incidents / NCRs (many-to-many) ---
export async function linkIncidentToRiskAssessment(companyId: UUID, riskAssessmentId: UUID, incidentId: UUID): Promise<void> {
  const { error } = await insforge.database.from('risk_assessment_incidents').insert({
    company_id: companyId,
    risk_assessment_id: riskAssessmentId,
    incident_id: incidentId
  });
  if (error) throw new Error(getErrorMessage(error));
}

export async function linkNcrToRiskAssessment(companyId: UUID, riskAssessmentId: UUID, ncrId: UUID): Promise<void> {
  const { error } = await insforge.database.from('risk_assessment_ncrs').insert({
    company_id: companyId,
    risk_assessment_id: riskAssessmentId,
    ncr_id: ncrId
  });
  if (error) throw new Error(getErrorMessage(error));
}

export async function listLinkedIncidentIds(riskAssessmentId: UUID): Promise<UUID[]> {
  const { data, error } = await insforge.database
    .from('risk_assessment_incidents')
    .select('incident_id')
    .eq('risk_assessment_id', riskAssessmentId);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []).map((r: { incident_id: UUID }) => r.incident_id);
}

export async function listLinkedNcrIds(riskAssessmentId: UUID): Promise<UUID[]> {
  const { data, error } = await insforge.database
    .from('risk_assessment_ncrs')
    .select('ncr_id')
    .eq('risk_assessment_id', riskAssessmentId);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []).map((r: { ncr_id: UUID }) => r.ncr_id);
}

// --- Change triggers ---
export interface RiskAssessmentChangeTrigger {
  id: UUID;
  company_id: UUID;
  risk_assessment_id: UUID | null;
  area_location: string | null;
  activity_process_operation: string | null;
  description: string;
  requested_by_user_id: UUID;
  status: 'open' | 'closed';
  created_at: string;
}

export async function createChangeTrigger(params: {
  companyId: UUID;
  riskAssessmentId?: UUID | null;
  areaLocation?: string | null;
  activityProcessOperation?: string | null;
  description: string;
  requestedByUserId: UUID;
}): Promise<RiskAssessmentChangeTrigger> {
  const { data, error } = await insforge.database
    .from('risk_assessment_change_triggers')
    .insert({
      company_id: params.companyId,
      risk_assessment_id: params.riskAssessmentId ?? null,
      area_location: params.areaLocation ?? null,
      activity_process_operation: params.activityProcessOperation ?? null,
      description: params.description,
      requested_by_user_id: params.requestedByUserId,
      status: 'open'
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create change trigger');
  const trigger = data as RiskAssessmentChangeTrigger;
  if (trigger.risk_assessment_id) {
    const { evaluateChangeTriggerForAssessment } = await import('./riskAssessmentTriggersService');
    await evaluateChangeTriggerForAssessment(params.companyId, trigger.risk_assessment_id).catch(() => {});
  }
  return trigger;
}

export async function listChangeTriggersForRiskAssessment(riskAssessmentId: UUID): Promise<RiskAssessmentChangeTrigger[]> {
  const { data, error } = await insforge.database
    .from('risk_assessment_change_triggers')
    .select('*')
    .eq('risk_assessment_id', riskAssessmentId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as RiskAssessmentChangeTrigger[];
}

export async function updateChangeTriggerStatus(triggerId: UUID, status: 'open' | 'closed'): Promise<void> {
  const { error } = await insforge.database
    .from('risk_assessment_change_triggers')
    .update({ status })
    .eq('id', triggerId);
  if (error) throw new Error(getErrorMessage(error));
}

// --- Signatures ---
export interface RiskAssessmentSignature {
  id: UUID;
  risk_assessment_id: UUID;
  pre_work_instance_id: UUID | null;
  signer_user_id: UUID;
  signer_name: string | null;
  role: 'Employee' | 'Supervisor';
  signed_at: string;
  signature_method: string | null;
  comment: string | null;
}

export async function addRiskAssessmentSignature(params: {
  riskAssessmentId: UUID;
  preWorkInstanceId?: UUID | null;
  signerUserId: UUID;
  signerName?: string | null;
  role: 'Employee' | 'Supervisor';
  signatureMethod?: string | null;
  comment?: string | null;
}): Promise<RiskAssessmentSignature> {
  const { data, error } = await insforge.database
    .from('risk_assessment_signatures')
    .insert({
      risk_assessment_id: params.riskAssessmentId,
      pre_work_instance_id: params.preWorkInstanceId ?? null,
      signer_user_id: params.signerUserId,
      signer_name: params.signerName ?? null,
      role: params.role,
      signature_method: params.signatureMethod ?? null,
      comment: params.comment ?? null
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to add signature');
  return data as RiskAssessmentSignature;
}

export async function listRiskAssessmentSignatures(riskAssessmentId: UUID, preWorkInstanceId?: UUID | null): Promise<RiskAssessmentSignature[]> {
  let q = insforge.database
    .from('risk_assessment_signatures')
    .select('*')
    .eq('risk_assessment_id', riskAssessmentId);
  if (preWorkInstanceId) q = q.eq('pre_work_instance_id', preWorkInstanceId);
  const { data, error } = await q.order('signed_at', { ascending: false });
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as RiskAssessmentSignature[];
}

// --- Versioning ---
export interface RiskAssessmentVersion {
  id: UUID;
  risk_assessment_id: UUID;
  version_number: number;
  snapshot: Record<string, unknown>;
  created_by_user_id: UUID;
  created_at: string;
}

export async function createRiskAssessmentVersion(params: {
  riskAssessmentId: UUID;
  snapshot: Record<string, unknown>;
  createdByUserId: UUID;
}): Promise<RiskAssessmentVersion> {
  const versions = await listRiskAssessmentVersions(params.riskAssessmentId);
  const versionNumber = versions.length + 1;
  const { data, error } = await insforge.database
    .from('risk_assessment_versions')
    .insert({
      risk_assessment_id: params.riskAssessmentId,
      version_number: versionNumber,
      snapshot: params.snapshot,
      created_by_user_id: params.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create version');
  return data as RiskAssessmentVersion;
}

export async function listRiskAssessmentVersions(riskAssessmentId: UUID): Promise<RiskAssessmentVersion[]> {
  const { data, error } = await insforge.database
    .from('risk_assessment_versions')
    .select('*')
    .eq('risk_assessment_id', riskAssessmentId)
    .order('version_number', { ascending: false });
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as RiskAssessmentVersion[];
}

// --- Pre-work instances ---
export interface PreWorkInstance {
  id: UUID;
  company_id: UUID;
  risk_assessment_id: UUID;
  instance_date: string;
  supervisor_signed_at: string | null;
  supervisor_user_id: UUID | null;
  created_at: string;
}

export async function createPreWorkInstance(params: {
  companyId: UUID;
  riskAssessmentId: UUID;
  instanceDate: string;
}): Promise<PreWorkInstance> {
  const { data, error } = await insforge.database
    .from('pre_work_instances')
    .insert({
      company_id: params.companyId,
      risk_assessment_id: params.riskAssessmentId,
      instance_date: params.instanceDate
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create pre-work instance');
  return data as PreWorkInstance;
}

export async function listPreWorkInstances(params: { companyId: UUID; riskAssessmentId?: UUID; fromDate?: string; toDate?: string }): Promise<PreWorkInstance[]> {
  let q = insforge.database.from('pre_work_instances').select('*').eq('company_id', params.companyId);
  if (params.riskAssessmentId) q = q.eq('risk_assessment_id', params.riskAssessmentId);
  if (params.fromDate) q = q.gte('instance_date', params.fromDate);
  if (params.toDate) q = q.lte('instance_date', params.toDate);
  const { data, error } = await q.order('instance_date', { ascending: false });
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as PreWorkInstance[];
}

export async function setPreWorkInstanceSupervisorSignOff(instanceId: UUID, supervisorUserId: UUID): Promise<void> {
  const { error } = await insforge.database
    .from('pre_work_instances')
    .update({
      supervisor_user_id: supervisorUserId,
      supervisor_signed_at: new Date().toISOString()
    })
    .eq('id', instanceId);
  if (error) throw new Error(getErrorMessage(error));
}

// Convenience helpers to create assessments from specific event types
export async function createRiskAssessmentFromIncident(
  incidentId: UUID,
  input: Omit<CreateRiskAssessmentInput, 'sourceEntityType' | 'sourceEntityId'>
): Promise<RiskAssessment> {
  return createRiskAssessment({
    ...input,
    sourceEntityType: 'incident',
    sourceEntityId: incidentId
  });
}

export async function createRiskAssessmentFromNcr(
  ncrId: UUID,
  input: Omit<CreateRiskAssessmentInput, 'sourceEntityType' | 'sourceEntityId'>
): Promise<RiskAssessment> {
  return createRiskAssessment({
    ...input,
    sourceEntityType: 'ncr',
    sourceEntityId: ncrId
  });
}

export async function createRiskAssessmentFromChange(
  changeId: UUID,
  input: Omit<CreateRiskAssessmentInput, 'sourceEntityType' | 'sourceEntityId'>
): Promise<RiskAssessment> {
  return createRiskAssessment({
    ...input,
    sourceEntityType: 'change',
    sourceEntityId: changeId
  });
}
