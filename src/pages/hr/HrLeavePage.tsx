import { useEffect, useMemo, useState } from 'react';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { HrSectionNav } from './HrSectionNav';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import {
  applyHrLeaveApproval,
  archiveHrLeaveRequest,
  createHrLeaveRequest,
  ensureDefaultHrLeaveTypes,
  getHrEmployeeByUserId,
  getHrSettings,
  getOrCreateHrLeaveTypeByName,
  listHrEmployees,
  listHrLeaveRequests,
  listHrRecords
} from '../../api/services/hrService';
import { HrEmployeeSelect } from '../../components/ui/HrEmployeeSelect';
import { SelectOrType } from '../../components/ui/SelectOrType';
import { EvidenceModal } from '../../components/evidence/EvidenceModal';
import { HrExportMenu } from '../../components/hr/HrExportMenu';
import type { UUID } from '../../api/models/core';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';
import { toUserFacingError } from '../../utils/userFacingMessage';

const LEAVE_STATUS_BADGES: Record<string, { label: string; classes: string }> = {
  APPROVED: { label: 'Approved', classes: 'bg-emerald-100 text-emerald-700' },
  DECLINED: { label: 'Declined', classes: 'bg-red-100 text-red-700' },
  SUBMITTED: { label: 'Pending', classes: 'bg-amber-100 text-amber-700' },
  CANCELLED: { label: 'Cancelled', classes: 'bg-charcoal-100 text-charcoal-600' },
  DRAFT: { label: 'Draft', classes: 'bg-charcoal-100 text-charcoal-600' }
};

function leaveStatusBadge(status: string): { label: string; classes: string } {
  return LEAVE_STATUS_BADGES[status] ?? { label: status, classes: 'bg-surface-100 text-charcoal-600' };
}

const MONTH_OPTIONS = [
  { value: '01', label: 'January' }, { value: '02', label: 'February' }, { value: '03', label: 'March' },
  { value: '04', label: 'April' }, { value: '05', label: 'May' }, { value: '06', label: 'June' },
  { value: '07', label: 'July' }, { value: '08', label: 'August' }, { value: '09', label: 'September' },
  { value: '10', label: 'October' }, { value: '11', label: 'November' }, { value: '12', label: 'December' }
];

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
  const [proofEvidenceRequestId, setProofEvidenceRequestId] = useState<UUID | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(t);
  }, [success]);

  const { data: selfEmployee } = useAsync(async () => {
    if (!activeCompanyId || !user?.id) return null;
    return getHrEmployeeByUserId(activeCompanyId, user.id as UUID);
  }, [activeCompanyId, user?.id]);

  const { data: settings } = useAsync(async () => {
    if (!activeCompanyId) return null;
    return getHrSettings(activeCompanyId);
  }, [activeCompanyId]);

  const activeEmployeeId = isEmployee ? (selfEmployee?.id ?? '') : employeeId;

  const { data: employees } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listHrEmployees(activeCompanyId);
  }, [activeCompanyId]);

  const { data: leaveTypes, refetch: refetchLeaveTypes } = useAsync(async () => {
    if (!activeCompanyId || !user?.id) return [];
    try {
      await ensureDefaultHrLeaveTypes(activeCompanyId, user.id as UUID);
    } catch {
      // seeding failed — continue with existing types
    }
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

  const selectedLeaveType = useMemo(
    () => (leaveTypes ?? []).find((row) => String(row.id) === String(selectedLeaveTypeId)) ?? null,
    [leaveTypes, selectedLeaveTypeId]
  );
  const proofRequired = Boolean((selectedLeaveType as any)?.requires_proof);

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

    const configuredWorkingDays = Array.isArray(settings?.working_days)
      ? settings.working_days.map((day) => String(day).toUpperCase())
      : ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
    const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

    // Count days inclusive using the company working-days setting.
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);
    const endDay = new Date(end);
    endDay.setHours(0, 0, 0, 0);

    let days = 0;
    while (cursor.getTime() <= endDay.getTime()) {
      if (configuredWorkingDays.includes(dayNames[cursor.getDay()] ?? '')) days += 1;
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }, [endDate, settings?.working_days, startDate]);

  const selectedLeaveNameLower = trimmedLeaveTypeName.toLowerCase();
  const isOverdrawAllowedType = ['unpaid leave', 'special leave', 'occupational injury leave'].includes(selectedLeaveNameLower);

  async function onCreate() {
    if (!activeCompanyId || !user?.id || !activeEmployeeId || !leaveTypeValue.trim()) return;
    setError(null);
    setSuccess(null);
    setDateError(null);
    if (startDate && endDate && startDate > endDate) {
      setDateError('End date must be on or after the start date.');
      return;
    }
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

      const createdRequest = await createHrLeaveRequest({
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
      if (proofRequired) {
        setProofEvidenceRequestId(createdRequest.id as UUID);
      }
      await refetch();

      // Mark the current values as "saved" so drafts don't immediately reappear.
      const baseline: HrLeaveCreateDraft = { employeeId, leaveTypeValue, startDate, endDate, reason };
      setCreateBaseline(baseline);
      clearDraft(draftKeyCreate);
      setSuccess(proofRequired ? 'Leave request submitted. Attach the required proof before approval.' : 'Saved successfully');
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
      setSuccess('Saved successfully');
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

      const updated: HrLeaveDeclineDraft = { ...declineReasonByRow };
      delete updated[String(row.id)];
      setDeclineReasonByRow(updated);
      setDeclineBaseline(updated);
      clearDraft(draftKeyDecline);
      setSuccess('Saved successfully');
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to decline this leave request right now.'));
    }
  }

  const pending = useMemo(() => (requests ?? []).filter((row) => row.status === 'SUBMITTED'), [requests]);

  const leaveTypeRequiresProofById = useMemo(
    () => new Map((leaveTypes ?? []).map((row) => [row.id as UUID, Boolean((row as any).requires_proof)])),
    [leaveTypes]
  );

  const [filterQuery, setFilterQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterYear, setFilterYear] = useState(String(currentYear));
  const [filterMonth, setFilterMonth] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [archivingId, setArchivingId] = useState<UUID | null>(null);

  const filtersActiveCount = [filterQuery, filterStatus, filterDateFrom, filterDateTo].filter(Boolean).length;

  function clearFilters() {
    setFilterQuery('');
    setFilterStatus('');
    setFilterDateFrom('');
    setFilterDateTo('');
  }

  async function onToggleArchive(row: Record<string, unknown>, archived: boolean) {
    if (!activeCompanyId || !user?.id) return;
    setError(null);
    setSuccess(null);
    setArchivingId(row.id as UUID);
    try {
      await archiveHrLeaveRequest({ companyId: activeCompanyId, leaveRequestId: row.id as UUID, actorUserId: user.id as UUID, archived });
      await refetch();
      setSuccess(archived ? 'Leave request archived.' : 'Leave request restored.');
    } catch (err) {
      setError(toUserFacingError(err, 'Unable to update the archive status right now.'));
    } finally {
      setArchivingId(null);
    }
  }

  const filteredRequests = useMemo(() => {
    return (requests ?? []).filter((row) => {
      if (Boolean((row as any).archived) !== showArchived) return false;
      const q = filterQuery.trim().toLowerCase();
      if (q) {
        const name = String(employeeLabel.get(row.employee_id as UUID) ?? '').toLowerCase();
        const leaveType = String(leaveTypeLabelById.get(row.leave_type_id as UUID) ?? '').toLowerCase();
        if (!name.includes(q) && !leaveType.includes(q)) return false;
      }
      if (filterStatus && String(row.status ?? '') !== filterStatus) return false;
      const start = String(row.start_date ?? '');
      const end = String(row.end_date ?? '');
      if (filterDateFrom && end && end < filterDateFrom) return false;
      if (filterDateTo && start && start > filterDateTo) return false;
      if (filterYear) {
        const startYear = start.slice(0, 4);
        if (startYear !== filterYear) return false;
      }
      if (filterMonth) {
        const startMonth = start.slice(5, 7);
        if (startMonth !== filterMonth) return false;
      }
      return true;
    });
  }, [requests, employeeLabel, leaveTypeLabelById, filterQuery, filterStatus, filterDateFrom, filterDateTo, filterYear, filterMonth, showArchived]);

  useEffect(() => {
    const highlightId = new URLSearchParams(window.location.search).get('highlight');
    if (!highlightId) return;
    const el = document.getElementById(`leave-${highlightId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-2', 'ring-teal', 'ring-offset-2');
    const t = setTimeout(() => el.classList.remove('ring-2', 'ring-teal', 'ring-offset-2'), 3000);
    return () => clearTimeout(t);
  }, [filteredRequests]);

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
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Start date</span>
              <input type="date" className="w-full border border-surface-300 rounded-lg px-3 py-2" value={startDate} onChange={(e) => { setStartDate(e.target.value); setDateError(null); }} />
            </label>
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">End date</span>
              <input type="date" className={`w-full border rounded-lg px-3 py-2 ${dateError ? 'border-critical' : 'border-surface-300'}`} value={endDate} onChange={(e) => { setEndDate(e.target.value); setDateError(null); }} />
              {dateError && <p className="text-xs text-critical mt-1">{dateError}</p>}
            </label>
            <label className="text-sm md:col-span-3">
              <span className="block text-xs text-charcoal-500 mb-1">Reason</span>
              <input className="w-full border border-surface-300 rounded-lg px-3 py-2" placeholder="Reason for leave" value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            {proofRequired && (
              <div className="md:col-span-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Proof is required for this leave type. The proof upload window will open after submission.
              </div>
            )}
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
          <div className="mt-3">
            <HrExportMenu
              moduleName="Leave Requests"
              columns={[
                { key: 'employee', label: 'Employee' },
                { key: 'leave_type', label: 'Leave Type' },
                { key: 'start_date', label: 'Start Date' },
                { key: 'end_date', label: 'End Date' },
                { key: 'total_days', label: 'Total Days' },
                { key: 'status', label: 'Status' },
                { key: 'supervisor_approval_status', label: 'Supervisor Approval' },
                { key: 'hr_approval_status', label: 'HR Approval' },
                { key: 'decline_reason', label: 'Decline Reason' }
              ]}
              rows={filteredRequests.map((row) => ({
                employee: employeeLabel.get(row.employee_id as UUID) ?? row.employee_id,
                leave_type: leaveTypeLabelById.get(row.leave_type_id as UUID) ?? row.leave_type_id,
                start_date: row.start_date,
                end_date: row.end_date,
                total_days: row.total_days,
                status: row.status,
                supervisor_approval_status: row.supervisor_approval_status,
                hr_approval_status: row.hr_approval_status,
                decline_reason: row.decline_reason
              }))}
            />
          </div>
        </div>

        <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Search</span>
              <input
                className="w-56 border border-surface-300 rounded-lg px-3 py-2 text-sm"
                placeholder="Employee or leave type"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">Status</span>
              <select className="border border-surface-300 rounded-lg px-3 py-2 text-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="">All</option>
                <option value="DRAFT">DRAFT</option>
                <option value="SUBMITTED">SUBMITTED</option>
                <option value="APPROVED">APPROVED</option>
                <option value="DECLINED">DECLINED</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">From</span>
              <input type="date" className="border border-surface-300 rounded-lg px-3 py-2 text-sm" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="block text-xs text-charcoal-500 mb-1">To</span>
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

        <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
          {filteredRequests.length === 0 ? (
            <div className="text-center py-10 text-sm text-charcoal-500">No leave requests match your filters.</div>
          ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-100"><tr><th className="text-left px-3 py-2">Employee</th><th className="text-left px-3 py-2">Leave type</th><th className="text-left px-3 py-2">Dates</th><th className="text-left px-3 py-2">Status</th><th className="text-left px-3 py-2">Workflow</th><th className="text-left px-3 py-2">Decline reason</th><th className="text-left px-3 py-2">Action</th></tr></thead>
            <tbody>
              {filteredRequests.map((row) => {
                const badge = leaveStatusBadge(String(row.status ?? ''));
                const requiresProof = leaveTypeRequiresProofById.get(row.leave_type_id as UUID) ?? false;
                return (
                <tr key={row.id} id={`leave-${row.id}`} className="border-t border-surface-100">
                  <td className="px-3 py-2">{employeeLabel.get(row.employee_id as UUID) ?? row.employee_id}</td>
                  <td className="px-3 py-2">{leaveTypeLabelById.get(row.leave_type_id as UUID) ?? row.leave_type_id}</td>
                  <td className="px-3 py-2">{row.start_date} - {row.end_date}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.classes}`}>{badge.label}</span>
                  </td>
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
                    {requiresProof && <button className="text-charcoal-700 underline text-xs" onClick={() => setProofEvidenceRequestId(row.id as UUID)}>View documents</button>}
                    {canApprove && row.status === 'SUBMITTED' && <button className="text-teal" onClick={() => void onApprove(row)}>Approve</button>}
                    {canApprove && row.status === 'SUBMITTED' && <button className="text-critical" onClick={() => void onDecline(row)}>Decline</button>}
                    {canApprove && row.status === 'APPROVED' && !showArchived && (
                      <button className="text-charcoal-700" disabled={archivingId === row.id} onClick={() => void onToggleArchive(row, true)}>
                        {archivingId === row.id ? 'Archiving...' : 'Archive'}
                      </button>
                    )}
                    {canApprove && showArchived && (
                      <button className="text-charcoal-700" disabled={archivingId === row.id} onClick={() => void onToggleArchive(row, false)}>
                        {archivingId === row.id ? 'Restoring...' : 'Restore'}
                      </button>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          )}
        </div>
        {activeCompanyId && user?.id && proofEvidenceRequestId && (
          <EvidenceModal
            open={Boolean(proofEvidenceRequestId)}
            onClose={() => setProofEvidenceRequestId(null)}
            companyId={activeCompanyId}
            actorUserId={user.id}
            entityType="hr_leave_request"
            entityId={proofEvidenceRequestId}
          />
        )}
      </div>
    </Layout>
  );
}

