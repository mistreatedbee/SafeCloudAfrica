import React from 'react';
import { motion } from 'framer-motion';
import { Building2Icon, RefreshCwIcon, UsersIcon, CreditCardIcon, ClockIcon, ShieldCheckIcon } from 'lucide-react';
import { useAsync } from '../../../api/hooks/useAsync';
import { getPlatformOverviewStats } from '../../../api/services/superAdminPlatformService';

export function SuperAdminOverviewPage() {
  const { data, loading, error, retry, isBackendUnavailable } = useAsync(() => getPlatformOverviewStats(), []);

  const stats = data ?? {
    totalOrgs: 0,
    totalUsers: 0,
    activeLicenses: 0,
    expiringSoon: 0
  };

  const cards = [
    { label: 'Total organisations', value: stats.totalOrgs, icon: Building2Icon },
    { label: 'Total users', value: stats.totalUsers, icon: UsersIcon },
    { label: 'Active licenses', value: stats.activeLicenses, icon: CreditCardIcon },
    { label: 'Expiring in 30 days', value: stats.expiringSoon, icon: ClockIcon }
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
        <div className="flex items-center gap-2 mb-6">
          <ShieldCheckIcon className="w-5 h-5 text-teal" />
          <p className="text-sm font-semibold text-charcoal">Platform analytics (aggregated)</p>
        </div>
        <p className="text-sm text-charcoal-500 mb-6">
          High-level platform metrics. Tenant-specific data is only visible in Support Mode.
        </p>

        {error && (
          <div className="rounded-lg border border-critical/30 bg-critical/5 p-4 mb-4">
            <p className="text-sm font-semibold text-critical">Unable to load platform analytics</p>
            <p className="text-sm text-charcoal-500 mt-1">{error.message}</p>
            {isBackendUnavailable && (
              <button
                type="button"
                onClick={retry}
                className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-teal text-white text-sm font-medium hover:bg-teal-600"
              >
                <RefreshCwIcon className="w-4 h-4" />
                Retry
              </button>
            )}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-charcoal-500">Loading…</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map(({ label, value, icon: Icon }) => (
              <div
                key={label}
                className="p-4 rounded-xl border border-surface-200 bg-surface-50/50"
              >
                <div className="flex items-center gap-2 text-charcoal-500 text-sm mb-1">
                  <Icon className="w-4 h-4" />
                  {label}
                </div>
                <p className="text-2xl font-bold text-navy">{value}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
