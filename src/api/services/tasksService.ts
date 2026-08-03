import { insforge } from '../insforge/client';
import { withInsforgeSession } from '../insforge/ensureSession';
import type {
  Task,
  TaskStatus,
  TaskTimeStatusIndicator,
  TaskComment,
  TaskProgressUpdate,
  TaskTimeLog,
  UUID
} from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';
import type { ModuleKey, Severity } from '../models/core';
import { getMyProfile } from './profilesService';
import { listEvidence } from './evidenceService';
import { listApprovals } from './approvalsService';

const OPEN_STATUSES: TaskStatus[] = [
  'draft',
  'assigned',
  'accepted',
  'in-progress',
  'awaiting-evidence',
  'under-review',
  'approved',
  'reopened',
  'overdue'
];

const ALLOWED_TRANSITIONS: Partial<Record<TaskStatus, TaskStatus[]>> = {
  draft: ['assigned'],
  assigned: ['accepted', 'overdue'],
  accepted: ['in-progress', 'overdue'],
  'in-progress': ['awaiting-evidence', 'overdue'],
  'awaiting-evidence': ['under-review', 'overdue'],
  'under-review': ['approved', 'overdue', 'reopened'],
  approved: ['closed'],
  closed: ['reopened'],
  reopened: ['in-progress', 'assigned', 'overdue'],
  overdue: ['accepted', 'in-progress', 'awaiting-evidence', 'under-review', 'approved']
};

function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  const allowed = ALLOWED_TRANSITIONS[from];
  return !!allowed && allowed.includes(to);
}

/** Compute time status indicator from task and optional reference date */
export function computeTimeStatusIndicator(
  task: Pick<
    Task,
    | 'due_at'
    | 'planned_completion_date'
    | 'actual_completion_at'
    | 'actual_start_at'
    | 'status'
    | 'progress_updates'
    | 'planned_start_date'
  >,
  todayUtc?: Date
): TaskTimeStatusIndicator {
  const now = todayUtc ?? new Date();
  const due = task.due_at ? new Date(task.due_at) : null;
  const plannedEnd = task.planned_completion_date ? new Date(task.planned_completion_date) : null;
  const completedAt = task.actual_completion_at ? new Date(task.actual_completion_at) : null;

  if (task.status === 'closed' && completedAt && due && plannedEnd) {
    const earliest = due < plannedEnd ? due : plannedEnd;
    if (completedAt < earliest) return 'completed_early';
  }

  if (task.status === 'closed') return 'on_schedule';

  if (due && now > due) return 'overdue';

  const atRiskDays = 3;
  const noProgressDays = 7;
  if (due) {
    const msToDue = due.getTime() - now.getTime();
    const daysToDue = msToDue / (24 * 60 * 60 * 1000);
    if (daysToDue >= 0 && daysToDue <= atRiskDays) return 'at_risk';
    const updates = task.progress_updates ?? [];
    const lastUpdate = updates[0]?.timestamp ? new Date(updates[0].timestamp) : null;
    const start = task.planned_start_date ? new Date(task.planned_start_date) : null;
    if (start && lastUpdate) {
      const daysSinceProgress = (now.getTime() - lastUpdate.getTime()) / (24 * 60 * 60 * 1000);
      if (daysSinceProgress >= noProgressDays && daysToDue > 0) return 'at_risk';
    }
  }

  if (plannedEnd && now > plannedEnd && due && now <= due) return 'delayed';

  return 'on_schedule';
}

function applyTimeStatusIndicator(task: Task): Task {
  const indicator = computeTimeStatusIndicator(task);
  return { ...task, time_status_indicator: indicator };
}

export type ListTasksInput = {
  companyId: UUID;
  assigneeUserId?: UUID;
  /**
   * "Tasks relevant to me": matches tasks assigned to this user OR created by
   * this user. A task created and left unassigned (the modal's default) has
   * assignee_user_id = null, so filtering "My Tasks" by assignee alone hides
   * every task the user just created until someone else assigns it to them.
   * Takes precedence over assigneeUserId when both are supplied.
   */
  myUserId?: UUID;
  limit?: number;
};

export type ListTasksWithFiltersInput = {
  companyId: UUID;
  category?: Task['category'];
  status?: TaskStatus;
  priority?: Severity;
  riskLevel?: Task['risk_level'];
  taskOwnerUserId?: UUID;
  assigneeUserId?: UUID;
  /** See ListTasksInput.myUserId. */
  myUserId?: UUID;
  sourceEntityType?: string;
  dueFrom?: string;
  dueTo?: string;
  departmentId?: UUID;
  siteId?: UUID;
  search?: string;
  limit?: number;
};

export async function listTasks(input: ListTasksInput): Promise<Task[]> {
  return withInsforgeSession('tasks:list', async () => {
  let q = insforge.database.from('tasks').select('*').eq('company_id', input.companyId);
  if (input.myUserId) {
    q = q.or(`assignee_user_id.eq.${input.myUserId},created_by_user_id.eq.${input.myUserId}`);
  } else if (input.assigneeUserId) {
    q = q.eq('assignee_user_id', input.assigneeUserId);
  }

  const { data, error } = await q.order('due_at', { ascending: true }).limit(input.limit ?? 50);
  if (error) throw new Error(getErrorMessage(error));
  const tasks = (data ?? []) as Task[];
  return tasks.map(applyTimeStatusIndicator);
  });
}

export async function listTasksWithFilters(input: ListTasksWithFiltersInput): Promise<Task[]> {
  return withInsforgeSession('tasks:list-with-filters', async () => {
  let q = insforge.database.from('tasks').select('*').eq('company_id', input.companyId);

  if (input.category) q = q.eq('category', input.category);
  if (input.status) q = q.eq('status', input.status);
  if (input.priority) q = q.eq('priority', input.priority);
  if (input.riskLevel) q = q.eq('risk_level', input.riskLevel);
  if (input.taskOwnerUserId) q = q.eq('task_owner_user_id', input.taskOwnerUserId);
  if (input.myUserId) {
    q = q.or(`assignee_user_id.eq.${input.myUserId},created_by_user_id.eq.${input.myUserId}`);
  } else if (input.assigneeUserId) {
    q = q.eq('assignee_user_id', input.assigneeUserId);
  }
  if (input.sourceEntityType) q = q.eq('source_entity_type', input.sourceEntityType);
  if (input.departmentId) q = q.eq('department_id', input.departmentId);
  if (input.siteId) q = q.eq('site_id', input.siteId);
  if (input.dueFrom) q = q.gte('due_at', input.dueFrom);
  if (input.dueTo) q = q.lte('due_at', input.dueTo);
  if (input.search?.trim()) {
    const term = input.search.trim();
    q = q.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
  }

  const { data, error } = await q
    .order('due_at', { ascending: true })
    .limit(input.limit ?? 200);
  if (error) throw new Error(getErrorMessage(error));
  const tasks = (data ?? []) as Task[];
  return tasks.map(applyTimeStatusIndicator);
  });
}

export async function getTaskById(companyId: UUID, taskId: UUID): Promise<Task | null> {
  return withInsforgeSession('tasks:get-by-id', async () => {
  const { data, error } = await insforge.database
    .from('tasks')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', taskId)
    .maybeSingle();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) return null;
  return applyTimeStatusIndicator(data as Task);
  });
}

export async function countTasksByAssignee(companyId: UUID, assigneeUserId: UUID, openOnly = true): Promise<number> {
  return withInsforgeSession('tasks:count-by-assignee', async () => {
  let q = insforge.database
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('assignee_user_id', assigneeUserId);
  if (openOnly) q = q.in('status', OPEN_STATUSES);
  const { count, error } = await q;
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
  });
}

export async function countTasksByDepartment(companyId: UUID, departmentId: UUID, openOnly = true): Promise<number> {
  return withInsforgeSession('tasks:count-by-department', async () => {
  let q = insforge.database
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('department_id', departmentId);
  if (openOnly) q = q.in('status', OPEN_STATUSES);
  const { count, error } = await q;
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
  });
}

export async function countTasksByRiskLevel(
  companyId: UUID,
  riskLevel: 'high' | 'critical',
  openOnly = true
): Promise<number> {
  return withInsforgeSession('tasks:count-by-risk-level', async () => {
  let q = insforge.database
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('risk_level', riskLevel);
  if (openOnly) q = q.in('status', OPEN_STATUSES);
  const { count, error } = await q;
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
  });
}

export async function countMyPendingTasks(companyId: UUID, userId: UUID): Promise<number> {
  return withInsforgeSession('tasks:count-my-pending', async () => {
  const { count, error } = await insforge.database
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('assignee_user_id', userId)
    .in('status', OPEN_STATUSES);
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
  });
}

export async function countCompanyPendingTasks(companyId: UUID): Promise<number> {
  return withInsforgeSession('tasks:count-company-pending', async () => {
  const { count, error } = await insforge.database
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .in('status', OPEN_STATUSES);
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
  });
}

export async function countOverdueTasks(companyId: UUID): Promise<number> {
  return withInsforgeSession('tasks:count-overdue', async () => {
  const { count, error } = await insforge.database
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'overdue');
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
  });
}

export async function countPendingTasksByModule(companyId: UUID, module: ModuleKey): Promise<number> {
  return withInsforgeSession('tasks:count-pending-by-module', async () => {
  const { count, error } = await insforge.database
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('module', module)
    .in('status', OPEN_STATUSES);
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
  });
}

export async function countTasksByStatus(companyId: UUID, input: { module?: ModuleKey; status?: Task['status'] }): Promise<number> {
  return withInsforgeSession('tasks:count-by-status', async () => {
  const base = insforge.database.from('tasks').select('*', { count: 'exact', head: true }).eq('company_id', companyId);
  const q1 = input.module ? base.eq('module', input.module) : base;
  const q2 = input.status ? q1.eq('status', input.status) : q1;
  const { count, error } = await q2;
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
  });
}

export type CreateTaskInput = {
  companyId: UUID;
  module: ModuleKey;
  title: string;
  description?: string;
  category?:
    | 'audit_action'
    | 'capa'
    | 'inspection'
    | 'ppe_issue'
    | 'safety_action'
    | 'env_action'
    | 'quality_action'
    | 'project_task'
    | 'maintenance'
    | 'training'
    | 'kpi_follow_up';
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  priority: Severity;
  plannedStartDate?: string;
  plannedCompletionDate?: string;
  estimatedHours?: number;
  dueAt?: string;
  assigneeUserId?: UUID;
  taskOwnerUserId?: UUID;
  allocatedByUserId?: UUID;
  supportingTeamUserIds?: UUID[];
  sourceEntityType?: string;
  sourceEntityId?: UUID;
  createdByUserId: UUID;
};

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const profile = await getMyProfile(input.companyId, input.createdByUserId);
  const initialStatus = input.assigneeUserId ? 'assigned' : 'draft';
  const insertPayload: Record<string, unknown> = {
    company_id: input.companyId,
    module: input.module,
    site_id: (profile as any)?.site_id ?? null,
    department_id: (profile as any)?.department_id ?? null,
    title: input.title,
    description: input.description ?? null,
    category: input.category ?? null,
    risk_level: input.riskLevel ?? null,
    priority: input.priority,
    status: initialStatus,
    planned_start_date: input.plannedStartDate ?? null,
    planned_completion_date: input.plannedCompletionDate ?? null,
    estimated_hours: input.estimatedHours ?? null,
    due_at: input.dueAt ?? null,
    assignee_user_id: input.assigneeUserId ?? null,
    task_owner_user_id: input.taskOwnerUserId ?? null,
    allocated_by_user_id: input.allocatedByUserId ?? input.createdByUserId,
    supporting_team_user_ids: input.supportingTeamUserIds ?? null,
    source_entity_type: input.sourceEntityType ?? null,
    source_entity_id: input.sourceEntityId ?? null,
    created_by_user_id: input.createdByUserId
  };

  const { data, error } = await insforge.database
    .from('tasks')
    .insert(insertPayload)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create task.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'tasks.create',
    entityType: 'task',
    entityId: (data as any).id as UUID
  });

  const created = applyTimeStatusIndicator(data as Task);
  const taskUrl = `/dashboard/management/tasks/${created.id}`;

  if (created.assignee_user_id) {
    const { notifyRelevantUsers } = await import('./notificationEventsService');
    await notifyRelevantUsers({
      companyId: input.companyId,
      eventKey: `task-assigned:${created.id}`,
      eventType: 'task_assigned',
      title: 'Task assigned',
      message: `You have been assigned a new task: "${created.title}".`,
      recipientUserIds: [created.assignee_user_id as UUID],
      emailTemplateKey: 'task_assigned',
      emailVariables: { title: created.title, status: created.priority, dueDate: created.due_at ?? '' },
      actionUrl: taskUrl,
      metadata: { itemType: 'task', itemId: created.id }
    }).catch(() => undefined);
  }

  const risk = (created.risk_level ?? created.priority) as string;
  if (risk === 'high' || risk === 'critical') {
    const { notifyRelevantUsers, listRelevantNotificationRecipientIds } = await import('./notificationEventsService');
    const recipientUserIds = await listRelevantNotificationRecipientIds({
      companyId: input.companyId,
      roles: ['owner', 'admin', 'manager']
    }).catch(() => [] as UUID[]);
    if (recipientUserIds.length) {
      await notifyRelevantUsers({
        companyId: input.companyId,
        eventKey: `task-high-risk:${created.id}`,
        eventType: 'task_high_risk_escalation',
        title: 'High-risk task created',
        message: `A ${risk} risk task "${created.title}" was created and may need escalation.`,
        recipientUserIds,
        emailTemplateKey: 'task_assigned',
        emailVariables: { title: created.title, status: risk, dueDate: created.due_at ?? '' },
        actionUrl: taskUrl,
        metadata: { itemType: 'task', itemId: created.id }
      }).catch(() => undefined);
    }
  }

  return created;
}

async function notifyTaskTransition(input: {
  companyId: UUID;
  task: Task;
  actorUserId: UUID;
  eventType: string;
  title: string;
  message: string;
  status: string;
}): Promise<void> {
  const recipientUserIds = new Set<UUID>();
  if (input.task.assignee_user_id) recipientUserIds.add(input.task.assignee_user_id as UUID);
  if (input.task.task_owner_user_id) recipientUserIds.add(input.task.task_owner_user_id as UUID);
  if (input.task.created_by_user_id) recipientUserIds.add(input.task.created_by_user_id as UUID);
  recipientUserIds.delete(input.actorUserId);
  if (recipientUserIds.size === 0) return;

  const { notifyRelevantUsers } = await import('./notificationEventsService');
  await notifyRelevantUsers({
    companyId: input.companyId,
    eventKey: `${input.eventType}:${input.task.id}`,
    eventType: input.eventType,
    title: input.title,
    message: input.message,
    recipientUserIds: Array.from(recipientUserIds),
    emailTemplateKey: 'task_assigned',
    emailVariables: { title: input.task.title, status: input.status, dueDate: input.task.due_at ?? '' },
    actionUrl: `/dashboard/management/tasks/${input.task.id}`,
    metadata: { itemType: 'task', itemId: input.task.id }
  }).catch(() => undefined);
}

async function updateTaskStatusInternal(input: {
  companyId: UUID;
  taskId: UUID;
  status: TaskStatus;
  actorUserId: UUID;
  patch?: Record<string, unknown>;
}): Promise<Task> {
  const nowIso = new Date().toISOString();
  const payload: Record<string, unknown> = {
    status: input.status,
    updated_at: nowIso,
    ...(input.patch ?? {})
  };
  const { data, error } = await insforge.database
    .from('tasks')
    .update(payload)
    .eq('company_id', input.companyId)
    .eq('id', input.taskId)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update task status.');
  return applyTimeStatusIndicator(data as Task);
}

export async function updateTaskStatus(input: {
  companyId: UUID;
  taskId: UUID;
  status: Task['status'];
  actorUserId: UUID;
}): Promise<Task> {
  const updated = await updateTaskStatusInternal({
    companyId: input.companyId,
    taskId: input.taskId,
    status: input.status,
    actorUserId: input.actorUserId
  });
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'tasks.update_status',
    entityType: 'task',
    entityId: input.taskId,
    metadata: { status: input.status }
  });
  await notifyTaskTransition({
    companyId: input.companyId,
    task: updated,
    actorUserId: input.actorUserId,
    eventType: 'task_status_updated',
    title: 'Task status updated',
    message: `Task "${updated.title}" status changed to ${input.status}.`,
    status: input.status
  });
  return updated;
}

export async function acceptTask(input: {
  companyId: UUID;
  taskId: UUID;
  actorUserId: UUID;
}): Promise<Task> {
  const task = await getTaskById(input.companyId, input.taskId);
  if (!task) throw new Error('Task not found.');
  if (task.assignee_user_id !== input.actorUserId) throw new Error('Only the assignee can accept this task.');
  if (!canTransition(task.status, 'accepted')) throw new Error(`Cannot accept task from status ${task.status}.`);
  const updated = await updateTaskStatusInternal({
    companyId: input.companyId,
    taskId: input.taskId,
    status: 'accepted',
    actorUserId: input.actorUserId
  });
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'tasks.accept',
    entityType: 'task',
    entityId: input.taskId
  });
  await notifyTaskTransition({
    companyId: input.companyId,
    task: updated,
    actorUserId: input.actorUserId,
    eventType: 'task_accepted',
    title: 'Task accepted',
    message: `Task "${updated.title}" was accepted by the assignee.`,
    status: 'Accepted'
  });
  return updated;
}

export async function startTask(input: {
  companyId: UUID;
  taskId: UUID;
  actorUserId: UUID;
}): Promise<Task> {
  const task = await getTaskById(input.companyId, input.taskId);
  if (!task) throw new Error('Task not found.');
  const nextStatus: TaskStatus = 'in-progress';
  if (!canTransition(task.status, nextStatus)) throw new Error(`Cannot start task from status ${task.status}.`);
  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = { actual_start_at: task.actual_start_at ?? nowIso };
  const updated = await updateTaskStatusInternal({
    companyId: input.companyId,
    taskId: input.taskId,
    status: nextStatus,
    actorUserId: input.actorUserId,
    patch
  });
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'tasks.start',
    entityType: 'task',
    entityId: input.taskId
  });
  await notifyTaskTransition({
    companyId: input.companyId,
    task: updated,
    actorUserId: input.actorUserId,
    eventType: 'task_started',
    title: 'Task started',
    message: `Work has started on task "${updated.title}".`,
    status: 'In Progress'
  });
  return updated;
}

export async function markAwaitingEvidence(input: {
  companyId: UUID;
  taskId: UUID;
  actorUserId: UUID;
}): Promise<Task> {
  const task = await getTaskById(input.companyId, input.taskId);
  if (!task) throw new Error('Task not found.');
  if (!canTransition(task.status, 'awaiting-evidence')) throw new Error(`Cannot move to awaiting-evidence from ${task.status}.`);
  const updated = await updateTaskStatusInternal({
    companyId: input.companyId,
    taskId: input.taskId,
    status: 'awaiting-evidence',
    actorUserId: input.actorUserId
  });
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'tasks.awaiting_evidence',
    entityType: 'task',
    entityId: input.taskId
  });
  await notifyTaskTransition({
    companyId: input.companyId,
    task: updated,
    actorUserId: input.actorUserId,
    eventType: 'task_awaiting_evidence',
    title: 'Task awaiting evidence',
    message: `Task "${updated.title}" is now awaiting evidence.`,
    status: 'Awaiting Evidence'
  });
  return updated;
}

export async function submitForReview(input: {
  companyId: UUID;
  taskId: UUID;
  actorUserId: UUID;
}): Promise<Task> {
  const task = await getTaskById(input.companyId, input.taskId);
  if (!task) throw new Error('Task not found.');
  if (!canTransition(task.status, 'under-review')) throw new Error(`Cannot submit for review from ${task.status}.`);
  const updated = await updateTaskStatusInternal({
    companyId: input.companyId,
    taskId: input.taskId,
    status: 'under-review',
    actorUserId: input.actorUserId
  });
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'tasks.submit_review',
    entityType: 'task',
    entityId: input.taskId
  });
  await notifyTaskTransition({
    companyId: input.companyId,
    task: updated,
    actorUserId: input.actorUserId,
    eventType: 'task_submitted_for_review',
    title: 'Task submitted for review',
    message: `Task "${updated.title}" has been submitted for review.`,
    status: 'Under Review'
  });
  return updated;
}

export async function approveTask(input: {
  companyId: UUID;
  taskId: UUID;
  actorUserId: UUID;
}): Promise<Task> {
  const task = await getTaskById(input.companyId, input.taskId);
  if (!task) throw new Error('Task not found.');
  if (!canTransition(task.status, 'approved')) throw new Error(`Cannot approve from ${task.status}.`);
  const updated = await updateTaskStatusInternal({
    companyId: input.companyId,
    taskId: input.taskId,
    status: 'approved',
    actorUserId: input.actorUserId
  });
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'tasks.approve',
    entityType: 'task',
    entityId: input.taskId
  });
  await notifyTaskTransition({
    companyId: input.companyId,
    task: updated,
    actorUserId: input.actorUserId,
    eventType: 'task_approved',
    title: 'Task approved',
    message: `Task "${updated.title}" has been approved.`,
    status: 'Approved'
  });
  return updated;
}

export async function validateTaskReadyForClosure(companyId: UUID, taskId: UUID): Promise<{ ok: boolean; errors: string[] }> {
  const task = await getTaskById(companyId, taskId);
  const errors: string[] = [];
  if (!task) {
    return { ok: false, errors: ['Task not found.'] };
  }
  const approvals = await listApprovals(companyId);
  const taskApprovals = approvals.filter(
    (a) => a.entity_id === taskId && ['task_supervisor_review', 'task_manager_approval', 'task_auditor_verification'].includes(a.entity_type)
  );
  const supervisorApproved = taskApprovals.some(
    (a) => a.entity_type === 'task_supervisor_review' && a.status === 'approved'
  );
  const managerApproved = taskApprovals.some(
    (a) => a.entity_type === 'task_manager_approval' && a.status === 'approved'
  );
  if (!supervisorApproved && !managerApproved) {
    errors.push('At least one sign-off (supervisor or manager approval) is required before closing.');
  }
  const auditSourceTypes = ['audit_finding', 'audit', 'program_audit_finding'];
  if (task.source_entity_type && auditSourceTypes.includes(String(task.source_entity_type))) {
    const auditorApproved = taskApprovals.some(
      (a) => a.entity_type === 'task_auditor_verification' && a.status === 'approved'
    );
    if (!auditorApproved) errors.push('Auditor verification is required for audit-related tasks.');
  }
  if (task.effectiveness_checked !== true) {
    errors.push('Effectiveness check must be completed before closure.');
  }
  return { ok: errors.length === 0, errors };
}

export async function closeTask(input: {
  companyId: UUID;
  taskId: UUID;
  actorUserId: UUID;
  closureData?: { finalStatus?: string; lessonsLearned?: string };
}): Promise<Task> {
  const task = await getTaskById(input.companyId, input.taskId);
  if (!task) throw new Error('Task not found.');
  if (!canTransition(task.status, 'closed')) throw new Error(`Cannot close task from status ${task.status}.`);
  const validation = await validateTaskReadyForClosure(input.companyId, input.taskId);
  if (!validation.ok) throw new Error(validation.errors.join(' '));
  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = {
    actual_completion_at: task.actual_completion_at ?? nowIso,
    closure_date: nowIso,
    final_status: input.closureData?.finalStatus ?? 'closed',
    lessons_learned: input.closureData?.lessonsLearned ?? task.lessons_learned
  };
  const updated = await updateTaskStatusInternal({
    companyId: input.companyId,
    taskId: input.taskId,
    status: 'closed',
    actorUserId: input.actorUserId,
    patch
  });
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'tasks.close',
    entityType: 'task',
    entityId: input.taskId
  });
  await notifyTaskTransition({
    companyId: input.companyId,
    task: updated,
    actorUserId: input.actorUserId,
    eventType: 'task_closed',
    title: 'Task closed',
    message: `Task "${updated.title}" has been closed.`,
    status: 'Closed'
  });
  return updated;
}

export async function reopenTask(input: {
  companyId: UUID;
  taskId: UUID;
  actorUserId: UUID;
  reason?: string;
}): Promise<Task> {
  const task = await getTaskById(input.companyId, input.taskId);
  if (!task) throw new Error('Task not found.');
  if (!canTransition(task.status, 'reopened')) throw new Error(`Cannot reopen from ${task.status}.`);
  const updated = await updateTaskStatusInternal({
    companyId: input.companyId,
    taskId: input.taskId,
    status: 'reopened',
    actorUserId: input.actorUserId
  });
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'tasks.reopen',
    entityType: 'task',
    entityId: input.taskId,
    metadata: { reason: input.reason }
  });
  await notifyTaskTransition({
    companyId: input.companyId,
    task: updated,
    actorUserId: input.actorUserId,
    eventType: 'task_reopened',
    title: 'Task reopened',
    message: input.reason
      ? `Task "${updated.title}" was reopened: ${input.reason}`
      : `Task "${updated.title}" was reopened.`,
    status: 'Reopened'
  });
  return updated;
}

export async function markOverdueTask(input: {
  companyId: UUID;
  taskId: UUID;
  actorUserId: UUID;
}): Promise<Task> {
  const task = await getTaskById(input.companyId, input.taskId);
  if (!task) throw new Error('Task not found.');
  if (task.status === 'closed') return task;
  const updated = await updateTaskStatusInternal({
    companyId: input.companyId,
    taskId: input.taskId,
    status: 'overdue',
    actorUserId: input.actorUserId
  });
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'tasks.mark_overdue',
    entityType: 'task',
    entityId: input.taskId
  });
  return updated;
}

// ---------- Time logs ----------
export async function listTaskTimeLogs(companyId: UUID, taskId: UUID): Promise<TaskTimeLog[]> {
  const { data, error } = await insforge.database
    .from('task_time_logs')
    .select('*')
    .eq('company_id', companyId)
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as TaskTimeLog[];
}

async function recalcTaskTimeSpent(companyId: UUID, taskId: UUID): Promise<void> {
  const logs = await listTaskTimeLogs(companyId, taskId);
  const totalMinutes = logs.reduce((sum, log) => sum + (log.minutes ?? 0), 0);
  await insforge.database
    .from('tasks')
    .update({ time_spent_minutes: totalMinutes, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', taskId);
}

export async function logTaskTimeIncrement(input: {
  companyId: UUID;
  taskId: UUID;
  minutes: number;
  createdByUserId: UUID;
}): Promise<TaskTimeLog> {
  const { data, error } = await insforge.database
    .from('task_time_logs')
    .insert({
      company_id: input.companyId,
      task_id: input.taskId,
      started_at: null,
      ended_at: null,
      minutes: input.minutes,
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create time log.');
  await recalcTaskTimeSpent(input.companyId, input.taskId);
  return data as TaskTimeLog;
}

export async function startTimeEntry(input: {
  companyId: UUID;
  taskId: UUID;
  createdByUserId: UUID;
}): Promise<TaskTimeLog> {
  const nowIso = new Date().toISOString();
  const { data, error } = await insforge.database
    .from('task_time_logs')
    .insert({
      company_id: input.companyId,
      task_id: input.taskId,
      started_at: nowIso,
      ended_at: null,
      minutes: null,
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to start time entry.');
  return data as TaskTimeLog;
}

export async function stopTimeEntry(input: {
  companyId: UUID;
  timeLogId: UUID;
  taskId: UUID;
  actorUserId: UUID;
}): Promise<TaskTimeLog> {
  const nowIso = new Date().toISOString();
  const { data: log, error: fetchErr } = await insforge.database
    .from('task_time_logs')
    .select('*')
    .eq('id', input.timeLogId)
    .eq('task_id', input.taskId)
    .eq('company_id', input.companyId)
    .single();
  if (fetchErr || !log) throw new Error('Time log not found.');
  const start = (log as TaskTimeLog).started_at ? new Date((log as TaskTimeLog).started_at) : null;
  const minutes = start ? Math.round((new Date(nowIso).getTime() - start.getTime()) / 60000) : 0;
  const { data, error } = await insforge.database
    .from('task_time_logs')
    .update({ ended_at: nowIso, minutes, updated_at: nowIso })
    .eq('company_id', input.companyId)
    .eq('task_id', input.taskId)
    .eq('id', input.timeLogId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to stop time entry.');
  await recalcTaskTimeSpent(input.companyId, input.taskId);
  return data as TaskTimeLog;
}

// ---------- Comments & progress updates ----------
export async function addTaskComment(input: {
  companyId: UUID;
  taskId: UUID;
  actorUserId: UUID;
  text: string;
}): Promise<Task> {
  const task = await getTaskById(input.companyId, input.taskId);
  if (!task) throw new Error('Task not found.');
  const comments: TaskComment[] = Array.isArray(task.comments) ? [...task.comments] : [];
  comments.unshift({
    timestamp: new Date().toISOString(),
    user_id: input.actorUserId,
    text: input.text
  });
  const { data, error } = await insforge.database
    .from('tasks')
    .update({ comments: comments as unknown as Record<string, unknown>[], updated_at: new Date().toISOString() })
    .eq('company_id', input.companyId)
    .eq('id', input.taskId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to add comment.');
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'tasks.comment',
    entityType: 'task',
    entityId: input.taskId
  });
  return applyTimeStatusIndicator(data as Task);
}

export async function addTaskProgressUpdate(input: {
  companyId: UUID;
  taskId: UUID;
  actorUserId: UUID;
  note: string;
  percentComplete?: number | null;
}): Promise<Task> {
  const task = await getTaskById(input.companyId, input.taskId);
  if (!task) throw new Error('Task not found.');
  const updates: TaskProgressUpdate[] = Array.isArray(task.progress_updates) ? [...task.progress_updates] : [];
  updates.unshift({
    timestamp: new Date().toISOString(),
    user_id: input.actorUserId,
    note: input.note,
    percent_complete: input.percentComplete ?? null
  });
  const patch: Record<string, unknown> = {
    progress_updates: updates,
    updated_at: new Date().toISOString()
  };
  if (input.percentComplete != null) patch.progress_percent = input.percentComplete;
  const { data, error } = await insforge.database
    .from('tasks')
    .update(patch)
    .eq('company_id', input.companyId)
    .eq('id', input.taskId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to add progress update.');
  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'tasks.progress_update',
    entityType: 'task',
    entityId: input.taskId
  });
  return applyTimeStatusIndicator(data as Task);
}

// ---------- Evidence wrappers ----------
export async function listTaskEvidence(companyId: UUID, taskId: UUID, limit = 200) {
  return listEvidence(companyId, { entityType: 'task', entityId: taskId, limit });
}

export async function addTaskEvidenceFromUpload(input: {
  companyId: UUID;
  taskId: UUID;
  actorUserId: UUID;
  title?: string;
  storageBucket: string;
  storageKey: string;
}): Promise<void> {
  const { createEvidence } = await import('./evidenceService');
  await createEvidence({
    companyId: input.companyId,
    entityType: 'task',
    entityId: input.taskId,
    title: input.title,
    storageBucket: input.storageBucket,
    storageKey: input.storageKey,
    createdByUserId: input.actorUserId
  });
}

// ---------- Task approval helpers ----------

/**
 * Resolves who should sign off on a task (the person it was allocated by, or
 * its task owner) and creates a supervisor-review approval request for them.
 * Used when the assignee submits work for review, and again on resubmission
 * after a rejection — each call creates a fresh pending approval row.
 */
export async function requestTaskSignOff(input: {
  companyId: UUID;
  taskId: UUID;
  requestedByUserId: UUID;
}): Promise<{ requested: boolean; approverUserId: UUID | null }> {
  const task = await getTaskById(input.companyId, input.taskId);
  const approverUserId = (task?.allocated_by_user_id ?? task?.task_owner_user_id ?? null) as UUID | null;
  if (!approverUserId) return { requested: false, approverUserId: null };
  await requestTaskSupervisorApproval({
    companyId: input.companyId,
    taskId: input.taskId,
    requestedByUserId: input.requestedByUserId,
    approverUserId
  });
  return { requested: true, approverUserId };
}

export async function requestTaskSupervisorApproval(input: {
  companyId: UUID;
  taskId: UUID;
  requestedByUserId: UUID;
  approverUserId: UUID;
}): Promise<void> {
  const { createApproval } = await import('./approvalsService');
  await createApproval({
    companyId: input.companyId,
    entityType: 'task_supervisor_review',
    entityId: input.taskId,
    requestedByUserId: input.requestedByUserId,
    approverUserId: input.approverUserId
  });
}

export async function requestTaskManagerApproval(input: {
  companyId: UUID;
  taskId: UUID;
  requestedByUserId: UUID;
  approverUserId: UUID;
}): Promise<void> {
  const { createApproval } = await import('./approvalsService');
  await createApproval({
    companyId: input.companyId,
    entityType: 'task_manager_approval',
    entityId: input.taskId,
    requestedByUserId: input.requestedByUserId,
    approverUserId: input.approverUserId
  });
}

export async function requestTaskAuditorVerification(input: {
  companyId: UUID;
  taskId: UUID;
  requestedByUserId: UUID;
  approverUserId: UUID;
}): Promise<void> {
  const { createApproval } = await import('./approvalsService');
  await createApproval({
    companyId: input.companyId,
    entityType: 'task_auditor_verification',
    entityId: input.taskId,
    requestedByUserId: input.requestedByUserId,
    approverUserId: input.approverUserId
  });
}

export async function setTaskEffectivenessCheck(input: {
  companyId: UUID;
  taskId: UUID;
  actorUserId: UUID;
  checked: boolean;
  notes?: string | null;
}): Promise<Task> {
  const task = await getTaskById(input.companyId, input.taskId);
  if (!task) throw new Error('Task not found.');
  const nowIso = new Date().toISOString().slice(0, 10);
  const { data, error } = await insforge.database
    .from('tasks')
    .update({
      effectiveness_checked: input.checked,
      effectiveness_notes: input.notes ?? null,
      effectiveness_check_date: input.checked ? nowIso : null,
      updated_at: new Date().toISOString()
    })
    .eq('company_id', input.companyId)
    .eq('id', input.taskId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to set effectiveness check.');
  return applyTimeStatusIndicator(data as Task);
}

// ---------- Auto-create tasks from other modules ----------
type QualityNcrLike = {
  id: UUID;
  company_id: UUID;
  title: string;
  description?: string | null;
  severity?: string | null;
  risk_rating?: string | null;
  site_id?: UUID | null;
  department_id?: UUID | null;
  corrective_action_due_date?: string | null;
  corrective_action_owner_user_id?: UUID | null;
  created_by_user_id: UUID;
};

export async function createTaskFromNcr(
  ncr: QualityNcrLike,
  options: { module?: ModuleKey } = {}
): Promise<Task | null> {
  const dueDate = ncr.corrective_action_due_date ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const priority = (ncr.severity === 'critical' || ncr.risk_rating === 'critical' ? 'critical' : ncr.severity === 'high' ? 'high' : 'medium') as Severity;
  try {
    return await createTask({
      companyId: ncr.company_id,
      module: (options.module ?? (ncr as { module?: ModuleKey }).module) ?? 'quality',
      title: `CAPA: ${ncr.title}`,
      description: ncr.description ?? null,
      category: 'capa',
      riskLevel: (ncr.severity === 'critical' || ncr.severity === 'high' ? ncr.severity : ncr.risk_rating === 'high' ? 'high' : 'medium') as Task['risk_level'],
      priority,
      dueAt: dueDate,
      assigneeUserId: ncr.corrective_action_owner_user_id ?? undefined,
      sourceEntityType: 'ncr',
      sourceEntityId: ncr.id,
      createdByUserId: ncr.created_by_user_id
    });
  } catch {
    return null;
  }
}

type InspectionRunItemLike = {
  id: UUID;
  company_id: UUID;
  run_id: UUID;
  question: string;
  comments?: string | null;
  risk_level?: string | null;
  due_date?: string | null;
  responsible_person_id?: UUID | null;
};
type InspectionRunLike = { inspection_id: UUID; site_id?: UUID | null; department_id?: UUID | null; module?: ModuleKey };

export async function createTaskFromInspectionItem(
  run: InspectionRunLike,
  item: InspectionRunItemLike,
  createdByUserId: UUID
): Promise<Task | null> {
  const dueDate = item.due_date ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const priority: Severity = item.risk_level === 'high' ? 'high' : item.risk_level === 'low' ? 'low' : 'medium';
  try {
    return await createTask({
      companyId: item.company_id,
      module: (run.module ?? 'quality') as ModuleKey,
      title: `Inspection NC: ${item.question.slice(0, 80)}${item.question.length > 80 ? '…' : ''}`,
      description: item.comments ?? null,
      category: 'inspection',
      riskLevel: (item.risk_level ?? 'medium') as Task['risk_level'],
      priority,
      dueAt: dueDate,
      assigneeUserId: item.responsible_person_id ?? undefined,
      sourceEntityType: 'inspection_run_item',
      sourceEntityId: item.id,
      createdByUserId
    });
  } catch {
    return null;
  }
}

type PpeIssueTrackerLike = {
  id: UUID;
  company_id: UUID;
  description_of_issue: string;
  risk_level: string;
  responsible_user_id?: UUID | null;
  target_completion_date?: string | null;
  created_by_user_id: UUID;
};

export async function createTaskFromPpeIssue(issue: PpeIssueTrackerLike): Promise<Task | null> {
  const dueDate = issue.target_completion_date ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const priority: Severity = issue.risk_level === 'critical' ? 'critical' : issue.risk_level === 'high' ? 'high' : 'medium';
  try {
    return await createTask({
      companyId: issue.company_id,
      module: 'safety',
      title: `PPE Issue: ${issue.description_of_issue.slice(0, 80)}${issue.description_of_issue.length > 80 ? '…' : ''}`,
      description: issue.description_of_issue,
      category: 'ppe_issue',
      riskLevel: issue.risk_level as Task['risk_level'],
      priority,
      dueAt: dueDate,
      assigneeUserId: issue.responsible_user_id ?? undefined,
      sourceEntityType: 'ppe_issue_tracker',
      sourceEntityId: issue.id,
      createdByUserId: issue.created_by_user_id
    });
  } catch {
    return null;
  }
}

type IncidentLike = {
  id: UUID;
  company_id: UUID;
  module: ModuleKey;
  title: string;
  description?: string | null;
  severity: string;
  assignee_user_id?: UUID | null;
  site_id?: UUID | null;
  department_id?: UUID | null;
  created_by_user_id: UUID;
};

export async function createTaskFromIncident(incident: IncidentLike): Promise<Task | null> {
  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const priority = (incident.severity === 'critical' ? 'critical' : incident.severity === 'high' ? 'high' : 'medium') as Severity;
  try {
    return await createTask({
      companyId: incident.company_id,
      module: incident.module,
      title: `Incident follow-up: ${incident.title}`,
      description: incident.description ?? null,
      category: 'safety_action',
      riskLevel: (incident.severity as Task['risk_level']) ?? 'medium',
      priority,
      dueAt: dueDate,
      assigneeUserId: incident.assignee_user_id ?? undefined,
      sourceEntityType: 'incident',
      sourceEntityId: incident.id,
      createdByUserId: incident.created_by_user_id
    });
  } catch {
    return null;
  }
}

type AuditFindingLike = {
  id: UUID;
  company_id: UUID;
  audit_id: UUID;
  title: string;
  risk_level?: string | null;
  required_action?: string | null;
  responsible_user_id?: UUID | null;
  due_date?: string | null;
  created_by_user_id: UUID;
};

export async function createTaskFromAuditFinding(finding: AuditFindingLike): Promise<Task | null> {
  const dueDate = finding.due_date ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const priority: Severity = finding.risk_level === 'critical' ? 'critical' : finding.risk_level === 'high' ? 'high' : 'medium';
  try {
    return await createTask({
      companyId: finding.company_id,
      module: 'quality',
      title: `Audit action: ${finding.title}`,
      description: finding.required_action ?? null,
      category: 'audit_action',
      riskLevel: (finding.risk_level as Task['risk_level']) ?? 'medium',
      priority,
      dueAt: dueDate,
      assigneeUserId: finding.responsible_user_id ?? undefined,
      sourceEntityType: 'audit_finding',
      sourceEntityId: finding.id,
      createdByUserId: finding.created_by_user_id
    });
  } catch {
    return null;
  }
}

export async function createTaskFromProgramAuditFinding(finding: AuditFindingLike & { deviation_type?: string }): Promise<Task | null> {
  const dueDate = finding.due_date ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const priority: Severity = finding.risk_level === 'critical' ? 'critical' : finding.risk_level === 'high' ? 'high' : 'medium';
  try {
    return await createTask({
      companyId: finding.company_id,
      module: 'quality',
      title: `Audit action: ${finding.title}`,
      description: finding.required_action ?? null,
      category: 'audit_action',
      riskLevel: (finding.risk_level as Task['risk_level']) ?? 'medium',
      priority,
      dueAt: dueDate,
      assigneeUserId: finding.responsible_user_id ?? undefined,
      sourceEntityType: 'program_audit_finding',
      sourceEntityId: finding.id,
      createdByUserId: finding.created_by_user_id
    });
  } catch {
    return null;
  }
}

// ---------- Metrics summary for dashboard ----------
export type TaskMetricsSummary = {
  taskCompletionRate: number;
  overdueCount: number;
  highRiskOpenCount: number;
  capaClosureRate: number;
  taskBacklogCount: number;
  averageClosureTimeDays: number | null;
  timeUtilizationRatio: number | null;
  byDepartment: { departmentId: UUID | null; total: number; closed: number; overdue: number }[];
  byAssignee: { assigneeUserId: UUID | null; total: number; closed: number; overdue: number }[];
  auditActionOpen: number;
  auditActionClosed: number;
  projectTaskProgress: { projectRef: string | null; total: number; closed: number }[];
  kpiScore: number;
};

export type GetTaskMetricsSummaryInput = {
  companyId: UUID;
  dateFrom?: string;
  dateTo?: string;
  departmentId?: UUID;
};

export async function getTaskMetricsSummary(input: GetTaskMetricsSummaryInput): Promise<TaskMetricsSummary> {
  const { companyId, dateFrom, dateTo } = input;
  let base = insforge.database.from('tasks').select('*').eq('company_id', companyId);
  if (dateFrom) base = base.gte('created_at', dateFrom);
  if (dateTo) base = base.lte('created_at', dateTo);
  if (input.departmentId) base = base.eq('department_id', input.departmentId);
  const { data: allTasks, error } = await base.limit(5000);
  if (error) throw new Error(getErrorMessage(error));
  const tasks = (allTasks ?? []) as Task[];

  const total = tasks.length;
  const closed = tasks.filter((t) => t.status === 'closed');
  const closedCount = closed.length;
  const overdueCount = tasks.filter((t) => t.status === 'overdue').length;
  const openTasks = tasks.filter((t) => OPEN_STATUSES.includes(t.status));
  const highRiskOpenCount = openTasks.filter(
    (t) => t.risk_level === 'high' || t.risk_level === 'critical' || t.priority === 'high' || t.priority === 'critical'
  ).length;
  const capaTasks = tasks.filter((t) => t.category === 'capa');
  const capaClosed = capaTasks.filter((t) => t.status === 'closed').length;
  const capaClosureRate = capaTasks.length > 0 ? capaClosed / capaTasks.length : 0;
  const taskBacklogCount = openTasks.length;

  let totalClosureMs = 0;
  let closureCount = 0;
  for (const t of closed) {
    if (t.closure_date && t.created_at) {
      totalClosureMs += new Date(t.closure_date).getTime() - new Date(t.created_at).getTime();
      closureCount += 1;
    }
  }
  const averageClosureTimeDays = closureCount > 0 ? totalClosureMs / closureCount / (24 * 60 * 60 * 1000) : null;

  let totalEstimated = 0;
  let totalSpent = 0;
  for (const t of tasks) {
    if (t.estimated_hours) totalEstimated += t.estimated_hours;
    if (t.time_spent_minutes) totalSpent += t.time_spent_minutes / 60;
  }
  const timeUtilizationRatio = totalEstimated > 0 ? totalSpent / totalEstimated : null;

  const byDept = new Map<string, { total: number; closed: number; overdue: number }>();
  for (const t of tasks) {
    const key = t.department_id ?? 'null';
    if (!byDept.has(key)) byDept.set(key, { total: 0, closed: 0, overdue: 0 });
    const row = byDept.get(key)!;
    row.total += 1;
    if (t.status === 'closed') row.closed += 1;
    if (t.status === 'overdue') row.overdue += 1;
  }
  const byDepartment = Array.from(byDept.entries()).map(([departmentId, v]) => ({
    departmentId: departmentId === 'null' ? null : (departmentId as UUID),
    ...v
  }));

  const byAssign = new Map<string, { total: number; closed: number; overdue: number }>();
  for (const t of tasks) {
    const key = t.assignee_user_id ?? 'null';
    if (!byAssign.has(key)) byAssign.set(key, { total: 0, closed: 0, overdue: 0 });
    const row = byAssign.get(key)!;
    row.total += 1;
    if (t.status === 'closed') row.closed += 1;
    if (t.status === 'overdue') row.overdue += 1;
  }
  const byAssignee = Array.from(byAssign.entries()).map(([assigneeUserId, v]) => ({
    assigneeUserId: assigneeUserId === 'null' ? null : (assigneeUserId as UUID),
    ...v
  }));

  const auditTasks = tasks.filter(
    (t) => t.source_entity_type === 'audit_finding' || t.source_entity_type === 'audit' || t.source_entity_type === 'program_audit_finding'
  );
  const auditActionOpen = auditTasks.filter((t) => OPEN_STATUSES.includes(t.status)).length;
  const auditActionClosed = auditTasks.filter((t) => t.status === 'closed').length;

  const projectTasks = tasks.filter((t) => t.category === 'project_task');
  const byProject = new Map<string, { total: number; closed: number }>();
  for (const t of projectTasks) {
    const key = t.project_ref ?? 'null';
    if (!byProject.has(key)) byProject.set(key, { total: 0, closed: 0 });
    const row = byProject.get(key)!;
    row.total += 1;
    if (t.status === 'closed') row.closed += 1;
  }
  const projectTaskProgress = Array.from(byProject.entries()).map(([projectRef, v]) => ({
    projectRef: projectRef === 'null' ? null : projectRef,
    ...v
  }));

  const taskCompletionRate = total > 0 ? closedCount / total : 0;
  const kpiScore = Math.round(
    (taskCompletionRate * 40 + (1 - overdueCount / Math.max(total, 1)) * 30 + (1 - highRiskOpenCount / Math.max(total, 1)) * 30)
  );
  const kpiScoreBounded = Math.max(0, Math.min(100, kpiScore));

  return {
    taskCompletionRate,
    overdueCount,
    highRiskOpenCount,
    capaClosureRate,
    taskBacklogCount,
    averageClosureTimeDays,
    timeUtilizationRatio,
    byDepartment,
    byAssignee,
    auditActionOpen,
    auditActionClosed,
    projectTaskProgress,
    kpiScore: kpiScoreBounded
  };
}
