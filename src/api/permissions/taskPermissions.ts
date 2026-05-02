import type { CompanyRole } from '../models/core';

const TASK_MANAGEMENT_ROLES: CompanyRole[] = ['owner', 'admin', 'manager', 'supervisor', 'consultant'];

export function canManageTasks(role: CompanyRole | null | undefined): boolean {
  return !!role && TASK_MANAGEMENT_ROLES.includes(role);
}
