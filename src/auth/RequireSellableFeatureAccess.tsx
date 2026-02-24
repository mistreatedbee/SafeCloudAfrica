import React from 'react';
import { Navigate } from 'react-router-dom';
import { useTenant } from '../tenant/TenantContext';
import { getDashboardPathByRole } from '../api/services/platformAdminService';
import type { SellableFeatureKey } from '../api/services/sellableFeaturesService';
import { SellableFeatureLockedPage } from '../pages/features/SellableFeatureLockedPage';

export function RequireSellableFeatureAccess(props: {
  featureKey: SellableFeatureKey;
  children: React.ReactElement;
}) {
  const { sellableFeatures, activeRole, isPlatformAdmin } = useTenant();

  if (isPlatformAdmin) return props.children;
  const state = sellableFeatures[props.featureKey];

  if (!state.enabled) {
    const dashboardPath = activeRole ? getDashboardPathByRole(activeRole) : '/app';
    return <Navigate to={dashboardPath} replace />;
  }
  if (state.locked) {
    return <SellableFeatureLockedPage featureKey={props.featureKey} />;
  }

  return props.children;
}
