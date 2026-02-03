import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useUser } from '@insforge/react';
import { insforge } from '../api/insforge/client';
import type { Company, CompanyMembership, UUID } from '../api/models/entities';
import type { CompanyRole } from '../api/models/core';
import { isPlatformAdmin as checkPlatformAdmin } from '../api/services/platformAdminService';
import { upsertMyProfile } from '../api/services/profilesService';

type MembershipWithCompany = CompanyMembership & { company?: Company };

type TenantContextValue = {
  memberships: MembershipWithCompany[];
  activeCompanyId: UUID | null;
  activeCompany: Company | null;
  activeRole: CompanyRole | null;
  isPlatformAdmin: boolean;
  setActiveCompanyId: (companyId: UUID) => void;
  refreshTenant: () => Promise<void>;
};

const ACTIVE_COMPANY_KEY = 'sca_active_company_id_v3';
const TenantContext = createContext<TenantContextValue | null>(null);

function getStoredActiveCompanyId(): UUID | null {
  try {
    return (localStorage.getItem(ACTIVE_COMPANY_KEY) as UUID | null) ?? null;
  } catch {
    return null;
  }
}

function storeActiveCompanyId(companyId: UUID | null): void {
  try {
    if (!companyId) localStorage.removeItem(ACTIVE_COMPANY_KEY);
    else localStorage.setItem(ACTIVE_COMPANY_KEY, companyId);
  } catch {
    // ignore storage errors
  }
}

async function fetchMemberships(userId: UUID): Promise<MembershipWithCompany[]> {
  const { data, error } = await insforge.database.from('company_memberships').select('*, companies(*)').eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...(row as CompanyMembership),
    company: row.companies as Company | undefined
  }));
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser();
  const [memberships, setMemberships] = useState<MembershipWithCompany[]>([]);
  const [activeCompanyId, setActiveCompanyIdState] = useState<UUID | null>(getStoredActiveCompanyId());
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  const refreshTenant = useCallback(async () => {
    if (!isLoaded) return;
    if (!user?.id) {
      setMemberships([]);
      setActiveCompanyIdState(null);
      storeActiveCompanyId(null);
      setIsPlatformAdmin(false);
      return;
    }

    const rows = await fetchMemberships(user.id as UUID);
    setMemberships(rows);

    const stored = getStoredActiveCompanyId();
    const hasStored = stored && rows.some((m) => m.company_id === stored);
    const next = hasStored ? stored : rows[0]?.company_id ?? null;
    setActiveCompanyIdState(next);
    storeActiveCompanyId(next);

    // Ensure the signed-in user has a profile row for the active company (names/emails for HR views).
    if (next) {
      try {
        await upsertMyProfile({
          companyId: next,
          userId: user.id as UUID,
          fullName: ((user.profile as any)?.name as string | undefined) ?? null,
          email: (user.email as string | undefined) ?? null
        });
      } catch {
        // ignore profile bootstrap errors (RLS/ordering); HR pages can still function with fallbacks
      }
    }

    const dbIsAdmin = await checkPlatformAdmin(user.id as UUID);
    setIsPlatformAdmin(dbIsAdmin);
  }, [isLoaded, user?.id]);

  useEffect(() => {
    void refreshTenant();
  }, [refreshTenant]);

  const setActiveCompanyId = useCallback((companyId: UUID) => {
    setActiveCompanyIdState(companyId);
    storeActiveCompanyId(companyId);
  }, []);

  const activeCompany = useMemo(() => {
    if (!activeCompanyId) return null;
    return memberships.find((m) => m.company_id === activeCompanyId)?.company ?? null;
  }, [activeCompanyId, memberships]);

  const activeRole = useMemo<CompanyRole | null>(() => {
    if (!activeCompanyId) return null;
    return memberships.find((m) => m.company_id === activeCompanyId)?.role ?? null;
  }, [activeCompanyId, memberships]);

  const value = useMemo<TenantContextValue>(
    () => ({
      memberships,
      activeCompanyId,
      activeCompany,
      activeRole,
      isPlatformAdmin,
      setActiveCompanyId,
      refreshTenant
    }),
    [activeCompany, activeCompanyId, activeRole, isPlatformAdmin, memberships, refreshTenant, setActiveCompanyId]
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used within TenantProvider.');
  return ctx;
}

