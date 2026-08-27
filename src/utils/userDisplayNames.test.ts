import { describe, expect, it } from 'vitest';
import {
  applyProfileLabelMap,
  collectResolvableUserIds,
  formatUserProfileLabel,
  isUuidLike
} from './userDisplayNames';

describe('userDisplayNames', () => {
  const userId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

  it('detects uuid-like values', () => {
    expect(isUuidLike(userId)).toBe(true);
    expect(isUuidLike('John Smith')).toBe(false);
  });

  it('prefers full name over email and employee number', () => {
    expect(
      formatUserProfileLabel({
        user_id: userId,
        full_name: 'Jane Doe',
        email: 'jane@example.com',
        employee_number: 'EMP-001'
      })
    ).toBe('Jane Doe');
  });

  it('falls back to email then employee number', () => {
    expect(
      formatUserProfileLabel({
        user_id: userId,
        full_name: null,
        email: 'jane@example.com',
        employee_number: 'EMP-001'
      })
    ).toBe('jane@example.com');

    expect(
      formatUserProfileLabel({
        user_id: userId,
        full_name: null,
        email: null,
        employee_number: 'EMP-001'
      })
    ).toBe('EMP-001');
  });

  it('collects and resolves owner uuid in email variables', () => {
    const variables = {
      reference: 'IMP-2026-00001',
      owner: userId,
      status: 'In Progress'
    };
    const ids = collectResolvableUserIds(variables);
    expect(ids).toContain(userId);
    const resolved = applyProfileLabelMap(variables, new Map([[userId, 'Jane Doe']]));
    expect(resolved.owner).toBe('Jane Doe');
  });
});
