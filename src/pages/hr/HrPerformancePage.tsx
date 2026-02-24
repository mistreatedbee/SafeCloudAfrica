import React, { useState } from 'react';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { HrSectionNav } from './HrSectionNav';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { createHrRecord, listHrEmployees, listHrRecords } from '../../api/services/hrService';

export function HrPerformancePage() {
  const { activeCompanyId } = useTenant();
  const { user } = useUser();
  const [employeeId, setEmployeeId] = useState('');
  const [cycle, setCycle] = useState('Annual');
  const [overallRating, setOverallRating] = useState('3');
  const [strengths, setStrengths] = useState('');

  const { data: employees } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listHrEmployees(activeCompanyId);
  }, [activeCompanyId]);

  const { data: reviews, refetch } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listHrRecords(activeCompanyId, 'hr_performance_reviews');
  }, [activeCompanyId]);

  const onCreate = async () => {
    if (!activeCompanyId || !user?.id || !employeeId) return;
    await createHrRecord('hr_performance_reviews', {
      company_id: activeCompanyId,
      employee_id: employeeId,
      cycle,
      review_date: new Date().toISOString().slice(0, 10),
      reviewer_user_id: user.id,
      overall_rating: Number(overallRating),
      strengths,
      improvements: null,
      goals_next_period: null,
      attachments: [],
      employee_acknowledged: false,
      hr_final_approved: false,
      status: 'IN_REVIEW',
      created_by_user_id: user.id
    });
    setStrengths('');
    await refetch();
  };

  return (
    <Layout title="Performance Management">
      <div className="space-y-4">
        <HrSectionNav />
        <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold">Performance review cycle entry</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <select className="border border-surface-300 rounded-lg px-3 py-2 text-sm" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Employee</option>
              {(employees ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.first_name} {employee.last_name}</option>)}
            </select>
            <input className="border border-surface-300 rounded-lg px-3 py-2 text-sm" value={cycle} onChange={(e) => setCycle(e.target.value)} placeholder="Cycle / Other" />
            <input className="border border-surface-300 rounded-lg px-3 py-2 text-sm" value={overallRating} onChange={(e) => setOverallRating(e.target.value)} placeholder="Rating (1-5)" />
            <input className="border border-surface-300 rounded-lg px-3 py-2 text-sm" value={strengths} onChange={(e) => setStrengths(e.target.value)} placeholder="Strengths" />
          </div>
          <button className="px-4 py-2 rounded-lg bg-teal text-white text-sm" onClick={onCreate}>Save review</button>
        </div>

        <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-100"><tr><th className="text-left px-3 py-2">Employee</th><th className="text-left px-3 py-2">Cycle</th><th className="text-left px-3 py-2">Review Date</th><th className="text-left px-3 py-2">Rating</th><th className="text-left px-3 py-2">Status</th></tr></thead>
            <tbody>
              {(reviews ?? []).map((row) => (
                <tr key={row.id} className="border-t border-surface-100">
                  <td className="px-3 py-2">{String(row.employee_id ?? '')}</td>
                  <td className="px-3 py-2">{String(row.cycle ?? '')}</td>
                  <td className="px-3 py-2">{String(row.review_date ?? '')}</td>
                  <td className="px-3 py-2">{String(row.overall_rating ?? '')}</td>
                  <td className="px-3 py-2">{String(row.status ?? '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
