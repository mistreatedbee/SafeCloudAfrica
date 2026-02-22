import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@insforge/react';
import { useTenant } from '../tenant/TenantContext';

/**
 * Ensures an authenticated user has selected/created a company workspace.
 * - Platform Super Admins are sent to the super-admin dashboard (this wrapper is only used for app routes like /app, /owner).
 * - Regular users with no memberships are redirected to onboarding.
 */
export function RequireWorkspace({ children }: { children: React.ReactElement }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { memberships, isPlatformAdmin, isTenantLoaded } = useTenant();

  if (!isLoaded) return null;
  if (!isSignedIn) return <Navigate to="/login" replace />;
  if (!isTenantLoaded) return null;
  if (isPlatformAdmin) return <Navigate to="/super-admin/overview" replace />;
  if (!memberships || memberships.length === 0) return <Navigate to="/activate?reason=no_org" replace />;

  return children;
}

