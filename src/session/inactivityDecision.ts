export type InactivityDecisionInput = {
  idleMs: number;
  formEditing: boolean;
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
 * - When `formEditing` is true, we suppress both warning and logout.
 * - Otherwise, warning shows after `warningTimeoutMs` and before `logoutTimeoutMs`.
 * - Logout triggers at/after `logoutTimeoutMs`.
 */
export function computeInactivityDecision(input: InactivityDecisionInput): InactivityDecision {
  const { idleMs, formEditing, warningTimeoutMs, logoutTimeoutMs } = input;
  if (formEditing) {
    return { shouldShowWarning: false, shouldLogout: false };
  }

  const shouldShowWarning = idleMs >= warningTimeoutMs && idleMs < logoutTimeoutMs;
  const shouldLogout = idleMs >= logoutTimeoutMs;
  return { shouldShowWarning, shouldLogout };
}

