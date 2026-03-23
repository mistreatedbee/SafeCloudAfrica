import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useUser } from '@insforge/react';
import { insforge } from '../api/insforge/client';
import type { Company, CompanyMembership, UUID } from '../api/models/entities';
import { createActivityLog } from '../api/services/activityLogService';
import type { CompanyRole, ModuleKey } from '../api/models/core';
import { ensureMeAsSuperAdmin, isPlatformAdmin as checkPlatformAdmin } from '../api/services/platformAdminService';
import { getEnabledModuleKeys } from '../api/services/orgModulesService';
import { upsertMyProfile } from '../api/services/profilesService';
import { getSellableFeaturesConfig, type SellableFeaturesConfig } from '../api/services/sellableFeaturesService';

type MembershipWithCompany = CompanyMembership & { company?: Company };

type TenantContextValue = {
  memberships: MembershipWithCompany[];
  activeCompanyId: UUID | null;
  activeCompany: Company | null;
  activeRole: CompanyRole | null;
  /** Active company membership row (role, is_hr_manager, scope, etc.). */
  activeMembership: MembershipWithCompany | null;
  /** Module keys enabled for the active org (Super Admin control). Empty = all enabled (e.g. no config). */
  enabledModules: ModuleKey[];
  sellableFeatures: SellableFeaturesConfig;
  isPlatformAdmin: boolean;
  /** True after first refreshTenant() has completed for the current user (so isPlatformAdmin is known). */
  isTenantLoaded: boolean;
  setActiveCompanyId: (companyId: UUID) => void;
  refreshTenant: () => Promise<void>;
};

/** localStorage key for active org; shared with client error reporting. */
export const ACTIVE_COMPANY_STORAGE_KEY = 'sca_active_company_id_v3';
const TenantContext = createContext<TenantContextValue | null>(null);

function getStoredActiveCompanyId(): UUID | null {
  try {
    return (localStorage.getItem(ACTIVE_COMPANY_STORAGE_KEY) as UUID | null) ?? null;
  } catch {
    return null;
  }
}

function storeActiveCompanyId(companyId: UUID | null): void {
  try {
    if (!companyId) localStorage.removeItem(ACTIVE_COMPANY_STORAGE_KEY);
    else localStorage.setItem(ACTIVE_COMPANY_STORAGE_KEY, companyId);
  } catch {
    // ignore storage errors
  }
}

/** Treat ACTIVE or missing status (legacy DB without status column) as active. */
function isActiveMembership(row: { status?: string | null }): boolean {
  const s = row.status;
  return s === 'ACTIVE' || s == null || s === '';
}

async function fetchMemberships(userId: UUID): Promise<MembershipWithCompany[]> {
  const { data, error } = await insforge.database
    .from('company_memberships')
    .select('*, companies(*)')
    .eq('user_id', userId);
  if (error) throw error;
  const rows = (data ?? []).filter(isActiveMembership);
  return rows.map((row: any) => ({
    ...(row as CompanyMembership),
    company: row.companies as Company | undefined
  }));
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser();
  const [memberships, setMemberships] = useState<MembershipWithCompany[]>([]);
  const [activeCompanyId, setActiveCompanyIdState] = useState<UUID | null>(getStoredActiveCompanyId());
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [isTenantLoaded, setIsTenantLoaded] = useState(false);
  /** Avoid duplicate session.workspace.active rows on periodic refresh; key = userId:companyId. */
  const workspaceSessionLoggedRef = useRef<string | null>(null);

  const refreshTenant = useCallback(async () => {
    if (!isLoaded) return;
    if (!user?.id) {
      setMemberships([]);
      setActiveCompanyIdState(null);
      storeActiveCompanyId(null);
      setIsPlatformAdmin(false);
      workspaceSessionLoggedRef.current = null;
      setIsTenantLoaded(true);
      return;
    }

    setIsTenantLoaded(false);
    try {
      await ensureMeAsSuperAdmin();
      const rows = await fetchMemberships(user.id as UUID);
      setMemberships(rows);

      const stored = getStoredActiveCompanyId();
      const hasStored = stored && rows.some((m) => m.company_id === stored);
      const next = hasStored ? stored : rows[0]?.company_id ?? null;
      setActiveCompanyIdState(next);
      storeActiveCompanyId(next);

      // Ensure the signed-in user has a profile row for the active company for HR views,
      // but do not overwrite any user-managed profile fields (name, email, etc.).
      if (next) {
        try {
          await upsertMyProfile({
            companyId: next,
            userId: user.id as UUID
          });
        } catch {
          // ignore profile bootstrap errors (RLS/ordering); HR pages can still function with fallbacks
        }
      }

      const dbIsAdmin = await checkPlatformAdmin(user.id as UUID);
      setIsPlatformAdmin(dbIsAdmin);

      if (next) {
        const sessionKey = `${user.id}:${next}`;
        if (workspaceSessionLoggedRef.current !== sessionKey) {
          workspaceSessionLoggedRef.current = sessionKey;
          void createActivityLog({
            companyId: next,
            actorUserId: user.id as UUID,
            action: 'session.workspace.active',
            metadata: { source: 'tenant_context' }
          }).catch(() => undefined);
        }
      }
    } catch {
      // Preserve existing memberships on transient failures to avoid redirect churn.
      try {
        const dbIsAdmin = await checkPlatformAdmin(user.id as UUID);
        setIsPlatformAdmin(dbIsAdmin);
      } catch {
        setIsPlatformAdmin(false);
      }
    } finally {
      setIsTenantLoaded(true);
    }
  }, [isLoaded, user?.id]);

  useEffect(() => {
    void refreshTenant();
  }, [refreshTenant]);

  // Periodic refresh keeps tenant state current without route disruption.
  useEffect(() => {
    if (!user?.id) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void refreshTenant();
    }, 60000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refreshTenant();
    };
    window.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
    };
  }, [refreshTenant, user?.id]);

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

  const activeMembership = useMemo<MembershipWithCompany | null>(() => {
    if (!activeCompanyId) return null;
    return memberships.find((m) => m.company_id === activeCompanyId) ?? null;
  }, [activeCompanyId, memberships]);

  const enabledModules = useMemo<ModuleKey[]>(() => {
    return getEnabledModuleKeys(activeCompany ?? null);
  }, [activeCompany]);
  const sellableFeatures = useMemo<SellableFeaturesConfig>(() => {
    return getSellableFeaturesConfig(activeCompany ?? null);
  }, [activeCompany]);

  const value = useMemo<TenantContextValue>(
    () => ({
      memberships,
      activeCompanyId,
      activeCompany,
      activeRole,
      activeMembership,
      enabledModules,
      sellableFeatures,
      isPlatformAdmin,
      isTenantLoaded,
      setActiveCompanyId,
      refreshTenant
    }),
    [
      activeCompany,
      activeCompanyId,
      activeRole,
      activeMembership,
      enabledModules,
      isPlatformAdmin,
      isTenantLoaded,
      memberships,
      refreshTenant,
      sellableFeatures,
      setActiveCompanyId
    ]
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used within TenantProvider.');
  return ctx;
}
