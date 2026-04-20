import { insforge } from '../insforge/client';
import { ensureInsforgeSession } from '../insforge/ensureSession';
import type { Task } from '../models/entities';
import type { Notification, UUID } from '../models/entities';
import type { Severity } from '../models/core';
import { getErrorMessage } from '../insforge/errors';

export async function listMyNotifications(companyId: UUID, userId: UUID, limit = 20): Promise<Notification[]> {
  const { data, error } = await insforge.database
    .from('notifications')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as Notification[];
}

/**
 * Create a notification
 */
export async function createNotification(
  companyId: UUID,
  userId: UUID,
  type: 'info' | 'warning' | 'success' | 'error',
  title: string,
  message: string,
  metadata?: Record<string, any>
): Promise<Notification> {
  await ensureInsforgeSession();

  const { data, error } = await insforge.database
    .from('notifications')
    .insert({
      company_id: companyId,
      user_id: userId,
      type,
      title,
      message,
      metadata: metadata || {},
      read: false
    })
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create notification.');

  return data as Notification;
}

/**
 * Mark notification as read
 */
export async function markNotificationRead(notificationId: UUID): Promise<void> {
  await ensureInsforgeSession();

  const { error } = await insforge.database
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId);

  if (error) throw new Error(getErrorMessage(error));
}

/**
 * Get unread count
 */
export async function getUnreadCount(companyId: UUID, userId: UUID): Promise<number> {
  const { count, error } = await insforge.database
    .from('notifications')
    .select('*', { count: 'planned', head: true })
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .eq('read', false);

  if (error) throw new Error(getErrorMessage(error));
  return count || 0;
}

/**
 * Send approval request notification
 */
export async function notifyApprovalRequest(
  companyId: UUID,
  approverId: UUID,
  itemType: string,
  itemId: UUID,
  requesterName: string
): Promise<void> {
  await createNotification(
    companyId,
    approverId,
    'info',
    'Approval Required',
    `${requesterName} has submitted a ${itemType} that requires your approval.`,
    { itemType, itemId, action: 'approve' }
  );
}

/**
 * Send overdue task notification
 */
export async function notifyOverdueTask(
  companyId: UUID,
  userId: UUID,
  taskTitle: string,
  taskId: UUID
): Promise<void> {
  await createNotification(
    companyId,
    userId,
    'warning',
    'Overdue Task',
    `Task "${taskTitle}" is overdue and requires attention.`,
    { taskId, action: 'view_task' }
  );
}

export async function notifyTaskAssigned(
  companyId: UUID,
  userId: UUID,
  taskTitle: string,
  priority: Severity
): Promise<void> {
  await createNotification(
    companyId,
    userId,
    priority === 'critical' || priority === 'high' ? 'warning' : 'info',
    'Task Assigned',
    `You have been assigned "${taskTitle}".`,
    { action: 'view_task', priority }
  );
}

export async function notifyHighRiskTaskEscalation(companyId: UUID, task: Pick<Task, 'id' | 'title' | 'priority' | 'risk_level'>): Promise<void> {
  const { data, error } = await insforge.database
    .from('user_profiles')
    .select('user_id, role')
    .eq('company_id', companyId);

  if (error) throw new Error(getErrorMessage(error));

  const recipients = (data ?? []).filter((profile: any) =>
    ['owner', 'admin', 'manager', 'supervisor', 'consultant'].includes(String(profile?.role ?? '').toLowerCase())
  );

  const level = String(task.risk_level ?? task.priority ?? 'high').toUpperCase();

  await Promise.all(
    recipients
      .map((profile: any) => profile?.user_id as UUID | null)
      .filter((userId): userId is UUID => Boolean(userId))
      .map((userId) =>
        createNotification(
          companyId,
          userId,
          'warning',
          'High Risk Task Escalation',
          `Task "${task.title}" requires attention (${level}).`,
          { action: 'view_task', taskId: task.id, riskLevel: task.risk_level ?? task.priority ?? 'high' }
        )
      )
  );
}

/**
 * Send incident notification
 */
export async function notifyIncidentCreated(
  companyId: UUID,
  userId: UUID,
  incidentTitle: string,
  incidentId: UUID
): Promise<void> {
  await createNotification(
    companyId,
    userId,
    'error',
    'New Incident Reported',
    `Incident "${incidentTitle}" has been reported and requires investigation.`,
    { incidentId, action: 'investigate' }
  );
}
