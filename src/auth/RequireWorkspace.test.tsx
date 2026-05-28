/* @vitest-environment jsdom */
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authState = {
  isLoaded: true,
  isSignedIn: true
};

const tenantState = {
  memberships: [] as unknown[],
  isPlatformAdmin: false,
  isTenantLoaded: true,
  setActiveCompanyId: vi.fn(),
  refreshTenant: vi.fn().mockResolvedValue(undefined)
};

const ensureInsforgeSessionMock = vi.fn();
const acceptPendingInviteAndActivateWorkspaceMock = vi.fn();
const markSessionExpiredMock = vi.fn();
const routerState = vi.hoisted(() => ({
  pathname: '/dashboard/hr/employees/377dcf58-264a-448f-8769-32fd0efc9095',
  search: '?tab=documents'
}));

vi.mock('@insforge/react', () => ({
  useAuth: () => authState
}));

vi.mock('react-router-dom', () => ({
  Navigate: ({ to }: { to: string }) => React.createElement('div', null, `navigate:${to}`),
  useLocation: () => routerState
}));

vi.mock('../tenant/TenantContext', () => ({
  useTenant: () => tenantState
}));

vi.mock('../api/insforge/ensureSession', () => ({
  ensureInsforgeSession: (...args: unknown[]) => ensureInsforgeSessionMock(...args),
  InsforgeAuthBootstrapError: class InsforgeAuthBootstrapError extends Error {
    constructor(public readonly code: string, message: string) {
      super(message);
      this.name = 'InsforgeAuthBootstrapError';
    }
  }
}));

vi.mock('../api/insforge/sessionState', () => ({
  markSessionExpired: (...args: unknown[]) => markSessionExpiredMock(...args)
}));

vi.mock('./acceptPendingInviteWorkspace', () => ({
  acceptPendingInviteAndActivateWorkspace: (...args: unknown[]) => acceptPendingInviteAndActivateWorkspaceMock(...args)
}));

vi.mock('../api/services/tenantService', () => ({
  PendingInviteAcceptanceError: class PendingInviteAcceptanceError extends Error {
    constructor(message: string, public readonly code: string, public readonly status: number) {
      super(message);
      this.name = 'PendingInviteAcceptanceError';
    }
  }
}));

import { PendingInviteAcceptanceError } from '../api/services/tenantService';
import { InsforgeAuthBootstrapError } from '../api/insforge/ensureSession';
import { RequireWorkspace } from './RequireWorkspace';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function waitForContent(container: HTMLElement, expected: string): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    if (container.textContent?.includes(expected)) return;
    await act(async () => {
      await flushAsyncWork();
    });
  }
}

function renderTree(root: Root): void {
  root.render(
    <RequireWorkspace>
      <div>workspace</div>
    </RequireWorkspace>
  );
}

describe('RequireWorkspace', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    authState.isLoaded = true;
    authState.isSignedIn = true;
    tenantState.memberships = [];
    tenantState.isPlatformAdmin = false;
    tenantState.isTenantLoaded = true;
    tenantState.setActiveCompanyId.mockReset();
    tenantState.refreshTenant.mockReset();
    tenantState.refreshTenant.mockResolvedValue(undefined);
    ensureInsforgeSessionMock.mockReset();
    acceptPendingInviteAndActivateWorkspaceMock.mockReset();
    markSessionExpiredMock.mockReset();
    routerState.pathname = '/dashboard/hr/employees/377dcf58-264a-448f-8769-32fd0efc9095';
    routerState.search = '?tab=documents';

    ensureInsforgeSessionMock.mockResolvedValue({ accessToken: 'token', userId: 'user-1' });
    acceptPendingInviteAndActivateWorkspaceMock.mockResolvedValue({ status: 'none' });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await flushAsyncWork();
    });
    container.remove();
  });

  it('accepts a pending invite before redirecting a no-membership user to activation', async () => {
    acceptPendingInviteAndActivateWorkspaceMock.mockResolvedValue({
      status: 'accepted',
      redirectPath: '/employee/dashboard',
      membership: { company_id: 'company-1', role: 'employee' }
    });

    await act(async () => {
      renderTree(root);
      await flushAsyncWork();
      await flushAsyncWork();
    });
    await waitForContent(container, 'navigate:/employee/dashboard');

    expect(ensureInsforgeSessionMock).toHaveBeenCalledWith({ reason: 'workspace:accept-pending-invite' });
    expect(acceptPendingInviteAndActivateWorkspaceMock).toHaveBeenCalledWith({
      userId: 'user-1',
      setActiveCompanyId: tenantState.setActiveCompanyId,
      refreshTenant: tenantState.refreshTenant
    });
    expect(container.textContent).toContain('navigate:/employee/dashboard');
    expect(container.textContent).not.toContain('activate');
  });

  it('redirects to activation only after no pending invite exists', async () => {
    await act(async () => {
      renderTree(root);
      await flushAsyncWork();
      await flushAsyncWork();
    });
    await waitForContent(container, 'navigate:/activate?reason=no_org');

    expect(acceptPendingInviteAndActivateWorkspaceMock).toHaveBeenCalled();
    expect(container.textContent).toContain('navigate:/activate?reason=no_org');
  });

  it('shows invite backend errors instead of silently redirecting to activation', async () => {
    acceptPendingInviteAndActivateWorkspaceMock.mockRejectedValue(
      new PendingInviteAcceptanceError('Invite acceptance is not configured. Please contact support.', 'SERVICE_ROLE_MISSING', 500)
    );

    await act(async () => {
      renderTree(root);
      await flushAsyncWork();
      await flushAsyncWork();
    });
    await waitForContent(container, 'Invite acceptance is not configured. Please contact support.');

    expect(container.textContent).toContain('Invite acceptance is not configured. Please contact support.');
    expect(container.textContent).not.toContain('activate');
  });

  it('redirects auth bootstrap failures to login without showing an invitation error', async () => {
    ensureInsforgeSessionMock.mockRejectedValue(
      new InsforgeAuthBootstrapError('AUTH_SESSION_MISSING', 'Your session is not available. Please sign in again.')
    );

    await act(async () => {
      renderTree(root);
      await flushAsyncWork();
      await flushAsyncWork();
    });

    const redirect = encodeURIComponent('/dashboard/hr/employees/377dcf58-264a-448f-8769-32fd0efc9095?tab=documents');
    await waitForContent(container, `navigate:/login?redirect=${redirect}`);

    expect(markSessionExpiredMock).toHaveBeenCalledTimes(1);
    expect(acceptPendingInviteAndActivateWorkspaceMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain(`navigate:/login?redirect=${redirect}`);
    expect(container.textContent).not.toContain('We could not accept your invitation');
  });
});
