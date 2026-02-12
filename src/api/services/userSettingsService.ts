import { insforge } from '../insforge/client';
import type { UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';

export type UserNotificationSettings = {
  id?: UUID;
  company_id: UUID;
  user_id: UUID;
  email_notifications_enabled: boolean;
  inapp_notifications_enabled: boolean;
  notification_frequency: 'immediate' | 'daily' | 'weekly';
};

export async function getMyUserSettings(companyId: UUID, userId: UUID): Promise<UserNotificationSettings> {
  const { data, error } = await insforge.database
    .from('user_settings')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  if (!data) {
    return {
      company_id: companyId,
      user_id: userId,
      email_notifications_enabled: true,
      inapp_notifications_enabled: true,
      notification_frequency: 'immediate'
    };
  }

  return data as UserNotificationSettings;
}

export async function upsertMyUserSettings(input: {
  companyId: UUID;
  userId: UUID;
  emailNotificationsEnabled?: boolean;
  inappNotificationsEnabled?: boolean;
  notificationFrequency?: 'immediate' | 'daily' | 'weekly';
}): Promise<UserNotificationSettings> {
  const existing = await getMyUserSettings(input.companyId, input.userId);

  const patch: Partial<UserNotificationSettings> = {
    email_notifications_enabled:
      typeof input.emailNotificationsEnabled === 'boolean'
        ? input.emailNotificationsEnabled
        : existing.email_notifications_enabled,
    inapp_notifications_enabled:
      typeof input.inappNotificationsEnabled === 'boolean'
        ? input.inappNotificationsEnabled
        : existing.inapp_notifications_enabled,
    notification_frequency: input.notificationFrequency ?? existing.notification_frequency
  };

  const payload = {
    company_id: input.companyId,
    user_id: input.userId,
    ...patch
  };

  const { data, error } = await insforge.database
    .from('user_settings')
    .upsert(payload, {
      onConflict: 'company_id,user_id'
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(getErrorMessage(error));
  }

  return data as UserNotificationSettings;
}

