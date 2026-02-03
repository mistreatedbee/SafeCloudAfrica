import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@insforge/react';
import { useTenant } from '../tenant/TenantContext';

export function RequirePlatformAdmin({ children }: { children: React.ReactElement }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { isPlatformAdmin } = useTenant();

  if (!isLoaded) return null;
  if (!isSignedIn) return <Navigate to="/login" replace />;
  if (!isPlatformAdmin) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-surface-300 shadow-card p-6 w-full max-w-lg">
          <p className="text-sm font-semibold text-charcoal">Access restricted</p>
          <p className="text-sm text-charcoal-500 mt-1">
            This page is only available to Safe Cloud Africa Super Admin users.
          </p>
          <p className="text-sm text-charcoal-500 mt-3">
            If you are the Super Admin, add your user id to `platform_admins` in the database and refresh.
          </p>
        </div>
      </div>
    );
  }

  return children;
}

