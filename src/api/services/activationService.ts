/**
 * License activation (key-based): validate key and activate to create org + owner + subscription.
 */

import { insforge } from '../insforge/client';

export type ValidatedKeyInfo = {
  plan_name: string;
  billing_cycle_months: number;
  seat_limit: number;
  modules_enabled: string[];
};

export type ActivateLicenseInput = {
  key: string;
  companyName: string;
  industry: string;
  country: string;
  primaryContactName: string;
  primaryContactEmail: string;
  phone: string;
};

export type ActivateLicenseResult = {
  organizationId: string;
  userId: string;
  success: boolean;
};

/** Validate a license key (public); returns plan info for display or null if invalid. */
export async function validateLicenseKey(key: string): Promise<ValidatedKeyInfo | null> {
  const trimmed = key?.trim();
  if (!trimmed) return null;
  const { data, error } = await insforge.database.rpc('validate_license_key', { p_key: trimmed });
  if (error || data == null) return null;
  const mods = (data as { modules_enabled?: unknown }).modules_enabled;
  return {
    plan_name: (data as ValidatedKeyInfo).plan_name,
    billing_cycle_months: (data as ValidatedKeyInfo).billing_cycle_months,
    seat_limit: (data as ValidatedKeyInfo).seat_limit,
    modules_enabled: Array.isArray(mods) ? mods : typeof mods === 'object' && mods != null ? Object.keys(mods as Record<string, unknown>) : []
  };
}

/** Activate license key; caller must be signed in as primaryContactEmail. */
export async function activateLicenseKey(input: ActivateLicenseInput): Promise<ActivateLicenseResult> {
  const { data, error } = await insforge.database.rpc('activate_license_key', {
    p_key: input.key.trim(),
    p_company_name: input.companyName.trim(),
    p_industry: input.industry.trim() || null,
    p_country: input.country.trim() || null,
    p_primary_contact_name: input.primaryContactName.trim(),
    p_primary_contact_email: input.primaryContactEmail.trim().toLowerCase(),
    p_phone: input.phone.trim() || null
  });
  if (error) throw new Error(error.message ?? 'Activation failed');
  const result = data as ActivateLicenseResult;
  if (!result?.organizationId || !result?.userId) throw new Error('Invalid response from server');
  return result;
}
