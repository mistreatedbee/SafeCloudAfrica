import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import type { UUID } from '../models/entities';

const ROLE_ORDER = ['owner', 'admin', 'manager', 'supervisor', 'consultant', 'employee', 'auditor'] as const;

/** Returns the dashboard path for the user's best role across memberships, or /app. */
export async function getRoleBasedRedirectPath(userId: UUID): Promise<string> {
  try {
    const { data, error } = await insforge.database
      .from('company_memberships')
      .select('role')
      .eq('user_id', userId);
    if (error || !data?.length) return '/app';
    const roles = data.map((r: { role: string }) => r.role);
    let bestIdx = ROLE_ORDER.length;
    let bestRole: string | null = null;
    for (const r of roles) {
      const idx = ROLE_ORDER.indexOf(r as (typeof ROLE_ORDER)[number]);
      if (idx >= 0 && idx < bestIdx) {
        bestIdx = idx;
        bestRole = r;
      }
    }
    const pathMap: Record<string, string> = {
      owner: '/owner',
      admin: '/admin',
      manager: '/manager',
      supervisor: '/manager',
      consultant: '/consultant',
      employee: '/employee',
      auditor: '/auditor'
    };
    return bestRole ? (pathMap[bestRole] ?? '/app') : '/app';
  } catch {
    return '/app';
  }
}

/** Call RPC so that if current user email is in super_admin_allowed_emails, they get added to platform_admins. No-op otherwise. */
export async function ensureMeAsSuperAdmin(): Promise<void> {
  try {
    const { error } = await insforge.database.rpc('ensure_me_as_super_admin');
    if (error) throw error;
  } catch {
    // Table or RPC may not exist yet; ignore so login still works
  }
}

export async function isPlatformAdmin(userId: UUID): Promise<boolean> {
  try {
    const { data, error } = await insforge.database.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return !!data;
  } catch (err) {
    const msg = getErrorMessage(err);
    // If the table doesn't exist yet, treat as not a platform admin.
    if (msg.toLowerCase().includes('does not exist')) return false;
    return false;
  }
}

