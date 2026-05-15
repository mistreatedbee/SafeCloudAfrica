import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import { ensureInsforgeSession, InsforgeAuthBootstrapError } from '../insforge/ensureSession';
import type { UUID } from '../models/entities';

const ROLE_ORDER = ['owner', 'admin', 'manager', 'supervisor', 'consultant', 'employee', 'auditor'] as const;

function isAuthDeniedError(error: unknown): boolean {
  const status = Number((error as any)?.status ?? (error as any)?.statusCode ?? 0);
  if (status === 401 || status === 403) return true;
  const msg = getErrorMessage(error).toLowerCase();
  return msg.includes('unauthorized') || msg.includes('not authorised') || msg.includes('forbidden');
}

/** Single source of truth: role -> dashboard path. Use for login, activation, and app boot. */
export const ROLE_PATH_MAP: Record<string, string> = {
  owner: '/org/dashboard',
  admin: '/admin/dashboard',
  manager: '/manager/dashboard',
  supervisor: '/supervisor/dashboard',
  consultant: '/consultant/dashboard',
  employee: '/employee/dashboard',
  auditor: '/auditor/dashboard',
};

/**
 * Returns the dashboard path for a role. Use after login, after license activation, and on app boot.
 * SUPER_ADMIN is handled separately (-> /super-admin/overview). For org roles, requires organizationId in session.
 */
export function getDashboardRoute(role: string): string {
  const path = ROLE_PATH_MAP[role?.toLowerCase()];
  return path ?? '/app';
}

export function getDashboardPathByRole(role: string): string {
  return getDashboardRoute(role);
}

/** Returns the dashboard path for the user's best role across memberships, or /app. */
export async function getRoleBasedRedirectPath(userId: UUID): Promise<string> {
  try {
    await ensureInsforgeSession({ reason: 'platform-admin:get-role-based-redirect' });
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

export type LoginRedirectResult = { path: string; organizationId?: UUID; reason?: string };

type CompanyBillingStatus =
  | { kind: 'not_found' }
  | { kind: 'ok' }
  | { kind: 'redirect'; path: string; reason: string };

/** Checks company status and license, returning a 3-way result for the caller to act on. */
async function checkCompanyBillingStatus(companyId: UUID): Promise<CompanyBillingStatus> {
  const { data: company, error: cErr } = await insforge.database
    .from('companies')
    .select('id, status')
    .eq('id', companyId)
    .maybeSingle();
  if (cErr || !company) return { kind: 'not_found' };
  if ((company as { status?: string }).status === 'suspended') {
    return { kind: 'redirect', path: '/billing/status', reason: 'suspended' };
  }
  const { data: licenses } = await insforge.database
    .from('org_licenses')
    .select('id, status, end_date')
    .eq('company_id', companyId)
    .order('end_date', { ascending: false })
    .limit(1);
  const license = Array.isArray(licenses) && licenses.length > 0 ? (licenses[0] as { status: string; end_date: string }) : null;
  if (license) {
    const endDate = new Date(license.end_date);
    const now = new Date();
    if (license.status === 'suspended' || license.status === 'expired' || endDate < now) {
      return { kind: 'redirect', path: '/billing/status', reason: license.status === 'suspended' ? 'suspended' : 'expired' };
    }
  }
  return { kind: 'ok' };
}

/**
 * Resolves post-login redirect: no org → /activate; subscription expired/suspended → /billing/status; else role path.
 * Returns organizationId so the client can set active company before navigating (correct org/tenant for dashboard).
 */
export async function getLoginRedirectPath(userId: UUID, preferredOrganizationId?: UUID | null): Promise<LoginRedirectResult> {
  try {
    await ensureInsforgeSession({ reason: 'platform-admin:get-login-redirect' });
    const { data: memberships, error: mErr } = await insforge.database
      .from('company_memberships')
      .select('company_id, role')
      .eq('user_id', userId);
    if (mErr || !memberships?.length) return { path: '/activate', reason: 'no_org' };

    const membershipRows = memberships as { company_id: UUID; role: string }[];
    if (preferredOrganizationId) {
      const preferredMembership = membershipRows.find((m) => m.company_id === preferredOrganizationId);
      if (preferredMembership) {
        const billing = await checkCompanyBillingStatus(preferredMembership.company_id);
        if (billing.kind === 'redirect') return { path: billing.path, organizationId: preferredMembership.company_id, reason: billing.reason };
        if (billing.kind === 'ok') {
          const path = ROLE_PATH_MAP[preferredMembership.role] ?? '/app';
          return { path, organizationId: preferredMembership.company_id };
        }
        // 'not_found': stored preferred org no longer valid — fall through to best-role logic
      }
    }

    let bestIdx = ROLE_ORDER.length;
    let bestCompanyId: UUID | null = null;
    let bestRole: string | null = null;
    for (const m of membershipRows) {
      const idx = ROLE_ORDER.indexOf(m.role as (typeof ROLE_ORDER)[number]);
      if (idx >= 0 && idx < bestIdx) {
        bestIdx = idx;
        bestCompanyId = m.company_id;
        bestRole = m.role;
      }
    }
    if (!bestCompanyId) return { path: '/activate', reason: 'no_org' };

    const billing = await checkCompanyBillingStatus(bestCompanyId);
    if (billing.kind === 'not_found') return { path: '/activate', reason: 'no_org' };
    if (billing.kind === 'redirect') return { path: billing.path, organizationId: bestCompanyId, reason: billing.reason };

    const path = bestRole ? (ROLE_PATH_MAP[bestRole] ?? '/app') : '/app';
    return { path, organizationId: bestCompanyId };
  } catch {
    return { path: '/activate', reason: 'no_org' };
  }
}

export type EnsureSuperAdminResult =
  | { status: 'ok' }
  | { status: 'auth_failed'; error: InsforgeAuthBootstrapError }
  | { status: 'compat_ignored' };

/** Call RPC so that if current user email is in super_admin_allowed_emails, they get added to platform_admins. No-op otherwise. */
export async function ensureMeAsSuperAdmin(): Promise<EnsureSuperAdminResult> {
  try {
    await ensureInsforgeSession({ reason: 'platform-admin:ensure-me-as-super-admin' });
    const { error } = await insforge.database.rpc('ensure_me_as_super_admin');
    if (error) throw error;
    return { status: 'ok' };
  } catch (error) {
    if (error instanceof InsforgeAuthBootstrapError) {
      return { status: 'auth_failed', error };
    }
    if (isAuthDeniedError(error)) {
      return {
        status: 'auth_failed',
        error: new InsforgeAuthBootstrapError(
          'AUTH_SESSION_INVALID',
          'Your session is not available. Please sign in again.',
          { cause: error }
        )
      };
    }
    const msg = getErrorMessage(error).toLowerCase();
    if (
      msg.includes('does not exist') ||
      msg.includes('function') ||
      msg.includes('not found') ||
      msg.includes('schema cache')
    ) {
      return { status: 'compat_ignored' };
    }
    throw error;
  }
}

export async function isPlatformAdmin(userId: UUID): Promise<boolean> {
  try {
    await ensureInsforgeSession({ reason: 'platform-admin:is-platform-admin' });
    const { data, error } = await insforge.database.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return !!data;
  } catch (err) {
    const msg = getErrorMessage(err);
    // If the table doesn't exist yet, treat as not a platform admin.
    if (msg.toLowerCase().includes('does not exist')) return false;
    if (err instanceof InsforgeAuthBootstrapError || isAuthDeniedError(err)) {
      throw err;
    }
    return false;
  }
}

