import { useEffect, useMemo, useState } from 'react';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { HrSectionNav } from './HrSectionNav';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { listDepartments } from '../../api/services/departmentsService';
import {
  approveHrTimesheet,
  archiveHrTimesheet,
  getHrSettings,
  getHrEmployeeByUserId,
  listHrEmployees,
  listHrRecords,
  listHrTimesheets,
  recalculateHrMonthlyHours,
  upsertHrTimesheet
} from '../../api/services/hrService';
import { HrEmployeeSelect } from '../../components/ui/HrEmployeeSelect';
import { HrExportMenu } from '../../components/hr/HrExportMenu';
import type { UUID } from '../../api/models/core';
import { toUserFacingError } from '../../utils/userFacingMessage';

const MONTH_OPTIONS = [
  { value: '01', label: 'January' }, { value: '02', label: 'February' }, { value: '03', label: 'March' },
  { value: '04', label: 'April' }, { value: '05', label: 'May' }, { value: '06', label: 'June' },
  { value: '07', label: 'July' }, { value: '08', label: 'August' }, { value: '09', label: 'September' },
  { value: '10', label: 'October' }, { value: '11', label: 'November' }, { value: '12', label: 'December' }
];

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
  const [declineReasonByRow, setDeclineReasonByRow] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { data: settings } = useAsync(async () => {
    if (!activeCompanyId) return null;
    return getHrSettings(activeCompanyId);
  }, [activeCompanyId]);

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

  const { data: rows, loading: rowsLoading, refetch } = useAsync(async () => {
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
  const canReopen = canApprove || isEmployee;
  const workingDays = useMemo(() => {
    const saved = Array.isArray(settings?.working_days) ? settings.working_days.map((day) => String(day).toUpperCase()) : [];
    return saved.length ? saved : ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
  }, [settings?.working_days]);
  const selectedDayName = useMemo(() => {
    const parsed = new Date(`${date}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return '';
    return ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][parsed.getDay()] ?? '';
  }, [date]);
  const selectedDayIsWorkingDay = !selectedDayName || workingDays.includes(selectedDayName);

  const currentYear = new Date().getFullYear();
  const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');

  const [filterQuery, setFilterQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterYear, setFilterYear] = useState(String(currentYear));
  const [filterMonth, setFilterMonth] = useState(currentMonth);
  const [showArchived, setShowArchived] = useState(false);
  const [archivingId, setArchivingId] = useState<UUID | null>(null);

  const filtersActiveCount = [filterQuery, filterStatus, filterDepartment, filterDateFrom, filterDateTo].filter(Boolean).length;

  function clearFilters() {
    setFilterQuery('');
    setFilterStatus('');
    setFilterDepartment('');
    setFilterDateFrom('');
    setFilterDateTo('');
  }

  async function onToggleArchive(rowId: UUID, archived: boolean) {
    if (!activeCompanyId || !user?.id) return;
    setError(null);
    setSuccess(null);
    setArchivingId(rowId);
    try {
      await archiveHrTimesheet({ companyId: activeCompanyId, timesheetId: rowId, actorUserId: user.id as UUID, archived });
      await refetch();
      setSuccess(archived ? 'Timesheet archived.' : 'Timesheet restored.');
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to update the archive status right now.'));
    } finally {
      setArchivingId(null);
    }
  }

  const employeeDepartmentId = useMemo(
    () => new Map((employees ?? []).map((e) => [e.id as UUID, e.department_id as UUID | null])),
    [employees]
  );

  const filteredRows = useMemo(() => {
    return (rows ?? []).filter((row) => {
      if (Boolean((row as any).archived) !== showArchived) return false;
      const q = filterQuery.trim().toLowerCase();
      if (q) {
        const name = String(employeeLabel.get(row.employee_id as UUID) ?? '').toLowerCase();
        if (!name.includes(q)) return false;
      }
      if (filterStatus && String(row.status ?? '') !== filterStatus) return false;
      if (filterDepartment) {
        const deptId = employeeDepartmentId.get(row.employee_id as UUID);
        if (!deptId || String(deptId) !== filterDepartment) return false;
      }
      if (filterDateFrom && row.date < filterDateFrom) return false;
      if (filterDateTo && row.date > filterDateTo) return false;
      if (filterYear && row.date.slice(0, 4) !== filterYear) return false;
      if (filterMonth && row.date.slice(5, 7) !== filterMonth) return false;
      return true;
    });
  }, [rows, employeeLabel, employeeDepartmentId, filterQuery, filterStatus, filterDepartment, filterDateFrom, filterDateTo, filterYear, filterMonth, showArchived]);

  useEffect(() => {
    const highlightId = new URLSearchParams(window.location.search).get('highlight');
    if (!highlightId) return;
    const el = document.getElementById(`timesheet-${highlightId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-2', 'ring-teal', 'ring-offset-2');
    const t = setTimeout(() => el.classList.remove('ring-2', 'ring-teal', 'ring-offset-2'), 3000);
    return () => clearTimeout(t);
  }, [filteredRows]);

  const byMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows ?? []) {
      const key = row.date.slice(0, 7);
      map.set(key, (map.get(key) ?? 0) + Number(row.hours_worked ?? 0) + Number(row.overtime_hours ?? 0));
    }
    return Array.from(map.entries()).sort(([a], [b]) => (a < b ? -1 : 1));
  }, [rows]);

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

    const approvedForDate = (rows ?? []).find(
      (r) => String(r.employee_id) === String(activeEmployeeId) && r.date === date && r.status === 'APPROVED'
    );
    if (approvedForDate) {
      setError('This record is already approved and locked. Create a new entry for another date.');
      return;
    }

    try {
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
      await Promise.all([refetch(), refetchMonthly()]);
      setSuccess('Saved successfully');
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to save hours worked right now. Please try again.'));
    }
  }

  async function onApprove(rowId: UUID) {
    if (!activeCompanyId || !user?.id) return;
    setError(null);
    setSuccess(null);
    try {
      await approveHrTimesheet({ companyId: activeCompanyId, timesheetId: rowId, actorUserId: user.id as UUID, decision: 'APPROVED' });
      await Promise.all([refetch(), refetchMonthly()]);
      setSuccess('Saved successfully');
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to approve this request right now.'));
    }
  }

  async function onDecline(rowId: UUID) {
    if (!activeCompanyId || !user?.id) return;
    const reason = (declineReasonByRow[String(rowId)] ?? '').trim();
    if (!reason) {
      setError('Decline reason is required.');
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await approveHrTimesheet({ companyId: activeCompanyId, timesheetId: rowId, actorUserId: user.id as UUID, decision: 'DECLINED', declineReason: reason });
      await Promise.all([refetch(), refetchMonthly()]);
      setSuccess('Saved successfully');
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to decline this request right now.'));
    }
  }

  function onReopen(rowId: UUID) {
    const row = (rows ?? []).find((r) => String(r.id) === String(rowId));
    if (!row) return;
    if (!isEmployee) setEmployeeId(String(row.employee_id ?? ''));
    setDate(row.date);
    setHoursWorked(String(row.hours_worked ?? '0'));
    setOvertimeHours(String(row.overtime_hours ?? '0'));
    setProjectOrClient(String(row.project_or_client ?? ''));
    setComments(String(row.notes ?? ''));
    setError(null);
    setSuccess('Request reopened. Update details and click Save timesheet to resubmit.');
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
              <div>
                <HrEmployeeSelect
                  companyId={activeCompanyId ?? null}
                  value={employeeId as any}
                  valueField="id"
                  includeUnlinked={true}
                  onChange={(val) => setEmployeeId(val)}
                  label="Employee"
                  placeholder="Search employee..."
                />
              </div>
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
                        if (!emp?.department_id) return 'No department assigned';
                        return departmentLabel.get(emp.department_id as UUID) ?? '';
                      })()
                    : 'No department assigned'
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
          {!selectedDayIsWorkingDay && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {selectedDayName.charAt(0) + selectedDayName.slice(1).toLowerCase()} is not in the company working-days setting. You can still save this entry if overtime or special work was performed.
            </div>
          )}
          <button className="px-4 py-2 rounded-lg bg-teal text-white text-sm" onClick={() => void onSave()} disabled={!activeEmployeeId}>
            Save timesheet
          </button>
        </div>

        <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Search</span>
              <input className="w-48 border border-surface-300 rounded-lg px-3 py-2 text-sm" placeholder="Employee name" value={filterQuery} onChange={(e) => setFilterQuery(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Status</span>
              <select className="border border-surface-300 rounded-lg px-3 py-2 text-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="">All</option>
                <option value="SUBMITTED">SUBMITTED</option>
                <option value="APPROVED">APPROVED</option>
                <option value="DECLINED">DECLINED</option>
              </select>
            </label>
            {(departments ?? []).length > 0 && (
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Department</span>
                <select className="border border-surface-300 rounded-lg px-3 py-2 text-sm" value={filterDepartment} onChange={(e) => setFilterDepartment(e.target.value)}>
                  <option value="">All</option>
                  {(departments ?? []).map((d) => <option key={String(d.id)} value={String(d.id)}>{d.name}</option>)}
                </select>
              </label>
            )}
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Date from</span>
              <input type="date" className="border border-surface-300 rounded-lg px-3 py-2 text-sm" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Date to</span>
              <input type="date" className="border border-surface-300 rounded-lg px-3 py-2 text-sm" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Year</span>
              <select className="border border-surface-300 rounded-lg px-3 py-2 text-sm" value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
                <option value="">All</option>
                {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map((y) => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Month</span>
              <select className="border border-surface-300 rounded-lg px-3 py-2 text-sm" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}>
                <option value="">All</option>
                {MONTH_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </label>
            {filtersActiveCount > 0 && (
              <div className="flex items-center gap-2 text-xs text-charcoal-500">
                <span>{filtersActiveCount} filter{filtersActiveCount === 1 ? '' : 's'} active</span>
                <button type="button" className="text-teal underline" onClick={clearFilters}>Clear filters</button>
              </div>
            )}
            <div className="flex rounded-lg border border-surface-300 overflow-hidden text-sm ml-auto">
              <button
                type="button"
                className={`px-3 py-2 ${!showArchived ? 'bg-teal text-white' : 'bg-white text-charcoal-600'}`}
                onClick={() => setShowArchived(false)}
              >
                Active
              </button>
              <button
                type="button"
                className={`px-3 py-2 ${showArchived ? 'bg-teal text-white' : 'bg-white text-charcoal-600'}`}
                onClick={() => setShowArchived(true)}
              >
                View Archived
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <HrExportMenu
            moduleName="Timesheets"
            periodLabel={filterMonth && filterYear ? `${MONTH_OPTIONS.find((m) => m.value === filterMonth)?.label ?? filterMonth} ${filterYear}` : filterYear || undefined}
            fileNameBase={`SCA_HoursWorked_${filterYear || new Date().getFullYear()}-${filterMonth || String(new Date().getMonth() + 1).padStart(2, '0')}`}
            columns={[
              { key: 'employee', label: 'Employee' },
              { key: 'date', label: 'Date' },
              { key: 'hours_worked', label: 'Hours Worked' },
              { key: 'overtime_hours', label: 'Overtime' },
              { key: 'daily_total', label: 'Daily Total' },
              { key: 'status', label: 'Status' },
              { key: 'project_or_client', label: 'Project / Client' }
            ]}
            rows={filteredRows.map((row) => ({
              employee: employeeLabel.get(row.employee_id as UUID) ?? row.employee_id,
              date: row.date,
              hours_worked: row.hours_worked,
              overtime_hours: row.overtime_hours,
              daily_total: Number(row.hours_worked ?? 0) + Number(row.overtime_hours ?? 0),
              status: row.status,
              project_or_client: row.project_or_client
            }))}
          />
        </div>

        <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
          {rowsLoading ? (
            <div className="flex justify-center py-10"><LoadingSpinner /></div>
          ) : filteredRows.length === 0 ? (
            <div className="text-center py-10 text-sm text-charcoal-500">No timesheet entries match your filters.</div>
          ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-100"><tr><th className="text-left px-3 py-2">Employee</th><th className="text-left px-3 py-2">Date</th><th className="text-left px-3 py-2">Hours worked</th><th className="text-left px-3 py-2">Overtime</th><th className="text-left px-3 py-2">Daily total</th><th className="text-left px-3 py-2">Status</th><th className="text-left px-3 py-2">Decline reason</th><th className="text-left px-3 py-2">Action</th></tr></thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id} id={`timesheet-${row.id}`} className="border-t border-surface-100">
                  <td className="px-3 py-2">{employeeLabel.get(row.employee_id as UUID) ?? row.employee_id}</td>
                  <td className="px-3 py-2">{row.date}</td>
                  <td className="px-3 py-2">{row.hours_worked}</td>
                  <td className="px-3 py-2">{row.overtime_hours}</td>
                  <td className="px-3 py-2 font-semibold">{(Number(row.hours_worked ?? 0) + Number(row.overtime_hours ?? 0)).toFixed(2)}</td>
                  <td className="px-3 py-2">{row.status}</td>
                  <td className="px-3 py-2">
                    {canApprove && row.status === 'SUBMITTED' ? (
                      <textarea
                        className="w-48 border border-surface-300 rounded px-2 py-1 text-xs"
                        value={declineReasonByRow[String(row.id)] ?? ''}
                        onChange={(e) => setDeclineReasonByRow((prev) => ({ ...prev, [String(row.id)]: e.target.value }))}
                        placeholder="Required if declining"
                      />
                    ) : row.status === 'DECLINED' ? (
                      <span className="text-critical text-xs">{row.decline_reason ? String(row.decline_reason) : 'No reason provided'}</span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {canApprove && row.status === 'SUBMITTED' && (
                      <div className="space-x-2">
                        <button className="text-teal" onClick={() => void onApprove(row.id as UUID)}>Approve</button>
                        <button className="text-critical" onClick={() => void onDecline(row.id as UUID)}>Decline</button>
                      </div>
                    )}
                    {canReopen && row.status === 'DECLINED' && (!isEmployee || String(row.employee_id) === String(selfEmployee?.id)) && (
                      <button className="text-teal" onClick={() => onReopen(row.id as UUID)}>Reopen</button>
                    )}
                    {row.status === 'APPROVED' && <span className="text-xs text-charcoal-500 mr-2">Locked</span>}
                    {canApprove && row.status === 'APPROVED' && !showArchived && (
                      <button className="text-charcoal-700" disabled={archivingId === row.id} onClick={() => void onToggleArchive(row.id as UUID, true)}>
                        {archivingId === row.id ? 'Archiving...' : 'Archive'}
                      </button>
                    )}
                    {canApprove && showArchived && (
                      <button className="text-charcoal-700" disabled={archivingId === row.id} onClick={() => void onToggleArchive(row.id as UUID, false)}>
                        {archivingId === row.id ? 'Restoring...' : 'Restore'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
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

