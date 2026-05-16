import React from 'react';
import { Navigate } from 'react-router-dom';
import { useTenant } from '../tenant/TenantContext';
import { getDashboardRoute } from '../api/services/platformAdminService';

/**
 * Redirects /app to the role-based dashboard so users always land on the correct home.
 * Uses single source of truth for role -> path.
 */
export function AppDashboardRedirect() {
  const { activeRole } = useTenant();
  const path = activeRole ? getDashboardRoute(activeRole) : '/org/dashboard';
  return <Navigate to={path} replace />;
}
