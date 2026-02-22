import { useUser } from '@insforge/react';
import { useTenant } from '../tenant/TenantContext';

export type IdentityInfo = {
  fullName: string;
  email: string;
  organisationName: string;
  roleLabel: string;
};

function formatRole(role: string | null): string {
  if (!role) return 'Member';
  if (role === 'owner') return 'Organisation Owner';
  if (role === 'admin') return 'Company Admin';
  if (role === 'manager') return 'Manager';
  if (role === 'supervisor') return 'Supervisor';
  if (role === 'consultant') return 'Consultant';
  if (role === 'employee') return 'Employee';
  if (role === 'auditor') return 'Auditor';
  return role;
}

/**
 * Centralised helper for user + organisation identity.
 *
 * Uses:
 * - Auth profile (preferred) for full name
 * - Email as a fallback identifier
 * - Tenant context for organisation name and role
 */
export function useIdentity(): IdentityInfo {
  const { user } = useUser();
  const { activeCompany, activeRole } = useTenant();

  const profileName = (user?.profile as any)?.name as string | undefined;
  const email = (user?.email as string | undefined) ?? '';

  const fullName = profileName?.trim() || email || 'User';
  const organisationName = activeCompany?.name ?? 'Your organisation';
  const roleLabel = formatRole(activeRole ?? null);

  return {
    fullName,
    email,
    organisationName,
    roleLabel,
  };
}

