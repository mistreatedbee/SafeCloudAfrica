import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import type { AuditFinding, UUID } from '../models/entities';
import { createActivityLog } from './activityLogService';
import { createTaskFromAuditFinding } from './tasksService';

export async function listAuditFindings(companyId: UUID, inspectionId: UUID, limit = 200): Promise<AuditFinding[]> {
  const { data, error } = await insforge.database
    .from('audit_findings')
    .select('*')
    .eq('company_id', companyId)
    .eq('inspection_id', inspectionId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as AuditFinding[];
}

export async function createAuditFinding(input: {
  companyId: UUID;
  inspectionId: UUID;
  title: string;
  severity?: AuditFinding['severity'];
  status?: AuditFinding['status'];
  nonconformance?: boolean;
  createdByUserId: UUID;
}): Promise<AuditFinding> {
  const { data, error } = await insforge.database
    .from('audit_findings')
    .insert({
      company_id: input.companyId,
      inspection_id: input.inspectionId,
      title: input.title,
      severity: input.severity ?? 'medium',
      status: input.status ?? 'open',
      nonconformance: input.nonconformance ?? false,
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create audit finding.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'audit_findings.create',
    entityType: 'audit_finding',
    entityId: (data as any).id as UUID
  });

  const created = data as AuditFinding;
  if (input.nonconformance) {
    await createTaskFromAuditFinding({
      id: created.id,
      company_id: created.company_id,
      audit_id: created.inspection_id,
      title: created.title,
      risk_level: (created.severity as string) ?? 'medium',
      required_action: null,
      responsible_user_id: null,
      due_date: null,
      created_by_user_id: created.created_by_user_id
    }).catch(() => undefined);
  }

  return data as AuditFinding;
}
