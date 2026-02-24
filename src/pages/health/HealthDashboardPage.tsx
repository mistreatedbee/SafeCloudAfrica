import React from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../../components/layout/Layout';
import { StatCard } from '../../components/ui/StatCard';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { getHealthDashboardStats, runHealthReminderSweep } from '../../api/services/healthService';

const quickLinks = [
  { to: '/dashboard/health/medical', label: 'Medical Surveillance' },
  { to: '/dashboard/health/hygiene', label: 'Occupational Hygiene Monitoring' },
  { to: '/dashboard/health/wellness', label: 'Wellness Programme' }
];

export function HealthDashboardPage() {
  const { activeCompanyId } = useTenant();
  const { data, loading, error } = useAsync(async () => {
    if (!activeCompanyId) return null;
    await runHealthReminderSweep(activeCompanyId).catch(() => undefined);
    return await getHealthDashboardStats(activeCompanyId);
  }, [activeCompanyId]);

  return (
    <Layout title="Health Dashboard">
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          {quickLinks.map((item) => (
            <Link key={item.to} to={item.to} className="px-3 py-2 rounded-lg border border-surface-300 bg-white text-sm hover:bg-surface-50">
              {item.label}
            </Link>
          ))}
        </div>

        {error && <div className="rounded-lg border border-critical/30 bg-critical/5 p-3 text-sm text-critical">{String(error.message)}</div>}
        {loading && <p className="text-sm text-charcoal-500">Loading health dashboard...</p>}

        {data && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <StatCard title="Fit" value={data.fitCount} icon="Shield" iconColor="#2ECC71" />
              <StatCard title="Restricted" value={data.restrictedCount} icon="AlertTriangle" iconColor="#F39C12" />
              <StatCard title="Unfit" value={data.unfitCount} icon="XCircle" iconColor="#E74C3C" />
              <StatCard title="Expired" value={data.expiredCount} icon="Clock" iconColor="#E67E22" />
              <StatCard title="Medicals due (30d)" value={data.medicalsExpiringSoon} icon="Calendar" iconColor="#1ABC9C" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white border border-surface-300 rounded-xl p-4">
                <p className="text-sm text-charcoal-500">Open hygiene non-compliances</p>
                <p className="text-2xl font-bold text-critical mt-1">{data.openHygieneNonCompliances}</p>
              </div>
              <div className="bg-white border border-surface-300 rounded-xl p-4">
                <p className="text-sm text-charcoal-500">Open health action plans</p>
                <p className="text-2xl font-bold text-warning mt-1">{data.openHealthActionPlans}</p>
              </div>
              <div className="bg-white border border-surface-300 rounded-xl p-4">
                <p className="text-sm text-charcoal-500">Vaccinations due soon</p>
                <p className="text-2xl font-bold text-teal mt-1">{data.vaccinationsDueSoon}</p>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

