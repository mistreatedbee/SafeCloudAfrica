import { paaq } from '../lib/paaq';

// This is the one place almost every caught, user-displayed error in the
// app already funnels through (~90+ call sites across every create/edit
// modal and page) — every one of those errors was only ever shown inline
// and never reported anywhere, invisible to PAAQ entirely regardless of
// how real or severe the underlying failure was. Reporting it here, once,
// covers all of them instead of instrumenting every call site by hand.
export function toUserFacingError(error: unknown, fallback: string): string {
  // Always surface the raw InsForge/DB error to the console so it's visible
  // during development and in browser devtools, even though the message
  // shown to the user below may be a sanitized fallback.
  console.error('[toUserFacingError]', fallback, error);

  try {
    paaq.trackError(error, { context: { fallback } });
  } catch {
    // Telemetry must never break the actual user-facing error message.
  }

  if (!(error instanceof Error)) return fallback;
  const message = String(error.message ?? '').trim();
  if (!message) return fallback;

  const lower = message.toLowerCase();

  // A 401 anywhere in the cause chain means the session itself is the problem,
  // not whatever action was being attempted — say so specifically rather than
  // falling through to the generic fallback or a masked technical string.
  const statusCode = Number((error as { statusCode?: number; status?: number }).statusCode ?? (error as { status?: number }).status ?? 0);
  if (statusCode === 401 || lower.includes('unauthorized') || lower.includes('jwt expired') || lower.includes('token expired')) {
    return 'Your session has expired — please refresh the page and try again.';
  }

  // A request that never reached the server (connection dropped, gateway body-size
  // limit, DNS/CORS failure) surfaces as an opaque "Request failed:"-style message
  // with no further detail — never show that raw string to the user.
  if (
    lower.includes('failed to fetch') ||
    lower.includes('network error') ||
    lower.includes('networkerror') ||
    lower.includes('load failed') ||
    /request failed:?\s*$/.test(lower)
  ) {
    return 'Could not reach the server — please check your connection and try again.';
  }

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
    'failed to fetch',
    'request failed',
    'storage upload failed',
    'bad gateway',
    'gateway timeout',
    'econnreset',
    'econnrefused'
  ];

  if (technicalHints.some((hint) => lower.includes(hint))) return fallback;
  return message;
}
