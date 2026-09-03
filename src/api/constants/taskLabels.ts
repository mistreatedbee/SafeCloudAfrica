import type { Task, TaskCategory, TaskTimeStatusIndicator, UUID } from '../models/entities';

/** Person who allocated/assigned the task (falls back to creator when not set). */
export function getTaskAssignerUserId(task: Pick<Task, 'allocated_by_user_id' | 'created_by_user_id'>): UUID | null {
  return task.allocated_by_user_id ?? task.created_by_user_id ?? null;
}

export const TASK_CATEGORY_LABELS: Record<TaskCategory, string> = {
  audit_action: 'Audit Action',
  capa: 'Corrective Action (CAPA)',
  inspection: 'Inspection',
  ppe_issue: 'PPE Issue',
  safety_action: 'Safety Action',
  env_action: 'Environmental Action',
  quality_action: 'Quality Action',
  project_task: 'Project Task',
  maintenance: 'Maintenance',
  training: 'Training',
  kpi_follow_up: 'KPI Follow-up',
};

export const TASK_TIME_STATUS_LABELS: Record<TaskTimeStatusIndicator, string> = {
  on_schedule: 'On Schedule',
  at_risk: 'At Risk',
  delayed: 'Delayed',
  overdue: 'Overdue',
  completed_early: 'Completed Early',
};

export const TASK_SOURCE_ENTITY_LABELS: Record<string, string> = {
  ncr: 'NCR',
  quality_ncr: 'Quality NCR',
  inspection_run_item: 'Inspection Finding',
  ppe_issue_tracker: 'PPE Issue',
  incident: 'Incident',
  audit_finding: 'Audit Finding',
  audit: 'Audit',
  program_audit_finding: 'Program Audit Finding',
  customer_complaint: 'Customer Complaint',
};
