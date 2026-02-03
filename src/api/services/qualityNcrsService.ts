import { insforge } from '../insforge/client';
import type { QualityNcr, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';

export async function listQualityNcrs(input: { companyId: UUID; limit?: number }): Promise<QualityNcr[]> {
  const { data, error } = await insforge.database
    .from('quality_ncrs')
    .select('*')
    .eq('company_id', input.companyId)
    .order('occurred_at', { ascending: false })
    .limit(input.limit ?? 200);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as QualityNcr[];
}

export async function countOpenQualityNcrs(companyId: UUID): Promise<number> {
  const { count, error } = await insforge.database
    .from('quality_ncrs')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .neq('status', 'closed');
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
}

export async function createQualityNcr(input: {
  companyId: UUID;
  title: string;
  description?: string;
  severity: QualityNcr['severity'];
  createdByUserId: UUID;
}): Promise<QualityNcr> {
  const { data, error } = await insforge.database
    .from('quality_ncrs')
    .insert({
      company_id: input.companyId,
      title: input.title,
      description: input.description ?? null,
      severity: input.severity,
      status: 'open',
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create NCR.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'quality_ncrs.create',
    entityType: 'quality_ncr',
    entityId: (data as any).id as UUID
  });

  return data as QualityNcr;
}

