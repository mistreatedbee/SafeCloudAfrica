/* @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tenantState = {
  activeCompanyId: 'company-1',
  isTenantLoaded: false
};

const getLicenseInfoMock = vi.fn();
const isInTrialMock = vi.fn();
const getTrialDaysRemainingMock = vi.fn();

vi.mock('../../tenant/TenantContext', () => ({
  useTenant: () => tenantState
}));

vi.mock('../../api/services/licensingService', () => ({
  getLicenseInfo: (...args: unknown[]) => getLicenseInfoMock(...args),
  isInTrial: (...args: unknown[]) => isInTrialMock(...args),
  getTrialDaysRemaining: (...args: unknown[]) => getTrialDaysRemainingMock(...args)
}));

import { LicenseBanner } from './LicenseBanner';

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('LicenseBanner', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    tenantState.activeCompanyId = 'company-1';
    tenantState.isTenantLoaded = false;
    getLicenseInfoMock.mockReset();
    isInTrialMock.mockReset();
    getTrialDaysRemainingMock.mockReset();
    getLicenseInfoMock.mockResolvedValue({
      type: 'professional_12m',
      status: 'active',
      employeeLimit: 100,
      currentEmployees: 10,
      startDate: '2026-01-01T00:00:00.000Z',
      expiresAt: '2027-01-01T00:00:00.000Z',
      daysRemaining: 200,
      isExpired: false,
      isTrialExpired: false,
      canAddEmployees: true,
      features: {}
    });
    isInTrialMock.mockResolvedValue(false);
    getTrialDaysRemainingMock.mockResolvedValue(0);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await flushAsyncWork();
    });
    container.remove();
  });

  it('waits for tenant load before loading license data', async () => {
    await act(async () => {
      root.render(<LicenseBanner />);
      await flushAsyncWork();
    });

    expect(getLicenseInfoMock).not.toHaveBeenCalled();

    tenantState.isTenantLoaded = true;
    await act(async () => {
      root.render(<LicenseBanner />);
      await flushAsyncWork();
    });

    expect(getLicenseInfoMock).toHaveBeenCalledWith('company-1');
  });
});
