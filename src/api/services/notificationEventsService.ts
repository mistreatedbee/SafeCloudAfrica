import { insforge } from '../insforge/client';
import type { UUID } from '../models/core';
import { getErrorMessage } from '../insforge/errors';
import { createNotification } from './notificationsService';
import { sendEmail, sendTemplatedNotificationEmail } from './emailService';
import type { EmailTemplateKey, EmailTemplateVariables } from './emailTemplates';

export type NotificationEventChannel = 'in_app' | 'email';

export type NotificationRecipientRole =
  | 'owner'
  | 'admin'
  | 'manager'
  | 'supervisor'
  | 'employee'
  | 'consultant'
  | 'auditor';

export type NotificationEventInput = {
  companyId: UUID;
  recipientUserId: UUID;
  channel: NotificationEventChannel;
  eventKey: string;
  eventType: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
};

function isUniqueConflict(error: unknown): boolean {
  const text = getErrorMessage(error).toLowerCase();
  return text.includes('duplicate') || text.includes('unique') || text.includes('23505');
}

export async function createNotificationEvent(input: NotificationEventInput): Promise<{ created: boolean; id?: UUID }> {
  const { data, error } = await insforge.database
    .from('notification_events')
    .insert({
      company_id: input.companyId,
      recipient_user_id: input.recipientUserId,
      channel: input.channel,
      event_key: input.eventKey,
      event_type: input.eventType,
      title: input.title,
      message: input.message,
      metadata: input.metadata ?? {},
      status: 'queued'
    })
    .select('id')
    .single();

  if (error) {
    if (isUniqueConflict(error)) return { created: false };
    throw new Error(getErrorMessage(error));
  }
  return { created: true, id: (data as any)?.id as UUID };
}

async function markNotificationEvent(id: UUID | undefined, status: 'sent' | 'failed' | 'skipped', errorMessage?: string) {
  if (!id) return;
  try {
    await insforge.database
      .from('notification_events')
      .update({
        status,
        sent_at: status === 'sent' ? new Date().toISOString() : null,
        error_message: errorMessage ?? null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);
  } catch {
    // Notification delivery should not block the original business action.
  }
}

async function getRecipientEmail(companyId: UUID, userId: UUID): Promise<string | null> {
  const { data } = await insforge.database
    .from('user_profiles')
    .select('email')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle();
  const email = String((data as any)?.email ?? '').trim();
  return email || null;
}

export async function listRelevantNotificationRecipientIds(input: {
  companyId: UUID;
  roles?: NotificationRecipientRole[];
  userIds?: Array<UUID | null | undefined>;
}): Promise<UUID[]> {
  const ids = new Set<string>();
  for (const userId of input.userIds ?? []) {
    if (userId) ids.add(String(userId));
  }

  if (input.roles?.length) {
    const { data, error } = await insforge.database
      .from('company_memberships')
      .select('user_id')
      .eq('company_id', input.companyId)
      .eq('status', 'ACTIVE')
      .in('role', input.roles);
    if (error) throw new Error(getErrorMessage(error));
    for (const row of data ?? []) {
      if ((row as any).user_id) ids.add(String((row as any).user_id));
    }
  }

  return Array.from(ids) as UUID[];
}

export async function notifyRelevantUsers(input: {
  companyId: UUID;
  eventKey: string;
  eventType: string;
  title: string;
  message: string;
  recipientUserIds: UUID[];
  channels?: NotificationEventChannel[];
  metadata?: Record<string, unknown>;
  emailTemplateKey?: EmailTemplateKey;
  emailVariables?: EmailTemplateVariables;
  actionUrl?: string | null;
  actionLabel?: string | null;
}): Promise<void> {
  const channels = input.channels ?? ['in_app', 'email'];
  const recipients = Array.from(new Set(input.recipientUserIds.filter(Boolean)));

  await Promise.all(recipients.flatMap((recipientUserId) =>
    channels.map(async (channel) => {
      const event = await createNotificationEvent({
        companyId: input.companyId,
        recipientUserId,
        channel,
        eventKey: `${input.eventKey}:${channel}`,
        eventType: input.eventType,
        title: input.title,
        message: input.message,
        metadata: input.metadata
      });
      if (!event.created) return;

      try {
        if (channel === 'in_app') {
          await createNotification(input.companyId, recipientUserId, 'info', input.title, input.message, input.metadata);
        } else {
          const email = await getRecipientEmail(input.companyId, recipientUserId);
          if (!email) {
            await markNotificationEvent(event.id, 'skipped', 'Recipient email not found.');
            return;
          }
          if (input.emailTemplateKey) {
            await sendTemplatedNotificationEmail({
              to: email,
              templateKey: input.emailTemplateKey,
              variables: {
                title: input.title,
                status: input.message,
                ...(input.emailVariables ?? {})
              },
              actionUrl: input.actionUrl,
              actionLabel: input.actionLabel,
              meta: input.metadata
            });
          } else {
            await sendEmail({
              to: email,
              subject: input.title,
              text: `${input.message}\n\nSafe Cloud Africa`,
              html: `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#1f2933"><h2 style="color:#0f766e">${input.title}</h2><p>${input.message}</p><p style="font-size:12px;color:#52606d">Safe Cloud Africa</p></div>`
            });
          }
        }
        await markNotificationEvent(event.id, 'sent');
      } catch (err) {
        await markNotificationEvent(event.id, 'failed', getErrorMessage(err));
      }
    })
  ));
}
