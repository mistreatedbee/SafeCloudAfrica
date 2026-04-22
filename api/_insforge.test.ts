import { describe, expect, it, vi } from 'vitest';

import { resolveServerUser } from './_insforge';

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function createJwt(payload: Record<string, unknown>): string {
  return [
    encodeBase64Url(JSON.stringify({ alg: 'none', typ: 'JWT' })),
    encodeBase64Url(JSON.stringify(payload)),
    'signature'
  ].join('.');
}

describe('resolveServerUser', () => {
  it('uses session user when getCurrentSession resolves one', async () => {
    const insforge = {
      auth: {
        getCurrentSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              user: {
                id: 'session-user',
                email: 'Session@Example.com'
              }
            }
          }
        })
      }
    } as any;

    const result = await resolveServerUser(insforge, createJwt({ sub: 'jwt-user', email: 'jwt@example.com' }));

    expect(result).toEqual({
      userId: 'session-user',
      email: 'session@example.com'
    });
  });

  it('falls back to JWT claims when getCurrentSession has no session user', async () => {
    const insforge = {
      auth: {
        getCurrentSession: vi.fn().mockResolvedValue({
          data: { session: null }
        })
      }
    } as any;

    const result = await resolveServerUser(
      insforge,
      createJwt({ sub: 'jwt-user', email: 'JwtUser@Example.com', exp: Math.floor(Date.now() / 1000) + 60 })
    );

    expect(result).toEqual({
      userId: 'jwt-user',
      email: 'jwtuser@example.com'
    });
  });

  it('falls back to JWT claims when getCurrentSession throws', async () => {
    const insforge = {
      auth: {
        getCurrentSession: vi.fn().mockRejectedValue(new Error('Unauthorized'))
      }
    } as any;

    const result = await resolveServerUser(insforge, createJwt({ sub: 'jwt-user' }));

    expect(result).toEqual({
      userId: 'jwt-user',
      email: null
    });
  });
});
