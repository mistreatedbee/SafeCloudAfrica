import { describe, it, expect } from 'vitest';
import { computeInactivityDecision } from './inactivityDecision';

const WARNING_TIMEOUT_MS = 45 * 60 * 1000;
const LOGOUT_TIMEOUT_MS = 60 * 60 * 1000;

describe('computeInactivityDecision', () => {
  it('does not warn or logout when idle below warning threshold', () => {
    const decision = computeInactivityDecision({
      idleMs: WARNING_TIMEOUT_MS - 1,
      warningTimeoutMs: WARNING_TIMEOUT_MS,
      logoutTimeoutMs: LOGOUT_TIMEOUT_MS
    });
    expect(decision).toEqual({ shouldShowWarning: false, shouldLogout: false });
  });

  it('shows warning at/after 45 minutes but before 60 minutes', () => {
    const decision = computeInactivityDecision({
      idleMs: WARNING_TIMEOUT_MS,
      warningTimeoutMs: WARNING_TIMEOUT_MS,
      logoutTimeoutMs: LOGOUT_TIMEOUT_MS
    });
    expect(decision).toEqual({ shouldShowWarning: true, shouldLogout: false });
  });

  it('logs out at/after 60 minutes', () => {
    const decision = computeInactivityDecision({
      idleMs: LOGOUT_TIMEOUT_MS,
      warningTimeoutMs: WARNING_TIMEOUT_MS,
      logoutTimeoutMs: LOGOUT_TIMEOUT_MS
    });
    expect(decision).toEqual({ shouldShowWarning: false, shouldLogout: true });
  });

  it('logs out even at high idle durations', () => {
    const decision = computeInactivityDecision({
      idleMs: LOGOUT_TIMEOUT_MS + 10_000,
      warningTimeoutMs: WARNING_TIMEOUT_MS,
      logoutTimeoutMs: LOGOUT_TIMEOUT_MS
    });
    expect(decision).toEqual({ shouldShowWarning: false, shouldLogout: true });
  });
});
