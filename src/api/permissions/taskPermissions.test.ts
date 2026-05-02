import { describe, expect, it } from 'vitest';
import type { CompanyRole } from '../models/core';
import { canManageTasks } from './taskPermissions';

describe('task permissions', () => {
  it.each<CompanyRole>(['owner', 'admin', 'manager', 'supervisor', 'consultant'])(
    'allows %s to manage tasks',
    (role) => {
      expect(canManageTasks(role)).toBe(true);
    }
  );

  it.each<CompanyRole | null | undefined>(['employee', 'auditor', null, undefined])(
    'does not allow %s to manage tasks',
    (role) => {
      expect(canManageTasks(role)).toBe(false);
    }
  );
});
