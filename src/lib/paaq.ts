const BASE_URL = 'https://mookyonwpovxscsbqwwl.supabase.co/functions/v1'
const SDK_VERSION = '1.0.0'

type EventPayload = {
  event_name: string
  session_id: string | null
  user_id: string | null
  screen_name: string | null
  properties: Record<string, unknown>
  timestamp: string
}

type ErrorPayload = {
  error_type: string
  message: string
  stack_trace?: string | null
  screen?: string | null
  severity?: 'fatal' | 'error' | 'warning' | 'info'
  context?: Record<string, unknown> | null
  session_id?: string | null
}

type PaaqConfig = {
  batchSize: number
  syncIntervalSeconds: number
}

type InitResult = {
  ok: boolean
  sessionId?: string
  deviceId?: string
  config?: PaaqConfig
  error?: string
}

type IdentifyResult = {
  ok: boolean
  userId?: string
  error?: string
}

let _sdkToken = ''
let _projectKey = ''
let _sessionId: string | null = null
let _userId: string | null = null
let _queue: EventPayload[] = []
let _config: PaaqConfig = { batchSize: 50, syncIntervalSeconds: 30 }
let _flushTimer: ReturnType<typeof setInterval> | null = null

function headers() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${_sdkToken}`,
    'X-Project-ID': _projectKey,
    'X-SDK-Version': SDK_VERSION,
    'X-Platform': 'react',
    'X-Environment': import.meta.env.PROD ? 'production' : 'development',
  }
}

function deviceId(): string {
  let id = localStorage.getItem('paaq_device_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('paaq_device_id', id)
  }
  return id
}

async function init(sdkToken: string, projectKey: string): Promise<InitResult> {
  _sdkToken = sdkToken
  _projectKey = projectKey

  try {
    const res = await fetch(`${BASE_URL}/sdk-init`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ deviceId: deviceId() }),
    })
    const data: InitResult = await res.json()
    if (data.ok && data.sessionId) {
      _sessionId = data.sessionId
      if (data.config) _config = data.config
      scheduleFlush()
      installGlobalHandlers()
    }
    return data
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Network error'
    return { ok: false, error }
  }
}

// Resolves a real users.id for this external identity so events/sessions can
// be linked to an actual user record instead of just an anonymous device.
async function identify(externalUserId: string, email?: string): Promise<IdentifyResult> {
  if (!_sdkToken) return { ok: false, error: 'paaq.init() has not completed yet' }
  try {
    const res = await fetch(`${BASE_URL}/users`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ external_user_id: externalUserId, email }),
    })
    const data: IdentifyResult & { user_id?: string } = await res.json()
    if (data.ok && data.user_id) {
      _userId = data.user_id
      return { ok: true, userId: data.user_id }
    }
    return { ok: false, error: data.error ?? 'Unknown error' }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Network error'
    return { ok: false, error }
  }
}

// screen_name defaults to the current path so every event (not just page_view)
// is attributable to a real screen for journey/feature-health analysis.
function track(eventName: string, properties: Record<string, unknown> = {}, screenName?: string) {
  _queue.push({
    event_name: eventName,
    session_id: _sessionId,
    user_id: _userId,
    screen_name: screenName ?? window.location.pathname,
    properties,
    timestamp: new Date().toISOString(),
  })
  if (_queue.length >= _config.batchSize) void flush()
}

async function flush(): Promise<void> {
  if (_queue.length === 0 || !_sdkToken) return
  const batch = _queue.splice(0)
  try {
    await fetch(`${BASE_URL}/events`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(batch),
    })
  } catch {
    // fire-and-forget; silently discard on failure
  }
}

function scheduleFlush() {
  if (_flushTimer) clearInterval(_flushTimer)
  _flushTimer = setInterval(() => void flush(), _config.syncIntervalSeconds * 1000)
}

async function sendError(payload: ErrorPayload): Promise<void> {
  if (!_sdkToken) return
  try {
    await fetch(`${BASE_URL}/errors`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ ...payload, session_id: payload.session_id ?? _sessionId }),
    })
  } catch {
    // fire-and-forget
  }
}

function trackError(
  error: unknown,
  options: { severity?: ErrorPayload['severity']; screen?: string; context?: Record<string, unknown> } = {},
): void {
  const err = error instanceof Error ? error : new Error(String(error))
  void sendError({
    error_type: err.name || 'Error',
    message: err.message,
    stack_trace: err.stack ?? null,
    screen: options.screen ?? window.location.pathname,
    severity: options.severity ?? 'error',
    context: options.context ?? null,
  })
}

function installGlobalHandlers(): void {
  window.addEventListener('error', (event) => {
    void sendError({
      error_type: event.error?.name ?? 'UncaughtError',
      message: event.message || String(event.error),
      stack_trace: event.error?.stack ?? null,
      screen: window.location.pathname,
      severity: 'error',
    })
  })
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const err = reason instanceof Error ? reason : new Error(String(reason))
    void sendError({
      error_type: err.name || 'UnhandledRejection',
      message: err.message,
      stack_trace: err.stack ?? null,
      screen: window.location.pathname,
      severity: 'error',
    })
  })
}

export const paaq = { init, identify, track, flush, trackError }
