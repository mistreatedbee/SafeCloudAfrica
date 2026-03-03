import React, { useMemo, useState } from 'react';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { HrSectionNav } from './HrSectionNav';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import {
  applyHrLeaveApproval,
  createHrLeaveRequest,
  ensureDefaultHrLeaveTypes,
  getHrEmployeeByUserId,
  getOrCreateHrLeaveTypeByName,
  listHrEmployees,
  listHrLeaveRequests,
  listHrRecords
} from '../../api/services/hrService';
import { SelectOrType } from '../../components/ui/SelectOrType';
import { downloadTextFile, toCsv } from '../../utils/csv';
import type { UUID } from '../../api/models/core';

export function HrLeavePage() {
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const [employeeId, setEmployeeId] = useState('');
  const [leaveTypeValue, setLeaveTypeValue] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [declineReasonByRow, setDeclineReasonByRow] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const isSupervisor = activeRole === 'manager' || activeRole === 'supervisor';
  const isHrApprover = activeRole === 'owner' || activeRole === 'admin';
  const canApprove = isSupervisor || isHrApprover;
  const isEmployee = activeRole === 'employee';

  const { data: selfEmployee } = useAsync(async () => {
    if (!activeCompanyId || !user?.id) return null;
    return getHrEmployeeByUserId(activeCompanyId, user.id as UUID);
  }, [activeCompanyId, user?.id]);

  const activeEmployeeId = isEmployee ? (selfEmployee?.id ?? '') : employeeId;

  const { data: employees } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listHrEmployees(activeCompanyId);
  }, [activeCompanyId]);

  const { data: leaveTypes, refetch: refetchLeaveTypes } = useAsync(async () => {
    if (!activeCompanyId || !user?.id) return [];
    await ensureDefaultHrLeaveTypes(activeCompanyId, user.id as UUID).catch(() => {});
    return listHrRecords(activeCompanyId, 'hr_leave_types');
  }, [activeCompanyId, user?.id]);

  const { data: requests, refetch } = useAsync(async () => {
    if (!activeCompanyId) return [];
    if (isEmployee && selfEmployee?.id) return listHrLeaveRequests(activeCompanyId, selfEmployee.id as UUID);
    return listHrLeaveRequests(activeCompanyId);
  }, [activeCompanyId, isEmployee, selfEmployee?.id]);

  const { data: balances } = useAsync(async () => {
    if (!activeCompanyId || !activeEmployeeId) return [];
    return listHrRecords(activeCompanyId, 'hr_leave_balances', { employee_id: activeEmployeeId });
  }, [activeCompanyId, activeEmployeeId]);

  const leaveOptions = useMemo(
    () => (leaveTypes ?? []).map((row) => ({ id: String(row.id), value: String(row.name ?? ''), label: String(row.name ?? '') })),
    [leaveTypes]
  );
  const leaveTypeLabelById = useMemo(
    () => new Map((leaveTypes ?? []).map((row) => [row.id as UUID, String(row.name ?? '')])),
    [leaveTypes]
  );
  const employeeLabel = useMemo(
    () => new Map((employees ?? []).map((employee) => [employee.id as UUID, `${employee.first_name} ${employee.last_name}`])),
    [employees]
  );

  async function onCreate() {
    if (!activeCompanyId || !user?.id || !activeEmployeeId || !leaveTypeValue.trim()) return;
    setError(null);
    try {
      const leaveTypeId = await getOrCreateHrLeaveTypeByName(activeCompanyId, user.id as UUID, leaveTypeValue.trim());
      await refetchLeaveTypes();
      const ms = Math.max(0, new Date(endDate).getTime() - new Date(startDate).getTime());
      const totalDays = Math.round(ms / (24 * 60 * 60 * 1000)) + 1;
      await createHrLeaveRequest({
        company_id: activeCompanyId,
        employee_id: activeEmployeeId as UUID,
        leave_type_id: leaveTypeId,
        start_date: startDate,
        end_date: endDate,
        total_days: totalDays,
        reason,
        reason_other: null,
        proof_file_ids: [],
        status: 'SUBMITTED',
        submitted_at: new Date().toISOString(),
        supervisor_approval_status: 'PENDING',
        hr_approval_status: 'PENDING',
        created_by_user_id: user.id as UUID
      });
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create leave request.');
    }
  }

  async function onApprove(row: Record<string, unknown>) {
    if (!activeCompanyId || !user?.id) return;
    await applyHrLeaveApproval({
      companyId: activeCompanyId,
      leaveRequestId: row.id as UUID,
      actorUserId: user.id as UUID,
      decision: isSupervisor ? 'SUPERVISOR_APPROVE' : 'HR_APPROVE'
    });
    await refetch();
  }

  async function onDecline(row: Record<string, unknown>) {
    if (!activeCompanyId || !user?.id) return;
    const reasonForDecline = (declineReasonByRow[String(row.id)] ?? '').trim();
    if (!reasonForDecline) {
      setError('Decline reason is required.');
      return;
    }
    await applyHrLeaveApproval({
      companyId: activeCompanyId,
      leaveRequestId: row.id as UUID,
      actorUserId: user.id as UUID,
      decision: isSupervisor ? 'SUPERVISOR_DECLINE' : 'HR_DECLINE',
      declineReason: reasonForDecline
    });
    await refetch();
  }

  const pending = useMemo(() => (requests ?? []).filter((row) => row.status === 'SUBMITTED'), [requests]);

  return (
    <Layout title="Leave Management">
      <div className="space-y-4">
        <HrSectionNav />
        {error && <div className="bg-critical/10 border border-critical/30 rounded-xl p-3 text-sm text-critical">{error}</div>}

        <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold">Create leave request</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {!isEmployee && (
              <label className="text-sm">
                <span className="block text-xs text-charcoal-500 mb-1">Employee</span>
                <select className="w-full border border-surface-300 rounded-lg px-3 py-2" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                  <option value="">Employee</option>
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
            <SelectOrType
              label="Leave type (Select or Type)"
              value={leaveTypeValue}
              onChange={(value) => setLeaveTypeValue(value)}
              options={leaveOptions}
              companyId={activeCompanyId ?? undefined}
              moduleKey="hr"
              fieldKey="leave_type"
              createdByUserId={user?.id as UUID | undefined}
              allowCreate={!!activeCompanyId}
              required
            />
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Start date</span><input type="date" className="w-full border border-surface-300 rounded-lg px-3 py-2" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">End date</span><input type="date" className="w-full border border-surface-300 rounded-lg px-3 py-2" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
            <label className="text-sm md:col-span-3"><span className="block text-xs text-charcoal-500 mb-1">Reason</span><input className="w-full border border-surface-300 rounded-lg px-3 py-2" placeholder="Reason for leave" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          </div>
          <button className="px-4 py-2 rounded-lg bg-teal text-white text-sm" onClick={() => void onCreate()} disabled={!activeEmployeeId}>Submit leave request</button>
        </div>

        <div className="bg-white border border-surface-300 rounded-xl p-4">
          <p className="text-sm text-charcoal-500">Pending approvals: {pending.length}</p>
          {activeEmployeeId && (
            <div className="mt-3">
              <h4 className="text-sm font-semibold mb-2">Leave balances</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                {(balances ?? []).map((row) => (
                  <div key={String(row.id)} className="rounded border border-surface-200 p-2">
                    <p className="font-medium">{leaveTypeLabelById.get(row.leave_type_id as UUID) ?? String(row.leave_type_id ?? '')} ({row.year})</p>
                    <p className="text-charcoal-500">Allocated: {String(row.allocated_days ?? 0)} | Used: {String(row.used_days ?? 0)} | Remaining: {String(row.remaining_days ?? 0)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          <button className="mt-3 px-3 py-2 rounded-lg border border-surface-300 text-sm" onClick={() => {
            const csv = toCsv((requests ?? []).map((row) => ({
              id: row.id,
              employee: employeeLabel.get(row.employee_id as UUID) ?? row.employee_id,
              leave_type: leaveTypeLabelById.get(row.leave_type_id as UUID) ?? row.leave_type_id,
              start_date: row.start_date,
              end_date: row.end_date,
              total_days: row.total_days,
              status: row.status,
              supervisor_approval_status: row.supervisor_approval_status,
              hr_approval_status: row.hr_approval_status,
              decline_reason: row.decline_reason
            })));
            downloadTextFile(`hr-leave-${new Date().toISOString().slice(0, 10)}.csv`, csv);
          }}>Export CSV</button>
        </div>

        <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-100"><tr><th className="text-left px-3 py-2">Employee</th><th className="text-left px-3 py-2">Leave type</th><th className="text-left px-3 py-2">Dates</th><th className="text-left px-3 py-2">Status</th><th className="text-left px-3 py-2">Workflow</th><th className="text-left px-3 py-2">Decline reason</th><th className="text-left px-3 py-2">Action</th></tr></thead>
            <tbody>
              {(requests ?? []).map((row) => (
                <tr key={row.id} className="border-t border-surface-100">
                  <td className="px-3 py-2">{employeeLabel.get(row.employee_id as UUID) ?? row.employee_id}</td>
                  <td className="px-3 py-2">{leaveTypeLabelById.get(row.leave_type_id as UUID) ?? row.leave_type_id}</td>
                  <td className="px-3 py-2">{row.start_date} - {row.end_date}</td>
                  <td className="px-3 py-2">{row.status}</td>
                  <td className="px-3 py-2">{row.supervisor_approval_status} / {row.hr_approval_status}</td>
                  <td className="px-3 py-2">
                    <input
                      className="border border-surface-300 rounded px-2 py-1 text-xs w-48"
                      value={declineReasonByRow[String(row.id)] ?? String(row.decline_reason ?? '')}
                      onChange={(e) => setDeclineReasonByRow((prev) => ({ ...prev, [String(row.id)]: e.target.value }))}
                      placeholder="Required if declining"
                    />
                  </td>
                  <td className="px-3 py-2 space-x-2">
                    {canApprove && row.status === 'SUBMITTED' && <button className="text-teal" onClick={() => void onApprove(row)}>Approve</button>}
                    {canApprove && row.status === 'SUBMITTED' && <button className="text-critical" onClick={() => void onDecline(row)}>Decline</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}

