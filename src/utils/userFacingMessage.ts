import { paaq } from '../lib/paaq';

// This is the one place almost every caught, user-displayed error in the
// app already funnels through (~90+ call sites across every create/edit
// modal and page) — every one of those errors was only ever shown inline
// and never reported anywhere, invisible to PAAQ entirely regardless of
// how real or severe the underlying failure was. Reporting it here, once,
// covers all of them instead of instrumenting every call site by hand.
export function toUserFacingError(error: unknown, fallback: string): string {
  try {
    paaq.trackError(error, { context: { fallback } });
  } catch {
    // Telemetry must never break the actual user-facing error message.
  }

  if (!(error instanceof Error)) return fallback;
  const message = String(error.message ?? '').trim();
  if (!message) return fallback;

  const lower = message.toLowerCase();
  const technicalHints = [
    'sqlstate',
    'relation',
    'constraint',
    'stack',
    'trace',
    'rpc',
    'permission denied',
    'duplicate key',
    'syntax error',
    'failed to fetch'
  ];

  if (technicalHints.some((hint) => lower.includes(hint))) return fallback;
  return message;
}
