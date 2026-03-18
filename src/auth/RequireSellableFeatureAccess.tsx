import React from 'react';
import { Navigate } from 'react-router-dom';
import { useTenant } from '../tenant/TenantContext';
import type { SellableFeatureKey } from '../api/services/sellableFeaturesService';
import { SellableFeatureLockedPage } from '../pages/features/SellableFeatureLockedPage';

export function RequireSellableFeatureAccess(props: {
  featureKey: SellableFeatureKey;
  children: React.ReactElement;
}) {
  const { sellableFeatures, isPlatformAdmin } = useTenant();

  if (isPlatformAdmin) return props.children;
  const state = sellableFeatures[props.featureKey];

  if (!state.enabled || state.locked) {
    return <SellableFeatureLockedPage featureKey={props.featureKey} />;
  }

  return props.children;
}
