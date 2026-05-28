/* @vitest-environment jsdom */
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.fn();
const useAuthState = {
  isLoaded: true,
  isSignedIn: false,
  signOut: vi.fn().mockResolvedValue(undefined)
};
const useUserState = {
  user: null as { id: string; email?: string } | null
};
const tenantState = {
  setActiveCompanyId: vi.fn(),
  refreshTenant: vi.fn().mockResolvedValue(undefined)
};
const validateLicenseKeyMock = vi.fn();
const activateLicenseKeyMock = vi.fn();
const signUpMock = vi.fn();
const signInWithPasswordMock = vi.fn();

vi.mock('react-router-dom', () => ({
  Link: ({ children }: { children: React.ReactNode }) => React.createElement('a', null, children),
  useNavigate: () => navigateMock
}));

vi.mock('@insforge/react', () => ({
  useAuth: () => useAuthState,
  useUser: () => useUserState
}));

vi.mock('../../components/auth/AuthShell', () => ({
  AuthShell: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children)
}));

vi.mock('../../tenant/TenantContext', () => ({
  useTenant: () => tenantState
}));

vi.mock('../../api/services/activationService', () => ({
  validateLicenseKey: (...args: unknown[]) => validateLicenseKeyMock(...args),
  activateLicenseKey: (...args: unknown[]) => activateLicenseKeyMock(...args)
}));

vi.mock('../../api/insforge/client', () => ({
  insforge: {
    auth: {
      signUp: (...args: unknown[]) => signUpMock(...args),
      signInWithPassword: (...args: unknown[]) => signInWithPasswordMock(...args)
    }
  }
}));

import { ActivateLicensePage } from './ActivateLicensePage';

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function fillInput(container: HTMLDivElement, index: number, value: string): Promise<void> {
  const input = container.querySelectorAll<HTMLInputElement>('input')[index];
  if (!input) throw new Error(`Input ${index} did not render.`);
  await act(async () => {
    Simulate.change(input, { target: { value } } as any);
    await flushAsyncWork();
  });
}

async function submitForm(container: HTMLDivElement): Promise<void> {
  const form = container.querySelector<HTMLFormElement>('form');
  if (!form) throw new Error('Activation form did not render.');
  await act(async () => {
    Simulate.submit(form);
    await flushAsyncWork();
    await flushAsyncWork();
  });
}

describe('ActivateLicensePage', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    localStorage.clear();
    sessionStorage.clear();

    useAuthState.isLoaded = true;
    useAuthState.isSignedIn = false;
    useAuthState.signOut.mockReset();
    useAuthState.signOut.mockResolvedValue(undefined);
    useUserState.user = null;

    navigateMock.mockReset();
    tenantState.setActiveCompanyId.mockReset();
    tenantState.refreshTenant.mockReset();
    tenantState.refreshTenant.mockResolvedValue(undefined);
    validateLicenseKeyMock.mockReset();
    activateLicenseKeyMock.mockReset();
    signUpMock.mockReset();
    signInWithPasswordMock.mockReset();

    validateLicenseKeyMock.mockResolvedValue({
      plan_name: 'base',
      billing_cycle_months: 12,
      seat_limit: 10,
      modules_enabled: ['hr']
    });
    activateLicenseKeyMock.mockResolvedValue({ organizationId: 'org-1' });
    signUpMock.mockResolvedValue({ data: { accessToken: 'token-1' }, error: null });
    signInWithPasswordMock.mockResolvedValue({ data: { accessToken: 'token-1' }, error: null });

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { origin: 'http://localhost' }
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await flushAsyncWork();
    });
    container.remove();
    vi.useRealTimers();
  });

  it('creates a signed-out user account, signs in automatically, and activates the organisation', async () => {
    await act(async () => {
      root.render(<ActivateLicensePage />);
      await flushAsyncWork();
    });

    await fillInput(container, 0, 'LICENSE-123');
    await act(async () => {
      vi.advanceTimersByTime(501);
      await flushAsyncWork();
    });
    await fillInput(container, 1, 'Acme Safety');
    await fillInput(container, 2, 'Mining');
    await fillInput(container, 3, 'South Africa');
    await fillInput(container, 4, 'Test Owner');
    await fillInput(container, 5, 'owner@example.com');
    await fillInput(container, 6, '+27000000000');
    await fillInput(container, 7, 'password-1');
    await submitForm(container);

    expect(signUpMock).toHaveBeenCalledWith({
      email: 'owner@example.com',
      password: 'password-1',
      name: 'Test Owner',
      redirectTo: 'http://localhost/login'
    });
    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: 'owner@example.com',
      password: 'password-1'
    });
    expect(activateLicenseKeyMock).toHaveBeenCalledWith({
      key: 'LICENSE-123',
      companyName: 'Acme Safety',
      industry: 'Mining',
      country: 'South Africa',
      primaryContactName: 'Test Owner',
      primaryContactEmail: 'owner@example.com',
      phone: '+27000000000'
    });
    expect(tenantState.setActiveCompanyId).toHaveBeenCalledWith('org-1');
    expect(tenantState.refreshTenant).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/org/dashboard', { replace: true });
  });
});
