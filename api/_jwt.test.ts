import { describe, expect, it, vi } from 'vitest';
import { signJwtHs256, verifyJwtHs256 } from './_jwt';

describe('jwt hs256', () => {
  it('signs and verifies payload', () => {
    const secret = 'test-secret';
    const token = signJwtHs256({ aud: 'x', foo: 'bar' }, secret, { expiresInSeconds: 60 });
    const payload = verifyJwtHs256<{ aud: string; foo: string }>(token, secret);
    expect(payload.aud).toBe('x');
    expect(payload.foo).toBe('bar');
  });

  it('rejects expired token', () => {
    const secret = 'test-secret';
    const start = Date.now();
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => start);
    const token = signJwtHs256({ aud: 'x' }, secret, { expiresInSeconds: 1 });
    spy.mockImplementation(() => start + 2_000);
    expect(() => verifyJwtHs256(token, secret)).toThrow(/expired/i);
    spy.mockRestore();
  });

  it('rejects invalid signature', () => {
    const token = signJwtHs256({ aud: 'x' }, 'secret-a', { expiresInSeconds: 60 });
    expect(() => verifyJwtHs256(token, 'secret-b')).toThrow(/signature/i);
  });
});
