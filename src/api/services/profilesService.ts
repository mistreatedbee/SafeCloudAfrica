import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import type { UserProfile, UUID } from '../models/entities';
import { createActivityLog } from './activityLogService';

export async function listUserProfiles(companyId: UUID): Promise<UserProfile[]> {
  const { data, error } = await insforge.database
    .from('user_profiles')
    .select('*')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false })
    .limit(2000);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as UserProfile[];
}

export async function upsertMyProfile(input: {
  companyId: UUID;
  userId: UUID;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  department?: string | null;
  site?: string | null;
}): Promise<UserProfile> {
  const { data, error } = await insforge.database
    .from('user_profiles')
    .upsert(
      {
        company_id: input.companyId,
        user_id: input.userId,
        full_name: input.fullName ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        department: input.department ?? null,
        site: input.site ?? null,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'company_id,user_id' }
    )
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to save profile.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.userId,
    action: 'user_profiles.upsert',
    entityType: 'user_profile',
    entityId: (data as any).id as UUID
  });

  return data as UserProfile;
}

export async function upsertUserProfileAsManager(input: {
  companyId: UUID;
  userId: UUID;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  department?: string | null;
  site?: string | null;
}): Promise<UserProfile> {
  const { data, error } = await insforge.database
    .from('user_profiles')
    .upsert(
      {
        company_id: input.companyId,
        user_id: input.userId,
        full_name: input.fullName ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        department: input.department ?? null,
        site: input.site ?? null,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'company_id,user_id' }
    )
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to save profile.');
  return data as UserProfile;
}

