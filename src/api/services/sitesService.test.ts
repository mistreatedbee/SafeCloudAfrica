import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = vi.hoisted(() => ({
  from: vi.fn()
}));

const activityMock = vi.hoisted(() => ({
  createActivityLog: vi.fn()
}));

const sessionMock = vi.hoisted(() => ({
  reasons: [] as string[],
  withInsforgeSession: vi.fn(async (reason: string, fn: () => Promise<unknown>) => {
    sessionMock.reasons.push(reason);
    return fn();
  })
}));

vi.mock('../insforge/client', () => ({
  insforge: {
    database: dbMock
  }
}));

vi.mock('../insforge/ensureSession', () => ({
  withInsforgeSession: sessionMock.withInsforgeSession
}));

vi.mock('./activityLogService', () => ({
  createActivityLog: activityMock.createActivityLog
}));

import { createSite, deleteSite, updateSite } from './sitesService';

function makeQuery(result: unknown) {
  const promise = Promise.resolve(result);
  const query: any = {
    insert: vi.fn(() => query),
    update: vi.fn(() => query),
    delete: vi.fn(() => query),
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    single: vi.fn(async () => result),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise)
  };
  return query;
}

describe('sitesService session guards', () => {
  beforeEach(() => {
    dbMock.from.mockReset();
    activityMock.createActivityLog.mockReset();
    activityMock.createActivityLog.mockResolvedValue(undefined);
    sessionMock.reasons = [];
    sessionMock.withInsforgeSession.mockClear();
    dbMock.from.mockReturnValue(makeQuery({ data: { id: 'site-1' }, error: null }));
  });

  it('rehydrates the session before creating a site', async () => {
    await createSite({ companyId: 'company-1', name: 'Main', actorUserId: 'user-1' });

    expect(sessionMock.reasons[0]).toBe('sites:create');
  });

  it('rehydrates the session before updating a site', async () => {
    await updateSite({
      companyId: 'company-1',
      siteId: 'site-1',
      patch: { name: 'HQ' },
      actorUserId: 'user-1'
    });

    expect(sessionMock.reasons[0]).toBe('sites:update');
  });

  it('rehydrates the session before deleting a site', async () => {
    dbMock.from.mockReturnValue(makeQuery({ error: null }));

    await deleteSite({ companyId: 'company-1', siteId: 'site-1', actorUserId: 'user-1' });

    expect(sessionMock.reasons[0]).toBe('sites:delete');
  });
});
