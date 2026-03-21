import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@insforge/react';
import { useTenant } from '../tenant/TenantContext';
import type { CompanyRole } from '../api/models/core';

/** Aligned with health_medicals_write_policy roles plus HR managers (is_hr_manager), matching health RLS after hr role alignment. */
const MEDICAL_PAGE_ROLES: CompanyRole[] = ['owner', 'admin', 'manager', 'supervisor'];

export function RequireHealthMedicalAccess(props: { children: React.ReactElement }) {
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
  if (MEDICAL_PAGE_ROLES.includes(activeRole) || hrManager) return props.children;

  return <Navigate to="/access-denied" replace state={{ from: location.pathname }} />;
}
