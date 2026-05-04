import { insforge } from '../insforge/client';
import { ensureInsforgeSession, withInsforgeSession } from '../insforge/ensureSession';
import type { Notification, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';

export async function listMyNotifications(companyId: UUID, userId: UUID, limit = 20): Promise<Notification[]> {
  return withInsforgeSession('notifications:list-my', async () => {
  const { data, error } = await insforge.database
    .from('notifications')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as Notification[];
  });
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

  const severity =
    type === 'error' ? 'critical' :
    type === 'warning' ? 'high' :
    type === 'success' ? 'low' :
    'medium';

  const { data, error } = await insforge.database
    .from('notifications')
    .insert({
      company_id: companyId,
      user_id: userId,
      title,
      message,
      severity,
      read_at: null,
      metadata: metadata || {}
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
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId);

  if (error) throw new Error(getErrorMessage(error));
}

/**
 * Get unread count
 */
export async function getUnreadCount(companyId: UUID, userId: UUID): Promise<number> {
  return withInsforgeSession('notifications:get-unread-count', async () => {
  const { count, error } = await insforge.database
    .from('notifications')
    .select('*', { count: 'planned', head: true })
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) throw new Error(getErrorMessage(error));
  return count || 0;
  });
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
