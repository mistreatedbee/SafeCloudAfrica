import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, useUser } from '@insforge/react';
import { useTenant } from '../tenant/TenantContext';
import { isPlatformAdmin as checkPlatformAdmin } from '../api/services/platformAdminService';
import type { UUID } from '../api/models/entities';

export function RequirePlatformAdmin({ children }: { children: React.ReactElement }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { isPlatformAdmin, refreshTenant } = useTenant();
  const [recheckResult, setRecheckResult] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user?.id || isPlatformAdmin) return;
    if (recheckResult !== null) return;
    let cancelled = false;
    checkPlatformAdmin(user.id as UUID).then((ok) => {
      if (!cancelled) {
        setRecheckResult(ok);
        if (ok) void refreshTenant();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, user?.id, isPlatformAdmin, recheckResult, refreshTenant]);

  if (!isLoaded) return null;
  if (!isSignedIn) return <Navigate to="/login" replace />;
  if (isPlatformAdmin || recheckResult === true) return children;
  if (recheckResult === false) return <Navigate to="/app" replace />;
  return <div className="flex items-center justify-center min-h-[200px] text-charcoal-500">Checking access…</div>;
}

