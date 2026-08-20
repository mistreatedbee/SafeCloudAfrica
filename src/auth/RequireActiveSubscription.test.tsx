/* @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tenantState = {
  activeCompanyId: 'company-1',
  isPlatformAdmin: false,
  isTenantLoaded: false
};

const withInsforgeSessionMock = vi.fn(async (_reason: string, fn: () => Promise<unknown>) => fn());
const maybeSingleMock = vi.fn();
const limitMock = vi.fn();

vi.mock('../tenant/TenantContext', () => ({
  useTenant: () => tenantState
}));

vi.mock('../api/insforge/ensureSession', () => ({
  withInsforgeSession: (...args: Parameters<typeof withInsforgeSessionMock>) => withInsforgeSessionMock(...args)
}));

vi.mock('../api/insforge/client', () => ({
  insforge: {
    database: {
      from: vi.fn((table: string) => {
        if (table === 'companies') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: maybeSingleMock
              })
            })
          };
        }
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: limitMock
              })
            })
          })
        };
      })
    }
  }
}));

import { RequireActiveSubscription } from './RequireActiveSubscription';

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('RequireActiveSubscription', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    tenantState.activeCompanyId = 'company-1';
    tenantState.isPlatformAdmin = false;
    tenantState.isTenantLoaded = false;
    withInsforgeSessionMock.mockClear();
    maybeSingleMock.mockResolvedValue({ data: { status: 'active' }, error: null });
    limitMock.mockResolvedValue({ data: [], error: null });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await flushAsyncWork();
    });
    container.remove();
  });

  it('waits for tenant load before checking subscription state', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/app']}>
          <RequireActiveSubscription>
            <div>workspace</div>
          </RequireActiveSubscription>
        </MemoryRouter>
      );
      await flushAsyncWork();
    });

    expect(withInsforgeSessionMock).not.toHaveBeenCalled();

    tenantState.isTenantLoaded = true;
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/app']}>
          <RequireActiveSubscription>
            <div>workspace</div>
          </RequireActiveSubscription>
        </MemoryRouter>
      );
      await flushAsyncWork();
    });

    expect(withInsforgeSessionMock).toHaveBeenCalledWith('subscription:active-check', expect.any(Function));
  });
});
