/**
 * Task reminders, overdue marking, and escalations.
 * Intended to be called from a scheduled job (e.g. Supabase cron or external scheduler).
 * Run daily or at configured intervals.
 */

import { insforge } from '../insforge/client';
import type { Task, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { createNotification } from './notificationsService';
import type { Severity } from '../models/core';

const REMINDER_DAYS_BEFORE = [7, 3];
const UNACCEPTED_HOURS = 24 * 2; // 2 days
const NO_PROGRESS_DAYS = 7;

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

    const severity: Severity = (task.risk_level === 'critical' || task.priority === 'critical' ? 'critical' : 'high') as Severity;
    if (task.assignee_user_id) {
      await createNotification(
        companyId,
        task.assignee_user_id,
        severity,
        'Overdue Task',
        `Task "${task.title}" is overdue and requires your attention.`
      ).catch(() => undefined);
    }
    if (task.task_owner_user_id && task.task_owner_user_id !== task.assignee_user_id) {
      await createNotification(
        companyId,
        task.task_owner_user_id,
        severity,
        'Overdue Task',
        `Task "${task.title}" (assigned) is overdue.`
      ).catch(() => undefined);
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

    let severity: Severity = 'medium';
    if (task.risk_level === 'high' || task.risk_level === 'critical' || task.priority === 'high' || task.priority === 'critical') {
      severity = 'high';
    }

    if (daysToDue <= 0 && dueDateStart <= todayEnd) {
      await createNotification(
        companyId,
        task.assignee_user_id!,
        severity,
        'Task Due Today',
        `Task "${task.title}" is due today.`
      ).catch(() => undefined);
      continue;
    }
    for (const d of REMINDER_DAYS_BEFORE) {
      if (daysToDue > d - 0.5 && daysToDue <= d + 0.5 && task.assignee_user_id) {
        await createNotification(
          companyId,
          task.assignee_user_id,
          severity,
          'Task Reminder',
          `Task "${task.title}" is due in ${d} days.`
        ).catch(() => undefined);
        break;
      }
    }
  }

  const { data: overdueTasks } = await insforge.database
    .from('tasks')
    .select('id, title, assignee_user_id, task_owner_user_id, risk_level, priority')
    .eq('company_id', companyId)
    .eq('status', 'overdue')
    .limit(200);

  for (const task of overdueTasks ?? []) {
    const t = task as Task;
    const sev: Severity = (t.risk_level === 'critical' || t.priority === 'critical' ? 'critical' : 'high') as Severity;
    if (t.assignee_user_id) {
      await createNotification(
        companyId,
        t.assignee_user_id,
        sev,
        'Overdue Task',
        `Task "${t.title}" is overdue.`
      ).catch(() => undefined);
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

  const severity: Severity = 'high';
  for (const task of tasks) {
    const userIds = new Set<UUID>();
    if (task.assignee_user_id) userIds.add(task.assignee_user_id);
    if (task.task_owner_user_id) userIds.add(task.task_owner_user_id);
    managerIds.forEach((id) => userIds.add(id));
    const reason = task.status === 'overdue' ? 'Task is overdue.' : 'High-risk task requires attention.';
    for (const userId of userIds) {
      await createNotification(
        companyId,
        userId,
        severity,
        'Task Escalation',
        `"${task.title}": ${reason}`
      ).catch(() => undefined);
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
      await createNotification(
        companyId,
        userId,
        'medium',
        'Unaccepted Task',
        `Task "${task.title}" was assigned but not accepted within ${UNACCEPTED_HOURS / 24} days.`
      ).catch(() => undefined);
    }
    if (task.task_owner_user_id) {
      await createNotification(
        companyId,
        task.task_owner_user_id,
        'medium',
        'Unaccepted Task',
        `Task "${task.title}" has not been accepted by the assignee.`
      ).catch(() => undefined);
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
      await createNotification(
        companyId,
        userId,
        'medium',
        'No Progress on Task',
        `Task "${task.title}" has had no progress update in ${NO_PROGRESS_DAYS} days.`
      ).catch(() => undefined);
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
