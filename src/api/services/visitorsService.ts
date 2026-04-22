import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import type { Visitor, UUID } from '../models/entities';
import { createActivityLog } from './activityLogService';
import { requireSellableFeatureAccess } from './sellableFeaturesService';

export async function listVisitors(companyId: UUID, limit = 200): Promise<Visitor[]> {
  await requireSellableFeatureAccess(companyId, 'contractorsVisitors');
  const { data, error } = await insforge.database
    .from('visitors')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as Visitor[];
}

export async function createVisitor(input: {
  companyId: UUID;
  name: string;
  hostUserId?: UUID | null;
  visitDate?: string | null;
  qrCode?: string | null;
  status?: Visitor['status'];
  briefing?: Visitor['briefing'];
  notes?: string | null;
  createdByUserId: UUID;
}): Promise<Visitor> {
  await requireSellableFeatureAccess(input.companyId, 'contractorsVisitors');
  const { data, error } = await insforge.database
    .from('visitors')
    .insert({
      company_id: input.companyId,
      name: input.name,
      host_user_id: input.hostUserId ?? null,
      visit_date: input.visitDate ?? null,
      qr_code: input.qrCode ?? null,
      status: input.status ?? 'scheduled',
      briefing: input.briefing ?? 'pending',
      notes: input.notes ?? null,
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create visitor.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'visitors.create',
    entityType: 'visitor',
    entityId: (data as any).id as UUID
  });

  return data as Visitor;
}

export async function listVisitorQrSessions(companyId: UUID): Promise<Array<{ id: UUID; visitor_id: UUID; qr_code: string; status: string; signed_in_at: string | null; signed_out_at: string | null }>> {
  const { data, error } = await insforge.database
    .from('visitor_qr_sessions')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as Array<{ id: UUID; visitor_id: UUID; qr_code: string; status: string; signed_in_at: string | null; signed_out_at: string | null }>;
}

export async function createVisitorQrSession(input: {
  companyId: UUID;
  visitorId: UUID;
  qrCode: string;
  createdByUserId: UUID;
}): Promise<{ id: UUID; visitor_id: UUID; qr_code: string; status: string }> {
  const { data, error } = await insforge.database
    .from('visitor_qr_sessions')
    .insert({
      company_id: input.companyId,
      visitor_id: input.visitorId,
      qr_code: input.qrCode,
      status: 'generated',
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  return data as { id: UUID; visitor_id: UUID; qr_code: string; status: string };
}

