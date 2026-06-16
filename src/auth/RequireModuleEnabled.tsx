import React from 'react';
import { Navigate } from 'react-router-dom';
import { useTenant } from '../tenant/TenantContext';
import type { ModuleKey } from '../api/models/core';

/**
 * Blocks access when:
 * 1. The module is disabled org-wide (Super Admin control), or
 * 2. The user is a consultant/auditor and the module is not in their consultant_scope.
 *
 * Use around all module-specific routes to prevent direct URL access bypassing the sidebar.
 */
export function RequireModuleEnabled(props: { module: ModuleKey; children: React.ReactElement }) {
  const { enabledModules, isPlatformAdmin, activeRole, consultantAllowedModules } = useTenant();

  if (isPlatformAdmin) return props.children;

  // Org-level module gate (Super Admin).
  if (enabledModules.length > 0 && !enabledModules.includes(props.module)) {
    return <Navigate to="/access-denied" replace state={{ reason: 'module_disabled', module: props.module }} />;
  }

  // Consultant/auditor scope gate — enforces what the Organisation Owner configured.
  if (activeRole === 'consultant' || activeRole === 'auditor') {
    if (!consultantAllowedModules.includes(props.module)) {
      return <Navigate to="/access-denied" replace state={{ reason: 'module_not_in_scope', module: props.module }} />;
    }
  }

  return props.children;
}
