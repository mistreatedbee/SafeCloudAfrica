import type { RiskAssessmentType } from '../../api/services/riskAssessmentsService';

export type RiskTableColumn = { key: string; label: string; kind?: 'text' | 'date' };

export function typeLabel(type: RiskAssessmentType): string {
  if (type === 'baseline') return 'Baseline Risk Assessment';
  if (type === 'task') return 'Task Risk Assessment';
  if (type === 'critical') return 'Critical Tasks Risk Assessment';
  return 'Pre-Work Risk Assessment';
}

export function columnsForType(type: RiskAssessmentType): RiskTableColumn[] {
  if (type === 'baseline') {
    return [
      { key: 'area_location', label: 'Area/Location' },
      { key: 'activity_process_operation', label: 'Activity/Process/Operation' },
      { key: 'aspect_hazard_flaw', label: 'Aspect/Hazard/Flaw' },
      { key: 'potential_risk', label: 'Potential Risk' },
      { key: 'risk_type', label: 'Risk Type' },
      { key: 'existing_controls', label: 'Existing Controls' },
      { key: 'current_year_nonconformances', label: 'Current Year Non-conformances' },
      { key: 'additional_controls', label: 'Additional Controls' },
      { key: 'responsible_personnel', label: 'Responsible Personnel' },
      { key: 'target_date', label: 'Target Date', kind: 'date' },
      { key: 'completion_date', label: 'Completion Date', kind: 'date' }
    ];
  }

  if (type === 'task') {
    return [
      { key: 'hazard', label: 'Hazard' },
      { key: 'risk', label: 'Risk' },
      { key: 'at_risk_person', label: 'At Risk Person' },
      { key: 'existing_controls', label: 'Existing Controls' },
      { key: 'additional_controls', label: 'Additional Controls' },
      { key: 'by_who', label: 'By Who' },
      { key: 'by_when', label: 'By When', kind: 'date' }
    ];
  }

  if (type === 'critical') {
    return [
      { key: 'process_task', label: 'Process/Task' },
      { key: 'task_inventory_instruction', label: 'Task Inventory / Instruction' },
      { key: 'hazard', label: 'Hazard' },
      { key: 'risk', label: 'Risk' },
      { key: 'who_is_at_risk', label: 'Who is at Risk' }
    ];
  }

  return [
    { key: 'hazard', label: 'Hazard' },
    { key: 'risk', label: 'Risk' },
    { key: 'risk_type', label: 'Risk Type' },
    { key: 'quick_rating', label: 'Risk Rating (L/M/H)' },
    { key: 'control_measures', label: 'Control Measures' }
  ];
}

export function defaultHeaderForType(type: RiskAssessmentType): Record<string, string> {
  if (type === 'task') {
    return {
      title: '',
      heading: '',
      area: '',
      activity: '',
      riskAssessorName: '',
      assessmentDate: new Date().toISOString().slice(0, 10),
      nextReviewDate: '',
      reference: ''
    };
  }

  if (type === 'prework') {
    return {
      title: '',
      heading: '',
      area: '',
      activity: '',
      riskAssessorName: '',
      assessmentDate: new Date().toISOString().slice(0, 10),
      nextReviewDate: '',
      reference: '',
      teamName: '',
      shift: ''
    };
  }

  return {
    title: '',
    heading: '',
    area: '',
    activity: '',
    riskAssessorName: '',
    assessmentDate: new Date().toISOString().slice(0, 10),
    nextReviewDate: '',
    reference: ''
  };
}
