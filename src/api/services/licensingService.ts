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
import type { BillingInvoice, BillingPlanCatalog, BillingSubscription, BillingUsageSnapshot, Company } from '../models/entities';
import { insforge } from '../insforge/client';

export type LicenseType = 'starter_6m' | 'professional_12m' | 'enterprise_custom';
export type LicenseStatus = 'trial' | 'active' | 'expired' | 'suspended';
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
  billingPlanCode?: string | null;
  billingCycleMonths?: number | null;
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
 * Feature availability by license tier
 */
const FEATURE_MAP: Record<LicenseType, Partial<FeatureAccess>> = {
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
    // All features enabled
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
    .select('*', { count: 'planned', head: true })
    .eq('company_id', companyId);

  if (countError) {
    throw countError;
  }

  const licenseType = company.license_type as LicenseType;
  const expiresAt = calculateExpiryDate(company.created_at, licenseType);
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
    billingPlanCode: company.billing_plan_code ?? null,
    billingCycleMonths: company.billing_cycle_months ?? company.subscription_duration_months ?? null
  };
  } catch (err) {
    console.error('Failed to load license info:', err);
    throw err;
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

export async function checkCanExport(companyId: UUID): Promise<boolean> {
  return await checkFeatureAccess(companyId, 'exports');
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
 * Calculate expiry date based on license type
 */
function calculateExpiryDate(startDate: string, licenseType: LicenseType): string {
  const start = new Date(startDate);

  switch (licenseType) {
    case 'starter_6m':
      start.setMonth(start.getMonth() + 6);
      break;
    case 'professional_12m':
      start.setFullYear(start.getFullYear() + 1);
      break;
    case 'enterprise_custom':
      // Custom license - set far in future (customer responsibility)
      start.setFullYear(start.getFullYear() + 10);
      break;
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
 * Format license type for display
 */
export function formatLicenseType(licenseType: LicenseType): string {
  const labels: Record<LicenseType, string> = {
    starter_6m: 'Starter (6 months)',
    professional_12m: 'Professional (12 months)',
    enterprise_custom: 'Enterprise',
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

export const BILLING_PLAN_DEFAULTS: Array<{
  planCode: string;
  name: string;
  monthlyBaseAmount: number;
  includedUsers: number;
  includedSites: number;
  modules: string[];
}> = [
  {
    planCode: 'starter_ops',
    name: 'Starter Ops',
    monthlyBaseAmount: 1999,
    includedUsers: 10,
    includedSites: 1,
    modules: ['safety', 'documents', 'training']
  },
  {
    planCode: 'professional_ops',
    name: 'Professional Ops',
    monthlyBaseAmount: 4999,
    includedUsers: 50,
    includedSites: 3,
    modules: ['safety', 'documents', 'training', 'quality', 'environment', 'health', 'legal', 'hr']
  },
  {
    planCode: 'enterprise_ops',
    name: 'Enterprise Ops',
    monthlyBaseAmount: 9999,
    includedUsers: 250,
    includedSites: 10,
    modules: ['safety', 'documents', 'training', 'quality', 'environment', 'health', 'legal', 'hr', 'security']
  }
];

export async function listBillingPlans(): Promise<BillingPlanCatalog[]> {
  const { data, error } = await insforge.database
    .from('billing_plan_catalog')
    .select('*')
    .eq('active', true)
    .order('monthly_base_amount', { ascending: true });
  if (error) throw error;
  return (data ?? []) as BillingPlanCatalog[];
}

export async function seedDefaultBillingPlans(): Promise<void> {
  for (const plan of BILLING_PLAN_DEFAULTS) {
    await insforge.database.from('billing_plan_catalog').upsert(
      {
        plan_code: plan.planCode,
        name: plan.name,
        currency: 'ZAR',
        monthly_base_amount: plan.monthlyBaseAmount,
        included_users: plan.includedUsers,
        included_sites: plan.includedSites,
        module_entitlements: plan.modules.reduce<Record<string, boolean>>((acc, moduleKey) => {
          acc[moduleKey] = true;
          return acc;
        }, {})
      },
      { onConflict: 'plan_code' }
    );
  }
}

export async function getBillingSubscription(companyId: UUID): Promise<BillingSubscription | null> {
  const { data, error } = await insforge.database
    .from('billing_subscriptions')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as BillingSubscription | null;
}

export async function upsertBillingSubscription(input: {
  companyId: UUID;
  planCode: string;
  status: BillingSubscription['status'];
  billingCycleMonths: number;
  startsAt?: string;
  renewsAt?: string | null;
  trialEndsAt?: string | null;
  userLimit?: number | null;
  siteLimit?: number | null;
  moduleOverrides?: Record<string, boolean>;
  createdByUserId?: UUID | null;
}): Promise<BillingSubscription> {
  const { data, error } = await insforge.database
    .from('billing_subscriptions')
    .upsert(
      {
        company_id: input.companyId,
        plan_code: input.planCode,
        status: input.status,
        billing_cycle_months: input.billingCycleMonths,
        starts_at: input.startsAt ?? new Date().toISOString(),
        renews_at: input.renewsAt ?? null,
        trial_ends_at: input.trialEndsAt ?? null,
        user_limit: input.userLimit ?? null,
        site_limit: input.siteLimit ?? null,
        module_overrides: input.moduleOverrides ?? {},
        created_by_user_id: input.createdByUserId ?? null,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'company_id' }
    )
    .select('*')
    .single();
  if (error) throw error;
  return data as BillingSubscription;
}

export async function captureBillingUsageSnapshot(companyId: UUID, snapshotMonth = new Date().toISOString().slice(0, 7) + '-01'): Promise<BillingUsageSnapshot> {
  const [usersResult, sitesResult, companyResult, externalResult] = await Promise.all([
    insforge.database
      .from('company_memberships')
      .select('id', { count: 'planned', head: true })
      .eq('company_id', companyId)
      .eq('status', 'ACTIVE'),
    insforge.database
      .from('sites')
      .select('id', { count: 'planned', head: true })
      .eq('company_id', companyId)
      .eq('is_active', true),
    insforge.database
      .from('companies')
      .select('modules_enabled')
      .eq('id', companyId)
      .single(),
    insforge.database
      .from('external_access_grants')
      .select('id', { count: 'planned', head: true })
      .eq('company_id', companyId)
      .eq('status', 'active')
  ]);
  if (usersResult.error) throw usersResult.error;
  if (sitesResult.error) throw sitesResult.error;
  if (companyResult.error) throw companyResult.error;
  if (externalResult.error) throw externalResult.error;

  const enabledModules = Object.entries((companyResult.data?.modules_enabled ?? {}) as Record<string, boolean>)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key);

  const { data, error } = await insforge.database
    .from('billing_usage_snapshots')
    .upsert(
      {
        company_id: companyId,
        snapshot_month: snapshotMonth,
        active_users: usersResult.count ?? 0,
        active_sites: sitesResult.count ?? 0,
        enabled_modules: enabledModules,
        external_grants: externalResult.count ?? 0
      },
      { onConflict: 'company_id,snapshot_month' }
    )
    .select('*')
    .single();
  if (error) throw error;
  return data as BillingUsageSnapshot;
}

function generateInvoiceNumber(companyId: UUID, periodStart: string): string {
  const compactCompany = companyId.replace(/-/g, '').slice(0, 6).toUpperCase();
  return `INV-${compactCompany}-${periodStart.slice(0, 7).replace('-', '')}`;
}

export async function generateInternalInvoice(input: {
  companyId: UUID;
  periodStart: string;
  periodEnd: string;
  createdByUserId?: UUID | null;
  taxRate?: number;
}): Promise<BillingInvoice> {
  const [subscription, usage, plans] = await Promise.all([
    getBillingSubscription(input.companyId),
    captureBillingUsageSnapshot(input.companyId, input.periodStart.slice(0, 7) + '-01'),
    listBillingPlans()
  ]);

  if (!subscription) throw new Error('Billing subscription not configured.');
  const plan = plans.find((item) => item.plan_code === subscription.plan_code);
  if (!plan) throw new Error(`Billing plan ${subscription.plan_code} not found.`);

  const overUserCount = Math.max(0, usage.active_users - (subscription.user_limit ?? plan.included_users));
  const overSiteCount = Math.max(0, usage.active_sites - (subscription.site_limit ?? plan.included_sites));
  const userOverage = overUserCount * 149;
  const siteOverage = overSiteCount * 499;
  const moduleAddons = Math.max(0, usage.enabled_modules.length - Object.keys(plan.module_entitlements ?? {}).length) * 299;
  const subtotal = Number(plan.monthly_base_amount) + userOverage + siteOverage + moduleAddons;
  const taxAmount = Number((subtotal * (input.taxRate ?? 0.15)).toFixed(2));
  const totalAmount = Number((subtotal + taxAmount).toFixed(2));

  const lineItems = [
    { label: `${plan.name} base`, amount: Number(plan.monthly_base_amount) },
    { label: `User overage (${overUserCount})`, amount: userOverage },
    { label: `Site overage (${overSiteCount})`, amount: siteOverage },
    { label: 'Module add-ons', amount: moduleAddons }
  ].filter((item) => item.amount > 0);

  const { data, error } = await insforge.database
    .from('billing_invoices')
    .upsert(
      {
        company_id: input.companyId,
        subscription_id: subscription.id,
        invoice_number: generateInvoiceNumber(input.companyId, input.periodStart),
        period_start: input.periodStart,
        period_end: input.periodEnd,
        subtotal_amount: subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        currency: plan.currency ?? 'ZAR',
        status: 'draft',
        line_items: lineItems,
        due_at: new Date(new Date(input.periodEnd).getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        created_by_user_id: input.createdByUserId ?? null,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'invoice_number' }
    )
    .select('*')
    .single();
  if (error) throw error;
  return data as BillingInvoice;
}

export async function getRenewalsDueWithin(days = 14): Promise<Array<{ company_id: UUID; renews_at: string }>> {
  const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await insforge.database
    .from('billing_subscriptions')
    .select('company_id, renews_at')
    .in('status', ['trial', 'active'])
    .not('renews_at', 'is', null)
    .lte('renews_at', cutoff);
  if (error) throw error;
  return (data ?? []) as Array<{ company_id: UUID; renews_at: string }>;
}
