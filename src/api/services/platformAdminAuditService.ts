import { insforge } from '../insforge/client';
import type { UUID } from '../models/entities';

export type AuditAction =
  | 'license_created'
  | 'module_toggled'
  | 'user_role_changed'
  | 'user_disabled'
  | 'support_mode_entered'
  | 'support_mode_exited';

export type AuditLogRow = {
  id: UUID;
  actor_user_id: UUID;
  action: string;
  target_company_id: UUID | null;
  target_user_id: UUID | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

/** Call after a Super Admin action. Pass current user id (e.g. from useUser). RLS ensures only platform admin can insert and actor_user_id must match request user. */
export async function logPlatformAdminAction(
  actorUserId: UUID,
  params: {
    action: AuditAction;
    target_company_id?: UUID | null;
    target_user_id?: UUID | null;
    details?: Record<string, unknown> | null;
  }
): Promise<void> {
  try {
    await insforge.database.from('platform_admin_audit_logs').insert({
      actor_user_id: actorUserId,
      action: params.action,
      target_company_id: params.target_company_id ?? null,
      target_user_id: params.target_user_id ?? null,
      details: params.details ?? null
    });
  } catch {
    // Do not block the main action if audit insert fails
  }
}

export async function listPlatformAdminAuditLogs(limit = 200): Promise<AuditLogRow[]> {
  const { data, error } = await insforge.database
    .from('platform_admin_audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AuditLogRow[];
}
