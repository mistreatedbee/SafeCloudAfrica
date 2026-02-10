import { insforge } from '../insforge/client';
import type { UUID } from '../models/entities';
import type { ModuleKey } from '../models/core';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';
import { listCorrectiveActions } from './correctiveActionsService';
import { listIncidents } from './incidentsService';
import { listAudits } from './auditsService';
import { listRiskAssessments } from './risksService';

export interface ComplianceScore {
  id: UUID;
  company_id: UUID;
  module: ModuleKey | 'overall';
  score: number;
  percentage_complete: number;
  total_items: number;
  completed_items: number;
  overdue_items: number;
  high_priority_items: number;
  last_calculated_at: string;
  updated_at: string;
}

export async function getComplianceScore(companyId: UUID, module: ModuleKey | 'overall'): Promise<ComplianceScore | null> {
  const { data, error } = await insforge.database
    .from('compliance_scores')
    .select('*')
    .eq('company_id', companyId)
    .eq('module', module)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    throw new Error(getErrorMessage(error));
  }
  
  return (data ?? null) as ComplianceScore | null;
}

export async function listComplianceScores(companyId: UUID): Promise<ComplianceScore[]> {
  const { data, error } = await insforge.database
    .from('compliance_scores')
    .select('*')
    .eq('company_id', companyId)
    .order('module', { ascending: true });
  
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as ComplianceScore[];
}

interface ScoringItem {
  status: string;
  priority?: string;
  due_date?: string;
  completed_date?: string;
}

function countScoringItems(items: ScoringItem[]): {
  total: number;
  completed: number;
  overdue: number;
  high_priority: number;
} {
  const today = new Date().toISOString().split('T')[0];
  let completed = 0;
  let overdue = 0;
  let high_priority = 0;

  for (const item of items) {
    // Count completed
    if (item.status === 'closed' || item.status === 'completed' || item.status === 'verified' || item.completed_date) {
      completed++;
    }

    // Count overdue (has due_date in past and not completed)
    if (item.due_date && item.due_date < today && (!item.completed_date && item.status !== 'closed' && item.status !== 'completed' && item.status !== 'verified')) {
      overdue++;
    }

    // Count high priority
    if (item.priority === 'high' || item.priority === 'urgent') {
      high_priority++;
    }
  }

  return {
    total: items.length,
    completed,
    overdue,
    high_priority
  };
}

export async function calculateComplianceScore(
  companyId: UUID,
  module: ModuleKey,
  updatedByUserId: UUID
): Promise<ComplianceScore> {
  let items: ScoringItem[] = [];

  // Gather items based on module
  switch (module) {
    case 'safety':
      const incidents = await listIncidents({ companyId, limit: 500 });
      const risks = await listRiskAssessments({ companyId, limit: 500 });
      items = [
        ...incidents.map(i => ({ status: i.status, due_date: i.created_at?.split('T')[0], priority: i.priority })),
        ...risks.map(r => ({ status: r.status, due_date: r.assessment_date }))
      ];
      break;

    case 'quality':
      const ncrs = await insforge.database
        .from('quality_ncrs')
        .select('*')
        .eq('company_id', companyId);
      if (ncrs.error) throw new Error(getErrorMessage(ncrs.error));
      items = (ncrs.data ?? []).map(n => ({
        status: n.status,
        due_date: n.due_date,
        priority: n.priority,
        completed_date: n.closed_date
      }));
      break;

    case 'environment':
    case 'health':
    case 'legal':
    case 'hr': {
      // Gather from program audits tagged to this module
      const audits = await listAudits({ companyId, module, limit: 500 });
      items = audits.map(a => ({
        status: a.status,
        due_date: a.selected_date ?? null,
        priority: 'medium'
      }));
      break;
    }
  }

  // Count items
  const counts = countScoringItems(items);
  
  // Calculate score (0-100)
  const score = counts.total === 0 ? 100 : Math.round((counts.completed / counts.total) * 100);
  const percentageComplete = counts.total === 0 ? 100 : Math.round((counts.completed / counts.total) * 100);

  // Upsert compliance score
  const existingScore = await getComplianceScore(companyId, module);

  let result: ComplianceScore;

  if (existingScore) {
    const { data, error } = await insforge.database
      .from('compliance_scores')
      .update({
        score,
        percentage_complete: percentageComplete,
        total_items: counts.total,
        completed_items: counts.completed,
        overdue_items: counts.overdue,
        high_priority_items: counts.high_priority,
        last_calculated_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', existingScore.id)
      .select('*')
      .single();

    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to update compliance score');
    result = data as ComplianceScore;
  } else {
    const { data, error } = await insforge.database
      .from('compliance_scores')
      .insert({
        company_id: companyId,
        module,
        score,
        percentage_complete: percentageComplete,
        total_items: counts.total,
        completed_items: counts.completed,
        overdue_items: counts.overdue,
        high_priority_items: counts.high_priority
      })
      .select('*')
      .single();

    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to create compliance score');
    result = data as ComplianceScore;
  }

  await createActivityLog({
    companyId,
    actorUserId: updatedByUserId,
    action: 'compliance_scores.calculate',
    entityType: 'compliance_score',
    entityId: result.id,
    details: { module, score, percentageComplete }
  });

  return result;
}

export async function calculateOverallScore(companyId: UUID, updatedByUserId: UUID): Promise<ComplianceScore> {
  // Get all module scores
  const modules: ModuleKey[] = ['safety', 'quality', 'environment', 'health', 'legal', 'hr'];
  
  // Recalculate all module scores first
  for (const module of modules) {
    try {
      await calculateComplianceScore(companyId, module, updatedByUserId);
    } catch (e) {
      console.error(`Failed to calculate score for ${module}:`, e);
    }
  }

  // Get all scores
  const allScores = await listComplianceScores(companyId);
  const moduleScores = allScores.filter(s => s.module !== 'overall');

  // Calculate weighted average
  const totalItems = moduleScores.reduce((sum, s) => sum + s.total_items, 0);
  const totalCompleted = moduleScores.reduce((sum, s) => sum + s.completed_items, 0);
  const totalOverdue = moduleScores.reduce((sum, s) => sum + s.overdue_items, 0);
  const totalHighPriority = moduleScores.reduce((sum, s) => sum + s.high_priority_items, 0);

  const overallScore = totalItems === 0 ? 100 : Math.round((totalCompleted / totalItems) * 100);
  const percentageComplete = totalItems === 0 ? 100 : Math.round((totalCompleted / totalItems) * 100);

  // Upsert overall score
  const existingOverall = await getComplianceScore(companyId, 'overall');

  let result: ComplianceScore;

  if (existingOverall) {
    const { data, error } = await insforge.database
      .from('compliance_scores')
      .update({
        score: overallScore,
        percentage_complete: percentageComplete,
        total_items: totalItems,
        completed_items: totalCompleted,
        overdue_items: totalOverdue,
        high_priority_items: totalHighPriority,
        last_calculated_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', existingOverall.id)
      .select('*')
      .single();

    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to update overall compliance score');
    result = data as ComplianceScore;
  } else {
    const { data, error } = await insforge.database
      .from('compliance_scores')
      .insert({
        company_id: companyId,
        module: 'overall',
        score: overallScore,
        percentage_complete: percentageComplete,
        total_items: totalItems,
        completed_items: totalCompleted,
        overdue_items: totalOverdue,
        high_priority_items: totalHighPriority
      })
      .select('*')
      .single();

    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to create overall compliance score');
    result = data as ComplianceScore;
  }

  await createActivityLog({
    companyId,
    actorUserId: updatedByUserId,
    action: 'compliance_scores.calculate_overall',
    entityType: 'compliance_score',
    entityId: result.id,
    details: { score: overallScore, percentageComplete }
  });

  return result;
}

export async function getComplianceSummary(companyId: UUID): Promise<{
  overallScore: ComplianceScore | null;
  moduleScores: ComplianceScore[];
  statusByModule: Record<string, { score: number; status: string }>;
}> {
  const allScores = await listComplianceScores(companyId);
  const overallScore = allScores.find(s => s.module === 'overall');
  const moduleScores = allScores.filter(s => s.module !== 'overall');

  const statusByModule: Record<string, { score: number; status: string }> = {};
  for (const score of moduleScores) {
    statusByModule[score.module] = {
      score: score.score,
      status:
        score.score >= 90 ? 'excellent' :
        score.score >= 75 ? 'good' :
        score.score >= 60 ? 'satisfactory' :
        'needs-improvement'
    };
  }

  return {
    overallScore: overallScore ?? null,
    moduleScores,
    statusByModule
  };
}
