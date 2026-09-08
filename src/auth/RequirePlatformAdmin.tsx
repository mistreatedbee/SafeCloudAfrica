import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, useUser } from '@insforge/react';
import { useTenant } from '../tenant/TenantContext';
import {
  isPlatformAdmin as checkPlatformAdmin,
  PlatformAdminCheckUnavailableError
} from '../api/services/platformAdminService';
import { InsforgeAuthBootstrapError } from '../api/insforge/ensureSession';
import type { UUID } from '../api/models/entities';

export function RequirePlatformAdmin({ children }: { children: React.ReactElement }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { isPlatformAdmin, refreshTenant } = useTenant();
  const [recheckResult, setRecheckResult] = useState<boolean | null>(null);
  const [authFailed, setAuthFailed] = useState(false);
  const [backendUnavailable, setBackendUnavailable] = useState<string | null>(null);
  const [recheckAttempt, setRecheckAttempt] = useState(0);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user?.id || isPlatformAdmin) return;
    if (recheckResult !== null && !backendUnavailable) return;
    let cancelled = false;
    setBackendUnavailable(null);
    checkPlatformAdmin(user.id as UUID)
      .then((ok) => {
        if (!cancelled) {
          setRecheckResult(ok);
          if (ok) void refreshTenant();
        }
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof InsforgeAuthBootstrapError) {
          setAuthFailed(true);
          return;
        }
        if (error instanceof PlatformAdminCheckUnavailableError) {
          setRecheckResult(null);
          setBackendUnavailable(error.message);
          return;
        }
        setRecheckResult(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, user?.id, isPlatformAdmin, recheckResult, refreshTenant, backendUnavailable, recheckAttempt]);

  if (!isLoaded) return null;
  if (!isSignedIn || authFailed) return <Navigate to="/login" replace />;
  if (backendUnavailable) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white border border-surface-300 rounded-2xl shadow-card p-6 space-y-4">
          <h1 className="text-lg font-semibold text-charcoal">Super Admin check unavailable</h1>
          <p className="text-sm text-charcoal-600">{backendUnavailable}</p>
          <p className="text-sm text-charcoal-500">
            The database REST API is still recovering. Wait a moment, then retry.
          </p>
          <button
            type="button"
            onClick={() => {
              setRecheckResult(null);
              setBackendUnavailable(null);
              setRecheckAttempt((n) => n + 1);
            }}
            className="inline-flex items-center px-4 py-2 rounded-lg bg-teal text-white text-sm font-medium hover:bg-teal-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }
  if (isPlatformAdmin || recheckResult === true) return children;
  if (recheckResult === false) return <Navigate to="/app" replace />;
  return <div className="flex items-center justify-center min-h-[200px] text-charcoal-500">Checking access…</div>;
}
