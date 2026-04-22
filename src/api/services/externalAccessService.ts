import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import type { ExternalAccessGrant, UUID } from '../models/entities';
import { createActivityLog } from './activityLogService';

export async function listExternalAccessGrants(companyId: UUID): Promise<ExternalAccessGrant[]> {
  const { data, error } = await insforge.database
    .from('external_access_grants')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as ExternalAccessGrant[];
}

export async function createExternalAccessGrant(input: {
  companyId: UUID;
  subjectEmail: string;
  subjectUserId?: UUID | null;
  role: ExternalAccessGrant['role'];
  allowedModules: string[];
  allowedSiteIds?: UUID[] | null;
  allowedDepartmentIds?: UUID[] | null;
  auditIds?: UUID[] | null;
  billingMode?: ExternalAccessGrant['billing_mode'];
  startsAt?: string;
  expiresAt: string;
  createdByUserId: UUID;
}): Promise<ExternalAccessGrant> {
  const { data, error } = await insforge.database
    .from('external_access_grants')
    .insert({
      company_id: input.companyId,
      subject_email: input.subjectEmail.trim().toLowerCase(),
      subject_user_id: input.subjectUserId ?? null,
      role: input.role,
      allowed_modules: input.allowedModules,
      allowed_site_ids: input.allowedSiteIds ?? null,
      allowed_department_ids: input.allowedDepartmentIds ?? null,
      audit_ids: input.auditIds ?? null,
      billing_mode: input.billingMode ?? 'seat',
      starts_at: input.startsAt ?? new Date().toISOString(),
      expires_at: input.expiresAt,
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create external access grant.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'external_access_grants.create',
    entityType: 'external_access_grant',
    entityId: (data as ExternalAccessGrant).id,
    metadata: {
      role: input.role,
      subjectEmail: input.subjectEmail,
      allowedModules: input.allowedModules
    }
  });

  return data as ExternalAccessGrant;
}

export async function revokeExternalAccessGrant(input: {
  companyId: UUID;
  grantId: UUID;
  revokedByUserId: UUID;
}): Promise<ExternalAccessGrant> {
  const { data, error } = await insforge.database
    .from('external_access_grants')
    .update({
      status: 'revoked',
      revoked_at: new Date().toISOString(),
      revoked_by_user_id: input.revokedByUserId,
      updated_at: new Date().toISOString()
    })
    .eq('company_id', input.companyId)
    .eq('id', input.grantId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to revoke external access grant.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.revokedByUserId,
    action: 'external_access_grants.revoke',
    entityType: 'external_access_grant',
    entityId: input.grantId
  });

  return data as ExternalAccessGrant;
}
