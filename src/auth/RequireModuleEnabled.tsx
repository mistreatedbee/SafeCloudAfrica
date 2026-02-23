import React from 'react';
import { Navigate } from 'react-router-dom';
import { useTenant } from '../tenant/TenantContext';
import { getDashboardPathByRole } from '../api/services/platformAdminService';
import type { ModuleKey } from '../api/models/core';

/**
 * When the given module is disabled for the active org, redirects to the user's dashboard.
 * Use around module-specific routes (e.g. /modules/safety, /legal-register) so direct URL access is blocked.
 */
export function RequireModuleEnabled(props: { module: ModuleKey; children: React.ReactElement }) {
  const { enabledModules, activeRole, isPlatformAdmin } = useTenant();

  if (isPlatformAdmin) return props.children;
  if (enabledModules.length === 0) return props.children;
  if (enabledModules.includes(props.module)) return props.children;

  const dashboardPath = activeRole ? getDashboardPathByRole(activeRole) : '/app';
  return <Navigate to={dashboardPath} replace />;
}
