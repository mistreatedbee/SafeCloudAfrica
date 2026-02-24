import React, { useMemo, useState } from 'react';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { HrSectionNav } from './HrSectionNav';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { approveHrTimesheet, listHrEmployees, listHrTimesheets, upsertHrTimesheet } from '../../api/services/hrService';
import { downloadTextFile, toCsv } from '../../utils/csv';

export function HrHoursPage() {
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const [employeeId, setEmployeeId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [hoursWorked, setHoursWorked] = useState('8');
  const [overtimeHours, setOvertimeHours] = useState('0');
  const [projectOrClient, setProjectOrClient] = useState('');

  const { data: employees } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listHrEmployees(activeCompanyId);
  }, [activeCompanyId]);

  const { data: rows, refetch } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listHrTimesheets(activeCompanyId);
  }, [activeCompanyId]);

  const canApprove = ['owner', 'admin', 'manager', 'supervisor'].includes(activeRole ?? '');

  const onSave = async () => {
    if (!activeCompanyId || !user?.id || !employeeId) return;
    await upsertHrTimesheet({
      company_id: activeCompanyId,
      employee_id: employeeId,
      date,
      hours_worked: Number(hoursWorked || 0),
      overtime_hours: Number(overtimeHours || 0),
      project_or_client: projectOrClient || null,
      notes: null,
      status: 'SUBMITTED',
      created_by_user_id: user.id
    });
    await refetch();
  };

  const byMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows ?? []) {
      const key = row.date.slice(0, 7);
      map.set(key, (map.get(key) ?? 0) + Number(row.hours_worked ?? 0) + Number(row.overtime_hours ?? 0));
    }
    return Array.from(map.entries()).sort(([a], [b]) => (a < b ? -1 : 1));
  }, [rows]);

  return (
    <Layout title="Attendance / Hours Worked">
      <div className="space-y-4">
        <HrSectionNav />
        <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold">Timesheet entry</h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <select className="border border-surface-300 rounded-lg px-3 py-2 text-sm" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Employee</option>
              {(employees ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.first_name} {employee.last_name}</option>)}
            </select>
            <input type="date" className="border border-surface-300 rounded-lg px-3 py-2 text-sm" value={date} onChange={(e) => setDate(e.target.value)} />
            <input className="border border-surface-300 rounded-lg px-3 py-2 text-sm" value={hoursWorked} onChange={(e) => setHoursWorked(e.target.value)} placeholder="Hours" />
            <input className="border border-surface-300 rounded-lg px-3 py-2 text-sm" value={overtimeHours} onChange={(e) => setOvertimeHours(e.target.value)} placeholder="Overtime" />
            <input className="border border-surface-300 rounded-lg px-3 py-2 text-sm" value={projectOrClient} onChange={(e) => setProjectOrClient(e.target.value)} placeholder="Project/Client (Other)" />
          </div>
          <button className="px-4 py-2 rounded-lg bg-teal text-white text-sm" onClick={onSave}>Submit timesheet</button>
        </div>

        <div className="flex justify-end">
          <button className="px-3 py-2 rounded-lg border border-surface-300 text-sm" onClick={() => {
            const csv = toCsv((rows ?? []).map((row) => ({ id: row.id, employee_id: row.employee_id, date: row.date, hours_worked: row.hours_worked, overtime_hours: row.overtime_hours, status: row.status, project_or_client: row.project_or_client })));
            downloadTextFile(`hr-timesheets-${new Date().toISOString().slice(0, 10)}.csv`, csv);
          }}>Export CSV</button>
        </div>

        <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-100"><tr><th className="text-left px-3 py-2">Employee</th><th className="text-left px-3 py-2">Date</th><th className="text-left px-3 py-2">Hours</th><th className="text-left px-3 py-2">Overtime</th><th className="text-left px-3 py-2">Status</th><th className="text-left px-3 py-2">Action</th></tr></thead>
            <tbody>
              {(rows ?? []).map((row) => (
                <tr key={row.id} className="border-t border-surface-100">
                  <td className="px-3 py-2">{row.employee_id}</td>
                  <td className="px-3 py-2">{row.date}</td>
                  <td className="px-3 py-2">{row.hours_worked}</td>
                  <td className="px-3 py-2">{row.overtime_hours}</td>
                  <td className="px-3 py-2">{row.status}</td>
                  <td className="px-3 py-2">
                    {canApprove && row.status === 'SUBMITTED' && (
                      <div className="space-x-2">
                        <button className="text-teal" onClick={async () => {
                          if (!activeCompanyId || !user?.id) return;
                          await approveHrTimesheet({ companyId: activeCompanyId, timesheetId: row.id, actorUserId: user.id, decision: 'APPROVED' });
                          await refetch();
                        }}>Approve</button>
                        <button className="text-critical" onClick={async () => {
                          if (!activeCompanyId || !user?.id) return;
                          await approveHrTimesheet({ companyId: activeCompanyId, timesheetId: row.id, actorUserId: user.id, decision: 'DECLINED', declineReason: 'Declined by approver' });
                          await refetch();
                        }}>Decline</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white border border-surface-300 rounded-xl p-4">
          <h3 className="font-semibold mb-2">Overtime trend</h3>
          <div className="space-y-2">
            {byMonth.map(([month, total]) => <div key={month} className="text-sm text-charcoal-600">{month}: {Math.round(total)} hrs</div>)}
          </div>
        </div>
      </div>
    </Layout>
  );
}
