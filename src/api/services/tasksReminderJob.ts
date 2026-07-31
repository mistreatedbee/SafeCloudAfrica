/**
 * Task reminders, overdue marking, and escalations.
 * Intended to be called from a scheduled job (e.g. Supabase cron or external scheduler).
 * Run daily or at configured intervals.
 */

import { insforge } from '../insforge/client';
import type { Task, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';

const REMINDER_DAYS_BEFORE = [7, 3];
const UNACCEPTED_HOURS = 24 * 2; // 2 days
const NO_PROGRESS_DAYS = 7;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

async function notifyTaskJobEvent(input: {
  companyId: UUID;
  task: Pick<Task, 'id' | 'title' | 'due_at'>;
  recipientUserId: UUID;
  eventType: string;
  title: string;
  message: string;
  status: string;
}): Promise<void> {
  const { notifyRelevantUsers } = await import('./notificationEventsService');
  await notifyRelevantUsers({
    companyId: input.companyId,
    eventKey: `${input.eventType}:${input.task.id}:${todayKey()}`,
    eventType: input.eventType,
    title: input.title,
    message: input.message,
    recipientUserIds: [input.recipientUserId],
    emailTemplateKey: 'task_assigned',
    emailVariables: { title: input.task.title, status: input.status, dueDate: input.task.due_at ?? '' },
    actionUrl: `/dashboard/management/tasks/${input.task.id}`,
    metadata: { itemType: 'task', itemId: input.task.id }
  }).catch(() => undefined);
}

/** Mark open tasks past due_at as overdue and notify assignee + owner */
export async function markOverdueTasks(companyId: UUID): Promise<void> {
  const nowIso = new Date().toISOString();
  const { data: openTasks, error } = await insforge.database
    .from('tasks')
    .select('*')
    .eq('company_id', companyId)
    .in('status', ['draft', 'assigned', 'accepted', 'in-progress', 'awaiting-evidence', 'under-review', 'approved', 'reopened'])
    .lt('due_at', nowIso);

  if (error) throw new Error(getErrorMessage(error));
  const tasks = (openTasks ?? []) as Task[];

  for (const task of tasks) {
    await insforge.database
      .from('tasks')
      .update({ status: 'overdue', updated_at: nowIso })
      .eq('company_id', companyId)
      .eq('id', task.id);

    if (task.assignee_user_id) {
      await notifyTaskJobEvent({
        companyId,
        task,
        recipientUserId: task.assignee_user_id,
        eventType: 'task_marked_overdue',
        title: 'Overdue Task',
        message: `Task "${task.title}" is overdue and requires your attention.`,
        status: 'Overdue'
      });
    }
    if (task.task_owner_user_id && task.task_owner_user_id !== task.assignee_user_id) {
      await notifyTaskJobEvent({
        companyId,
        task,
        recipientUserId: task.task_owner_user_id,
        eventType: 'task_marked_overdue',
        title: 'Overdue Task',
        message: `Task "${task.title}" (assigned) is overdue.`,
        status: 'Overdue'
      });
    }
  }
}

/** Send reminders at 7 days, 3 days, and on due date for open tasks */
export async function sendTaskReminders(companyId: UUID): Promise<void> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();

  const { data: openTasks, error } = await insforge.database
    .from('tasks')
    .select('*')
    .eq('company_id', companyId)
    .in('status', ['assigned', 'accepted', 'in-progress', 'awaiting-evidence', 'under-review'])
    .not('due_at', 'is', null)
    .gte('due_at', todayStart)
    .limit(500);

  if (error) throw new Error(getErrorMessage(error));
  const tasks = (openTasks ?? []) as Task[];

  for (const task of tasks) {
    const dueAt = task.due_at ? new Date(task.due_at) : null;
    if (!dueAt) continue;
    const dueDateStart = new Date(dueAt.getFullYear(), dueAt.getMonth(), dueAt.getDate()).toISOString();
    const daysToDue = (dueAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);

    if (daysToDue <= 0 && dueDateStart <= todayEnd) {
      if (task.assignee_user_id) {
        await notifyTaskJobEvent({
          companyId,
          task,
          recipientUserId: task.assignee_user_id,
          eventType: 'task_due_today',
          title: 'Task Due Today',
          message: `Task "${task.title}" is due today.`,
          status: 'Due Today'
        });
      }
      continue;
    }
    for (const d of REMINDER_DAYS_BEFORE) {
      if (daysToDue > d - 0.5 && daysToDue <= d + 0.5 && task.assignee_user_id) {
        await notifyTaskJobEvent({
          companyId,
          task,
          recipientUserId: task.assignee_user_id,
          eventType: `task_due_in_${d}_days`,
          title: 'Task Reminder',
          message: `Task "${task.title}" is due in ${d} days.`,
          status: `Due in ${d} days`
        });
        break;
      }
    }
  }

  const { data: overdueTasks } = await insforge.database
    .from('tasks')
    .select('id, title, due_at, assignee_user_id, task_owner_user_id, risk_level, priority')
    .eq('company_id', companyId)
    .eq('status', 'overdue')
    .limit(200);

  for (const task of overdueTasks ?? []) {
    const t = task as Task;
    if (t.assignee_user_id) {
      await notifyTaskJobEvent({
        companyId,
        task: t,
        recipientUserId: t.assignee_user_id,
        eventType: 'task_overdue_reminder',
        title: 'Overdue Task',
        message: `Task "${t.title}" is overdue.`,
        status: 'Overdue'
      });
    }
  }
}

/** Escalate high-risk and overdue tasks to assignee, owner, managers, admins */
export async function escalateHighRiskTasks(companyId: UUID): Promise<void> {
  const { data: members } = await insforge.database
    .from('company_memberships')
    .select('user_id')
    .eq('company_id', companyId)
    .in('role', ['admin', 'manager', 'supervisor']);

  const managerIds = new Set<UUID>();
  for (const m of members ?? []) {
    const uid = (m as { user_id: UUID }).user_id;
    if (uid) managerIds.add(uid);
  }

  const { data: highRisk, error } = await insforge.database
    .from('tasks')
    .select('*')
    .eq('company_id', companyId)
    .in('status', ['assigned', 'accepted', 'in-progress', 'awaiting-evidence', 'under-review', 'approved', 'overdue'])
    .or('risk_level.eq.high,risk_level.eq.critical,priority.eq.high,priority.eq.critical,status.eq.overdue')
    .limit(200);

  if (error) throw new Error(getErrorMessage(error));
  const tasks = (highRisk ?? []) as Task[];

  for (const task of tasks) {
    const userIds = new Set<UUID>();
    if (task.assignee_user_id) userIds.add(task.assignee_user_id);
    if (task.task_owner_user_id) userIds.add(task.task_owner_user_id);
    managerIds.forEach((id) => userIds.add(id));
    const reason = task.status === 'overdue' ? 'Task is overdue.' : 'High-risk task requires attention.';
    for (const userId of userIds) {
      await notifyTaskJobEvent({
        companyId,
        task,
        recipientUserId: userId,
        eventType: 'task_escalation',
        title: 'Task Escalation',
        message: `"${task.title}": ${reason}`,
        status: 'Escalated'
      });
    }
  }
}

/** Notify managers when tasks have been assigned but not accepted after X hours */
export async function escalateUnacceptedTasks(companyId: UUID): Promise<void> {
  const cutoff = new Date(Date.now() - UNACCEPTED_HOURS * 60 * 60 * 1000).toISOString();
  const { data: assigned, error } = await insforge.database
    .from('tasks')
    .select('*')
    .eq('company_id', companyId)
    .eq('status', 'assigned')
    .lt('updated_at', cutoff)
    .limit(200);

  if (error) throw new Error(getErrorMessage(error));
  const tasks = (assigned ?? []) as Task[];

  const { data: members } = await insforge.database
    .from('company_memberships')
    .select('user_id')
    .eq('company_id', companyId)
    .in('role', ['admin', 'manager', 'supervisor']);

  const managerIds = new Set<UUID>();
  for (const m of members ?? []) {
    const uid = (m as { user_id: UUID }).user_id;
    if (uid) managerIds.add(uid);
  }

  for (const task of tasks) {
    for (const userId of managerIds) {
      await notifyTaskJobEvent({
        companyId,
        task,
        recipientUserId: userId,
        eventType: 'task_unaccepted',
        title: 'Unaccepted Task',
        message: `Task "${task.title}" was assigned but not accepted within ${UNACCEPTED_HOURS / 24} days.`,
        status: 'Unaccepted'
      });
    }
    if (task.task_owner_user_id) {
      await notifyTaskJobEvent({
        companyId,
        task,
        recipientUserId: task.task_owner_user_id,
        eventType: 'task_unaccepted_owner',
        title: 'Unaccepted Task',
        message: `Task "${task.title}" has not been accepted by the assignee.`,
        status: 'Unaccepted'
      });
    }
  }
}

/** Notify owner/manager when task has no progress updates for X days */
export async function escalateNoProgressTasks(companyId: UUID): Promise<void> {
  const cutoff = new Date(Date.now() - NO_PROGRESS_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: openTasks, error } = await insforge.database
    .from('tasks')
    .select('*')
    .eq('company_id', companyId)
    .in('status', ['accepted', 'in-progress'])
    .lt('updated_at', cutoff)
    .limit(200);

  if (error) throw new Error(getErrorMessage(error));
  const tasks = (openTasks ?? []) as Task[];

  for (const task of tasks) {
    const hasProgress = Array.isArray(task.progress_updates) && task.progress_updates.length > 0;
    const lastUpdate = hasProgress && task.progress_updates![0]?.timestamp
      ? new Date(task.progress_updates![0].timestamp)
      : null;
    if (lastUpdate && lastUpdate.getTime() > cutoff) continue;

    const userIds = new Set<UUID>();
    if (task.task_owner_user_id) userIds.add(task.task_owner_user_id);
    if (task.assignee_user_id) userIds.add(task.assignee_user_id);

    const { data: managers } = await insforge.database
      .from('company_memberships')
      .select('user_id')
      .eq('company_id', companyId)
      .in('role', ['admin', 'manager']);
    for (const m of managers ?? []) {
      const uid = (m as { user_id: UUID }).user_id;
      if (uid) userIds.add(uid);
    }

    for (const userId of userIds) {
      await notifyTaskJobEvent({
        companyId,
        task,
        recipientUserId: userId,
        eventType: 'task_no_progress',
        title: 'No Progress on Task',
        message: `Task "${task.title}" has had no progress update in ${NO_PROGRESS_DAYS} days.`,
        status: 'No Progress'
      });
    }
  }
}

/** Run all task reminder and escalation jobs for a company */
export async function runAllTaskJobs(companyId: UUID): Promise<void> {
  await markOverdueTasks(companyId);
  await sendTaskReminders(companyId);
  await escalateHighRiskTasks(companyId);
  await escalateUnacceptedTasks(companyId);
  await escalateNoProgressTasks(companyId);
}
