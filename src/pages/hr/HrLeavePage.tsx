import React, { useMemo, useState } from 'react';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { HrSectionNav } from './HrSectionNav';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { applyHrLeaveApproval, createHrLeaveRequest, listHrEmployees, listHrLeaveRequests, listHrRecords } from '../../api/services/hrService';
import { downloadTextFile, toCsv } from '../../utils/csv';

export function HrLeavePage() {
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const [employeeId, setEmployeeId] = useState('');
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');

  const { data: employees } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listHrEmployees(activeCompanyId);
  }, [activeCompanyId]);

  const { data: leaveTypes } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listHrRecords(activeCompanyId, 'hr_leave_types');
  }, [activeCompanyId]);

  const { data: requests, refetch } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listHrLeaveRequests(activeCompanyId);
  }, [activeCompanyId]);

  const onCreate = async () => {
    if (!activeCompanyId || !user?.id || !employeeId || !leaveTypeId) return;
    const ms = Math.max(0, new Date(endDate).getTime() - new Date(startDate).getTime());
    const totalDays = Math.round(ms / (24 * 60 * 60 * 1000)) + 1;
    await createHrLeaveRequest({
      company_id: activeCompanyId,
      employee_id: employeeId,
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
      created_by_user_id: user.id
    });
    await refetch();
  };

  const canApprove = ['admin', 'manager', 'supervisor', 'owner'].includes(activeRole ?? '');

  const onExport = () => {
    const csv = toCsv((requests ?? []).map((row) => ({
      id: row.id,
      employee_id: row.employee_id,
      leave_type_id: row.leave_type_id,
      start_date: row.start_date,
      end_date: row.end_date,
      total_days: row.total_days,
      status: row.status,
      supervisor_approval_status: row.supervisor_approval_status,
      hr_approval_status: row.hr_approval_status
    })));
    downloadTextFile(`hr-leave-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const pending = useMemo(() => (requests ?? []).filter((row) => row.status === 'SUBMITTED'), [requests]);

  return (
    <Layout title="Leave Management">
      <div className="space-y-4">
        <HrSectionNav />

        <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold">Create leave request</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <select className="border border-surface-300 rounded-lg px-3 py-2 text-sm" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Employee</option>
              {(employees ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.first_name} {employee.last_name}</option>)}
            </select>
            <select className="border border-surface-300 rounded-lg px-3 py-2 text-sm" value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)}>
              <option value="">Leave Type</option>
              {(leaveTypes ?? []).map((row) => <option key={String(row.id)} value={String(row.id)}>{String(row.name ?? '')}</option>)}
            </select>
            <input className="border border-surface-300 rounded-lg px-3 py-2 text-sm" placeholder="Reason / Other" value={reason} onChange={(e) => setReason(e.target.value)} />
            <input type="date" className="border border-surface-300 rounded-lg px-3 py-2 text-sm" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <input type="date" className="border border-surface-300 rounded-lg px-3 py-2 text-sm" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <button className="px-4 py-2 rounded-lg bg-teal text-white text-sm" onClick={onCreate}>Submit leave request</button>
        </div>

        <div className="flex justify-between items-center">
          <p className="text-sm text-charcoal-500">Pending approvals: {pending.length}</p>
          <button className="px-3 py-2 rounded-lg border border-surface-300 text-sm" onClick={onExport}>Export CSV</button>
        </div>

        <div className="bg-white border border-surface-300 rounded-xl overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-100"><tr><th className="text-left px-3 py-2">Employee</th><th className="text-left px-3 py-2">Dates</th><th className="text-left px-3 py-2">Status</th><th className="text-left px-3 py-2">Workflow</th><th className="text-left px-3 py-2">Action</th></tr></thead>
            <tbody>
              {(requests ?? []).map((row) => (
                <tr key={row.id} className="border-t border-surface-100">
                  <td className="px-3 py-2">{row.employee_id}</td>
                  <td className="px-3 py-2">{row.start_date} - {row.end_date}</td>
                  <td className="px-3 py-2">{row.status}</td>
                  <td className="px-3 py-2">{row.supervisor_approval_status} / {row.hr_approval_status}</td>
                  <td className="px-3 py-2 space-x-2">
                    {canApprove && <button className="text-teal" onClick={async () => {
                      if (!activeCompanyId || !user?.id) return;
                      const isSupervisor = activeRole === 'manager' || activeRole === 'supervisor';
                      await applyHrLeaveApproval({ companyId: activeCompanyId, leaveRequestId: row.id, actorUserId: user.id, decision: isSupervisor ? 'SUPERVISOR_APPROVE' : 'HR_APPROVE' });
                      await refetch();
                    }}>Approve</button>}
                    {canApprove && <button className="text-critical" onClick={async () => {
                      if (!activeCompanyId || !user?.id) return;
                      const isSupervisor = activeRole === 'manager' || activeRole === 'supervisor';
                      await applyHrLeaveApproval({ companyId: activeCompanyId, leaveRequestId: row.id, actorUserId: user.id, decision: isSupervisor ? 'SUPERVISOR_DECLINE' : 'HR_DECLINE' });
                      await refetch();
                    }}>Decline</button>}
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
