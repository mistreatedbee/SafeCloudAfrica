import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useUser } from '@insforge/react';
import { useTenant } from '../tenant/TenantContext';
import type { UserProfile } from '../api/models/entities';
import { getUserProfile, resolveUserProfileAvatarUrl } from '../api/services/profilesService';

export type IdentityInfo = {
  fullName: string;
  email: string;
  organisationName: string;
  roleLabel: string;
  avatarUrl: string | null;
  profile: UserProfile | null;
  isLoading: boolean;
  refreshIdentity: () => Promise<void>;
  setIdentityProfile: (profile: UserProfile | null) => void;
};

type IdentityContextValue = IdentityInfo;

const IdentityContext = createContext<IdentityContextValue | null>(null);

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

export function IdentityProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const { activeCompany, activeCompanyId, activeRole } = useTenant();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refreshIdentity = useCallback(async () => {
    if (!activeCompanyId || !user?.id) {
      setProfile(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const nextProfile = await getUserProfile(activeCompanyId, user.id as any);
      setProfile(nextProfile);
    } catch {
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  }, [activeCompanyId, user?.id]);

  useEffect(() => {
    void refreshIdentity();
  }, [refreshIdentity]);

  const value = useMemo<IdentityContextValue>(() => {
    const authProfile = (user?.profile as Record<string, unknown> | undefined) ?? {};
    const authName = typeof authProfile.name === 'string' ? authProfile.name.trim() : '';
    const email = (user?.email as string | undefined) ?? '';
    const profileName = profile?.full_name?.trim() ?? '';
    const fullName = profileName || authName || email || 'User';
    const organisationName = activeCompany?.name ?? 'Your organisation';
    const roleLabel = formatRole(activeRole ?? null);
    const authAvatarUrl = typeof authProfile.avatarUrl === 'string' ? authProfile.avatarUrl : null;
    const avatarUrl = resolveUserProfileAvatarUrl(profile) ?? authAvatarUrl;

    return {
      fullName,
      email,
      organisationName,
      roleLabel,
      avatarUrl,
      profile,
      isLoading,
      refreshIdentity,
      setIdentityProfile: setProfile
    };
  }, [activeCompany?.name, activeRole, isLoading, profile, refreshIdentity, user?.email, user?.profile]);

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

export function useIdentity(): IdentityInfo {
  const ctx = useContext(IdentityContext);
  if (!ctx) throw new Error('useIdentity must be used within IdentityProvider.');
  return ctx;
}
