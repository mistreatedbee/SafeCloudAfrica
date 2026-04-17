import React from 'react';
import { motion } from 'framer-motion';
import { Building2Icon, UsersIcon, CreditCardIcon, ClockIcon, ShieldCheckIcon } from 'lucide-react';
import { useAsync } from '../../../api/hooks/useAsync';
import { insforge } from '../../../api/insforge/client';

type OverviewStats = {
  totalOrgs: number;
  totalUsers: number;
  activeLicenses: number;
  expiringSoon: number;
};

async function fetchOverviewStats(): Promise<OverviewStats> {
  const [companiesRes, membershipsRes] = await Promise.all([
    // IMPORTANT: Avoid `count: 'exact'` on large tables in production.
    // Exact counts translate to COUNT(*) queries that can be expensive and, under tight DB resource limits,
    // have caused Postgres processes to be killed (signal 9) and trigger a cascading 503 outage.
    insforge.database.from('companies').select('id', { count: 'planned', head: true }),
    insforge.database.from('company_memberships').select('user_id', { count: 'planned', head: true })
  ]);

  const totalOrgs = companiesRes.count ?? 0;
  const totalUsers = membershipsRes.count ?? 0;

  // Active licenses and expiring soon will come from org_licenses once that table exists
  let activeLicenses = 0;
  let expiringSoon = 0;
  try {
    const { data: licenses } = await insforge.database
      .from('org_licenses')
      .select('id, end_date, status')
      .eq('status', 'active');
    activeLicenses = licenses?.length ?? 0;
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    expiringSoon =
      licenses?.filter((l: { end_date: string }) => l.end_date && new Date(l.end_date) <= in30Days && new Date(l.end_date) >= now)
        .length ?? 0;
  } catch {
    // org_licenses may not exist yet
  }

  return { totalOrgs, totalUsers, activeLicenses, expiringSoon };
}

export function SuperAdminOverviewPage() {
  const { data, loading, error } = useAsync(fetchOverviewStats, []);

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
          <p className="text-sm text-critical">
            {String((error as Error)?.message ?? error)}
          </p>
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
