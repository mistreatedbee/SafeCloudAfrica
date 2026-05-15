/* @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type AuthState = {
  isLoaded: boolean;
  isSignedIn: boolean;
  signOut: ReturnType<typeof vi.fn>;
};

const authState: AuthState = {
  isLoaded: true,
  isSignedIn: true,
  signOut: vi.fn().mockResolvedValue(undefined)
};

const navigateMock = vi.fn();
const flushAllDraftsMock = vi.fn().mockResolvedValue(undefined);
const getSessionTimeoutMinutesMock = vi.fn().mockResolvedValue(120);
const getCurrentSessionMock = vi.fn();
const getCurrentUserMock = vi.fn();
const fetchMock = vi.fn();

const httpClientState = {
  authorization: ''
};

const httpClient = {
  getHeaders: () =>
    httpClientState.authorization
      ? { Authorization: httpClientState.authorization }
      : {},
  setAuthToken: (token: string | null) => {
    httpClientState.authorization = token ? `Bearer ${token}` : '';
  }
};

vi.mock('@insforge/react', () => ({
  useAuth: () => authState
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useLocation: () => ({ pathname: '/app/work', search: '?tab=editor' })
}));

vi.mock('../api/insforge/client', () => ({
  insforge: {
    auth: {
      getCurrentSession: (...args: unknown[]) => getCurrentSessionMock(...args),
      getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args)
    },
    getHttpClient: () => httpClient
  }
}));

vi.mock('./DraftManagerProvider', () => ({
  useDraftManager: () => ({
    flushAllDrafts: flushAllDraftsMock
  })
}));

vi.mock('../tenant/TenantContext', () => ({
  useTenant: () => ({
    activeCompanyId: 'company-1'
  })
}));

vi.mock('../api/services/securityService', () => ({
  getSessionTimeoutMinutes: (...args: unknown[]) => getSessionTimeoutMinutesMock(...args)
}));

import { SessionManagerProvider } from './SessionManagerProvider';

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

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('SessionManagerProvider', () => {
  let container: HTMLDivElement;
  let root: Root;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T08:00:00.000Z'));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    authState.isLoaded = true;
    authState.isSignedIn = true;
    authState.signOut = vi.fn().mockResolvedValue(undefined);
    navigateMock.mockReset();
    flushAllDraftsMock.mockReset();
    flushAllDraftsMock.mockResolvedValue(undefined);
    getSessionTimeoutMinutesMock.mockReset();
    getSessionTimeoutMinutesMock.mockResolvedValue(120);
    getCurrentSessionMock.mockReset();
    getCurrentUserMock.mockReset();
    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new Error('Service temporarily unavailable'));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    sessionStorage.clear();
    localStorage.clear();
    httpClientState.authorization = '';

    await act(async () => {
      root.render(
        <SessionManagerProvider>
          <div>session child</div>
        </SessionManagerProvider>
      );
      await flushAsyncWork();
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await flushAsyncWork();
    });
    container.remove();
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('keeps the user signed in when refresh fails transiently and the current token is still valid', async () => {
    const nearExpiryToken = createJwt(Date.now() + 60_000);
    httpClient.setAuthToken(nearExpiryToken);
    getCurrentSessionMock.mockResolvedValue({
      data: {
        session: {
          accessToken: nearExpiryToken,
          user: { id: 'user-1' }
        }
      }
    });
    await act(async () => {
      vi.advanceTimersByTime(15_000);
      await flushAsyncWork();
    });

    expect(authState.signOut).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(httpClient.getHeaders()).toEqual({ Authorization: `Bearer ${nearExpiryToken}` });
  });

  it('does not redirect to login after repeated transient refresh failures', async () => {
    const expiredToken = createJwt(Date.now() - 60_000);
    httpClient.setAuthToken(expiredToken);
    getCurrentSessionMock.mockResolvedValue({});

    await act(async () => {
      vi.advanceTimersByTime(90_000);
      await flushAsyncWork();
    });

    expect(authState.signOut).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('sca_session_expired')).toBeNull();
  });

  it('logs the user out when the backend confirms the session is invalid', async () => {
    getCurrentSessionMock.mockResolvedValue({
      error: {
        status: 401,
        message: 'invalid or expired session'
      }
    });

    await act(async () => {
      vi.advanceTimersByTime(15_000);
      await flushAsyncWork();
    });

    expect(authState.signOut).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/login?redirect=%2Fapp%2Fwork%3Ftab%3Deditor', { replace: true });
    expect(sessionStorage.getItem('sca_session_expired')).toBe('1');
    expect(sessionStorage.getItem('sca_session_expired_message')).toBe('Your session has expired. Please log in again.');
  });

  it('does not log the user out after long inactivity', async () => {
    const longLivedToken = createJwt(Date.now() + 24 * 60 * 60 * 1000);
    httpClient.setAuthToken(longLivedToken);
    getCurrentSessionMock.mockResolvedValue({
      data: {
        session: {
          accessToken: longLivedToken,
          user: { id: 'user-1' }
        }
      }
    });

    await act(async () => {
      vi.advanceTimersByTime(120 * 60 * 1000);
      await flushAsyncWork();
    });

    expect(authState.signOut).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('sca_session_expired')).toBeNull();
    expect(sessionStorage.getItem('sca_session_expired_message')).toBeNull();
  });

  it('uses getCurrentUser when getCurrentSession is not available', async () => {
    const longLivedToken = createJwt(Date.now() + 24 * 60 * 60 * 1000);
    httpClient.setAuthToken(longLivedToken);
    const auth = (await import('../api/insforge/client')).insforge.auth as any;
    const originalGetCurrentSession = auth.getCurrentSession;
    delete auth.getCurrentSession;
    getCurrentUserMock.mockResolvedValue({
      data: {
        user: { id: 'user-1' }
      },
      error: null
    });

    await act(async () => {
      vi.advanceTimersByTime(15_000);
      await flushAsyncWork();
    });

    expect(getCurrentUserMock).toHaveBeenCalledTimes(1);
    expect(httpClient.getHeaders()).toEqual({ Authorization: `Bearer ${longLivedToken}` });
    expect(authState.signOut).not.toHaveBeenCalled();

    auth.getCurrentSession = originalGetCurrentSession;
  });
});
