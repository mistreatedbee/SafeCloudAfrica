import React, { useMemo, useState } from 'react';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { HrSectionNav } from './HrSectionNav';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { listDepartments } from '../../api/services/departmentsService';
import {
  approveHrTimesheet,
  deleteHrTimesheet,
  getHrEmployeeByUserId,
  listHrEmployees,
  listHrRecords,
  listHrTimesheets,
  recalculateHrMonthlyHours,
  updateHrTimesheet,
  upsertHrTimesheet
} from '../../api/services/hrService';
import { downloadTextFile, toCsv } from '../../utils/csv';
import type { UUID } from '../../api/models/core';

export function HrHoursPage() {
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const canApprove = ['owner', 'admin', 'manager', 'supervisor'].includes(activeRole ?? '');
  const isEmployee = activeRole === 'employee';
  const [employeeId, setEmployeeId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [hoursWorked, setHoursWorked] = useState('8');
  const [overtimeHours, setOvertimeHours] = useState('0');
  const [projectOrClient, setProjectOrClient] = useState('');
  const [comments, setComments] = useState('');
  const [editingRowId, setEditingRowId] = useState<UUID | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { data: selfEmployee } = useAsync(async () => {
    if (!activeCompanyId || !user?.id) return null;
    return getHrEmployeeByUserId(activeCompanyId, user.id as UUID);
  }, [activeCompanyId, user?.id]);

  const activeEmployeeId = isEmployee ? (selfEmployee?.id ?? '') : employeeId;

  const { data: employees } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listHrEmployees(activeCompanyId);
  }, [activeCompanyId]);

  const { data: departments } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listDepartments(activeCompanyId);
  }, [activeCompanyId]);

  const { data: rows, refetch } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listHrTimesheets(activeCompanyId, isEmployee ? (selfEmployee?.id as UUID | undefined) : undefined);
  }, [activeCompanyId, isEmployee, selfEmployee?.id]);

  const { data: monthlyRows, refetch: refetchMonthly } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listHrRecords(activeCompanyId, 'hr_monthly_hours', isEmployee ? { employee_id: selfEmployee?.id ?? null } : undefined);
  }, [activeCompanyId, isEmployee, selfEmployee?.id]);

  const employeeLabel = useMemo(
    () => new Map((employees ?? []).map((employee) => [employee.id as UUID, `${employee.first_name} ${employee.last_name}`])),
    [employees]
  );

  const employeeNumber = useMemo(
    () => new Map((employees ?? []).map((employee) => [employee.id as UUID, employee.employee_no])),
    [employees]
  );

  const departmentLabel = useMemo(
    () => new Map((departments ?? []).map((dept) => [dept.id as UUID, dept.name])),
    [departments]
  );

  const dailyTotal = Number(hoursWorked || 0) + Number(overtimeHours || 0);
  const canManageRows = ['owner', 'admin', 'manager', 'supervisor'].includes(activeRole ?? '');

  const byMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows ?? []) {
      const key = row.date.slice(0, 7);
      map.set(key, (map.get(key) ?? 0) + Number(row.hours_worked ?? 0) + Number(row.overtime_hours ?? 0));
    }
    return Array.from(map.entries()).sort(([a], [b]) => (a < b ? -1 : 1));
  }, [rows]);

  function resetForm() {
    setEditingRowId(null);
    setEmployeeId('');
    setDate(new Date().toISOString().slice(0, 10));
    setHoursWorked('8');
    setOvertimeHours('0');
    setProjectOrClient('');
    setComments('');
  }

  function beginEdit(row: any) {
    setEditingRowId(row.id as UUID);
    if (!isEmployee) setEmployeeId(String(row.employee_id ?? ''));
    setDate(String(row.date ?? '').slice(0, 10));
    setHoursWorked(String(row.hours_worked ?? 0));
    setOvertimeHours(String(row.overtime_hours ?? 0));
    setProjectOrClient(String(row.project_or_client ?? ''));
    setComments(String(row.notes ?? ''));
    setError(null);
    setSuccess(null);
  }

  async function onSave() {
    setError(null);
    setSuccess(null);

    if (!activeCompanyId || !user?.id || !activeEmployeeId) {
      setError('Unable to save hours worked record. Please make sure an employee is selected and try again.');
      return;
    }

    const parsedHours = Number(hoursWorked || 0);
    const parsedOvertime = Number(overtimeHours || 0);

    if (!Number.isFinite(parsedHours) || parsedHours < 0 || !Number.isFinite(parsedOvertime) || parsedOvertime < 0) {
      setError('Hours worked and overtime hours must be zero or a positive number.');
      return;
    }

    try {
      if (editingRowId) {
        await updateHrTimesheet({
          companyId: activeCompanyId,
          timesheetId: editingRowId,
          actorUserId: user.id as UUID,
          patch: {
            employee_id: activeEmployeeId as UUID,
            date,
            hours_worked: parsedHours,
            overtime_hours: parsedOvertime,
            project_or_client: projectOrClient || null,
            notes: comments || null
          }
        });
      } else {
        const row = await upsertHrTimesheet({
          company_id: activeCompanyId,
          employee_id: activeEmployeeId as UUID,
          date,
          hours_worked: parsedHours,
          overtime_hours: parsedOvertime,
          project_or_client: projectOrClient || null,
          notes: comments || null,
          status: 'SUBMITTED',
          created_by_user_id: user.id as UUID
        });
        const d = new Date(row.date);
        await recalculateHrMonthlyHours(activeCompanyId, row.employee_id as UUID, d.getUTCFullYear(), d.getUTCMonth() + 1, user.id as UUID);
      }
      await Promise.all([refetch(), refetchMonthly()]);
      setSuccess(editingRowId ? 'Hours worked record updated successfully.' : 'Hours worked record saved successfully.');
      resetForm();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save hours worked record. Please try again.';
      setError(message);
    }
  }

  async function onApprove(rowId: UUID) {
    if (!activeCompanyId || !user?.id) return;
    await approveHrTimesheet({ companyId: activeCompanyId, timesheetId: rowId, actorUserId: user.id as UUID, decision: 'APPROVED' });
    await Promise.all([refetch(), refetchMonthly()]);
  }

  async function onDecline(rowId: UUID) {
    if (!activeCompanyId || !user?.id) return;
    const reason = window.prompt('Decline reason (required):', '');
    if (!reason?.trim()) {
      setError('Decline reason is required.');
      return;
    }
    await approveHrTimesheet({ companyId: activeCompanyId, timesheetId: rowId, actorUserId: user.id as UUID, decision: 'DECLINED', declineReason: reason.trim() });
    await Promise.all([refetch(), refetchMonthly()]);
  }

  async function onDelete(row: any) {
    if (!activeCompanyId || !user?.id) return;
    const canDeleteRow =
      canManageRows || (isEmployee && String(row.employee_id) === String(selfEmployee?.id) && String(row.status) !== 'APPROVED');
    if (!canDeleteRow) return;
    if (!window.confirm('Delete this timesheet entry? This cannot be undone.')) return;
    try {
      await deleteHrTimesheet({
        companyId: activeCompanyId,
        timesheetId: row.id as UUID,
        actorUserId: user.id as UUID
      });
      await Promise.all([refetch(), refetchMonthly()]);
      if (String(editingRowId ?? '') === String(row.id)) resetForm();
      setSuccess('Timesheet entry deleted successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete timesheet entry.');
    }
  }

  return (
    <Layout title="Attendance / Hours Worked">
      <div className="space-y-4">
        <HrSectionNav />
        {error && <div className="bg-critical/10 border border-critical/30 rounded-xl p-3 text-sm text-critical">{error}</div>}
        {success && <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700">{success}</div>}
        <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold">Timesheet entry</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {!isEmployee && (
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Employee</span>
                <select className="w-full border border-surface-300 rounded-lg px-3 py-2" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                  <option value="">Select employee</option>
                  {(employees ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.first_name} {employee.last_name}</option>)}
                </select>
              </label>
            )}
            {isEmployee && (
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Employee</span>
                <input className="w-full border border-surface-300 rounded-lg px-3 py-2 bg-surface-50" readOnly value={selfEmployee ? `${selfEmployee.first_name} ${selfEmployee.last_name}` : 'No linked employee profile'} />
              </label>
            )}
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Employee ID</span>
              <input
                className="w-full border border-surface-300 rounded-lg px-3 py-2 bg-surface-50"
                readOnly
                value={
                  activeEmployeeId
                    ? employeeNumber.get(activeEmployeeId as UUID) ?? ''
                    : ''
                }
              />
            </label>
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Department</span>
              <input
                className="w-full border border-surface-300 rounded-lg px-3 py-2 bg-surface-50"
                readOnly
                value={
                  activeEmployeeId
                    ? (() => {
                        const emp = (employees ?? []).find((e) => String(e.id) === String(activeEmployeeId));
                        if (!emp?.department_id) return '';
                        return departmentLabel.get(emp.department_id as UUID) ?? '';
                      })()
                    : ''
                }
              />
            </label>
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Date</span><input type="date" className="w-full border border-surface-300 rounded-lg px-3 py-2" value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Hours worked</span><input className="w-full border border-surface-300 rounded-lg px-3 py-2" value={hoursWorked} onChange={(e) => setHoursWorked(e.target.value)} /></label>
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Overtime hours</span><input className="w-full border border-surface-300 rounded-lg px-3 py-2" value={overtimeHours} onChange={(e) => setOvertimeHours(e.target.value)} /></label>
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Project / Client</span><input className="w-full border border-surface-300 rounded-lg px-3 py-2" value={projectOrClient} onChange={(e) => setProjectOrClient(e.target.value)} /></label>
            <label className="text-sm md:col-span-2 lg:col-span-2">
              <span className="block text-xs text-charcoal-500 mb-1">Comments</span>
              <textarea
                className="w-full border border-surface-300 rounded-lg px-3 py-2 min-h-[38px]"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
              />
            </label>
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Daily total</span><input className="w-full border border-surface-300 rounded-lg px-3 py-2 bg-surface-50 font-semibold" readOnly value={dailyTotal.toFixed(2)} /></label>
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-lg bg-teal text-white text-sm" onClick={() => void onSave()} disabled={!activeEmployeeId}>
              {editingRowId ? 'Update timesheet' : 'Save timesheet'}
            </button>
            {editingRowId && (
              <button className="px-4 py-2 rounded-lg border border-surface-300 text-sm" onClick={resetForm}>
                Cancel edit
              </button>
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <button className="px-3 py-2 rounded-lg border border-surface-300 text-sm" onClick={() => {
            const csv = toCsv((rows ?? []).map((row) => ({
              id: row.id,
              employee: employeeLabel.get(row.employee_id as UUID) ?? row.employee_id,
              date: row.date,
              hours_worked: row.hours_worked,
              overtime_hours: row.overtime_hours,
              daily_total: Number(row.hours_worked ?? 0) + Number(row.overtime_hours ?? 0),
              status: row.status,
              project_or_client: row.project_or_client
            })));
            downloadTextFile(`hr-timesheets-${new Date().toISOString().slice(0, 10)}.csv`, csv);
          }}>Export CSV</button>
        </div>

        <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-100"><tr><th className="text-left px-3 py-2">Employee</th><th className="text-left px-3 py-2">Date</th><th className="text-left px-3 py-2">Hours worked</th><th className="text-left px-3 py-2">Overtime</th><th className="text-left px-3 py-2">Daily total</th><th className="text-left px-3 py-2">Status</th><th className="text-left px-3 py-2">Action</th></tr></thead>
            <tbody>
              {(rows ?? []).map((row) => (
                <tr key={row.id} className="border-t border-surface-100">
                  <td className="px-3 py-2">{employeeLabel.get(row.employee_id as UUID) ?? row.employee_id}</td>
                  <td className="px-3 py-2">{row.date}</td>
                  <td className="px-3 py-2">{row.hours_worked}</td>
                  <td className="px-3 py-2">{row.overtime_hours}</td>
                  <td className="px-3 py-2 font-semibold">{(Number(row.hours_worked ?? 0) + Number(row.overtime_hours ?? 0)).toFixed(2)}</td>
                  <td className="px-3 py-2">{row.status}</td>
                  <td className="px-3 py-2">
                    <div className="space-x-2">
                      {(canManageRows || (isEmployee && String(row.employee_id) === String(selfEmployee?.id) && String(row.status) !== 'APPROVED')) && (
                        <>
                          <button className="text-charcoal-700" onClick={() => beginEdit(row)}>Edit</button>
                          <button className="text-critical" onClick={() => void onDelete(row)}>Delete</button>
                        </>
                      )}
                      {canApprove && row.status === 'SUBMITTED' && (
                        <>
                        <button className="text-teal" onClick={() => void onApprove(row.id as UUID)}>Approve</button>
                        <button className="text-critical" onClick={() => void onDecline(row.id as UUID)}>Decline</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-surface-300 rounded-xl p-4">
            <h3 className="font-semibold mb-2">Monthly total (auto-calculated)</h3>
            <div className="space-y-2 text-sm">
              {byMonth.map(([month, total]) => <div key={month}>{month}: <span className="font-semibold">{total.toFixed(2)} hrs</span></div>)}
            </div>
          </div>
          <div className="bg-white border border-surface-300 rounded-xl p-4 overflow-auto">
            <h3 className="font-semibold mb-2">Stored monthly totals</h3>
            <table className="w-full text-sm">
              <thead><tr><th className="text-left py-1">Employee</th><th className="text-left py-1">Month</th><th className="text-left py-1">Total hrs</th></tr></thead>
              <tbody>
                {(monthlyRows ?? []).map((row) => (
                  <tr key={String(row.id)} className="border-t border-surface-100">
                    <td className="py-1">{employeeLabel.get(row.employee_id as UUID) ?? String(row.employee_id ?? '')}</td>
                    <td className="py-1">{String(row.year ?? '')}-{String(row.month ?? '').padStart(2, '0')}</td>
                    <td className="py-1 font-semibold">{Number(row.total_with_overtime ?? 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
