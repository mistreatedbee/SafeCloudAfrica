import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@insforge/react';
import { useTenant } from '../tenant/TenantContext';
import type { CompanyRole } from '../api/models/core';

const LEAVE_HOURS_ROLES: CompanyRole[] = ['owner', 'admin', 'manager', 'supervisor', 'employee'];

/**
 * Leave and timesheet routes: self-service for employees; supervisors/managers/admins approve.
 * Blocks consultant and auditor from HR leave/hours UI.
 */
export function RequireHrLeaveHoursAccess(props: { children: React.ReactElement }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { activeRole, isPlatformAdmin } = useTenant();
  const location = useLocation();

  if (!isLoaded) return null;
  if (!isSignedIn) return <Navigate to="/login" replace />;
  if (isPlatformAdmin) return props.children;
  if (!activeRole) return <Navigate to="/onboarding" replace />;

  if (activeRole === 'consultant' || activeRole === 'auditor') {
    return <Navigate to="/access-denied" replace state={{ from: location.pathname }} />;
  }

  if (LEAVE_HOURS_ROLES.includes(activeRole)) return props.children;

  return <Navigate to="/access-denied" replace state={{ from: location.pathname }} />;
}
