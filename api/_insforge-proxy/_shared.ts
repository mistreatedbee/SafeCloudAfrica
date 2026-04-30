import crypto from 'node:crypto';
import { applyNoStoreHeaders } from '../_response.js';
import { logStructuredLine } from '../_observability.js';
import { resolveInsforgeOrigin } from '../_insforge-origin.js';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  // These are request-specific and should be recomputed by `fetch`.
  'host',
  'content-length'
]);

const DROP_RESPONSE_HEADERS = new Set([
  // Node fetch transparently decompresses; don't forward encodings/lengths we didn't compute.
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection'
]);

function rewriteSetCookieHeader(cookie: string): string {
  // Minimal, safe rewrite so InsForge cookies can be set on the Vercel domain when proxying.
  // - Drop `Domain=` so the browser scopes it to the current host.
  // - Keep Path/SameSite/Secure/HttpOnly as sent by upstream.
  const parts = cookie.split(';').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return cookie;
  const first = parts[0];
  const attrs = parts.slice(1).filter((p) => !p.toLowerCase().startsWith('domain='));
  return [first, ...attrs].join('; ');
}

export type ProxyResult = {
  requestId: string;
  upstreamOrigin: string;
};

function getRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function getQueryString(req: any): string {
  const url: string = typeof req?.url === 'string' ? req.url : '';
  const idx = url.indexOf('?');
  return idx >= 0 ? url.slice(idx) : '';
}

export function getInsforgeUpstreamOrigin(): string {
  return resolveInsforgeOrigin({ allowViteEnv: false, allowLinkedProjectFallback: true });
}

export function buildUpstreamUrl(upstreamOrigin: string, upstreamPath: string, req: any): string {
  const qs = getQueryString(req);
  const cleaned = upstreamPath.startsWith('/') ? upstreamPath : `/${upstreamPath}`;
  return `${upstreamOrigin}${cleaned}${qs}`;
}

export function buildForwardHeaders(req: any, extraHeaders?: Record<string, string>): Headers {
  const headers = new Headers();
  const raw: Record<string, string | string[] | undefined> = req?.headers ?? {};
  for (const [keyRaw, value] of Object.entries(raw)) {
    const key = keyRaw.toLowerCase();
    if (!key || HOP_BY_HOP.has(key)) continue;
    if (value == null) continue;
    if (Array.isArray(value)) headers.set(key, value.join(','));
    else headers.set(key, String(value));
  }
  headers.set('cache-control', headers.get('cache-control') ?? 'no-store');
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) headers.set(k, v);
  }
  return headers;
}

export function getProxyBody(req: any): BodyInit | undefined {
  const method = String(req?.method ?? 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return undefined;

  const body = (req as any)?.body;
  if (body == null) return undefined;
  // Vercel may parse an empty body as `{}`; avoid sending a synthetic `{}` payload.
  if (typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 0) {
    const contentType = String(req?.headers?.['content-type'] ?? '').toLowerCase();
    if (!contentType || contentType === 'application/json') return undefined;
  }
  if (typeof body === 'string') return body;
  // Vercel may provide Buffer for raw payloads; fetch expects a web BodyInit type.
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(body)) return new Uint8Array(body);
  if (body instanceof ArrayBuffer) return body;
  if (ArrayBuffer.isView(body)) return body as any;
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

export async function writeUpstreamResponse(res: any, upstreamRes: Response, method: string): Promise<void> {
  // Apply upstream headers first, then enforce no-store headers.
  upstreamRes.headers.forEach((value, key) => {
    const lowered = key.toLowerCase();
    if (DROP_RESPONSE_HEADERS.has(lowered)) return;
    if (lowered === 'set-cookie') return;
    if (!res?.setHeader) return;
    res.setHeader(key, value);
  });

  // Preserve multiple Set-Cookie headers if available (Node/undici) and rewrite Domain for proxying.
  try {
    const getSetCookie = (upstreamRes.headers as any)?.getSetCookie as undefined | (() => string[]);
    const setCookies = typeof getSetCookie === 'function' ? getSetCookie.call(upstreamRes.headers) : [];
    if (setCookies.length && res?.setHeader) {
      res.setHeader('Set-Cookie', setCookies.map(rewriteSetCookieHeader));
    }
  } catch {
    // best-effort
  }

  applyNoStoreHeaders(res);

  res.statusCode = upstreamRes.status;

  if (method === 'HEAD' || upstreamRes.status === 204 || upstreamRes.status === 304) {
    res.end();
    return;
  }

  const contentType = upstreamRes.headers.get('content-type') ?? '';
  if (contentType.startsWith('text/') || contentType.includes('application/json')) {
    const text = await upstreamRes.text();
    res.end(text);
    return;
  }

  const ab = await upstreamRes.arrayBuffer();
  res.end(Buffer.from(ab));
}

export function startProxy(req: any, res: any, moduleName: string): ProxyResult | null {
  applyNoStoreHeaders(res);
  const upstreamOrigin = getInsforgeUpstreamOrigin();
  const requestId = getRequestId();
  if (res?.setHeader) res.setHeader('X-SafeCloud-Request-Id', requestId);

  if (!upstreamOrigin) {
    logStructuredLine({
      module: moduleName,
      level: 'error',
      message: 'InsForge upstream origin not configured',
      extra: { requestId }
    });
    res.status(500).json({
      ok: false,
      error: 'Server misconfigured',
      requestId
    });
    return null;
  }

  // Guard against accidental self-proxy loops (e.g. INSFORGE_BASE_URL set to the Vercel app URL).
  try {
    const host = String(req?.headers?.['x-forwarded-host'] ?? req?.headers?.host ?? '').trim();
    const proto = String(req?.headers?.['x-forwarded-proto'] ?? 'https').trim() || 'https';
    const currentOrigin = host ? `${proto}://${host}` : '';
    if (currentOrigin && new URL(currentOrigin).origin === new URL(upstreamOrigin).origin) {
      logStructuredLine({
        module: moduleName,
        level: 'error',
        message: 'Refusing to proxy to self (loop)',
        extra: { requestId, upstreamOrigin, currentOrigin }
      });
      res.status(500).json({
        ok: false,
        error: 'Server misconfigured',
        requestId
      });
      return null;
    }
  } catch {
    // Ignore origin parsing errors; continue proxying.
  }

  return { requestId, upstreamOrigin };
}
