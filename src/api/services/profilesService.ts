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
  departmentId?: UUID | null;
  siteId?: UUID | null;
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
        department_id: input.departmentId ?? null,
        site_id: input.siteId ?? null,
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
  }
): Promise<UserProfile> {
  const { data, error } = await insforge.database
    .from('user_profiles')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('company_id', companyId)
    .eq('user_id', userId)
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
