import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import type { UserProfile, UUID } from '../models/entities';
import { createActivityLog } from './activityLogService';
import { syncTrainingRequirementsForUser } from './trainingService';

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

export async function getMyProfile(companyId: UUID, userId: UUID): Promise<UserProfile | null> {
  const { data, error } = await insforge.database
    .from('user_profiles')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(getErrorMessage(error));
  return (data ?? null) as UserProfile | null;
}

export async function upsertMyProfile(input: {
  companyId: UUID;
  userId: UUID;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  department?: string | null;
  site?: string | null;
  siteId?: UUID | null;
  departmentId?: UUID | null;
}): Promise<UserProfile> {
  const payload = {
    company_id: input.companyId,
    user_id: input.userId,
    full_name: input.fullName ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    site_id: input.siteId ?? null,
    department_id: input.departmentId ?? null,
    department: input.department ?? null,
    site: input.site ?? null,
    updated_at: new Date().toISOString()
  };
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
  siteId?: UUID | null;
  departmentId?: UUID | null;
  jobDescriptionId?: UUID | null;
  employeeNumber?: string | null;
  supervisorUserId?: UUID | null;
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
        site_id: input.siteId ?? null,
        department_id: input.departmentId ?? null,
        department: input.department ?? null,
        site: input.site ?? null,
        job_description_id: input.jobDescriptionId ?? null,
        employee_number: input.employeeNumber ?? null,
        supervisor_user_id: input.supervisorUserId ?? null,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'company_id,user_id' }
    )
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to save profile.');
  const profile = data as UserProfile;
  if (input.jobDescriptionId !== undefined) {
    await syncTrainingRequirementsForUser(input.userId, input.companyId);
  }
  return profile;
}

/**
 * Get user profile by company_id and user_id (legacy helper)
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
    .maybeSingle();

  if (error) throw new Error(getErrorMessage(error));
  return (data ?? null) as UserProfile | null;
}

/**
 * Update user profile (name/email/phone, site/department, job description, etc.)
 * When job_description_id is updated, training requirements are synced for that user.
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
    job_description_id?: UUID | null;
    employee_number?: string | null;
    supervisor_user_id?: UUID | null;
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

  if (updates.job_description_id !== undefined) {
    await syncTrainingRequirementsForUser(userId, companyId);
  }

  await createActivityLog({
    companyId,
    actorUserId: userId,
    action: 'user_profiles.update',
    entityType: 'user_profile',
    entityId: (data as { id: UUID }).id
  });

  return data as UserProfile;
}

