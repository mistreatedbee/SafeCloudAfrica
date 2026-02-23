import React from 'react';
import { Navigate } from 'react-router-dom';
import { useTenant } from '../tenant/TenantContext';
import type { CompanyRole } from '../api/models/core';

const ROLE_PATH: Record<CompanyRole, string> = {
  owner: '/owner',
  admin: '/admin',
  manager: '/manager',
  supervisor: '/manager',
  employee: '/employee',
  consultant: '/external',
  auditor: '/external',
};

/**
 * Redirects /app to the role-based dashboard so users always land on the correct home.
 */
export function AppDashboardRedirect() {
  const { activeRole } = useTenant();
  const path = activeRole ? ROLE_PATH[activeRole] : '/owner';
  return <Navigate to={path} replace />;
}
