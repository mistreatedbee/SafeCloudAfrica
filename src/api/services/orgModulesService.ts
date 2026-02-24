/**
 * Organisation-level module control: Super Admin enables/disables modules per org.
 * Used by TenantContext (frontend) and by API enforcement (backend).
 */

import { insforge } from '../insforge/client';
import type { ModuleKey } from '../models/core';
import type { UUID } from '../models/entities';

export const ALL_MODULE_KEYS: ModuleKey[] = [
  'safety',
  'quality',
  'legal',
  'environment',
  'health',
  'hr',
  'general',
  'security',
  'asset_management',
  'hazardous_chemical_management'
];

/** Paid modules (General is available when any paid module is enabled). */
const PAID_MODULE_KEYS: ModuleKey[] = [
  'safety',
  'quality',
  'legal',
  'environment',
  'health',
  'hr',
  'security',
  'asset_management',
  'hazardous_chemical_management'
];

/**
 * Normalise raw modules_enabled from company (metadata or top-level) to Record<moduleKey, boolean>.
 * Super Admin stores in company.metadata.modules_enabled.
 */
export function getModulesEnabledMap(company: {
  modules_enabled?: Record<string, boolean> | null;
  metadata?: Record<string, unknown> | null;
}): Record<string, boolean> {
  const mod =
    company.modules_enabled ??
    (company.metadata as Record<string, unknown> | undefined)?.['modules_enabled'];
  if (mod && typeof mod === 'object') return mod as Record<string, boolean>;
  return {};
}

/**
 * Returns the list of module keys enabled for this organisation.
 * - If no config or empty: all modules enabled (backwards compat).
 * - Otherwise: only keys set to true; General is auto-enabled when any paid module is enabled.
 */
export function getEnabledModuleKeys(company: {
  modules_enabled?: Record<string, boolean> | null;
  metadata?: Record<string, unknown> | null;
} | null): ModuleKey[] {
  if (!company) return [...ALL_MODULE_KEYS];
  const map = getModulesEnabledMap(company);
  const hasAny = Object.keys(map).length > 0;
  if (!hasAny) return [...ALL_MODULE_KEYS];

  const enabled: ModuleKey[] = [];
  for (const key of ALL_MODULE_KEYS) {
    if (key === 'general') continue;
    if (map[key] === true) enabled.push(key);
  }
  const anyPaidEnabled = PAID_MODULE_KEYS.some((k) => map[k] === true);
  if (anyPaidEnabled && !enabled.includes('general')) enabled.push('general');
  return enabled;
}

/**
 * Backend: fetch company and return enabled module keys. Use in API layer to enforce.
 */
export async function getEnabledModulesForCompany(companyId: UUID): Promise<ModuleKey[]> {
  const { data, error } = await insforge.database
    .from('companies')
    .select('id, metadata')
    .eq('id', companyId)
    .maybeSingle();
  if (error || !data) return [...ALL_MODULE_KEYS];
  return getEnabledModuleKeys(data as { modules_enabled?: Record<string, boolean> | null; metadata?: Record<string, unknown> | null });
}

/**
 * Backend: throw if module is disabled for the company (use at start of module-scoped APIs).
 */
export async function requireModuleEnabled(companyId: UUID, moduleKey: ModuleKey): Promise<void> {
  const enabled = await getEnabledModulesForCompany(companyId);
  if (enabled.includes(moduleKey)) return;
  throw new Error(`Module "${moduleKey}" is not enabled for this organisation.`);
}
