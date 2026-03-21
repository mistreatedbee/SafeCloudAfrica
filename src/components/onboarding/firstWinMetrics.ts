import type { UUID } from '../../api/models/core';
import type { FirstWinPersona } from './firstWinConfig';
import type { ModuleKey } from '../../api/models/core';
import type { FirstWinMetrics } from './firstWinTypes';
import { countActiveMembers, countPendingInvites } from '../../api/services/tenantService';
import { getHrDashboardStats, listHrLeaveRequests, getEmployeeIntegratedProfile, getHrEmployeeByUserId } from '../../api/services/hrService';
import { listIncidents, countMyIncidents } from '../../api/services/incidentsService';
import { listCorrectiveActions } from '../../api/services/correctiveActionsService';
import { countMyPendingTasks, listTasks } from '../../api/services/tasksService';

function moduleOn(key: ModuleKey, enabledModules: ModuleKey[]): boolean {
  return enabledModules.includes(key);
}

export async function loadFirstWinMetrics(input: {
  persona: FirstWinPersona;
  companyId: UUID;
  userId: UUID | null;
  enabledModules: ModuleKey[];
}): Promise<FirstWinMetrics> {
  const { persona, companyId, userId, enabledModules } = input;

  if (persona === 'owner') {
    const [activeMembers, pendingInvites] = await Promise.all([
      countActiveMembers(companyId).catch(() => 0),
      countPendingInvites(companyId).catch(() => 0)
    ]);
    const base: FirstWinMetrics = { activeMembers, pendingInvites };
    if (moduleOn('hr', enabledModules)) {
      const stats = await getHrDashboardStats(companyId).catch(() => null);
      base.totalEmployees = stats?.totalEmployees ?? 0;
    }
    return base;
  }

  if (persona === 'hr' && moduleOn('hr', enabledModules)) {
    const [stats, leaveRows] = await Promise.all([
      getHrDashboardStats(companyId).catch(() => null),
      listHrLeaveRequests(companyId).catch(() => [])
    ]);
    return {
      totalEmployees: stats?.totalEmployees ?? 0,
      leaveRequestsCount: leaveRows.length,
      trainingCompliancePercent: stats?.trainingCompliancePercent ?? 0
    };
  }

  if (persona === 'hr') {
    return {};
  }

  if (persona === 'safety' && moduleOn('safety', enabledModules)) {
    const [incidents, actions] = await Promise.all([
      listIncidents({ companyId, limit: 1 }).catch(() => []),
      listCorrectiveActions({ companyId, limit: 1 }).catch(() => [])
    ]);
    return {
      hasIncident: incidents.length > 0,
      hasCorrectiveAction: actions.length > 0
    };
  }

  if (persona === 'safety') {
    return {};
  }

  if (persona === 'employee' && userId) {
    const [myPendingTasks, myIncidents, tasks, employee] = await Promise.all([
      countMyPendingTasks(companyId, userId).catch(() => 0),
      countMyIncidents(companyId, userId).catch(() => 0),
      listTasks({ companyId, assigneeUserId: userId, limit: 1 }).catch(() => []),
      getHrEmployeeByUserId(companyId, userId).catch(() => null)
    ]);
    let hasLeaveSubmittedOrPending = false;
    if (employee?.id && moduleOn('hr', enabledModules)) {
      const profile = await getEmployeeIntegratedProfile(companyId, employee.id).catch(() => null);
      const leaveRequests = (profile?.leaveRequests as Array<Record<string, unknown>> | undefined) ?? [];
      hasLeaveSubmittedOrPending = leaveRequests.some((row) => {
        const status = String(row.status ?? '').toUpperCase();
        return status === 'SUBMITTED' || status === 'DRAFT';
      });
    } else if (!moduleOn('hr', enabledModules)) {
      hasLeaveSubmittedOrPending = true;
    }
    return {
      myPendingTasks,
      myIncidents,
      assignedTaskCount: tasks.length,
      hasLeaveSubmittedOrPending
    };
  }

  return {};
}
