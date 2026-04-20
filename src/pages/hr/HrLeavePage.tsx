import { useEffect, useMemo, useState } from 'react';
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
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';
import { toUserFacingError } from '../../utils/userFacingMessage';

export function HrLeavePage() {
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const defaultLeaveDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [employeeId, setEmployeeId] = useState('');
  const [leaveTypeValue, setLeaveTypeValue] = useState('');
  const [startDate, setStartDate] = useState(defaultLeaveDate);
  const [endDate, setEndDate] = useState(defaultLeaveDate);
  const [reason, setReason] = useState('');
  const [declineReasonByRow, setDeclineReasonByRow] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { restoreDraft, clearDraft } = useDraftManager();

  const isSupervisor = activeRole === 'manager' || activeRole === 'supervisor';
  const isHrApprover = activeRole === 'owner' || activeRole === 'admin';
  const canApprove = isSupervisor || isHrApprover;
  const isEmployee = activeRole === 'employee';

  type HrLeaveCreateDraft = {
    employeeId: string;
    leaveTypeValue: string;
    startDate: string;
    endDate: string;
    reason: string;
  };

  type HrLeaveDeclineDraft = Record<string, string>;

  const draftKeyCreate = `hr-leave-create:${activeCompanyId ?? 'none'}:${user?.id ?? 'anon'}`;
  const draftKeyDecline = `hr-leave-decline:${activeCompanyId ?? 'none'}:${user?.id ?? 'anon'}`;

  const [createBaseline, setCreateBaseline] = useState<HrLeaveCreateDraft>(() => ({
    employeeId: '',
    leaveTypeValue: '',
    startDate: defaultLeaveDate,
    endDate: defaultLeaveDate,
    reason: ''
  }));

  const [declineBaseline, setDeclineBaseline] = useState<HrLeaveDeclineDraft>({});

  const hasDirtyCreateDraft = useMemo(() => {
    return (
      employeeId !== createBaseline.employeeId ||
      leaveTypeValue !== createBaseline.leaveTypeValue ||
      startDate !== createBaseline.startDate ||
      endDate !== createBaseline.endDate ||
      reason !== createBaseline.reason
    );
  }, [createBaseline, employeeId, endDate, leaveTypeValue, reason, startDate]);

  const hasDirtyDeclineDraft = useMemo(() => {
    return JSON.stringify(declineReasonByRow) !== JSON.stringify(declineBaseline);
  }, [declineReasonByRow, declineBaseline]);

  useDraftRegistration({
    key: draftKeyCreate,
    enabled: Boolean(activeCompanyId && user?.id),
    isDirty: () => hasDirtyCreateDraft,
    serialize: () =>
      ({
        employeeId,
        leaveTypeValue,
        startDate,
        endDate,
        reason
      }) satisfies HrLeaveCreateDraft
  });

  useDraftRegistration({
    key: draftKeyDecline,
    enabled: Boolean(activeCompanyId && user?.id && canApprove),
    isDirty: () => hasDirtyDeclineDraft,
    serialize: () => declineReasonByRow satisfies HrLeaveDeclineDraft
  });

  useEffect(() => {
    if (!activeCompanyId || !user?.id) return;
    const restored = restoreDraft<HrLeaveCreateDraft>(draftKeyCreate);
    if (!restored) return;

    const next: HrLeaveCreateDraft = {
      employeeId: restored.employeeId ?? '',
      leaveTypeValue: restored.leaveTypeValue ?? '',
      startDate: restored.startDate ?? defaultLeaveDate,
      endDate: restored.endDate ?? defaultLeaveDate,
      reason: restored.reason ?? ''
    };
    setEmployeeId(next.employeeId);
    setLeaveTypeValue(next.leaveTypeValue);
    setStartDate(next.startDate);
    setEndDate(next.endDate);
    setReason(next.reason);
    setCreateBaseline(next);
  }, [activeCompanyId, defaultLeaveDate, draftKeyCreate, restoreDraft, user?.id]);

  useEffect(() => {
    if (!activeCompanyId || !user?.id || !canApprove) return;
    const restored = restoreDraft<HrLeaveDeclineDraft>(draftKeyDecline);
    if (!restored) return;

    const next: HrLeaveDeclineDraft = restored ?? {};
    setDeclineReasonByRow(next);
    setDeclineBaseline(next);
  }, [activeCompanyId, canApprove, draftKeyDecline, restoreDraft, user?.id]);

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
    await ensureDefaultHrLeaveTypes(activeCompanyId, user.id as UUID).catch(() => undefined);
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

  const currentYear = useMemo(() => new Date().getFullYear(), []);

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

  const leaveTypeIdByName = useMemo(
    () =>
      new Map(
        (leaveTypes ?? [])
          .map((row) => [String(row.name ?? '').trim().toLowerCase(), row.id as UUID] as const)
          .filter(([name]) => !!name)
      ),
    [leaveTypes]
  );

  const balancesByLeaveTypeAndYear = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const row of balances ?? []) {
      const key = `${row.leave_type_id}:${row.year}`;
      if (!map.has(key)) map.set(key, row);
    }
    return map;
  }, [balances]);

  const trimmedLeaveTypeName = leaveTypeValue.trim();
  const selectedLeaveTypeId = useMemo(() => {
    if (!trimmedLeaveTypeName) return null;
    return leaveTypeIdByName.get(trimmedLeaveTypeName.toLowerCase()) ?? null;
  }, [leaveTypeIdByName, trimmedLeaveTypeName]);

  const selectedBalance = useMemo(() => {
    if (!selectedLeaveTypeId) return null;
    const key = `${selectedLeaveTypeId}:${currentYear}`;
    return balancesByLeaveTypeAndYear.get(key) ?? null;
  }, [balancesByLeaveTypeAndYear, currentYear, selectedLeaveTypeId]);

  const totalDaysSelected = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
    if (end.getTime() < start.getTime()) return 0;

    // Count days inclusive, excluding Sundays.
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);
    const endDay = new Date(end);
    endDay.setHours(0, 0, 0, 0);

    let days = 0;
    while (cursor.getTime() <= endDay.getTime()) {
      if (cursor.getDay() !== 0) days += 1; // 0 = Sunday
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }, [startDate, endDate]);

  const selectedLeaveNameLower = trimmedLeaveTypeName.toLowerCase();
  const isOverdrawAllowedType = ['unpaid leave', 'special leave', 'occupational injury leave'].includes(selectedLeaveNameLower);

  async function onCreate() {
    if (!activeCompanyId || !user?.id || !activeEmployeeId || !leaveTypeValue.trim()) return;
    setError(null);
    setSuccess(null);
    try {
      const leaveTypeId = await getOrCreateHrLeaveTypeByName(activeCompanyId, user.id as UUID, leaveTypeValue.trim());
      await refetchLeaveTypes();
      const totalDays = totalDaysSelected;

      const remaining = Number((selectedBalance as any)?.remaining_days ?? 0);
      const hasBalanceRecord = selectedBalance != null;
      const canOverrideBalance = !isEmployee;

      if (!isOverdrawAllowedType && hasBalanceRecord && !canOverrideBalance && totalDays > remaining) {
        setError(
          `You only have ${remaining} ${trimmedLeaveTypeName || 'leave'} day${remaining === 1 ? '' : 's'} available. Requested leave exceeds your current balance.`
        );
        return;
      }

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

      // Mark the current values as "saved" so drafts don't immediately reappear.
      const baseline: HrLeaveCreateDraft = { employeeId, leaveTypeValue, startDate, endDate, reason };
      setCreateBaseline(baseline);
      clearDraft(draftKeyCreate);
      setSuccess('Saved successfully.');
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to submit leave request right now. Please try again.'));
    }
  }

  async function onApprove(row: Record<string, unknown>) {
    if (!activeCompanyId || !user?.id) return;
    setError(null);
    setSuccess(null);
    try {
      await applyHrLeaveApproval({
        companyId: activeCompanyId,
        leaveRequestId: row.id as UUID,
        actorUserId: user.id as UUID,
        decision: isSupervisor ? 'SUPERVISOR_APPROVE' : 'HR_APPROVE'
      });
      await refetch();
      setSuccess('Saved successfully.');
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to approve this leave request right now.'));
    }
  }

  async function onDecline(row: Record<string, unknown>) {
    if (!activeCompanyId || !user?.id) return;
    const reasonForDecline = (declineReasonByRow[String(row.id)] ?? '').trim();
    if (!reasonForDecline) {
      setError('Decline reason is required.');
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await applyHrLeaveApproval({
        companyId: activeCompanyId,
        leaveRequestId: row.id as UUID,
        actorUserId: user.id as UUID,
        decision: isSupervisor ? 'SUPERVISOR_DECLINE' : 'HR_DECLINE',
        declineReason: reasonForDecline
      });
      await refetch();

      const baseline: HrLeaveDeclineDraft = { ...declineReasonByRow };
      setDeclineBaseline(baseline);
      clearDraft(draftKeyDecline);
      setSuccess('Saved successfully.');
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to decline this leave request right now.'));
    }
  }

  const pending = useMemo(() => (requests ?? []).filter((row) => row.status === 'SUBMITTED'), [requests]);

  return (
    <Layout title="Leave Management">
      <div className="space-y-4">
        <HrSectionNav />
        {error && <div className="bg-critical/10 border border-critical/30 rounded-xl p-3 text-sm text-critical">{error}</div>}
        {success && <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700">{success}</div>}

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
            <div className="space-y-1">
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
              {trimmedLeaveTypeName && (
                <div className="text-xs mt-1">
                  {selectedBalance ? (
                    <div
                      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border ${
                        Number((selectedBalance as any).remaining_days ?? 0) <= 2 ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-teal bg-teal-50 text-teal-800'
                      }`}
                    >
                      <span className="font-medium">
                        {trimmedLeaveTypeName} Available:{' '}
                        {String((selectedBalance as any).remaining_days ?? 0)} day
                        {Number((selectedBalance as any).remaining_days ?? 0) === 1 ? '' : 's'}
                      </span>
                      <span className="text-[10px] text-charcoal-500">
                        Year {String((selectedBalance as any).year ?? currentYear)} · Allocated {String((selectedBalance as any).allocated_days ?? 0)} · Used{' '}
                        {String((selectedBalance as any).used_days ?? 0)}
                      </span>
                    </div>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full border border-surface-300 bg-surface-50 text-charcoal-600">
                      No leave balance record found for “{trimmedLeaveTypeName}” in {currentYear}. The request will still be submitted.
                    </span>
                  )}
                </div>
              )}
            </div>
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">Start date</span><input type="date" className="w-full border border-surface-300 rounded-lg px-3 py-2" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
            <label className="text-sm"><span className="block text-xs text-charcoal-500 mb-1">End date</span><input type="date" className="w-full border border-surface-300 rounded-lg px-3 py-2" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
            <label className="text-sm md:col-span-3">
              <span className="block text-xs text-charcoal-500 mb-1">Reason</span>
              <input className="w-full border border-surface-300 rounded-lg px-3 py-2" placeholder="Reason for leave" value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            <div className="text-xs text-charcoal-500 md:col-span-3">
              Total days requested: <span className="font-semibold">{totalDaysSelected}</span>
            </div>
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
                    <p className="font-medium">{leaveTypeLabelById.get(row.leave_type_id as UUID) ?? String(row.leave_type_id ?? '')} ({String(row.year ?? '')})</p>
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

