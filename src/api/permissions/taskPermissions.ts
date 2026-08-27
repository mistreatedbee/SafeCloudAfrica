import type { CompanyRole } from '../models/core';
import type { Task, UUID } from '../models/entities';

const TASK_MANAGEMENT_ROLES: CompanyRole[] = ['owner', 'admin', 'manager', 'supervisor', 'consultant'];
const SENIOR_ROLES: CompanyRole[] = ['owner', 'admin', 'manager', 'supervisor'];

export function canManageTasks(role: CompanyRole | null | undefined): boolean {
  return !!role && TASK_MANAGEMENT_ROLES.includes(role);
}

export function isSeniorRole(role: CompanyRole | null | undefined): boolean {
  return !!role && SENIOR_ROLES.includes(role);
}

type TaskActor = Pick<Task, 'assignee_user_id' | 'task_owner_user_id' | 'created_by_user_id' | 'status'>;

export function isTaskAssignee(task: TaskActor, actorUserId: UUID): boolean {
  return task.assignee_user_id === actorUserId;
}

export function canSubmitTaskForReview(input: {
  task: TaskActor;
  actorUserId: UUID;
  actorRole: CompanyRole | null | undefined;
}): boolean {
  if (!['in-progress', 'awaiting-evidence', 'reopened'].includes(input.task.status)) return false;
  if (isTaskAssignee(input.task, input.actorUserId)) return true;
  return isSeniorRole(input.actorRole);
}

export function canApproveOrRejectTask(actorRole: CompanyRole | null | undefined): boolean {
  return isSeniorRole(actorRole) || actorRole === 'consultant' || actorRole === 'auditor';
}

/** Assignee or a senior/manager role may close an approved task. */
export function canCloseTask(input: {
  task: TaskActor;
  actorUserId: UUID;
  actorRole: CompanyRole | null | undefined;
}): boolean {
  if (input.task.status !== 'approved') return false;
  if (isSeniorRole(input.actorRole)) return true;
  if (isTaskAssignee(input.task, input.actorUserId)) return true;
  if (input.task.task_owner_user_id === input.actorUserId) return true;
  return false;
}
