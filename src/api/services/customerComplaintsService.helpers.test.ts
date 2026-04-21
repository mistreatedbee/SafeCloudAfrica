import { describe, expect, it } from 'vitest';
import { resolveComplaintClosureFields } from './customerComplaintsService.helpers';

describe('resolveComplaintClosureFields', () => {
  it('requires action taken before closing a complaint', () => {
    expect(() =>
      resolveComplaintClosureFields({
        nextStatus: 'CLOSED',
        actorUserId: 'actor-1',
        actionTaken: '   '
      })
    ).toThrow('Action taken is required before closing a complaint.');
  });

  it('preserves the explicit date selected in the form when closing', () => {
    const result = resolveComplaintClosureFields({
      nextStatus: 'CLOSED',
      actorUserId: 'actor-1',
      actionTaken: 'Customer refunded',
      closedAt: '2026-04-21'
    });

    expect(result.actionTaken).toBe('Customer refunded');
    expect(result.closedAt).toBe('2026-04-21T00:00:00.000Z');
    expect(result.closedByUserId).toBe('actor-1');
  });

  it('clears close metadata when the complaint is not closed', () => {
    const result = resolveComplaintClosureFields({
      nextStatus: 'MONITORING_REQUIRED',
      actorUserId: 'actor-1',
      actionTaken: 'Monitoring in progress',
      existingActionTaken: 'Existing action',
      existingClosedAt: '2026-04-21T00:00:00.000Z',
      existingClosedByUserId: 'actor-2'
    });

    expect(result.actionTaken).toBe('Monitoring in progress');
    expect(result.closedAt).toBeNull();
    expect(result.closedByUserId).toBeNull();
  });
});
