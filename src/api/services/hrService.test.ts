import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn()
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

import {
  canViewRestrictedFields,
  getHrEmployeeById,
  listHrPersonalDocuments,
  searchHrEmployees
} from './hrService';

function makeQuery(result: unknown) {
  const promise = Promise.resolve(result);
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    in: vi.fn(() => query),
    not: vi.fn(() => query),
    is: vi.fn(() => query),
    or: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise)
  };
  return query;
}

describe('hrService session guards', () => {
  beforeEach(() => {
    dbMock.from.mockReset();
    dbMock.rpc.mockReset();
    sessionMock.reasons = [];
    sessionMock.withInsforgeSession.mockClear();
    dbMock.from.mockReturnValue(makeQuery({ data: [], error: null }));
    dbMock.rpc.mockResolvedValue({ data: true, error: null });
  });

  it('rehydrates the session before searching HR employees', async () => {
    await searchHrEmployees('company-1');

    expect(sessionMock.reasons[0]).toBe('hr:employees:search');
    expect(dbMock.from).toHaveBeenCalledWith('hr_employees');
  });

  it('rehydrates the session before loading an HR employee profile', async () => {
    dbMock.from.mockReturnValue(makeQuery({ data: { id: 'employee-1' }, error: null }));

    await getHrEmployeeById('company-1', 'employee-1');

    expect(sessionMock.reasons[0]).toBe('hr:employees:get-by-id');
    expect(dbMock.from).toHaveBeenCalledWith('hr_employees');
  });

  it('rehydrates the session before restricted field checks', async () => {
    await canViewRestrictedFields('company-1');

    expect(sessionMock.reasons[0]).toBe('hr:restricted-fields:can-view');
    expect(dbMock.rpc).toHaveBeenCalledWith('hr_can_view_restricted_fields', { p_company_id: 'company-1' });
  });

  it('rehydrates the session before listing personal HR documents', async () => {
    await listHrPersonalDocuments({
      companyId: 'company-1',
      actorRole: 'admin',
      actorUserId: 'user-1'
    });

    expect(sessionMock.reasons[0]).toBe('hr:personal-documents:list');
    expect(dbMock.from).toHaveBeenCalledWith('hr_employee_documents');
  });
});
