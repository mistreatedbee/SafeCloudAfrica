import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@insforge/react';
import { useTenant } from '../tenant/TenantContext';
import type { CompanyRole } from '../api/models/core';

export function RequireCompanyRole(props: { allowed: CompanyRole[]; children: React.ReactElement }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { activeRole, isPlatformAdmin } = useTenant();
  const location = useLocation();

  if (!isLoaded) return null;
  if (!isSignedIn) return <Navigate to="/login" replace />;
  if (isPlatformAdmin) return props.children;
  if (!activeRole) return <Navigate to="/onboarding" replace />;
  if (!props.allowed.includes(activeRole)) {
    return <Navigate to="/app" replace state={{ from: location.pathname }} />;
  }
  return props.children;
}

