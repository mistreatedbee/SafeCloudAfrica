import type { RiskAssessmentType } from '../api/services/riskAssessmentsService';

export function mapTypeToLegacyAssessmentType(type: RiskAssessmentType): string {
  if (type === 'baseline') return 'baseline';
  if (type === 'critical') return 'critical_task';
  if (type === 'prework') return 'pre_work';
  return 'task-based';
}
