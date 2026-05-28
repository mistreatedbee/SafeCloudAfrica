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

import { createDepartment, deleteDepartment, updateDepartment } from './departmentsService';

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

describe('departmentsService session guards', () => {
  beforeEach(() => {
    dbMock.from.mockReset();
    activityMock.createActivityLog.mockReset();
    activityMock.createActivityLog.mockResolvedValue(undefined);
    sessionMock.reasons = [];
    sessionMock.withInsforgeSession.mockClear();
    dbMock.from.mockReturnValue(makeQuery({ data: { id: 'department-1' }, error: null }));
  });

  it('rehydrates the session before creating a department', async () => {
    await createDepartment({ companyId: 'company-1', name: 'HR', actorUserId: 'user-1' });

    expect(sessionMock.reasons[0]).toBe('departments:create');
  });

  it('rehydrates the session before updating a department', async () => {
    await updateDepartment({
      companyId: 'company-1',
      departmentId: 'department-1',
      patch: { name: 'People' },
      actorUserId: 'user-1'
    });

    expect(sessionMock.reasons[0]).toBe('departments:update');
  });

  it('rehydrates the session before deleting a department', async () => {
    dbMock.from.mockReturnValue(makeQuery({ error: null }));

    await deleteDepartment({ companyId: 'company-1', departmentId: 'department-1', actorUserId: 'user-1' });

    expect(sessionMock.reasons[0]).toBe('departments:delete');
  });
});
