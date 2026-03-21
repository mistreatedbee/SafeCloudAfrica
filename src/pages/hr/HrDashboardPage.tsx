import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../components/layout/Layout';
import { HrSectionNav } from './HrSectionNav';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { getHrDashboardStats } from '../../api/services/hrService';
import { listHrEmployees, listHrLeaveRequests, listHrTimesheets } from '../../api/services/hrService';
import { FirstWinBanner } from '../../components/onboarding/FirstWinBanner';

export function HrDashboardPage() {
  const navigate = useNavigate();
  const { activeCompanyId, activeRole, memberships } = useTenant();
  const activeMembership = memberships.find((m) => m.company_id === activeCompanyId);
  const showHrFirstWin = activeRole === 'admin' || activeMembership?.is_hr_manager === true;

  const { data: stats } = useAsync(async () => {
    if (!activeCompanyId) return null;
    return getHrDashboardStats(activeCompanyId);
  }, [activeCompanyId]);

  const { data: employees } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listHrEmployees(activeCompanyId);
  }, [activeCompanyId]);

  const { data: leaveRequests } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listHrLeaveRequests(activeCompanyId);
  }, [activeCompanyId]);

  const { data: timesheets } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listHrTimesheets(activeCompanyId);
  }, [activeCompanyId]);

  const headcountByDepartment = useMemo(() => {
    const map = new Map<string, number>();
    for (const employee of employees ?? []) {
      const key = employee.department_id ?? 'Unassigned';
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries()).slice(0, 8);
  }, [employees]);

  const leaveMonthly = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of leaveRequests ?? []) {
      const key = row.start_date.slice(0, 7);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort(([a], [b]) => (a < b ? -1 : 1)).slice(-12);
  }, [leaveRequests]);

  const overtimeMonthly = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of timesheets ?? []) {
      const key = row.date.slice(0, 7);
      map.set(key, (map.get(key) ?? 0) + Number(row.overtime_hours ?? 0));
    }
    return Array.from(map.entries()).sort(([a], [b]) => (a < b ? -1 : 1)).slice(-3);
  }, [timesheets]);

  return (
    <Layout title="HR Dashboard">
      <div className="space-y-4">
        {showHrFirstWin ? <FirstWinBanner persona="hr" /> : null}
        <HrSectionNav />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="Employees" value={String(stats?.totalEmployees ?? 0)} subtitle={`Active ${stats?.activeEmployees ?? 0}`} />
          <Stat label="Leave Pending" value={String(stats?.pendingLeaveApprovals ?? 0)} subtitle={`Overdue ${stats?.overdueLeaveApprovals ?? 0}`} />
          <Stat label="Contracts Expiring" value={String(stats?.contractsExpiring30Days ?? 0)} subtitle={`7d ${stats?.contractsExpiring7Days ?? 0}`} />
          <Stat label="Hours Worked" value={String(Math.round(stats?.hoursWorkedSelectedPeriod ?? 0))} subtitle={`Training ${stats?.trainingCompliancePercent ?? 0}%`} />
          <Stat label="Disciplinary Open" value={String(stats?.disciplinaryOpen ?? 0)} subtitle={`Repeat ${stats?.disciplinaryRepeatOffence ?? 0}`} />
          <Stat label="HR Docs Expiring" value={String(stats?.hrDocsExpiringSoon ?? 0)} subtitle="Next 30 days" />
          <Stat label="HR Docs Expired" value={String(stats?.hrDocsExpired ?? 0)} subtitle="Compliance gap" />
          <Stat label="Ack Completion" value={`${stats?.acknowledgementCompletionPercent ?? 0}%`} subtitle="Policies/sign-offs" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <button className="bg-white border border-surface-300 rounded-xl p-4 text-left" onClick={() => navigate('/dashboard/hr/employees')}>Add employee</button>
          <button className="bg-white border border-surface-300 rounded-xl p-4 text-left" onClick={() => navigate('/dashboard/hr/employees?tab=import')}>Import employees (CSV)</button>
          <button className="bg-white border border-surface-300 rounded-xl p-4 text-left" onClick={() => navigate('/dashboard/hr/leave')}>Create leave request</button>
          <button className="bg-white border border-surface-300 rounded-xl p-4 text-left" onClick={() => navigate('/dashboard/hr/documents')}>Upload contract</button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <SimpleChart title="Headcount by department/site" data={headcountByDepartment} />
          <SimpleChart title="Leave trends (12 months)" data={leaveMonthly} />
          <SimpleChart title="Overtime trend (3 months)" data={overtimeMonthly} />
        </div>
      </div>
    </Layout>
  );
}

function Stat({ label, value, subtitle }: { label: string; value: string; subtitle: string }) {
  return (
    <div className="bg-white rounded-xl border border-surface-300 p-4">
      <p className="text-xs text-charcoal-500">{label}</p>
      <p className="text-2xl font-semibold text-charcoal mt-1">{value}</p>
      <p className="text-xs text-charcoal-500 mt-1">{subtitle}</p>
    </div>
  );
}

function SimpleChart({ title, data }: { title: string; data: Array<[string, number]> }) {
  const max = Math.max(...data.map(([, v]) => v), 1);
  return (
    <div className="bg-white rounded-xl border border-surface-300 p-4">
      <h3 className="text-sm font-semibold text-charcoal mb-3">{title}</h3>
      <div className="space-y-2">
        {data.length === 0 && <p className="text-xs text-charcoal-500">No data</p>}
        {data.map(([label, value]) => (
          <div key={label} className="space-y-1">
            <div className="flex justify-between text-xs text-charcoal-500"><span>{label}</span><span>{value}</span></div>
            <div className="h-2 bg-surface-100 rounded">
              <div className="h-2 bg-teal rounded" style={{ width: `${Math.round((value / max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
