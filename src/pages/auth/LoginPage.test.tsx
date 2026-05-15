/* @vitest-environment jsdom */
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const useAuthState = {
  isLoaded: true,
  isSignedIn: true,
  signIn: vi.fn(),
  signOut: vi.fn().mockResolvedValue(undefined)
};

const useUserState = {
  user: { id: 'user-1', email: 'user@example.com' } as any,
  setUser: vi.fn()
};

const tenantState = {
  setActiveCompanyId: vi.fn(),
  refreshTenant: vi.fn().mockResolvedValue(undefined)
};

const ensureInsforgeSessionMock = vi.fn();
const ensureMeAsSuperAdminMock = vi.fn();
const isPlatformAdminMock = vi.fn();
const getLoginRedirectPathMock = vi.fn();
const recoverAuthStateMock = vi.fn().mockResolvedValue(undefined);
const callOrder: string[] = [];
const setAuthTokenMock = vi.fn();
const getCurrentSessionMock = vi.fn();
const getCurrentUserMock = vi.fn();
const signInWithPasswordMock = vi.fn();
const searchParamsMock = new URLSearchParams();

vi.mock('@insforge/react', () => ({
  useAuth: () => useAuthState,
  useUser: () => useUserState
}));

vi.mock('react-router-dom', () => ({
  Link: ({ children }: { children: React.ReactNode }) => React.createElement('a', null, children),
  useSearchParams: () => [searchParamsMock]
}));

vi.mock('../../components/auth/AuthShell', () => ({
  AuthShell: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children)
}));

vi.mock('../../tenant/TenantContext', () => ({
  useTenant: () => tenantState
}));

vi.mock('../../api/insforge/ensureSession', () => ({
  ensureInsforgeSession: (...args: unknown[]) => ensureInsforgeSessionMock(...args)
}));

vi.mock('../../api/services/platformAdminService', () => ({
  ensureMeAsSuperAdmin: (...args: unknown[]) => ensureMeAsSuperAdminMock(...args),
  isPlatformAdmin: (...args: unknown[]) => isPlatformAdminMock(...args),
  getLoginRedirectPath: (...args: unknown[]) => getLoginRedirectPathMock(...args)
}));

vi.mock('../../auth/recoverAuthState', () => ({
  recoverAuthState: (...args: unknown[]) => recoverAuthStateMock(...args)
}));

vi.mock('../../api/insforge/client', () => ({
  insforgeReady: Promise.resolve(),
  insforge: {
    getHttpClient: () => ({
      setAuthToken: setAuthTokenMock
    }),
    auth: {
      signInWithPassword: (...args: unknown[]) => signInWithPasswordMock(...args),
      getCurrentSession: (...args: unknown[]) => getCurrentSessionMock(...args),
      getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args)
    }
  }
}));

import { LoginPage } from './LoginPage';

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('LoginPage', () => {
  let container: HTMLDivElement;
  let root: Root;
  let replaceMock: ReturnType<typeof vi.fn>;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    callOrder.length = 0;
    useAuthState.isLoaded = true;
    useAuthState.isSignedIn = true;
    useAuthState.signIn.mockReset();
    useAuthState.signOut.mockReset();
    useAuthState.signOut.mockResolvedValue(undefined);
    useUserState.user = { id: 'user-1', email: 'user@example.com' };
    useUserState.setUser.mockReset();
    setAuthTokenMock.mockReset();
    getCurrentSessionMock.mockReset();
    getCurrentUserMock.mockReset();
    signInWithPasswordMock.mockReset();

    tenantState.setActiveCompanyId.mockReset();
    tenantState.refreshTenant.mockReset();
    tenantState.refreshTenant.mockResolvedValue(undefined);

    ensureInsforgeSessionMock.mockReset();
    ensureMeAsSuperAdminMock.mockReset();
    isPlatformAdminMock.mockReset();
    getLoginRedirectPathMock.mockReset();
    recoverAuthStateMock.mockReset();

    ensureInsforgeSessionMock.mockImplementation(async () => {
      callOrder.push('ensureSession');
      return { accessToken: 'token', userId: 'user-1' };
    });
    ensureMeAsSuperAdminMock.mockImplementation(async () => {
      callOrder.push('ensureMeAsSuperAdmin');
      return { status: 'ok' };
    });
    isPlatformAdminMock.mockImplementation(async () => {
      callOrder.push('isPlatformAdmin');
      return false;
    });
    getLoginRedirectPathMock.mockImplementation(async () => {
      callOrder.push('getLoginRedirectPath');
      return { path: '/org/dashboard', organizationId: 'company-1' };
    });
    recoverAuthStateMock.mockResolvedValue(undefined);

    replaceMock = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { replace: replaceMock }
    });
    globalThis.fetch = originalFetch;
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

  it('ensures session auth is rehydrated before protected post-login checks', async () => {
    await act(async () => {
      root.render(<LoginPage />);
      await flushAsyncWork();
    });

    expect(callOrder.slice(0, 4)).toEqual([
      'ensureSession',
      'ensureMeAsSuperAdmin',
      'isPlatformAdmin',
      'getLoginRedirectPath'
    ]);
    expect(tenantState.setActiveCompanyId).toHaveBeenCalledWith('company-1');
    expect(replaceMock).toHaveBeenCalledWith('/org/dashboard');
  });

  it('accepts SDK 1.2 raw sign-in data and redirects through post-login checks', async () => {
    useAuthState.isSignedIn = false;
    useUserState.user = null as any;
    signInWithPasswordMock.mockResolvedValue({
      data: { accessToken: 'token-from-sign-in', user: { id: 'user-1' } },
      error: null
    });

    await act(async () => {
      root.render(<LoginPage />);
      await flushAsyncWork();
    });

    const emailInput = container.querySelector('#login-email') as HTMLInputElement;
    const passwordInput = container.querySelector('#login-password') as HTMLInputElement;
    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      setInputValue(emailInput, 'USER@EXAMPLE.COM ');
      setInputValue(passwordInput, 'secret');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flushAsyncWork();
    });

    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'secret'
    });
    expect(useUserState.setUser).toHaveBeenCalledWith({ id: 'user-1' });
    expect(setAuthTokenMock).toHaveBeenCalledWith('token-from-sign-in');
    expect(replaceMock).toHaveBeenCalledWith('/org/dashboard');
  });

  it('uses getCurrentUser after sign-in when getCurrentSession is not available', async () => {
    useAuthState.isSignedIn = false;
    useUserState.user = null as any;
    signInWithPasswordMock.mockResolvedValue({ data: { accessToken: 'token-from-sign-in' }, error: null });
    const { insforge } = await import('../../api/insforge/client');
    const originalGetCurrentSession = (insforge.auth as any).getCurrentSession;
    delete (insforge.auth as any).getCurrentSession;
    getCurrentUserMock.mockResolvedValue({
      data: {
        user: { id: 'user-1', email: 'user@example.com' }
      },
      error: null
    });

    await act(async () => {
      root.render(<LoginPage />);
      await flushAsyncWork();
    });

    const emailInput = container.querySelector('#login-email') as HTMLInputElement;
    const passwordInput = container.querySelector('#login-password') as HTMLInputElement;
    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      setInputValue(emailInput, 'user@example.com');
      setInputValue(passwordInput, 'secret');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flushAsyncWork();
    });

    expect(getCurrentUserMock).toHaveBeenCalledTimes(1);
    expect(useUserState.setUser).toHaveBeenCalledWith({ id: 'user-1', email: 'user@example.com' });
    expect(replaceMock).toHaveBeenCalledWith('/org/dashboard');

    (insforge.auth as any).getCurrentSession = originalGetCurrentSession;
  });

  it('accepts legacy token and user_id fields from the proxied login response', async () => {
    useAuthState.isSignedIn = false;
    useUserState.user = null as any;
    signInWithPasswordMock.mockResolvedValue({
      data: { token: 'legacy-token', user_id: 'user-1', user: { id: 'user-1' } },
      error: null
    });

    await act(async () => {
      root.render(<LoginPage />);
      await flushAsyncWork();
    });

    const emailInput = container.querySelector('#login-email') as HTMLInputElement;
    const passwordInput = container.querySelector('#login-password') as HTMLInputElement;
    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      setInputValue(emailInput, 'user@example.com');
      setInputValue(passwordInput, 'secret');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flushAsyncWork();
    });

    expect(setAuthTokenMock).toHaveBeenCalledWith('legacy-token');
    expect(useUserState.setUser).toHaveBeenCalledWith({ id: 'user-1' });
    expect(replaceMock).toHaveBeenCalledWith('/org/dashboard');
  });

  it('resolves the current user from /api/auth/me when login returns only a token', async () => {
    useAuthState.isSignedIn = false;
    useUserState.user = null as any;
    signInWithPasswordMock.mockResolvedValue({
      data: { access_token: 'legacy-token' },
      error: null
    });
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'user-1', email: 'user@example.com' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    ) as unknown as typeof fetch;

    await act(async () => {
      root.render(<LoginPage />);
      await flushAsyncWork();
    });

    const emailInput = container.querySelector('#login-email') as HTMLInputElement;
    const passwordInput = container.querySelector('#login-password') as HTMLInputElement;
    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      setInputValue(emailInput, 'user@example.com');
      setInputValue(passwordInput, 'secret');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flushAsyncWork();
    });

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/auth/me', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer legacy-token' })
    }));
    expect(useUserState.setUser).toHaveBeenCalledWith({ id: 'user-1', email: 'user@example.com' });
    expect(replaceMock).toHaveBeenCalledWith('/org/dashboard');
  });

  it('does not blindly redirect to /app when sign-in succeeds but no session user can be resolved', async () => {
    vi.useFakeTimers();
    useAuthState.isSignedIn = false;
    useUserState.user = null as any;
    signInWithPasswordMock.mockResolvedValue({ data: {}, error: null });
    getCurrentSessionMock.mockResolvedValue({ data: {}, error: null });

    await act(async () => {
      root.render(<LoginPage />);
      await flushAsyncWork();
    });

    const emailInput = container.querySelector('#login-email') as HTMLInputElement;
    const passwordInput = container.querySelector('#login-password') as HTMLInputElement;
    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      setInputValue(emailInput, 'user@example.com');
      setInputValue(passwordInput, 'secret');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flushAsyncWork();
      await vi.advanceTimersByTimeAsync(1000);
      await flushAsyncWork();
    });

    expect(recoverAuthStateMock).toHaveBeenCalledWith(useAuthState.signOut, tenantState.refreshTenant);
    expect(replaceMock).not.toHaveBeenCalledWith('/app');
    expect(container.textContent).toContain('Login failed. Please check your details or contact support.');
  });
});
