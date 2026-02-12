import { insforge } from '../insforge/client';
import { ensureInsforgeSession } from '../insforge/ensureSession';
import type { Notification, UUID } from '../models/entities';
import type { Severity } from '../models/core';
import { getErrorMessage } from '../insforge/errors';

async function isInAppNotificationsEnabled(companyId: UUID, userId: UUID): Promise<boolean> {
  const { data, error } = await insforge.database
    .from('user_settings')
    .select('inapp_notifications_enabled')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    // Fail open: do not block notifications if preferences lookup fails
    console.warn?.('Failed to load user_settings for notifications', error);
    return true;
  }

  if (!data) return true;
  // Default to true when column is null/undefined to match schema default
  return (data as any).inapp_notifications_enabled !== false;
}

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
 * Create an in-app notification, respecting user_settings.inapp_notifications_enabled.
 * Returns the created notification, or null if suppressed by preferences.
 */
export async function createNotification(
  companyId: UUID,
  userId: UUID,
  severity: Severity,
  title: string,
  message: string
): Promise<Notification | null> {
  await ensureInsforgeSession();

  const enabled = await isInAppNotificationsEnabled(companyId, userId);
  if (!enabled) {
    return null;
  }

  const { data, error } = await insforge.database
    .from('notifications')
    .insert({
      company_id: companyId,
      user_id: userId,
      title,
      message,
      severity,
      read_at: null
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

  const nowIso = new Date().toISOString();
  const { error } = await insforge.database
    .from('notifications')
    .update({ read_at: nowIso })
    .eq('id', notificationId);

  if (error) throw new Error(getErrorMessage(error));
}

/**
 * Get unread count
 */
export async function getUnreadCount(companyId: UUID, userId: UUID): Promise<number> {
  const { count, error } = await insforge.database
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .is('read_at', null);

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
    'medium',
    'Approval Required',
    `${requesterName} has submitted a ${itemType} that requires your approval.`
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
    'high',
    'Overdue Task',
    `Task "${taskTitle}" is overdue and requires attention.`
  );
}

/**
 * Send incident notification to an assignee or owner
 */
export async function notifyIncidentCreated(
  companyId: UUID,
  userId: UUID,
  incidentTitle: string,
  severity: Severity
): Promise<void> {
  await createNotification(
    companyId,
    userId,
    severity,
    'New Incident Reported',
    `Incident "${incidentTitle}" has been reported and requires investigation.`
  );
}

/**
 * Send NCR created notification to key stakeholders
 */
export async function notifyNcrCreated(
  companyId: UUID,
  userId: UUID,
  ncrTitle: string,
  severity: Severity
): Promise<void> {
  await createNotification(
    companyId,
    userId,
    severity,
    'New NCR Raised',
    `NCR "${ncrTitle}" has been raised and requires your attention.`
  );
}

/**
 * Notify a user that they have been assigned a task
 */
export async function notifyTaskAssigned(
  companyId: UUID,
  assigneeUserId: UUID,
  taskTitle: string,
  priority: Severity
): Promise<void> {
  await createNotification(
    companyId,
    assigneeUserId,
    priority,
    'New Task Assigned',
    `You have been assigned the task "${taskTitle}".`
  );
}

/**
 * Notify a user that a risk assessment has been created
 */
export async function notifyRiskAssessmentCreated(
  companyId: UUID,
  userId: UUID,
  assessmentTitle: string,
  isCritical: boolean
): Promise<void> {
  await createNotification(
    companyId,
    userId,
    isCritical ? 'high' : 'medium',
    'New Risk Assessment Created',
    `Risk assessment "${assessmentTitle}" has been created.`
  );
}

