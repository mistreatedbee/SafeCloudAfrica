/* @vitest-environment jsdom */
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const useUserState = {
  user: { id: 'user-1' },
  isLoaded: true
};

const callOrder: string[] = [];
const ensureInsforgeSessionMock = vi.fn();
const ensureMeAsSuperAdminMock = vi.fn();
const checkPlatformAdminMock = vi.fn();
const upsertMyProfileMock = vi.fn();
const createActivityLogMock = vi.fn();
const membershipsQuery = {
  select: vi.fn(),
  eq: vi.fn()
};

vi.mock('@insforge/react', () => ({
  useUser: () => useUserState
}));

vi.mock('../api/insforge/client', () => ({
  insforgeReady: Promise.resolve(),
  insforge: {
    database: {
      from: vi.fn(() => {
        callOrder.push('from');
        membershipsQuery.select.mockImplementation(() => {
          callOrder.push('select');
          return membershipsQuery;
        });
        membershipsQuery.eq.mockImplementation(async () => {
          callOrder.push('eq');
          return {
            data: [
              {
                company_id: 'company-1',
                role: 'owner',
                status: 'ACTIVE',
                companies: { id: 'company-1', name: 'Safe Cloud Africa' }
              }
            ],
            error: null
          };
        });
        return membershipsQuery;
      })
    }
  }
}));

vi.mock('../api/insforge/ensureSession', () => ({
  ensureInsforgeSession: (...args: unknown[]) => ensureInsforgeSessionMock(...args),
  InsforgeAuthBootstrapError: class InsforgeAuthBootstrapError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
}));

vi.mock('../api/services/platformAdminService', () => ({
  ensureMeAsSuperAdmin: (...args: unknown[]) => ensureMeAsSuperAdminMock(...args),
  isPlatformAdmin: (...args: unknown[]) => checkPlatformAdminMock(...args)
}));

vi.mock('../api/services/activityLogService', () => ({
  createActivityLog: (...args: unknown[]) => createActivityLogMock(...args)
}));

vi.mock('../api/services/profilesService', () => ({
  upsertMyProfile: (...args: unknown[]) => upsertMyProfileMock(...args)
}));

vi.mock('../api/services/orgModulesService', () => ({
  getEnabledModuleKeys: () => []
}));

vi.mock('../api/services/sellableFeaturesService', () => ({
  getSellableFeaturesConfig: () => ({})
}));

import { TenantProvider } from './TenantContext';

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('TenantProvider', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T08:00:00.000Z'));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    callOrder.length = 0;
    ensureInsforgeSessionMock.mockReset();
    ensureMeAsSuperAdminMock.mockReset();
    checkPlatformAdminMock.mockReset();
    upsertMyProfileMock.mockReset();
    createActivityLogMock.mockReset();

    ensureInsforgeSessionMock.mockImplementation(async () => {
      callOrder.push('ensureSession');
      return { accessToken: 'token', userId: 'user-1' };
    });
    ensureMeAsSuperAdminMock.mockImplementation(async () => {
      callOrder.push('ensureMeAsSuperAdmin');
      return { status: 'ok' };
    });
    checkPlatformAdminMock.mockImplementation(async () => {
      callOrder.push('isPlatformAdmin');
      return false;
    });
    upsertMyProfileMock.mockResolvedValue(undefined);
    createActivityLogMock.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await flushAsyncWork();
    });
    container.remove();
    vi.useRealTimers();
  });

  it('rehydrates auth before membership queries on initial tenant load', async () => {
    await act(async () => {
      root.render(
        <TenantProvider>
          <div>tenant child</div>
        </TenantProvider>
      );
      await flushAsyncWork();
    });

    expect(callOrder.indexOf('ensureSession')).toBeLessThan(callOrder.indexOf('from'));
    expect(callOrder).toContain('ensureMeAsSuperAdmin');
  });

  it('rehydrates auth again before background refresh queries', async () => {
    await act(async () => {
      root.render(
        <TenantProvider>
          <div>tenant child</div>
        </TenantProvider>
      );
      await flushAsyncWork();
    });

    callOrder.length = 0;

    await act(async () => {
      vi.setSystemTime(new Date('2026-04-22T08:00:06.000Z'));
      window.dispatchEvent(new Event('focus'));
      await flushAsyncWork();
    });

    expect(callOrder[0]).toBe('ensureSession');
    expect(callOrder).toContain('from');
  });
});
