import React from 'react';
import { Navigate } from 'react-router-dom';
import { useTenant } from '../tenant/TenantContext';
import { getDashboardRoute } from '../api/services/platformAdminService';

/**
 * Redirects /app to the role-based dashboard so users always land on the correct home.
 * Falls back to the first available membership role when activeRole is null (e.g. stale
 * localStorage active company) to prevent an infinite /app → /app redirect loop.
 */
export function AppDashboardRedirect() {
  const { activeRole, memberships, isTenantLoaded } = useTenant();
  if (!isTenantLoaded) return null;
  const role = activeRole ?? memberships?.[0]?.role ?? '';
  return <Navigate to={getDashboardRoute(role)} replace />;
}
