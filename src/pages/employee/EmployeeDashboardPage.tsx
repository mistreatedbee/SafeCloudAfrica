import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  UserIcon,
  ClipboardCheckIcon,
  GraduationCapIcon,
  AlertTriangleIcon,
  HardHatIcon,
  FileTextIcon,
  ArrowRightIcon,
} from 'lucide-react';
import { Layout } from '../../components/layout/Layout';
import { StatCard } from '../../components/ui/StatCard';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useIdentity } from '../../hooks/useIdentity';
import { useAsync } from '../../api/hooks/useAsync';
import { countMyPendingTasks, listTasks } from '../../api/services/tasksService';
import { countMyIncidents } from '../../api/services/incidentsService';
import { countExpiringTrainingForUser } from '../../api/services/trainingService';
import { getEmployeeIntegratedProfile, getHrEmployeeByUserId } from '../../api/services/hrService';
import type { UUID } from '../../api/models/core';

export function EmployeeDashboardPage() {
  const { activeCompanyId } = useTenant();
  const { user } = useUser();
  const { fullName, organisationName } = useIdentity();
  const firstName = String(fullName).split(' ')[0];
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: summary, loading, error } = useAsync(
    async () => {
      if (!activeCompanyId || !user?.id) return null;
      const [myPendingTasks, myIncidents, expiringTraining] = await Promise.all([
        countMyPendingTasks(activeCompanyId, user.id as UUID).catch(() => 0),
        countMyIncidents(activeCompanyId, user.id as UUID).catch(() => 0),
        countExpiringTrainingForUser(activeCompanyId, user.id as UUID, 30).catch(() => 0),
      ]);
      const tasks = await listTasks({
        companyId: activeCompanyId,
        assigneeUserId: user.id as UUID,
        limit: 12,
      }).catch(() => []);
      const employee = await getHrEmployeeByUserId(activeCompanyId, user.id as UUID).catch(() => null);
      const hr = employee?.id ? await getEmployeeIntegratedProfile(activeCompanyId, employee.id).catch(() => null) : null;
      return { myPendingTasks, myIncidents, expiringTraining, tasks, employee, hr };
    },
    [activeCompanyId, user?.id, refreshKey]
  );

  const leaveWarnings = useMemo(() => {
    const leaveRequests = (summary?.hr?.leaveRequests as Array<Record<string, unknown>> | undefined) ?? [];
    return leaveRequests.filter((row) => String(row.status ?? '') === 'DECLINED').length;
  }, [summary?.hr]);

  const disciplinaryOpen = useMemo(() => {
    const disciplinary = (summary?.hr?.disciplinary as Array<Record<string, unknown>> | undefined) ?? [];
    return disciplinary.filter((row) => String(row.status ?? '') !== 'CLOSED').length;
  }, [summary?.hr]);

  const overduePerformanceActions = useMemo(() => {
    const perf = (summary?.hr?.performance as Array<Record<string, unknown>> | undefined) ?? [];
    const today = new Date().toISOString().slice(0, 10);
    return perf.filter((row) => row.corrective_due_date && String(row.corrective_due_date) < today && String(row.status ?? '') !== 'CLOSED').length;
  }, [summary?.hr]);

  const leaveBalances = (summary?.hr?.balances as Array<Record<string, unknown>> | undefined) ?? [];
  const leaveRequests = (summary?.hr?.leaveRequests as Array<Record<string, unknown>> | undefined) ?? [];

  const leaveStatusCounts = useMemo(() => {
    const base = { pending: 0, approved: 0, declined: 0 };
    for (const row of leaveRequests) {
      const status = String(row.status ?? '').toUpperCase();
      if (status === 'SUBMITTED' || status === 'DRAFT') base.pending += 1;
      else if (status === 'APPROVED') base.approved += 1;
      else if (status === 'DECLINED') base.declined += 1;
    }
    return base;
  }, [leaveRequests]);

  return (
    <Layout title="My Dashboard">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <div className="bg-gradient-to-r from-navy to-navy-700 rounded-2xl p-6 text-white">
          <h1 className="text-2xl font-bold mb-1">Hello, {firstName}</h1>
          <p className="text-navy-200">
            Your unified employee dashboard at {organisationName}
          </p>
        </div>

        {error && (
          <div className="bg-white rounded-xl border border-critical/30 p-4 shadow-card">
            <p className="text-sm font-semibold text-critical">Unable to load dashboard</p>
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="mt-2 text-sm text-teal font-medium"
            >
              Try again
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard title="My pending tasks" value={summary?.myPendingTasks ?? 0} icon="ClipboardCheck" iconColor="#0FB9B1" variant="info" subtitle="Assigned to you" />
          <StatCard title="My incidents" value={summary?.myIncidents ?? 0} icon="AlertTriangle" iconColor="#E74C3C" variant="critical" subtitle="Reported by you" />
          <StatCard title="Training expiring (30 days)" value={summary?.expiringTraining ?? 0} icon="GraduationCap" iconColor="#3498DB" variant="warning" subtitle="Renewals due" />
          <StatCard title="Leave warnings" value={leaveWarnings} icon="FileText" iconColor="#F39C12" variant="warning" subtitle="Declined requests" />
          <StatCard title="Disciplinary actions" value={disciplinaryOpen} icon="AlertTriangle" iconColor="#C0392B" variant="critical" subtitle="Open warnings/offences" />
          <StatCard title="Overdue performance actions" value={overduePerformanceActions} icon="ClipboardCheck" iconColor="#8E44AD" variant="warning" subtitle="Corrective actions" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-surface-300 p-4">
            <h3 className="font-semibold text-charcoal mb-2">Personal profile</h3>
            {summary?.employee ? (
              <div className="text-sm text-charcoal-600 space-y-1">
                <p>Name: {summary.employee.first_name} {summary.employee.last_name}</p>
                <p>Email: {summary.employee.email}</p>
                <p>Employee no: {summary.employee.employee_no}</p>
                <p>Status: {summary.employee.employment_status}</p>
                <p>Job title: {summary.employee.job_title ?? '-'}</p>
              </div>
            ) : (
              <p className="text-sm text-charcoal-500">No linked HR employee profile.</p>
            )}
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4 space-y-3">
            <h3 className="font-semibold text-charcoal mb-2">Leave status & balances</h3>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full border border-surface-300 bg-surface-50 text-charcoal-700">
                Pending: <span className="ml-1 font-semibold">{leaveStatusCounts.pending}</span>
              </span>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full border border-emerald-400 bg-emerald-50 text-emerald-800">
                Approved: <span className="ml-1 font-semibold">{leaveStatusCounts.approved}</span>
              </span>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full border border-amber-400 bg-amber-50 text-amber-800">
                Declined: <span className="ml-1 font-semibold">{leaveStatusCounts.declined}</span>
              </span>
            </div>
            <div className="space-y-2 text-sm text-charcoal-600">
              {leaveBalances.slice(0, 6).map((row) => (
                <div
                  key={String(row.id)}
                  className="flex items-center justify-between border border-surface-100 rounded-lg px-2 py-1.5"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {String(row.leave_type_name ?? row.leave_type_label ?? row.leave_type_id ?? 'Leave type')}
                    </span>
                    <span className="text-xs text-charcoal-500">
                      Year {String(row.year ?? '')} · Allocated {String(row.allocated_days ?? 0)} · Used {String(row.used_days ?? 0)}
                    </span>
                  </div>
                  <span
                    className={`ml-3 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                      Number(row.remaining_days ?? 0) <= 2
                        ? 'bg-amber-50 text-amber-800 border border-amber-400'
                        : 'bg-teal-50 text-teal-800 border border-teal-400'
                    }`}
                  >
                    {String(row.remaining_days ?? 0)} days left
                  </span>
                </div>
              ))}
              {leaveBalances.length === 0 && (
                <p className="text-sm text-charcoal-500">No leave balance records.</p>
              )}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4">
            <h3 className="font-semibold text-charcoal mb-2">Warnings & offences</h3>
            <div className="space-y-1 text-sm text-charcoal-600">
              {((summary?.hr?.disciplinary as Array<Record<string, unknown>> | undefined) ?? []).slice(0, 5).map((row) => (
                <p key={String(row.id)}>{String(row.offence_type ?? row.offence_category ?? 'Offence')} - {String(row.status ?? 'OPEN')}</p>
              ))}
              {(((summary?.hr?.disciplinary as Array<Record<string, unknown>> | undefined) ?? []).length === 0) && <p className="text-charcoal-500">No disciplinary records.</p>}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-surface-300 p-4">
            <h3 className="font-semibold text-charcoal mb-2">Performance & corrective actions</h3>
            <div className="space-y-1 text-sm text-charcoal-600">
              {((summary?.hr?.performance as Array<Record<string, unknown>> | undefined) ?? []).slice(0, 5).map((row) => (
                <p key={String(row.id)}>
                  {String(row.cycle ?? 'Review')} - Manager rating {String(row.manager_rating ?? row.overall_rating ?? '-')}
                  {row.corrective_due_date ? ` (Due ${String(row.corrective_due_date)})` : ''}
                </p>
              ))}
              {(((summary?.hr?.performance as Array<Record<string, unknown>> | undefined) ?? []).length === 0) && <p className="text-charcoal-500">No performance reviews.</p>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <a href="/profile" className="flex items-center justify-between p-5 bg-white rounded-xl border border-surface-300 shadow-card hover:shadow-card-hover transition-all">
            <div className="flex items-center gap-3"><UserIcon className="w-8 h-8 text-teal" /><span className="font-medium text-charcoal">My profile</span></div>
            <ArrowRightIcon className="w-5 h-5 text-charcoal-400" />
          </a>
          <a href="/dashboard/management/tasks" className="flex items-center justify-between p-5 bg-white rounded-xl border border-surface-300 shadow-card hover:shadow-card-hover transition-all">
            <div className="flex items-center gap-3"><ClipboardCheckIcon className="w-8 h-8 text-navy" /><span className="font-medium text-charcoal">My tasks</span></div>
            <ArrowRightIcon className="w-5 h-5 text-charcoal-400" />
          </a>
          <a href="/training" className="flex items-center justify-between p-5 bg-white rounded-xl border border-surface-300 shadow-card hover:shadow-card-hover transition-all">
            <div className="flex items-center gap-3"><GraduationCapIcon className="w-8 h-8 text-amber-600" /><span className="font-medium text-charcoal">Training & certificates</span></div>
            <ArrowRightIcon className="w-5 h-5 text-charcoal-400" />
          </a>
          <a href="/dashboard/incidents/management" className="flex items-center justify-between p-5 bg-white rounded-xl border border-surface-300 shadow-card hover:shadow-card-hover transition-all">
            <div className="flex items-center gap-3"><AlertTriangleIcon className="w-8 h-8 text-critical" /><span className="font-medium text-charcoal">Report incident</span></div>
            <ArrowRightIcon className="w-5 h-5 text-charcoal-400" />
          </a>
          <a href="/ppe" className="flex items-center justify-between p-5 bg-white rounded-xl border border-surface-300 shadow-card hover:shadow-card-hover transition-all">
            <div className="flex items-center gap-3"><HardHatIcon className="w-8 h-8 text-charcoal-600" /><span className="font-medium text-charcoal">My PPE</span></div>
            <ArrowRightIcon className="w-5 h-5 text-charcoal-400" />
          </a>
          <a href="/dashboard/hr/leave" className="flex items-center justify-between p-5 bg-white rounded-xl border border-surface-300 shadow-card hover:shadow-card-hover transition-all">
            <div className="flex items-center gap-3"><FileTextIcon className="w-8 h-8 text-charcoal-500" /><span className="font-medium text-charcoal">My leave</span></div>
            <ArrowRightIcon className="w-5 h-5 text-charcoal-400" />
          </a>
        </div>

        {loading && <p className="text-sm text-charcoal-500">Loading dashboard...</p>}
      </motion.div>
    </Layout>
  );
}

