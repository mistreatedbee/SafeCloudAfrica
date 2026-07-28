// Server-side PAAQ Intelligence client for Vercel serverless functions.
// Only called from real backend/database operations (see _observability.ts
// and health/insforge-db.ts) — never on an artificial timer.
const BASE_URL = 'https://mookyonwpovxscsbqwwl.supabase.co/functions/v1';
const SDK_TOKEN = process.env.PAAQ_SDK_TOKEN ?? process.env.VITE_PAAQ_SDK_TOKEN ?? 'sdk_live_aa2vjr8nhh14hfqeax0ywx4euz7vg3b2';
const PROJECT_KEY = process.env.PAAQ_PROJECT_KEY ?? process.env.VITE_PAAQ_PROJECT_KEY ?? 'proj_6u2h0ixg';

export type PaaqLayer = 'nodejs' | 'database';

type SessionState = { sessionId: string | null; initPromise: Promise<void> | null };
const sessionsByLayer: Partial<Record<PaaqLayer, SessionState>> = {};

function headersFor(platform: PaaqLayer) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${SDK_TOKEN}`,
    'X-Project-ID': PROJECT_KEY,
    'X-SDK-Version': '1.0.0',
    'X-Platform': platform,
    'X-Environment': process.env.VERCEL_ENV ?? (process.env.NODE_ENV === 'production' ? 'production' : 'development'),
  };
}

async function ensureSession(layer: PaaqLayer): Promise<string | null> {
  let state = sessionsByLayer[layer];
  if (!state) {
    state = { sessionId: null, initPromise: null };
    sessionsByLayer[layer] = state;
  }
  if (state.sessionId) return state.sessionId;
  if (!state.initPromise) {
    state.initPromise = fetch(`${BASE_URL}/sdk-init`, {
      method: 'POST',
      headers: headersFor(layer),
      body: JSON.stringify({ deviceId: `vercel-${layer}-safecloudafrica` }),
    })
      .then((res) => res.json())
      .then((data: { ok?: boolean; sessionId?: string }) => {
        if (data.ok && data.sessionId) state!.sessionId = data.sessionId;
      })
      .catch(() => undefined);
  }
  await state.initPromise;
  return state.sessionId;
}

/** Fire-and-forget: records a real backend/database event in PAAQ. Never throws. */
export function trackPaaqEvent(layer: PaaqLayer, eventName: string, properties: Record<string, unknown> = {}): void {
  void ensureSession(layer).then((sessionId) => {
    void fetch(`${BASE_URL}/events`, {
      method: 'POST',
      headers: headersFor(layer),
      body: JSON.stringify([
        {
          event_name: eventName,
          session_id: sessionId,
          screen_name: null,
          properties,
          timestamp: new Date().toISOString(),
        },
      ]),
    }).catch(() => undefined);
  });
}
