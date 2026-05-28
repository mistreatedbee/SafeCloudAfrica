/* @vitest-environment jsdom */
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const signUpMock = vi.fn();
const routerState = vi.hoisted(() => ({
  searchParams: new URLSearchParams()
}));

vi.mock('react-router-dom', () => ({
  Link: ({ children }: { children: React.ReactNode }) => React.createElement('a', null, children),
  useSearchParams: () => [routerState.searchParams]
}));

vi.mock('../../components/auth/AuthShell', () => ({
  AuthShell: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children)
}));

vi.mock('../../api/insforge/client', () => ({
  insforgeReady: Promise.resolve(),
  insforge: {
    auth: {
      signUp: (...args: unknown[]) => signUpMock(...args)
    }
  }
}));

import { RegisterPage } from './RegisterPage';

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function fillInput(container: HTMLDivElement, selector: string, value: string): Promise<void> {
  const input = container.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`Input ${selector} did not render.`);
  await act(async () => {
    Simulate.change(input, { target: { value } } as any);
    await flushAsyncWork();
  });
}

async function submitForm(container: HTMLDivElement): Promise<void> {
  const form = container.querySelector<HTMLFormElement>('form');
  if (!form) throw new Error('Register form did not render.');
  await act(async () => {
    Simulate.submit(form);
    await flushAsyncWork();
    await flushAsyncWork();
  });
}

describe('RegisterPage', () => {
  let container: HTMLDivElement;
  let root: Root;
  let replaceMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    routerState.searchParams = new URLSearchParams('redirect=/app');
    localStorage.clear();
    sessionStorage.clear();

    signUpMock.mockReset();
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

  it('continues to the safe redirect path when signup returns an access token', async () => {
    signUpMock.mockResolvedValue({ data: { accessToken: 'token-1' }, error: null });

    await act(async () => {
      root.render(<RegisterPage />);
      await flushAsyncWork();
    });
    await fillInput(container, '#register-name', 'Test User');
    await fillInput(container, '#register-email', 'test@example.com');
    await fillInput(container, '#register-password', 'password-1');
    await submitForm(container);

    expect(signUpMock).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password-1',
      name: 'Test User',
      redirectTo: 'http://localhost/login'
    });
    expect(replaceMock).toHaveBeenCalledWith('/app');
  });
});
