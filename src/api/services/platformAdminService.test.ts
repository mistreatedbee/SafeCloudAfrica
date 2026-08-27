import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentSessionMock = vi.fn();
const setAuthTokenMock = vi.fn();
const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock('../insforge/client', () => ({
  insforge: {
    auth: {
      getCurrentSession: (...args: unknown[]) => getCurrentSessionMock(...args)
    },
    getHttpClient: () => ({
      setAuthToken: (...args: unknown[]) => setAuthTokenMock(...args),
      getHeaders: () => ({})
    }),
    database: {
      rpc: (...args: unknown[]) => rpcMock(...args),
      from: (...args: unknown[]) => fromMock(...args)
    }
  }
}));

import { ensureMeAsSuperAdmin, isPlatformAdmin } from './platformAdminService';

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function createJwt(expiresAtMs: number, userId = 'user-1'): string {
  return [
    encodeBase64Url(JSON.stringify({ alg: 'none', typ: 'JWT' })),
    encodeBase64Url(JSON.stringify({ sub: userId, exp: Math.floor(expiresAtMs / 1000) })),
    'signature'
  ].join('.');
}

describe('platformAdminService', () => {
  beforeEach(() => {
    getCurrentSessionMock.mockReset();
    setAuthTokenMock.mockReset();
    rpcMock.mockReset();
    fromMock.mockReset();
  });

  it('ensures the session token is attached before ensure_me_as_super_admin RPC', async () => {
    const calls: string[] = [];
    const token = createJwt(Date.now() + 60_000);
    getCurrentSessionMock.mockImplementation(async () => {
      calls.push('getCurrentSession');
      return {
        data: {
          session: {
            accessToken: token,
            user: { id: 'user-1' }
          }
        }
      };
    });
    setAuthTokenMock.mockImplementation(() => {
      calls.push('setAuthToken');
    });
    rpcMock.mockImplementation(async () => {
      calls.push('rpc');
      return { error: null };
    });

    const result = await ensureMeAsSuperAdmin();

    expect(result).toEqual({ status: 'ok' });
    expect(calls).toEqual(['getCurrentSession', 'setAuthToken', 'rpc']);
    expect(rpcMock).toHaveBeenCalledWith('ensure_me_as_super_admin');
  });

  it('returns auth_failed when current session is unauthorized', async () => {
    getCurrentSessionMock.mockResolvedValue({
      data: null,
      error: { status: 401, message: 'Unauthorized' }
    });

    const result = await ensureMeAsSuperAdmin();

    expect(result.status).toBe('auth_failed');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('returns compat_ignored when the RPC does not exist', async () => {
    const token = createJwt(Date.now() + 60_000);
    getCurrentSessionMock.mockResolvedValue({
      data: {
        session: {
          accessToken: token,
          user: { id: 'user-1' }
        }
      }
    });
    rpcMock.mockResolvedValue({
      error: { message: 'function public.ensure_me_as_super_admin() does not exist' }
    });

    const result = await ensureMeAsSuperAdmin();

    expect(result).toEqual({ status: 'compat_ignored' });
  });

  it('returns false for isPlatformAdmin when platform_admins query is forbidden', async () => {
    const token = createJwt(Date.now() + 60_000);
    getCurrentSessionMock.mockResolvedValue({
      data: {
        session: {
          accessToken: token,
          user: { id: 'user-1' }
        }
      }
    });
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: { status: 403, message: 'Forbidden' } })
        })
      })
    });

    await expect(isPlatformAdmin('user-1')).resolves.toBe(false);
  });
});
