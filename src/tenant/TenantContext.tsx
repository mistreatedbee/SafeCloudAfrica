import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useUser } from '@insforge/react';
import { insforge, insforgeReady } from '../api/insforge/client';
import { ensureInsforgeSession, InsforgeAuthBootstrapError } from '../api/insforge/ensureSession';
import type { Company, CompanyMembership, UUID } from '../api/models/entities';
import { createActivityLog } from '../api/services/activityLogService';
import type { CompanyRole, ModuleKey } from '../api/models/core';
import { ensureMeAsSuperAdmin, isPlatformAdmin as checkPlatformAdmin } from '../api/services/platformAdminService';
import { getEnabledModuleKeys, ALL_MODULE_KEYS } from '../api/services/orgModulesService';
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
  /**
   * For consultant/auditor roles: the module keys explicitly granted in their consultant_scope.
   * Empty means no modules have been assigned (all module access denied).
   * For all other roles this is an empty array and should not be used for access decisions.
   */
  consultantAllowedModules: ModuleKey[];
  sellableFeatures: SellableFeaturesConfig;
  isPlatformAdmin: boolean;
  /** True after first refreshTenant() has completed for the current user (so isPlatformAdmin is known). */
  isTenantLoaded: boolean;
  setActiveCompanyId: (companyId: UUID | null) => void;
  refreshTenant: () => Promise<void>;
};

/** localStorage key for active org; shared with client error reporting. */
export const ACTIVE_COMPANY_STORAGE_KEY = 'sca_active_company_id_v3';
const TENANT_DEBUG = (import.meta as any)?.env?.VITE_TENANT_DEBUG === '1';
function debugTenant(...args: unknown[]) {
  if (!TENANT_DEBUG) return;
  console.debug('[tenant-debug]', ...args);
}
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
  await ensureInsforgeSession({ reason: 'tenant:fetch-memberships' });
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
  const didInitialTenantLoadRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const lastTenantRefreshAtRef = useRef(0);
  /** Avoid duplicate session.workspace.active rows on periodic refresh; key = userId:companyId. */
  const workspaceSessionLoggedRef = useRef<string | null>(null);

  const refreshTenant = useCallback(async () => {
    if (!isLoaded) return;
    // Prevent overlapping refreshes from focus/visibility + the 60s interval.
    if (refreshInFlightRef.current) return;
    const now = Date.now();
    // After initial load, throttle rapid focus/visibility triggers.
    if (didInitialTenantLoadRef.current && now - lastTenantRefreshAtRef.current < 5000) return;
    refreshInFlightRef.current = true;
    lastTenantRefreshAtRef.current = now;
    if (!user?.id) {
      setMemberships([]);
      setActiveCompanyIdState(null);
      storeActiveCompanyId(null);
      setIsPlatformAdmin(false);
      workspaceSessionLoggedRef.current = null;
      debugTenant('setIsTenantLoaded(true) (no user)');
      setIsTenantLoaded(true);
      didInitialTenantLoadRef.current = true;
      refreshInFlightRef.current = false;
      return;
    }

    // Only toggle the "loaded" flag during the initial boot. Background refreshes
    // should be silent so RequireWorkspace doesn't unmount protected routes.
    if (!didInitialTenantLoadRef.current) {
      debugTenant('setIsTenantLoaded(false) (initial boot)');
      setIsTenantLoaded(false);
    }
    try {
      await insforgeReady;
      const session = await ensureInsforgeSession({ reason: 'tenant:refresh' });
      const ensureSaResult = await ensureMeAsSuperAdmin();
      if (ensureSaResult.status === 'auth_failed') {
        throw ensureSaResult.error;
      }
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

      const dbIsAdmin = await checkPlatformAdmin(session.userId as UUID);
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
    } catch (error) {
      if (error instanceof InsforgeAuthBootstrapError) {
        debugTenant('auth bootstrap failed during tenant refresh', {
          code: error.code
        });
      }
      // Preserve existing memberships on transient failures to avoid redirect churn.
      try {
        await ensureInsforgeSession({ reason: 'tenant:refresh-fallback-is-platform-admin' });
        const dbIsAdmin = await checkPlatformAdmin(user.id as UUID);
        setIsPlatformAdmin(dbIsAdmin);
      } catch {
        setIsPlatformAdmin(false);
      }
    } finally {
      debugTenant('setIsTenantLoaded(true) (tenant refreshed)');
      setIsTenantLoaded(true);
      didInitialTenantLoadRef.current = true;
      refreshInFlightRef.current = false;
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

  const setActiveCompanyId = useCallback((companyId: UUID | null) => {
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

  const consultantAllowedModules = useMemo<ModuleKey[]>(() => {
    const role = activeMembership?.role;
    if (role !== 'consultant' && role !== 'auditor') return [];
    const allowed = activeMembership?.consultant_scope?.allowedModules;
    if (!allowed?.length) return [];
    const validSet = new Set<string>(ALL_MODULE_KEYS);
    return allowed.filter((m): m is ModuleKey => validSet.has(m));
  }, [activeMembership]);
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
      consultantAllowedModules,
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
      consultantAllowedModules,
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
