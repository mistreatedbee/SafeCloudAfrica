import { insforge } from '../insforge/client';
import type { Risk, UUID } from '../models/entities';
import type { ModuleKey } from '../models/core';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';

// Risk Assessment Types
export interface RiskAssessment {
  id: UUID;
  company_id: UUID;
  assessment_type: 'baseline' | 'task-based';
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
  status: 'draft' | 'in-progress' | 'reviewed' | 'approved' | 'closed';
  assessment_date: string | null;
  reviewed_by_user_id: UUID | null;
  reviewed_at: string | null;
  approved_by_user_id: UUID | null;
  approved_at: string | null;
  total_risks: number;
  high_risks: number;
  medium_risks: number;
  low_risks: number;
  assessment_document_url: string | null;
  evidence_document_url: string | null;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
}

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

function calculateRiskLevel(likelihood: number, consequence: number): 'low' | 'medium' | 'high' | 'critical' {
  const rating = likelihood * consequence;
  if (rating <= 4) return 'low';
  if (rating <= 9) return 'medium';
  if (rating <= 15) return 'high';
  return 'critical';
}

function generateAssessmentNumber(type: 'baseline' | 'task-based'): string {
  const prefix = type === 'baseline' ? 'RA-BL' : 'RA-TB';
  const date = new Date();
  const yyyymm = date.getFullYear().toString() + String(date.getMonth() + 1).padStart(2, '0');
  const random = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `${prefix}-${yyyymm}-${random}`;
}

export type CreateRiskAssessmentInput = {
  companyId: UUID;
  assessmentType: 'baseline' | 'task-based';
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
  createdByUserId: UUID;
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
      status: 'draft',
      total_risks: 0,
      high_risks: 0,
      medium_risks: 0,
      low_risks: 0,
      created_by_user_id: input.createdByUserId
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
  
  return data as RiskAssessment;
}

export type ListRiskAssessmentsInput = {
  companyId: UUID;
  assessmentType?: 'baseline' | 'task-based';
  status?: RiskAssessment['status'];
  limit?: number;
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
  status: RiskAssessment['status'];
  reviewedByUserId?: UUID;
  approvedByUserId?: UUID;
  updatedByUserId: UUID;
};

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
