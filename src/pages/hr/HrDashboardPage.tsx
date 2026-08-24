import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { HrSectionNav } from './HrSectionNav';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import {
  applyHrLeaveApproval,
  getHrDashboardStats,
  getHrEmployeeByUserId,
  listHrAcknowledgementDocuments,
  listHrEmployees,
  listHrLeaveRequests,
  listHrRecords,
  listHrTimesheets,
  submitHrAcknowledgement
} from '../../api/services/hrService';
import { FirstWinBanner } from '../../components/onboarding/FirstWinBanner';
import { toUserFacingError } from '../../utils/userFacingMessage';
import type { UUID } from '../../api/models/core';

function isApproverRole(role: string | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'manager' || role === 'supervisor';
}

export function HrDashboardPage() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { activeCompanyId, activeRole, memberships } = useTenant();
  const activeMembership = memberships.find((m) => m.company_id === activeCompanyId);
  const showHrFirstWin = activeRole === 'admin' || activeMembership?.is_hr_manager === true;
  const canApproveLeave = isApproverRole(activeRole ?? null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actingKey, setActingKey] = useState<string | null>(null);

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

  const { data: selfEmployee } = useAsync(async () => {
    if (!activeCompanyId || !user?.id) return null;
    return getHrEmployeeByUserId(activeCompanyId, user.id as UUID);
  }, [activeCompanyId, user?.id]);

  // actorRole is hard-coded to 'employee' here regardless of the viewer's real company
  // role — that's what makes listHrAcknowledgementDocuments scope the result to
  // documents where *this specific person* has a pending receipt, which is exactly
  // "my" pending acknowledgements for the approvals panel below.
  const { data: myAckDocs, refetch: refetchMyAckDocs } = useAsync(async () => {
    if (!activeCompanyId || !user?.id) return [];
    return listHrAcknowledgementDocuments({ companyId: activeCompanyId, actorRole: 'employee', actorUserId: user.id as UUID });
  }, [activeCompanyId, user?.id]);

  const { data: myReviews } = useAsync(async () => {
    if (!activeCompanyId || !selfEmployee?.id) return [];
    return listHrRecords(activeCompanyId, 'hr_performance_reviews');
  }, [activeCompanyId, selfEmployee?.id]);

  const { refetch: refetchLeaveRequests } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return listHrLeaveRequests(activeCompanyId);
  }, [activeCompanyId]);

  const pendingLeave = useMemo(
    () => (canApproveLeave ? (leaveRequests ?? []).filter((row) => row.status === 'SUBMITTED') : []),
    [leaveRequests, canApproveLeave]
  );

  const pendingAckDocs = useMemo(
    () => (myAckDocs ?? []).filter((doc) => (doc.receipts ?? []).some((r) => r.status === 'PENDING')),
    [myAckDocs]
  );

  const pendingReviews = useMemo(() => {
    if (!selfEmployee?.id) return [];
    return (myReviews ?? []).filter((row) => {
      const r = row as Record<string, unknown>;
      return String(r['corrective_responsible_user_id'] ?? '') === String(selfEmployee.id) && String(r['status'] ?? '') !== 'CLOSED' && !Boolean(r['archived']);
    });
  }, [myReviews, selfEmployee?.id]);

  const employeeLabel = useMemo(
    () => new Map((employees ?? []).map((employee) => [employee.id as UUID, `${employee.first_name} ${employee.last_name}`])),
    [employees]
  );

  const pendingApprovalsCount = pendingLeave.length + pendingAckDocs.length + pendingReviews.length;

  async function onLeaveDecision(leaveId: UUID, decision: 'SUPERVISOR_APPROVE' | 'SUPERVISOR_DECLINE' | 'HR_APPROVE' | 'HR_DECLINE') {
    if (!activeCompanyId || !user?.id) return;
    const isDecline = decision.endsWith('DECLINE');
    let declineReason: string | undefined;
    if (isDecline) {
      declineReason = window.prompt('Reason for declining this leave request?') ?? undefined;
      if (!declineReason?.trim()) return;
    }
    setActionError(null);
    setActingKey(`leave-${leaveId}`);
    try {
      await applyHrLeaveApproval({ companyId: activeCompanyId, leaveRequestId: leaveId, actorUserId: user.id as UUID, decision, declineReason });
      await refetchLeaveRequests();
    } catch (err) {
      setActionError(toUserFacingError(err, 'Unable to update this leave request right now.'));
    } finally {
      setActingKey(null);
    }
  }

  async function onAckDecision(docId: UUID, action: 'acknowledge' | 'decline') {
    if (!activeCompanyId || !user?.id) return;
    let declineReason: string | undefined;
    if (action === 'decline') {
      declineReason = window.prompt('Reason for declining to acknowledge this document?') ?? undefined;
      if (!declineReason?.trim()) return;
    }
    setActionError(null);
    setActingKey(`ack-${docId}`);
    try {
      await submitHrAcknowledgement({ companyId: activeCompanyId, actorUserId: user.id as UUID, ackDocumentId: docId, action, declineReason });
      await refetchMyAckDocs();
    } catch (err) {
      setActionError(toUserFacingError(err, 'Unable to record your response right now.'));
    } finally {
      setActingKey(null);
    }
  }

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

        {(canApproveLeave || pendingAckDocs.length > 0 || pendingReviews.length > 0) && (
          <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-charcoal">My Pending Approvals</h3>
              <span className="px-2 py-0.5 rounded-full bg-surface-100 text-xs font-semibold text-charcoal-600">{pendingApprovalsCount}</span>
            </div>
            {actionError && <div className="bg-critical/10 border border-critical/30 rounded-lg p-2 text-sm text-critical">{actionError}</div>}
            {pendingApprovalsCount === 0 ? (
              <p className="text-sm text-charcoal-500">Nothing awaiting your approval right now.</p>
            ) : (
              <div className="divide-y divide-surface-100">
                {pendingLeave.map((row) => (
                  <div key={`leave-${row.id}`} className="py-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <button className="text-sm font-medium text-teal hover:underline" onClick={() => navigate(`/dashboard/hr/leave?highlight=${row.id}`)}>
                        Leave request — {employeeLabel.get(row.employee_id as UUID) ?? row.employee_id}
                      </button>
                      <p className="text-xs text-charcoal-500">{row.start_date} to {row.end_date} · Submitted {row.submitted_at ? new Date(String(row.submitted_at)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        className="px-3 py-1.5 rounded-lg bg-teal text-white text-xs disabled:opacity-60"
                        disabled={actingKey === `leave-${row.id}`}
                        onClick={() => void onLeaveDecision(row.id as UUID, activeRole === 'supervisor' ? 'SUPERVISOR_APPROVE' : 'HR_APPROVE')}
                      >
                        Approve
                      </button>
                      <button
                        className="px-3 py-1.5 rounded-lg border border-critical text-critical text-xs disabled:opacity-60"
                        disabled={actingKey === `leave-${row.id}`}
                        onClick={() => void onLeaveDecision(row.id as UUID, activeRole === 'supervisor' ? 'SUPERVISOR_DECLINE' : 'HR_DECLINE')}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
                {pendingAckDocs.map((doc) => (
                  <div key={`ack-${doc.id}`} className="py-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <button className="text-sm font-medium text-teal hover:underline" onClick={() => navigate(`/dashboard/hr/documents?highlight=${doc.id}`)}>
                        Document acknowledgement — {doc.title}
                      </button>
                      <p className="text-xs text-charcoal-500">{doc.category}{doc.created_at ? ` · Assigned ${new Date(doc.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        className="px-3 py-1.5 rounded-lg bg-teal text-white text-xs disabled:opacity-60"
                        disabled={actingKey === `ack-${doc.id}`}
                        onClick={() => void onAckDecision(doc.id as UUID, 'acknowledge')}
                      >
                        Approve
                      </button>
                      <button
                        className="px-3 py-1.5 rounded-lg border border-critical text-critical text-xs disabled:opacity-60"
                        disabled={actingKey === `ack-${doc.id}`}
                        onClick={() => void onAckDecision(doc.id as UUID, 'decline')}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
                {pendingReviews.map((row) => {
                  const r = row as Record<string, unknown>;
                  return (
                    <div key={`review-${String(r['id'])}`} className="py-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <button className="text-sm font-medium text-teal hover:underline" onClick={() => navigate(`/dashboard/hr/performance?highlight=${String(r['id'])}`)}>
                          Performance review corrective action — {employeeLabel.get(r['employee_id'] as UUID) ?? String(r['employee_id'] ?? '')}
                        </button>
                        <p className="text-xs text-charcoal-500">Due: {String(r['corrective_due_date'] ?? '-')} · Assigned to you</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

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
