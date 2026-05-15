/* @vitest-environment jsdom */
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const getCurrentSessionMock = vi.fn();
  const getCurrentUserMock = vi.fn();
  return {
    authState: {
      isLoaded: true,
      isSignedIn: false,
      reloadAuth: vi.fn().mockResolvedValue({ success: true }),
      setUser: vi.fn()
    },
    navigateRenderMock: vi.fn(),
    setAuthTokenMock: vi.fn(),
    getCurrentSessionMock,
    getCurrentUserMock,
    authApi: {
      getCurrentSession: (...args: unknown[]) => getCurrentSessionMock(...args),
      getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args)
    }
  };
});

vi.mock('@insforge/react', () => ({
  useInsforge: () => mocks.authState
}));

vi.mock('react-router-dom', () => ({
  Navigate: (props: unknown) => {
    mocks.navigateRenderMock(props);
    return React.createElement('div', null, 'navigate');
  },
  useLocation: () => ({ pathname: '/app', search: '' })
}));

vi.mock('../api/insforge/client', () => ({
  insforge: {
    auth: mocks.authApi,
    getHttpClient: () => ({
      setAuthToken: mocks.setAuthTokenMock
    })
  }
}));

import { RequireSignedIn } from './RequireSignedIn';

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

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('RequireSignedIn', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    localStorage.clear();
    mocks.authState.isLoaded = true;
    mocks.authState.isSignedIn = false;
    mocks.authState.reloadAuth.mockReset();
    mocks.authState.reloadAuth.mockResolvedValue({ success: true });
    mocks.authState.setUser.mockReset();
    mocks.authState.setUser.mockImplementation(() => {
      mocks.authState.isSignedIn = true;
    });
    mocks.navigateRenderMock.mockReset();
    mocks.setAuthTokenMock.mockReset();
    mocks.getCurrentSessionMock.mockReset();
    mocks.getCurrentUserMock.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await flushAsyncWork();
    });
    container.remove();
  });

  it('bridges a valid SDK current user before redirecting to login', async () => {
    const token = createJwt({ sub: 'user-1', exp: Math.floor((Date.now() + 60_000) / 1000) });
    const originalGetCurrentSession = (mocks.authApi as any).getCurrentSession;
    delete (mocks.authApi as any).getCurrentSession;
    localStorage.setItem('insforge-auth-token', token);
    mocks.getCurrentUserMock.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'user@example.com' } },
      error: null
    });

    await act(async () => {
      root.render(
        <RequireSignedIn>
          <div>protected dashboard</div>
        </RequireSignedIn>
      );
      await flushAsyncWork();
    });

    expect(mocks.getCurrentUserMock).toHaveBeenCalledTimes(1);
    expect(mocks.setAuthTokenMock).toHaveBeenCalledWith(token);
    expect(mocks.authState.setUser).toHaveBeenCalledWith({ id: 'user-1', email: 'user@example.com' });
    expect(mocks.authState.reloadAuth).toHaveBeenCalledTimes(1);
    expect(mocks.navigateRenderMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain('protected dashboard');

    (mocks.authApi as any).getCurrentSession = originalGetCurrentSession;
  });
});
