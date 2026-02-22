import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@insforge/react';
import { useTenant } from '../tenant/TenantContext';

export function RequirePlatformAdmin({ children }: { children: React.ReactElement }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { isPlatformAdmin } = useTenant();

  if (!isLoaded) return null;
  if (!isSignedIn) return <Navigate to="/login" replace />;
  if (!isPlatformAdmin) return <Navigate to="/app" replace />;

  return children;
}

