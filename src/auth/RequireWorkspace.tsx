import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@insforge/react';
import { useTenant } from '../tenant/TenantContext';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';

/**
 * Ensures an authenticated user has selected/created a company workspace.
 * - Platform Super Admins are sent to the super-admin dashboard (this wrapper is only used for app routes like /app, /owner).
 * - Regular users with no memberships are redirected to onboarding.
 */
export function RequireWorkspace({ children }: { children: React.ReactElement }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { memberships, isPlatformAdmin, isTenantLoaded } = useTenant();
  const membershipsList = Array.isArray(memberships) ? memberships : [];

  if (!isLoaded) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner className="w-8 h-8 border-charcoal-300 border-t-teal" />
      </div>
    );
  }
  if (!isSignedIn) return <Navigate to="/login" replace />;
  if (!isTenantLoaded) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner className="w-8 h-8 border-charcoal-300 border-t-teal" />
      </div>
    );
  }
  if (isPlatformAdmin) return <Navigate to="/super-admin/overview" replace />;
  if (membershipsList.length === 0) return <Navigate to="/activate?reason=no_org" replace />;

  return children;
}

