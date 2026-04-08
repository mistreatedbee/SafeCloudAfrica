export type InactivityDecisionInput = {
  idleMs: number;
  warningTimeoutMs: number;
  logoutTimeoutMs: number;
};

export type InactivityDecision = {
  shouldShowWarning: boolean;
  shouldLogout: boolean;
};

/**
 * Pure decision helper for session inactivity behavior.
 *
 * - Warning shows after `warningTimeoutMs` and before `logoutTimeoutMs`.
 * - Logout triggers at/after `logoutTimeoutMs`.
 */
export function computeInactivityDecision(input: InactivityDecisionInput): InactivityDecision {
  const { idleMs, warningTimeoutMs, logoutTimeoutMs } = input;

  const shouldShowWarning = idleMs >= warningTimeoutMs && idleMs < logoutTimeoutMs;
  const shouldLogout = idleMs >= logoutTimeoutMs;
  return { shouldShowWarning, shouldLogout };
}
