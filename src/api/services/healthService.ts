import { insforge } from '../insforge/client';
import type { MedicalCertificate, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';

export async function listMedicalCertificates(companyId: UUID, input?: { userId?: UUID; limit?: number }): Promise<MedicalCertificate[]> {
  const base = insforge.database.from('medical_certificates').select('*').eq('company_id', companyId);
  const q = input?.userId ? base.eq('user_id', input.userId) : base;
  const { data, error } = await q.order('expires_at', { ascending: true }).limit(input?.limit ?? 500);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as MedicalCertificate[];
}

export async function countExpiringMedical(companyId: UUID, withinDays = 30): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);
  const { count, error } = await insforge.database
    .from('medical_certificates')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .lte('expires_at', cutoff.toISOString());
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
}

export async function createMedicalCertificate(input: {
  companyId: UUID;
  userId: UUID;
  certificateType: string;
  issuedAt?: string;
  expiresAt?: string | null;
  status?: MedicalCertificate['status'];
  certificateBucket?: string | null;
  certificateKey?: string | null;
  createdByUserId: UUID;
}): Promise<MedicalCertificate> {
  const { data, error } = await insforge.database
    .from('medical_certificates')
    .insert({
      company_id: input.companyId,
      user_id: input.userId,
      certificate_type: input.certificateType,
      issued_at: input.issuedAt ?? new Date().toISOString(),
      expires_at: input.expiresAt ?? null,
      status: input.status ?? 'valid',
      certificate_bucket: input.certificateBucket ?? null,
      certificate_key: input.certificateKey ?? null,
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create medical certificate.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'medical_certificates.create',
    entityType: 'medical_certificate',
    entityId: (data as any).id as UUID
  });

  return data as MedicalCertificate;
}

