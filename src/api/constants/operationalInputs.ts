export const OPERATIONAL_AREAS = [
  'safety',
  'health',
  'environment',
  'quality',
  'risk',
  'compliance'
] as const;

export type OperationalArea = (typeof OPERATIONAL_AREAS)[number];

export const OPERATIONAL_AREA_LABELS: Record<OperationalArea, string> = {
  safety: 'Safety',
  health: 'Health',
  environment: 'Environment',
  quality: 'Quality',
  risk: 'Risk',
  compliance: 'Compliance'
};

export const OPERATIONAL_PRIORITIES = ['low', 'medium', 'high'] as const;
export type OperationalPriority = (typeof OPERATIONAL_PRIORITIES)[number];

export const OPERATIONAL_PRIORITY_LABELS: Record<OperationalPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High'
};

export const OPERATIONAL_STATUSES = ['not_started', 'in_progress', 'completed', 'delayed', 'overdue'] as const;
export type OperationalRecordStatus = (typeof OPERATIONAL_STATUSES)[number];

export const OPERATIONAL_STATUS_LABELS: Record<OperationalRecordStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  completed: 'Completed',
  delayed: 'Delayed',
  overdue: 'Overdue'
};
