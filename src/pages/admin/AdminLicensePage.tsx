import React from 'react';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import { getLicenseInfo, formatLicenseType } from '../api/services/licensingService';
import { insforge } from '../api/insforge/client';

export function AdminLicensePage() {
  const { activeCompanyId } = useTenant();
  const { data: licenseInfo, loading, error } = useAsync(
    () => (activeCompanyId ? getLicenseInfo(activeCompanyId) : null),
    [activeCompanyId]
  );
  const { data: orgLicense } = useAsync(
    async () => {
      if (!activeCompanyId) return null;
      const { data } = await insforge.database
        .from('org_licenses')
        .select('plan_name, start_date, end_date, status, billing_cycle_months')
        .eq('company_id', activeCompanyId)
        .order('end_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as { plan_name: string; start_date: string; end_date: string; status: string; billing_cycle_months?: number } | null;
    },
    [activeCompanyId]
  );

  if (!activeCompanyId) {
    return (
      <Layout title="License">
        <p className="text-charcoal-500">No organisation selected.</p>
      </Layout>
    );
  }

  if (loading || !licenseInfo) {
    return (
      <Layout title="License">
        <p className="text-charcoal-500">Loading license info…</p>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout title="License">
        <p className="text-critical">Failed to load license info.</p>
      </Layout>
    );
  }

  const planName = orgLicense?.plan_name ?? licenseInfo.type;
  const endDate = orgLicense?.end_date ?? licenseInfo.expiresAt;

  return (
    <Layout title="License & subscription">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
          <h2 className="text-lg font-semibold text-charcoal mb-4">Current subscription</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <dt className="text-charcoal-500">Plan</dt>
            <dd className="font-medium text-charcoal">{formatLicenseType(planName as any)}</dd>
            <dt className="text-charcoal-500">Status</dt>
            <dd className="font-medium text-charcoal">{licenseInfo.status}</dd>
            <dt className="text-charcoal-500">Seats</dt>
            <dd className="font-medium text-charcoal">{licenseInfo.currentEmployees} / {licenseInfo.employeeLimit}</dd>
            <dt className="text-charcoal-500">Renewal / end date</dt>
            <dd className="font-medium text-charcoal">{endDate ? new Date(endDate).toLocaleDateString() : '—'}</dd>
            {licenseInfo.daysRemaining >= 0 && (
              <>
                <dt className="text-charcoal-500">Days remaining</dt>
                <dd className="font-medium text-charcoal">{licenseInfo.daysRemaining}</dd>
              </>
            )}
          </dl>
          {licenseInfo.isExpired && (
            <p className="mt-4 text-sm text-critical font-medium">Your subscription has expired. Contact support to renew.</p>
          )}
          <p className="mt-4 text-sm text-charcoal-500">
            To renew or change your plan, please contact support.
          </p>
        </div>
      </div>
    </Layout>
  );
}
