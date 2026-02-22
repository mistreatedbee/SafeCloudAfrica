/**
 * Licensing & Trial Management Service
 * 
 * Handles:
 * - License type validation (starter, professional, enterprise)
 * - Employee limit enforcement
 * - Trial expiration checks
 * - Feature access control
 * - Upgrade/downgrade workflows
 */

import type { UUID } from '../models/core';
import type { LicenseType } from '../models/core';
import type { Company } from '../models/entities';
import { insforge } from '../insforge/client';

export type { LicenseType };
export type LicenseStatus = 'trial' | 'active' | 'expired' | 'suspended';

/** Operating Model: pricing (ZAR/month) and seat ranges */
export const LICENSE_PRICING: Record<string, { monthlyPriceZAR: number; minSeats: number; maxSeats: number }> = {
  base: { monthlyPriceZAR: 4000, minSeats: 1, maxSeats: 5 },
  growth: { monthlyPriceZAR: 6500, minSeats: 6, maxSeats: 20 },
  professional: { monthlyPriceZAR: 7500, minSeats: 21, maxSeats: 50 },
  hr_only: { monthlyPriceZAR: 3000, minSeats: 1, maxSeats: 5 },
  starter_6m: { monthlyPriceZAR: 3000, minSeats: 1, maxSeats: 4 },
  professional_12m: { monthlyPriceZAR: 5000, minSeats: 1, maxSeats: 20 },
  enterprise_custom: { monthlyPriceZAR: 0, minSeats: 1, maxSeats: 9999 },
};
export const PAYMENT_DURATION_MONTHS = [3, 6, 9, 12] as const;

export interface LicenseInfo {
  type: LicenseType;
  status: LicenseStatus;
  employeeLimit: number;
  currentEmployees: number;
  startDate: string;
  expiresAt: string;
  daysRemaining: number;
  isExpired: boolean;
  isTrialExpired: boolean;
  canAddEmployees: boolean;
  features: Record<string, boolean>;
}

export interface FeatureAccess {
  incidents: boolean;
  risks: boolean;
  ncrs: boolean;
  audits: boolean;
  training: boolean;
  documents: boolean;
  forms: boolean;
  ppe: boolean;
  environment: boolean;
  health: boolean;
  planning: boolean;
  legal: boolean;
  exports: boolean; // PDF/Excel
  api: boolean;
  customFields: boolean;
  advancedReporting: boolean;
  isoMapping: boolean;
  complianceScoring: boolean;
  automation: boolean;
}

/**
 * Feature availability by license tier (legacy + Operating Model)
 */
const FEATURE_MAP: Record<string, Partial<FeatureAccess>> = {
  starter_6m: {
    incidents: true,
    risks: true,
    ncrs: false,
    audits: false,
    training: true,
    documents: true,
    forms: true,
    ppe: false,
    environment: false,
    health: false,
    planning: false,
    legal: false,
    exports: false,
    api: false,
    customFields: false,
    advancedReporting: false,
    isoMapping: false,
    complianceScoring: false,
    automation: false,
  },
  professional_12m: {
    incidents: true,
    risks: true,
    ncrs: true,
    audits: true,
    training: true,
    documents: true,
    forms: true,
    ppe: true,
    environment: true,
    health: true,
    planning: true,
    legal: true,
    exports: true,
    api: true,
    customFields: true,
    advancedReporting: true,
    isoMapping: false,
    complianceScoring: false,
    automation: false,
  },
  enterprise_custom: {
    incidents: true,
    risks: true,
    ncrs: true,
    audits: true,
    training: true,
    documents: true,
    forms: true,
    ppe: true,
    environment: true,
    health: true,
    planning: true,
    legal: true,
    exports: true,
    api: true,
    customFields: true,
    advancedReporting: true,
    isoMapping: true,
    complianceScoring: true,
    automation: true,
  },
  base: {
    incidents: true,
    risks: true,
    ncrs: true,
    audits: true,
    training: true,
    documents: true,
    forms: true,
    ppe: true,
    environment: true,
    health: true,
    planning: true,
    legal: true,
    exports: true,
    api: false,
    customFields: true,
    advancedReporting: true,
    isoMapping: false,
    complianceScoring: false,
    automation: false,
  },
  growth: {
    incidents: true,
    risks: true,
    ncrs: true,
    audits: true,
    training: true,
    documents: true,
    forms: true,
    ppe: true,
    environment: true,
    health: true,
    planning: true,
    legal: true,
    exports: true,
    api: true,
    customFields: true,
    advancedReporting: true,
    isoMapping: false,
    complianceScoring: false,
    automation: false,
  },
  professional: {
    incidents: true,
    risks: true,
    ncrs: true,
    audits: true,
    training: true,
    documents: true,
    forms: true,
    ppe: true,
    environment: true,
    health: true,
    planning: true,
    legal: true,
    exports: true,
    api: true,
    customFields: true,
    advancedReporting: true,
    isoMapping: true,
    complianceScoring: true,
    automation: true,
  },
  hr_only: {
    incidents: false,
    risks: false,
    ncrs: false,
    audits: false,
    training: true,
    documents: true,
    forms: true,
    ppe: false,
    environment: false,
    health: true,
    planning: true,
    legal: false,
    exports: true,
    api: false,
    customFields: false,
    advancedReporting: false,
    isoMapping: false,
    complianceScoring: false,
    automation: false,
  },
};

/**
 * Get license info for a company
 */
export async function getLicenseInfo(companyId: UUID): Promise<LicenseInfo> {
  try {
    // Fetch company
    const { data: company, error: companyError } = await insforge.database
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();

  if (companyError || !company) {
    throw new Error(`Company not found: ${companyId}`);
  }

  // Count members
  const { count: memberCount, error: countError } = await insforge.database
    .from('company_memberships')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId);

  if (countError) {
    throw countError;
  }

  const licenseType = company.license_type as LicenseType;
  const durationMonths = (company as any).subscription_duration_months as number | null | undefined;
  const expiresAt = calculateExpiryDate(company.created_at, licenseType, durationMonths);
  const now = new Date();
  const expDate = new Date(expiresAt);
  const daysRemaining = Math.max(0, Math.floor((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  const isExpired = now > expDate;

  return {
    type: licenseType,
    status: isExpired ? 'expired' : 'active',
    employeeLimit: company.employee_limit,
    currentEmployees: memberCount || 0,
    startDate: company.created_at,
    expiresAt,
    daysRemaining,
    isExpired,
    isTrialExpired: licenseType === 'starter_6m' && isExpired,
    canAddEmployees: (memberCount || 0) < company.employee_limit && !isExpired,
    features: getFeatures(licenseType),
  };
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/**
 * Get features available for a license type
 */
export function getFeatures(licenseType: LicenseType): FeatureAccess {
  return {
    incidents: true, // All tiers
    risks: true,
    training: true,
    documents: true,
    forms: true,
    exports: licenseType !== 'starter_6m',
    api: licenseType !== 'starter_6m',
    customFields: licenseType !== 'starter_6m',
    advancedReporting: licenseType !== 'starter_6m',
    ...FEATURE_MAP[licenseType],
  };
}

/**
 * Check if a specific feature is available
 */
export async function checkFeatureAccess(
  companyId: UUID,
  feature: keyof FeatureAccess
): Promise<boolean> {
  try {
    const license = await getLicenseInfo(companyId);
    return license.features[feature] ?? false;
  } catch (err) {
    console.error('Feature access check failed:', err);
    return false;
  }
}

/**
 * Validate employee limit not exceeded
 */
export async function validateEmployeeLimit(companyId: UUID): Promise<{ valid: boolean; message?: string }> {
  try {
    const license = await getLicenseInfo(companyId);

    if (license.isExpired) {
      return { valid: false, message: 'License has expired. Please renew to add employees.' };
    }

    if (license.currentEmployees >= license.employeeLimit) {
      return {
        valid: false,
        message: `Employee limit reached (${license.currentEmployees}/${license.employeeLimit}). Upgrade license to add more.`,
      };
    }

    return { valid: true };
  } catch (err) {
    console.error('Employee limit validation failed:', err);
    return { valid: false, message: 'Failed to validate employee limit' };
  }
}

/**
 * Upgrade license tier
 */
export async function upgradeLicense(
  companyId: UUID,
  newLicenseType: LicenseType
): Promise<Company> {
  const { data, error } = await insforge.database
    .from('companies')
    .update({ license_type: newLicenseType })
    .eq('id', companyId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as Company;
}

/**
 * Calculate expiry date based on license type and optional payment duration (3,6,9,12 months)
 */
function calculateExpiryDate(startDate: string, licenseType: LicenseType, durationMonths?: number | null): string {
  const start = new Date(startDate);
  const months = durationMonths && [3, 6, 9, 12].includes(durationMonths) ? durationMonths : null;

  switch (licenseType) {
    case 'starter_6m':
      start.setMonth(start.getMonth() + 6);
      break;
    case 'professional_12m':
      start.setFullYear(start.getFullYear() + 1);
      break;
    case 'enterprise_custom':
      start.setFullYear(start.getFullYear() + 10);
      break;
    case 'base':
    case 'growth':
    case 'professional':
    case 'hr_only':
      start.setMonth(start.getMonth() + (months ?? 12));
      break;
    default:
      start.setMonth(start.getMonth() + (months ?? 12));
  }

  return start.toISOString();
}

/**
 * Check if company is in trial period
 */
export async function isInTrial(companyId: UUID): Promise<boolean> {
  try {
    const license = await getLicenseInfo(companyId);
    return license.type === 'starter_6m' && !license.isTrialExpired;
  } catch {
    return false;
  }
}

/**
 * Get trial days remaining
 */
export async function getTrialDaysRemaining(companyId: UUID): Promise<number> {
  try {
    const license = await getLicenseInfo(companyId);
    if (license.type !== 'starter_6m') {
      return 0;
    }
    return Math.max(0, license.daysRemaining);
  } catch {
    return 0;
  }
}

/**
 * Format license type for display (legacy + Operating Model)
 */
export function formatLicenseType(licenseType: LicenseType): string {
  const labels: Record<string, string> = {
    starter_6m: 'Starter (6 months)',
    professional_12m: 'Professional (12 months)',
    enterprise_custom: 'Enterprise',
    base: 'Base (1–5 users)',
    growth: 'Growth (6–20 users)',
    professional: 'Professional (21–50 users)',
    hr_only: 'HR-only (1–5 users)',
  };
  return labels[licenseType] || licenseType;
}

/**
 * Trigger warning notifications for expiring licenses
 */
export async function checkAndNotifyExpiringLicenses(): Promise<void> {
  // This would typically run as a cron job
  // Implementation depends on your notification system
  // For now, just log
  console.log('[Licensing] Expiration check would run here (implement as cron job)');
}
