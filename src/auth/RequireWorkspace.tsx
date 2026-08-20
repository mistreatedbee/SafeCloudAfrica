import React, { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@insforge/react';
import { useTenant } from '../tenant/TenantContext';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ensureInsforgeSession, InsforgeAuthBootstrapError } from '../api/insforge/ensureSession';
import { PendingInviteAcceptanceError } from '../api/services/tenantService';
import { acceptPendingInviteAndActivateWorkspace } from './acceptPendingInviteWorkspace';

/**
 * Ensures an authenticated user has selected/created a company workspace.
 * - Platform Super Admins are sent to the super-admin dashboard (this wrapper is only used for app routes like /app, /owner).
 * - Regular users with no memberships are redirected to onboarding.
 */
export function RequireWorkspace({ children }: { children: React.ReactElement }) {
  const { isLoaded, isSignedIn } = useAuth();
  const location = useLocation();
  const {
    memberships,
    isPlatformAdmin,
    isTenantLoaded,
    setActiveCompanyId,
    refreshTenant
  } = useTenant();
  const [checkingPendingInvite, setCheckingPendingInvite] = useState(false);
  const [pendingInviteError, setPendingInviteError] = useState<string | null>(null);
  const [acceptedInviteRedirectPath, setAcceptedInviteRedirectPath] = useState<string | null>(null);
  const [authRedirectPath, setAuthRedirectPath] = useState<string | null>(null);
  const pendingInviteAttemptedRef = useRef(false);
  const pendingInviteInFlightRef = useRef(false);

  const hasMemberships = Boolean(memberships && memberships.length > 0);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !isTenantLoaded || isPlatformAdmin || hasMemberships) return;
    if (pendingInviteAttemptedRef.current || pendingInviteInFlightRef.current) return;

    let cancelled = false;
    pendingInviteAttemptedRef.current = true;
    pendingInviteInFlightRef.current = true;
    setPendingInviteError(null);
    setCheckingPendingInvite(true);

    (async () => {
      try {
        const session = await ensureInsforgeSession({ reason: 'workspace:accept-pending-invite' });
        const result = await acceptPendingInviteAndActivateWorkspace({
          userId: session.userId,
          setActiveCompanyId: (companyId: string | null) => setActiveCompanyId(companyId),
          refreshTenant
        });
        if (cancelled) return;
        if (result.status === 'accepted') {
          setAcceptedInviteRedirectPath(result.redirectPath);
          return;
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof InsforgeAuthBootstrapError) {
          const redirect = encodeURIComponent(location.pathname + location.search);
          setAuthRedirectPath(`/login?redirect=${redirect}`);
          return;
        }
        if (error instanceof PendingInviteAcceptanceError) {
          setPendingInviteError(error.message);
          return;
        }
        setPendingInviteError('We could not accept your invitation right now. Please try again or contact support.');
      } finally {
        if (!cancelled) {
          pendingInviteInFlightRef.current = false;
          setCheckingPendingInvite(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    hasMemberships,
    isLoaded,
    isPlatformAdmin,
    isSignedIn,
    isTenantLoaded,
    location.pathname,
    location.search,
    refreshTenant,
    setActiveCompanyId
  ]);

  if (authRedirectPath) return <Navigate to={authRedirectPath} replace />;
  if (acceptedInviteRedirectPath) return <Navigate to={acceptedInviteRedirectPath} replace />;

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
  if (!hasMemberships) {
    if (checkingPendingInvite) {
      return (
        <div className="flex min-h-[40vh] items-center justify-center">
          <LoadingSpinner className="w-8 h-8 border-charcoal-300 border-t-teal" />
        </div>
      );
    }
    if (pendingInviteError) {
      return (
        <div className="flex min-h-[40vh] items-center justify-center px-4">
          <div className="max-w-md rounded-lg border border-critical/30 bg-critical/5 p-4 text-sm text-critical">
            {pendingInviteError}
          </div>
        </div>
      );
    }
    if (!pendingInviteAttemptedRef.current) {
      return (
        <div className="flex min-h-[40vh] items-center justify-center">
          <LoadingSpinner className="w-8 h-8 border-charcoal-300 border-t-teal" />
        </div>
      );
    }
    return <Navigate to="/activate?reason=no_org" replace />;
  }

  return children;
}

