const BASE_URL = 'https://mookyonwpovxscsbqwwl.supabase.co/functions/v1'
const SDK_VERSION = '1.0.0'

type EventPayload = {
  event_name: string
  session_id: string | null
  properties: Record<string, unknown>
  timestamp: string
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

let _sdkToken = ''
let _projectKey = ''
let _sessionId: string | null = null
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
    }
    return data
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Network error'
    return { ok: false, error }
  }
}

function track(eventName: string, properties: Record<string, unknown> = {}) {
  _queue.push({
    event_name: eventName,
    session_id: _sessionId,
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

export const paaq = { init, track, flush }
