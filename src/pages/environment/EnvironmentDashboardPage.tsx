import React from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { getEnvironmentDashboardStats, runEnvironmentReminderSweep } from '../../api/services/environmentService';
import { StatCard } from '../../components/ui/StatCard';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from 'recharts';
import { ListEmptyState } from '../../components/ui/ListEmptyState';
import { Trash2Icon } from 'lucide-react';

const quickLinks = [
  { to: '/dashboard/environment/eia', label: 'Environmental Impact Assessment (EIA)' },
  { to: '/dashboard/environment/risk-opportunity', label: 'Risk & Opportunity Register' },
  { to: '/dashboard/environment/waste', label: 'Waste Disposal Register' },
  { to: '/dashboard/environment/water', label: 'Water Monitoring' },
  { to: '/dashboard/environment/air', label: 'Air Quality Monitoring' }
];

export function EnvironmentDashboardPage() {
  const { activeCompanyId } = useTenant();

  const { data, loading, error } = useAsync(async () => {
    if (!activeCompanyId) return null;
    await runEnvironmentReminderSweep(activeCompanyId).catch(() => undefined);
    return await getEnvironmentDashboardStats(activeCompanyId);
  }, [activeCompanyId]);

  return (
    <Layout title="Environment Dashboard">
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          {quickLinks.map((item) => (
            <Link key={item.to} to={item.to} className="px-3 py-2 rounded-lg border border-surface-300 bg-white text-sm hover:bg-surface-50">
              {item.label}
            </Link>
          ))}
        </div>

        {error && <div className="rounded-lg border border-critical/30 bg-critical/5 p-3 text-sm text-critical">{String(error.message)}</div>}
        {loading && <p className="text-sm text-charcoal-500">Loading environment dashboard...</p>}

        {data && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <StatCard title="Open Environmental NCRs" value={data.openEnvironmentalNcrs} icon="AlertTriangle" iconColor="#E74C3C" />
              <StatCard title="Overdue corrective actions" value={data.overdueCorrectiveActions} icon="Clock" iconColor="#F39C12" />
              <StatCard title="Latest water compliance" value={data.latestWaterComplianceStatus} icon="Droplet" iconColor={data.latestWaterComplianceStatus === 'Fail' ? '#E74C3C' : '#2ECC71'} />
              <StatCard title="Latest air compliance" value={data.latestAirComplianceStatus} icon="Wind" iconColor={data.latestAirComplianceStatus === 'Fail' ? '#E74C3C' : '#2ECC71'} />
              <StatCard title="Waste entries this month" value={data.wasteDisposalEntriesThisMonth} icon="Trash2" iconColor="#1ABC9C" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-surface-300 p-4">
                <h3 className="font-semibold text-charcoal mb-3">Water Compliance (12 months)</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={data.waterComplianceTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="pass" fill="#2ECC71" name="Pass" />
                    <Bar dataKey="fail" fill="#E74C3C" name="Fail" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-xl border border-surface-300 p-4">
                <h3 className="font-semibold text-charcoal mb-3">Air Exceedances (12 months)</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={data.airExceedanceTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="exceedances" stroke="#E67E22" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-surface-300 p-4">
              <h3 className="font-semibold text-charcoal mb-3">Waste Quantities by Category (12 months)</h3>
              <div className="overflow-auto">
                <table className="w-full text-sm min-w-[760px]">
                  <thead className="bg-surface-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Month</th>
                      <th className="px-3 py-2 text-left">Category</th>
                      <th className="px-3 py-2 text-left">Quantity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {data.wasteQuantityTrend.slice(0, 40).map((row, idx) => (
                      <tr key={`${row.month}-${row.category}-${idx}`}>
                        <td className="px-3 py-2">{row.month}</td>
                        <td className="px-3 py-2">{row.category}</td>
                        <td className="px-3 py-2">{row.quantity}</td>
                      </tr>
                    ))}
                    {data.wasteQuantityTrend.length === 0 && (
                      <ListEmptyState
                        tableColSpan={3}
                        icon={Trash2Icon}
                        title="No waste data for this period"
                        description="Log waste movements and quantities in the waste register to populate this trend."
                        primaryAction={{ kind: 'link', to: '/dashboard/environment/waste', label: 'Open waste register' }}
                      />
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
