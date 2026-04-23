import crypto from 'node:crypto';

function base64UrlEncode(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecodeToBuffer(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = `${normalized}${'='.repeat((4 - (normalized.length % 4)) % 4)}`;
  return Buffer.from(padded, 'base64');
}

export type JwtSignOptions = {
  expiresInSeconds: number;
};

export function signJwtHs256(payload: Record<string, unknown>, secret: string, options: JwtSignOptions): string {
  if (!secret) throw new Error('JWT secret not configured.');

  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const exp = now + Math.max(1, Math.floor(options.expiresInSeconds));

  const headerPart = base64UrlEncode(JSON.stringify(header));
  const payloadPart = base64UrlEncode(JSON.stringify({ ...payload, iat: now, exp }));
  const data = `${headerPart}.${payloadPart}`;

  const sig = crypto.createHmac('sha256', secret).update(data).digest();
  const sigPart = base64UrlEncode(sig);

  return `${data}.${sigPart}`;
}

export function verifyJwtHs256<T extends Record<string, unknown>>(token: string, secret: string): T {
  if (!secret) throw new Error('JWT secret not configured.');
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format.');
  const [headerPart, payloadPart, sigPart] = parts;
  const data = `${headerPart}.${payloadPart}`;

  const expected = crypto.createHmac('sha256', secret).update(data).digest();
  const actual = base64UrlDecodeToBuffer(sigPart);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw new Error('Invalid JWT signature.');
  }

  const payload = JSON.parse(base64UrlDecodeToBuffer(payloadPart).toString('utf8')) as T & {
    exp?: unknown;
  };

  const exp = typeof payload.exp === 'number' ? payload.exp : null;
  if (!exp) throw new Error('JWT exp missing.');
  const now = Math.floor(Date.now() / 1000);
  if (now >= exp) throw new Error('JWT expired.');

  return payload as T;
}

