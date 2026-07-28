import { getServiceInsforge } from './_insforge.js';
import { trackPaaqEvent } from './_paaq.js';

export type LogLevel = 'info' | 'warn' | 'error';

export type StructuredLogPayload = {
  module: string;
  message: string;
  level?: LogLevel;
  user_id?: string | null;
  organization_id?: string | null;
  extra?: Record<string, unknown>;
};

export function logStructuredLine(payload: StructuredLogPayload): void {
  const line = {
    ts: new Date().toISOString(),
    level: payload.level ?? 'info',
    module: payload.module,
    message: payload.message,
    ...(payload.user_id != null && payload.user_id !== '' ? { user_id: payload.user_id } : {}),
    ...(payload.organization_id != null && payload.organization_id !== ''
      ? { organization_id: payload.organization_id }
      : {}),
    ...(payload.extra && Object.keys(payload.extra).length ? { extra: payload.extra } : {})
  };
  const text = JSON.stringify(line);
  if (payload.level === 'error') console.error(text);
  else if (payload.level === 'warn') console.warn(text);
  else console.log(text);
}

export type OperationalEventStatus = 'success' | 'failure' | 'info';

export type RecordOperationalEventInput = {
  event_type: string;
  status: OperationalEventStatus;
  module: string;
  message: string;
  user_id?: string | null;
  organization_id?: string | null;
  details?: Record<string, unknown> | null;
};

/** Best-effort insert; requires INSFORGE_SERVICE_ROLE_KEY. Never throws. */
export function recordOperationalEvent(input: RecordOperationalEventInput): void {
  const client = getServiceInsforge();
  if (client) {
    void client.database
      .from('platform_operational_events')
      .insert({
        event_type: input.event_type,
        status: input.status,
        module: input.module,
        message: input.message,
        user_id: input.user_id ?? null,
        organization_id: input.organization_id ?? null,
        details: input.details ?? null
      })
      .then(() => undefined, () => undefined);
  }

  // Every real operational event is genuine backend activity — report it to
  // PAAQ so the Backend SDK layer reflects actual server-side traffic.
  trackPaaqEvent('nodejs', input.event_type, {
    status: input.status,
    module: input.module,
    message: input.message,
  });
}

const WEBHOOK_TIMEOUT_MS = 5000;

/** POST JSON to ALERT_WEBHOOK_URL if set. Swallows all errors. */
export function sendAlertWebhook(body: Record<string, unknown>): void {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ts: new Date().toISOString(), ...body }),
    signal: controller.signal
  })
    .catch(() => undefined)
    .finally(() => {
      clearTimeout(t);
    });
}
