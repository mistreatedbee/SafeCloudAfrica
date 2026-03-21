import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../../components/layout/Layout';
import { ListEmptyState } from '../../components/ui/ListEmptyState';
import { ClipboardCheckIcon } from 'lucide-react';
import { useTenant } from '../../tenant/TenantContext';
import { listPreWorkInstances } from '../../api/services/risksService';

export function PreWorkInstancesPage() {
  const { activeCompanyId } = useTenant();
  const [instances, setInstances] = useState<Array<{ id: string; risk_assessment_id: string; instance_date: string; supervisor_signed_at: string | null }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeCompanyId) return;
    listPreWorkInstances({ companyId: activeCompanyId })
      .then((data) => setInstances(data as never))
      .catch(() => setInstances([]))
      .finally(() => setLoading(false));
  }, [activeCompanyId]);

  return (
    <Layout title="Pre-work Daily Instances">
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Pre-work Daily Instances</h1>
        <p className="text-gray-600 mb-6">
          View daily pre-work risk assessment instances by date. Each instance shows employee signatures and supervisor sign-off.
        </p>
        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : instances.length === 0 ? (
          <ListEmptyState
            icon={ClipboardCheckIcon}
            title="No pre-work instances yet"
            description="Daily pre-work sign-offs appear here once employees complete instances linked to a pre-work assessment."
            primaryAction={{ kind: 'link', to: '/risk-assessments/new?type=prework', label: 'Create pre-work assessment' }}
          />
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Assessment</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Supervisor sign-off</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {instances.map((inst) => (
                  <tr key={inst.id}>
                    <td className="px-4 py-2 text-sm text-gray-900">{inst.instance_date}</td>
                    <td className="px-4 py-2 text-sm">
                      <Link to={`/risk-assessments/${inst.risk_assessment_id}`} className="text-blue-600 hover:underline">
                        View assessment
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {inst.supervisor_signed_at ? new Date(inst.supervisor_signed_at).toLocaleString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4">
          <Link to="/risk-assessments" className="text-gray-600 hover:text-gray-900 text-sm">Back to Risk Assessments</Link>
        </div>
      </div>
    </Layout>
  );
}
