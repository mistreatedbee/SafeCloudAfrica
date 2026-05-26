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
  user: { id: 'user-1', email: 'user@example.com' }
};

const tenantState = {
  setActiveCompanyId: vi.fn(),
  refreshTenant: vi.fn().mockResolvedValue(undefined)
};

const ensureInsforgeSessionMock = vi.fn();
const ensureMeAsSuperAdminMock = vi.fn();
const isPlatformAdminMock = vi.fn();
const getLoginRedirectPathMock = vi.fn();
const acceptInviteByTokenMock = vi.fn();
const recoverAuthStateMock = vi.fn().mockResolvedValue(undefined);
const callOrder: string[] = [];
const routerState = vi.hoisted(() => ({
  searchParams: new URLSearchParams()
}));

vi.mock('@insforge/react', () => ({
  useAuth: () => useAuthState,
  useUser: () => useUserState
}));

vi.mock('react-router-dom', () => ({
  Link: ({ children }: { children: React.ReactNode }) => React.createElement('a', null, children),
  useSearchParams: () => [routerState.searchParams]
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
  getDashboardRoute: (role: string) => `/${String(role).toLowerCase()}/dashboard`,
  getLoginRedirectPath: (...args: unknown[]) => getLoginRedirectPathMock(...args)
}));

vi.mock('../../api/services/tenantService', () => ({
  acceptInviteByToken: (...args: unknown[]) => acceptInviteByTokenMock(...args)
}));

vi.mock('../../auth/recoverAuthState', () => ({
  recoverAuthState: (...args: unknown[]) => recoverAuthStateMock(...args)
}));

vi.mock('../../api/insforge/client', () => ({
  insforgeReady: Promise.resolve(),
  insforge: {
    getHttpClient: () => ({
      setAuthToken: vi.fn()
    }),
    auth: {
      getCurrentSession: vi.fn()
    }
  }
}));

import { LoginPage } from './LoginPage';

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('LoginPage', () => {
  let container: HTMLDivElement;
  let root: Root;
  let replaceMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    callOrder.length = 0;
    routerState.searchParams = new URLSearchParams();
    localStorage.clear();
    sessionStorage.clear();

    tenantState.setActiveCompanyId.mockReset();
    tenantState.refreshTenant.mockReset();
    tenantState.refreshTenant.mockResolvedValue(undefined);

    ensureInsforgeSessionMock.mockReset();
    ensureMeAsSuperAdminMock.mockReset();
    isPlatformAdminMock.mockReset();
    getLoginRedirectPathMock.mockReset();
    acceptInviteByTokenMock.mockReset();
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
    acceptInviteByTokenMock.mockImplementation(async () => {
      callOrder.push('acceptInviteByToken');
      return { company_id: 'company-invite', role: 'employee' };
    });
    recoverAuthStateMock.mockResolvedValue(undefined);

    replaceMock = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { origin: 'http://localhost', replace: replaceMock }
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await flushAsyncWork();
    });
    container.remove();
  });

  it('ensures session auth is rehydrated before protected post-login checks', async () => {
    await act(async () => {
      root.render(<LoginPage />);
      await flushAsyncWork();
    });

    expect(callOrder).toEqual([
      'ensureSession',
      'ensureMeAsSuperAdmin',
      'isPlatformAdmin',
      'getLoginRedirectPath'
    ]);
    expect(tenantState.setActiveCompanyId).toHaveBeenCalledWith('company-1');
    expect(replaceMock).toHaveBeenCalledWith('/org/dashboard');
  });

  it('accepts invite redirects before normal post-login routing', async () => {
    routerState.searchParams = new URLSearchParams(`redirect=${encodeURIComponent('/invite/accept?token=invite-token-1')}`);

    await act(async () => {
      root.render(<LoginPage />);
      await flushAsyncWork();
    });

    expect(callOrder).toEqual([
      'ensureSession',
      'ensureMeAsSuperAdmin',
      'isPlatformAdmin',
      'acceptInviteByToken'
    ]);
    expect(acceptInviteByTokenMock).toHaveBeenCalledWith({
      token: 'invite-token-1',
      userId: 'user-1'
    });
    expect(getLoginRedirectPathMock).not.toHaveBeenCalled();
    expect(tenantState.setActiveCompanyId).toHaveBeenCalledWith('company-invite');
    expect(replaceMock).toHaveBeenCalledWith('/employee/dashboard');
  });
});
