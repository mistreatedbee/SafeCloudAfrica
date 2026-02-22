import React from 'react';
import { Navigate } from 'react-router-dom';
import { useTenant } from '../tenant/TenantContext';

/**
 * For owner role: redirect to /owner/onboarding if onboarding not completed.
 * Renders children otherwise.
 */
export function OwnerOnboardingGate({ children }: { children: React.ReactElement }) {
  const { activeRole, activeCompany } = useTenant();
  const completed = (activeCompany?.metadata as { onboarding_completed_at?: string } | undefined)?.onboarding_completed_at;
  if (activeRole === 'owner' && !completed) {
    return <Navigate to="/owner/onboarding" replace />;
  }
  return children;
}
