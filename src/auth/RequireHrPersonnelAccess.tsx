import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@insforge/react';
import { useTenant } from '../tenant/TenantContext';
import type { CompanyRole } from '../api/models/core';

const PERSONNEL_ROLES: CompanyRole[] = ['owner', 'admin', 'manager', 'supervisor'];

/**
 * HR module routes that list or edit workforce-wide data (not employee self-service).
 * Allows platform admins, owner/admin/manager/supervisor, or members flagged is_hr_manager.
 * Blocks consultant and auditor by default.
 */
export function RequireHrPersonnelAccess(props: { children: React.ReactElement }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { activeRole, isPlatformAdmin, activeMembership } = useTenant();
  const location = useLocation();

  if (!isLoaded) return null;
  if (!isSignedIn) return <Navigate to="/login" replace />;
  if (isPlatformAdmin) return props.children;
  if (!activeRole) return <Navigate to="/onboarding" replace />;

  if (activeRole === 'consultant' || activeRole === 'auditor') {
    return <Navigate to="/access-denied" replace state={{ from: location.pathname }} />;
  }

  const hrManager = activeMembership?.is_hr_manager === true;
  if (PERSONNEL_ROLES.includes(activeRole) || hrManager) return props.children;

  return <Navigate to="/access-denied" replace state={{ from: location.pathname }} />;
}
