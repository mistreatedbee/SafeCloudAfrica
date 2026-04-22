import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import type { UserProfile, UUID } from '../models/entities';
import { createActivityLog } from './activityLogService';

export function resolveUserProfileAvatarUrl(profile: Pick<UserProfile, 'avatar_bucket' | 'avatar_key'> | null | undefined): string | null {
  const bucket = profile?.avatar_bucket?.trim();
  const key = profile?.avatar_key?.trim();
  if (!bucket || !key) return null;
  try {
    return insforge.storage.from(bucket).getPublicUrl(key);
  } catch {
    return null;
  }
}

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
  avatarBucket?: string | null;
  avatarKey?: string | null;
}): Promise<UserProfile> {
  const payload: Record<string, unknown> = {
    company_id: input.companyId,
    user_id: input.userId,
    updated_at: new Date().toISOString()
  };
  if ('fullName' in input) payload.full_name = input.fullName ?? null;
  if ('email' in input) payload.email = input.email ?? null;
  if ('phone' in input) payload.phone = input.phone ?? null;
  if ('department' in input) payload.department = input.department ?? null;
  if ('site' in input) payload.site = input.site ?? null;
  if ('avatarBucket' in input) payload.avatar_bucket = input.avatarBucket ?? null;
  if ('avatarKey' in input) payload.avatar_key = input.avatarKey ?? null;

  const { data, error } = await insforge.database
    .from('user_profiles')
    .upsert(payload, { onConflict: 'company_id,user_id' })
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
  avatarBucket?: string | null;
  avatarKey?: string | null;
  departmentId?: UUID | null;
  siteId?: UUID | null;
}): Promise<UserProfile> {
  const payload: Record<string, unknown> = {
    company_id: input.companyId,
    user_id: input.userId,
    updated_at: new Date().toISOString()
  };
  if ('fullName' in input) payload.full_name = input.fullName ?? null;
  if ('email' in input) payload.email = input.email ?? null;
  if ('phone' in input) payload.phone = input.phone ?? null;
  if ('department' in input) payload.department = input.department ?? null;
  if ('site' in input) payload.site = input.site ?? null;
  if ('avatarBucket' in input) payload.avatar_bucket = input.avatarBucket ?? null;
  if ('avatarKey' in input) payload.avatar_key = input.avatarKey ?? null;
  if ('departmentId' in input) payload.department_id = input.departmentId ?? null;
  if ('siteId' in input) payload.site_id = input.siteId ?? null;

  const { data, error } = await insforge.database
    .from('user_profiles')
    .upsert(payload, { onConflict: 'company_id,user_id' })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to save profile.');
  return data as UserProfile;
}

export async function adminUpdateEmployeeNumber(input: {
  companyId: UUID;
  userId: UUID;
  employeeNumber: string;
}): Promise<string> {
  const employeeNumber = input.employeeNumber.trim();
  if (!employeeNumber) throw new Error('Employee number is required.');

  const { data, error } = await insforge.database
    .from('user_profiles')
    .update({
      employee_number: employeeNumber,
      updated_at: new Date().toISOString()
    })
    .eq('company_id', input.companyId)
    .eq('user_id', input.userId)
    .select('employee_number')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update employee number.');
  return String((data as any).employee_number ?? employeeNumber);
}

/**
 * Get user profile by company_id and user_id
 */
export async function getUserProfile(
  companyId: UUID,
  userId: UUID
): Promise<UserProfile | null> {
  const { data, error } = await insforge.database
    .from('user_profiles')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 is "no rows found"
    throw new Error(getErrorMessage(error));
  }

  return (data as UserProfile) || null;
}

export async function getMyProfile(companyId: UUID, userId: UUID): Promise<UserProfile | null> {
  return await getUserProfile(companyId, userId);
}

/**
 * Update user profile
 */
export async function updateUserProfile(
  companyId: UUID,
  userId: UUID,
  updates: {
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    department?: string | null;
    site?: string | null;
    avatar_bucket?: string | null;
    avatar_key?: string | null;
  }
): Promise<UserProfile> {
  const patch: Record<string, unknown> = {
    company_id: companyId,
    user_id: userId,
    updated_at: new Date().toISOString()
  };
  if ('full_name' in updates) patch.full_name = updates.full_name ?? null;
  if ('email' in updates) patch.email = updates.email ?? null;
  if ('phone' in updates) patch.phone = updates.phone ?? null;
  if ('department' in updates) patch.department = updates.department ?? null;
  if ('site' in updates) patch.site = updates.site ?? null;
  if ('avatar_bucket' in updates) patch.avatar_bucket = updates.avatar_bucket ?? null;
  if ('avatar_key' in updates) patch.avatar_key = updates.avatar_key ?? null;

  const { data, error } = await insforge.database
    .from('user_profiles')
    .upsert(patch, { onConflict: 'company_id,user_id' })
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update profile.');

  await createActivityLog({
    companyId,
    actorUserId: userId,
    action: 'user_profiles.update',
    entityType: 'user_profile',
    entityId: (data as any).id as UUID
  });

  return data as UserProfile;
}
