/* @vitest-environment jsdom */
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routerState = vi.hoisted(() => ({
  searchParams: new URLSearchParams('token=invite-token-1'),
  params: {} as Record<string, string>,
  navigate: vi.fn()
}));

const userState = vi.hoisted(() => ({
  isLoaded: true,
  user: { id: 'user-1', email: 'user@example.com' } as { id: string; email: string } | null
}));

const tenantState = vi.hoisted(() => ({
  refreshTenant: vi.fn().mockResolvedValue(undefined),
  setActiveCompanyId: vi.fn()
}));

const serviceMocks = vi.hoisted(() => ({
  acceptInvite: vi.fn(),
  acceptInviteByToken: vi.fn(),
  getInviteById: vi.fn(),
  validateInvitationToken: vi.fn(),
  toUserInviteMessage: vi.fn((message: string) => message)
}));

const pendingInviteMocks = vi.hoisted(() => ({
  acceptPendingInviteAndActivateWorkspace: vi.fn()
}));

const redirectStorageMocks = vi.hoisted(() => ({
  clearPendingInviteContext: vi.fn(),
  savePendingInviteContext: vi.fn()
}));

vi.mock('react-router-dom', () => ({
  Link: ({ children, to, onClick, className }: { children: React.ReactNode; to: string; onClick?: () => void; className?: string }) =>
    React.createElement('a', { href: to, onClick, className }, children),
  useNavigate: () => routerState.navigate,
  useParams: () => routerState.params,
  useSearchParams: () => [routerState.searchParams]
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children: React.ReactNode }) => React.createElement('div', props, children)
  }
}));

vi.mock('@insforge/react', () => ({
  useUser: () => userState
}));

vi.mock('../../components/auth/AuthShell', () => ({
  AuthShell: ({ title, children }: { title: string; children: React.ReactNode }) =>
    React.createElement('section', null, React.createElement('h1', null, title), children)
}));

vi.mock('../../components/ui/LoadingOverlay', () => ({
  LoadingOverlay: ({ show, title, message }: { show: boolean; title: string; message: string }) =>
    show ? React.createElement('div', { 'data-testid': 'loading-overlay' }, `${title} ${message}`) : null
}));

vi.mock('../../components/ui/LoadingSpinner', () => ({
  LoadingSpinner: () => React.createElement('div', null, 'loading')
}));

vi.mock('../../tenant/TenantContext', () => ({
  useTenant: () => tenantState
}));

vi.mock('../../api/services/platformAdminService', () => ({
  getDashboardRoute: (role: string) => `/${String(role).toLowerCase()}/dashboard`
}));

vi.mock('../../api/services/tenantService', () => ({
  acceptInvite: (...args: unknown[]) => serviceMocks.acceptInvite(...args),
  acceptInviteByToken: (...args: unknown[]) => serviceMocks.acceptInviteByToken(...args),
  getInviteById: (...args: unknown[]) => serviceMocks.getInviteById(...args),
  validateInvitationToken: (...args: unknown[]) => serviceMocks.validateInvitationToken(...args),
  toUserInviteMessage: (...args: unknown[]) => serviceMocks.toUserInviteMessage(...args)
}));

vi.mock('../../auth/acceptPendingInviteWorkspace', () => ({
  acceptPendingInviteAndActivateWorkspace: (...args: unknown[]) => pendingInviteMocks.acceptPendingInviteAndActivateWorkspace(...args)
}));

vi.mock('../../auth/pendingAuthRedirect', () => ({
  clearPendingInviteContext: (...args: unknown[]) => redirectStorageMocks.clearPendingInviteContext(...args),
  savePendingInviteContext: (...args: unknown[]) => redirectStorageMocks.savePendingInviteContext(...args)
}));

import { InviteAcceptPage } from './InviteAcceptPage';

const invite = {
  id: 'invite-1',
  company_id: 'company-1',
  organization_name: 'Acme Safety',
  company_name: 'Acme Safety',
  email: 'user@example.com',
  role: 'employee',
  status: 'PENDING'
};

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function renderPage(root: Root): Promise<void> {
  await act(async () => {
    root.render(<InviteAcceptPage />);
    await flushAsyncWork();
  });
}

describe('InviteAcceptPage', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    routerState.searchParams = new URLSearchParams('token=invite-token-1');
    routerState.params = {};
    routerState.navigate.mockReset();
    userState.isLoaded = true;
    userState.user = { id: 'user-1', email: 'user@example.com' };

    tenantState.refreshTenant.mockReset();
    tenantState.refreshTenant.mockResolvedValue(undefined);
    tenantState.setActiveCompanyId.mockReset();

    serviceMocks.acceptInvite.mockReset();
    serviceMocks.acceptInviteByToken.mockReset();
    serviceMocks.getInviteById.mockReset();
    serviceMocks.validateInvitationToken.mockReset();
    serviceMocks.toUserInviteMessage.mockReset();
    serviceMocks.toUserInviteMessage.mockImplementation((message: string) => message);
    pendingInviteMocks.acceptPendingInviteAndActivateWorkspace.mockReset();
    redirectStorageMocks.clearPendingInviteContext.mockReset();
    redirectStorageMocks.savePendingInviteContext.mockReset();

    serviceMocks.validateInvitationToken.mockResolvedValue({ code: 'OK', invite });
    serviceMocks.acceptInviteByToken.mockResolvedValue({ company_id: 'company-1', role: 'employee' });
    pendingInviteMocks.acceptPendingInviteAndActivateWorkspace.mockResolvedValue({ status: 'none' });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await flushAsyncWork();
    });
    container.remove();
    vi.useRealTimers();
  });

  it('does not self-cancel the auto-accept attempt when accepting state changes', async () => {
    await renderPage(root);

    expect(serviceMocks.acceptInviteByToken).toHaveBeenCalledTimes(1);
    expect(tenantState.setActiveCompanyId).toHaveBeenCalledWith('company-1');
    expect(redirectStorageMocks.clearPendingInviteContext).toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(900);
      await flushAsyncWork();
    });

    expect(routerState.navigate).toHaveBeenCalledWith('/employee/dashboard', { replace: true });
  });

  it('clears the accepting overlay and shows an error when token and email fallback both fail', async () => {
    serviceMocks.acceptInviteByToken.mockRejectedValue(new Error('INVITE_INVALID: Invalid invite link.'));
    pendingInviteMocks.acceptPendingInviteAndActivateWorkspace.mockResolvedValue({ status: 'none' });

    await renderPage(root);
    await act(async () => {
      await flushAsyncWork();
    });

    expect(container.textContent).not.toContain('Accepting invite...');
    expect(container.textContent).toContain('INVITE_INVALID: Invalid invite link.');
    expect(routerState.navigate).not.toHaveBeenCalled();
  });

  it('redirects when token accept fails but pending email fallback succeeds', async () => {
    serviceMocks.acceptInviteByToken.mockRejectedValue(new Error('INVITE_INVALID: Invalid invite link.'));
    pendingInviteMocks.acceptPendingInviteAndActivateWorkspace.mockResolvedValue({
      status: 'accepted',
      redirectPath: '/employee/dashboard',
      membership: { company_id: 'company-1', role: 'employee' }
    });

    await renderPage(root);
    await act(async () => {
      vi.advanceTimersByTime(900);
      await flushAsyncWork();
    });

    expect(pendingInviteMocks.acceptPendingInviteAndActivateWorkspace).toHaveBeenCalledWith({
      userId: 'user-1',
      setActiveCompanyId: tenantState.setActiveCompanyId,
      refreshTenant: tenantState.refreshTenant
    });
    expect(routerState.navigate).toHaveBeenCalledWith('/employee/dashboard', { replace: true });
  });

  it('clears the overlay and shows a timeout message if auto-accept hangs', async () => {
    serviceMocks.acceptInviteByToken.mockReturnValue(new Promise(() => undefined));

    await renderPage(root);
    expect(container.textContent).toContain('Accepting invite...');

    await act(async () => {
      vi.advanceTimersByTime(20000);
      await flushAsyncWork();
    });

    expect(container.textContent).not.toContain('Accepting invite...');
    expect(container.textContent).toContain('We could not finish accepting this invite.');
  });
});
