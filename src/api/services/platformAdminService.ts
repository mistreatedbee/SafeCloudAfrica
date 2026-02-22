import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import type { UUID } from '../models/entities';

const ROLE_ORDER = ['owner', 'admin', 'manager', 'supervisor', 'consultant', 'employee', 'auditor'] as const;

const ROLE_PATH_MAP: Record<string, string> = {
  owner: '/owner',
  admin: '/admin',
  manager: '/manager',
  supervisor: '/manager',
  consultant: '/consultant',
  employee: '/employee',
  auditor: '/auditor'
};

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
    return bestRole ? (ROLE_PATH_MAP[bestRole] ?? '/app') : '/app';
  } catch {
    return '/app';
  }
}

export type LoginRedirectResult = { path: string; reason?: string };

/**
 * Resolves post-login redirect: no org → /activate; subscription expired/suspended → /billing/status; else role path.
 */
export async function getLoginRedirectPath(userId: UUID): Promise<LoginRedirectResult> {
  try {
    const { data: memberships, error: mErr } = await insforge.database
      .from('company_memberships')
      .select('company_id, role')
      .eq('user_id', userId);
    if (mErr || !memberships?.length) return { path: '/activate', reason: 'no_org' };

    let bestIdx = ROLE_ORDER.length;
    let bestCompanyId: UUID | null = null;
    let bestRole: string | null = null;
    for (const m of memberships as { company_id: UUID; role: string }[]) {
      const idx = ROLE_ORDER.indexOf(m.role as (typeof ROLE_ORDER)[number]);
      if (idx >= 0 && idx < bestIdx) {
        bestIdx = idx;
        bestCompanyId = m.company_id;
        bestRole = m.role;
      }
    }
    if (!bestCompanyId) return { path: '/activate', reason: 'no_org' };

    const { data: company, error: cErr } = await insforge.database
      .from('companies')
      .select('id, status')
      .eq('id', bestCompanyId)
      .maybeSingle();
    if (cErr || !company) return { path: '/activate', reason: 'no_org' };
    const companyStatus = (company as { status?: string }).status;
    if (companyStatus === 'suspended') {
      return { path: '/billing/status', reason: 'suspended' };
    }

    const { data: licenses } = await insforge.database
      .from('org_licenses')
      .select('id, status, end_date')
      .eq('company_id', bestCompanyId)
      .order('end_date', { ascending: false })
      .limit(1);
    const license = Array.isArray(licenses) && licenses.length > 0 ? (licenses[0] as { status: string; end_date: string }) : null;
    if (license) {
      const endDate = new Date(license.end_date);
      const now = new Date();
      if (license.status === 'suspended' || license.status === 'expired' || endDate < now) {
        return { path: '/billing/status', reason: license.status === 'suspended' ? 'suspended' : 'expired' };
      }
    }
    /* No org_licenses row = legacy company; allow role-based redirect */

    const path = bestRole ? (ROLE_PATH_MAP[bestRole] ?? '/app') : '/app';
    return { path };
  } catch {
    return { path: '/activate', reason: 'no_org' };
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

