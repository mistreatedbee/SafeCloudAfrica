import type { ModuleKey } from '../../api/models/core';
import type { FirstWinMetrics } from './firstWinTypes';

export type FirstWinPersona = 'owner' | 'hr' | 'safety' | 'employee';

export type FirstWinStepDef = {
  id: string;
  label: string;
  to: string;
  tooltip?: string;
  requiresModule?: ModuleKey;
};

function moduleOn(key: ModuleKey, enabledModules: ModuleKey[]): boolean {
  return enabledModules.includes(key);
}

export function getStepsForPersona(persona: FirstWinPersona, enabledModules: ModuleKey[]): FirstWinStepDef[] {
  switch (persona) {
    case 'owner': {
      const invite: FirstWinStepDef = {
        id: 'invite_team',
        label: 'Invite your team',
        to: '/users',
        tooltip: 'Send invitations so colleagues can access your workspace.'
      };
      if (moduleOn('hr', enabledModules)) {
        return [
          invite,
          {
            id: 'add_hr_employees',
            label: 'Add employees (HR)',
            to: '/dashboard/hr/employees',
            requiresModule: 'hr',
            tooltip: 'Create HR employee records for reporting, leave, and training.'
          }
        ];
      }
      return [
        invite,
        {
          id: 'grow_team',
          label: 'Add another team member',
          to: '/users',
          tooltip: 'Organisations with more than one active member get value faster.'
        }
      ];
    }
    case 'hr':
      return [
        {
          id: 'add_employee',
          label: 'Add an employee',
          to: '/dashboard/hr/employees',
          requiresModule: 'hr',
          tooltip: 'Create at least one employee profile.'
        },
        {
          id: 'leave_or_training',
          label: 'Set up leave or training',
          to: '/dashboard/hr/leave',
          requiresModule: 'hr',
          tooltip: 'Submit a leave request or ensure training compliance is visible on the HR dashboard.'
        },
        {
          id: 'hr_overview',
          label: 'Review your HR dashboard',
          to: '/dashboard/hr',
          requiresModule: 'hr',
          tooltip: 'Confirm stats and shortcuts look right once data is flowing.'
        }
      ];
    case 'safety':
      return [
        {
          id: 'log_incident',
          label: 'Log an incident',
          to: '/incidents/new',
          requiresModule: 'safety',
          tooltip: 'Record a safety event so the register is in use.'
        },
        {
          id: 'add_corrective_action',
          label: 'Add a corrective action',
          to: '/incidents',
          requiresModule: 'safety',
          tooltip: 'Create a CAPA linked to safety work (from an incident or the management register).'
        },
        {
          id: 'track_capa',
          label: 'Track CAPA status',
          to: '/dashboard/management/ncrs',
          requiresModule: 'safety',
          tooltip: 'Monitor corrective actions until they are closed out.'
        }
      ];
    case 'employee':
      return [
        {
          id: 'tasks',
          label: 'Open your tasks',
          to: '/dashboard/management/tasks?view=tasks',
          tooltip: 'See work assigned to you in one place.'
        },
        {
          id: 'report_incident',
          label: 'Report an incident',
          to: '/dashboard/incidents/management',
          tooltip: 'Submit a safety incident if something happens on site.'
        },
        {
          id: 'request_leave',
          label: 'Request leave',
          to: '/dashboard/hr/leave',
          requiresModule: 'hr',
          tooltip: 'Submit a leave request for manager approval.'
        }
      ];
    default:
      return [];
  }
}

export function filterStepsByModule(steps: FirstWinStepDef[], enabledModules: ModuleKey[]): FirstWinStepDef[] {
  return steps.filter((s) => !s.requiresModule || moduleOn(s.requiresModule, enabledModules));
}

export function isStepComplete(
  step: FirstWinStepDef,
  persona: FirstWinPersona,
  m: FirstWinMetrics,
  enabledModules: ModuleKey[]
): boolean {
  if (step.requiresModule && !moduleOn(step.requiresModule, enabledModules)) return true;

  switch (persona) {
    case 'owner': {
      const teamOk = (m.pendingInvites ?? 0) > 0 || (m.activeMembers ?? 0) > 1;
      if (step.id === 'invite_team') return teamOk;
      if (step.id === 'add_hr_employees') return (m.totalEmployees ?? 0) > 0;
      if (step.id === 'grow_team') return (m.activeMembers ?? 0) > 1;
      return false;
    }
    case 'hr': {
      const hasEmployees = (m.totalEmployees ?? 0) > 0;
      const leaveOrTraining =
        (m.leaveRequestsCount ?? 0) > 0 || (m.trainingCompliancePercent ?? 0) > 0;
      if (step.id === 'add_employee') return hasEmployees;
      if (step.id === 'leave_or_training') return leaveOrTraining;
      if (step.id === 'hr_overview') return hasEmployees && leaveOrTraining;
      return false;
    }
    case 'safety': {
      if (step.id === 'log_incident') return !!m.hasIncident;
      // Both tie to CAPA usage v1: any corrective action counts; "track" nudges the NCR board.
      if (step.id === 'add_corrective_action' || step.id === 'track_capa') return !!m.hasCorrectiveAction;
      return false;
    }
    case 'employee': {
      const hasTasks = (m.myPendingTasks ?? 0) > 0 || (m.assignedTaskCount ?? 0) > 0;
      if (step.id === 'tasks') return hasTasks;
      if (step.id === 'report_incident') return (m.myIncidents ?? 0) > 0;
      if (step.id === 'request_leave') {
        if (!moduleOn('hr', enabledModules)) return true;
        return !!m.hasLeaveSubmittedOrPending;
      }
      return false;
    }
    default:
      return false;
  }
}
