import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolverMocks = vi.hoisted(() => ({
  resolveInviteToken: vi.fn()
}));

const insforgeMocks = vi.hoisted(() => ({
  getServerInsforge: vi.fn(),
  getServiceInsforge: vi.fn(),
  readBearerToken: vi.fn(),
  resolveServerUser: vi.fn(),
  nowIso: vi.fn(() => '2026-05-28T00:00:00.000Z')
}));

vi.mock('../../api/_insforge.js', () => insforgeMocks);
vi.mock('./resolver.js', () => ({
  resolveInviteToken: resolverMocks.resolveInviteToken
}));
vi.mock('../../api/_observability.js', () => ({
  logStructuredLine: vi.fn(),
  sendAlertWebhook: vi.fn()
}));
vi.mock('../../api/_response.js', () => ({
  applyNoStoreHeaders: vi.fn()
}));

type TestResponse = {
  statusCode: number;
  jsonBody: any;
  status: (code: number) => TestResponse;
  json: (body: any) => TestResponse;
};

function createRes(): TestResponse {
  return {
    statusCode: 200,
    jsonBody: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: any) {
      this.jsonBody = body;
      return this;
    }
  };
}

function createServiceClient(invites: any[]) {
  const db = {
    rpc: vi.fn(async () => ({ data: 0, error: null })),
    from: vi.fn((table: string) => {
      const state = { selectValue: '' };
      const chain: any = {
        select(value?: string) {
          state.selectValue = String(value ?? '');
          return chain;
        },
        ilike() {
          return chain;
        },
        order() {
          return chain;
        },
        limit: vi.fn(async () => ({ data: invites, error: null })),
        eq() {
          return chain;
        },
        maybeSingle: vi.fn(async () => {
          if (table === 'companies') return { data: { employee_limit: 10, license_user_limit: 10 }, error: null };
          if (table === 'company_memberships') return { data: null, error: null };
          return { data: null, error: null };
        }),
        insert() {
          if (table === 'activity_logs') return Promise.resolve({ data: null, error: null });
          return chain;
        },
        update() {
          return chain;
        },
        single: vi.fn(async () => {
          if (table === 'company_invites') {
            const invite = invites[0];
            return { data: { id: invite?.id, company_id: invite?.company_id, role: invite?.role }, error: null };
          }
          if (table === 'company_memberships') return { data: { id: 'membership-1' }, error: null };
          return { data: null, error: null };
        })
      };

      if (table === 'company_memberships' && state.selectValue === 'role, status, seat_exempt') {
        chain.eq = vi.fn(async () => ({ data: [], error: null }));
      }

      return chain;
    })
  };
  return { database: db };
}

describe('invite accept handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insforgeMocks.readBearerToken.mockReturnValue('token');
    insforgeMocks.getServerInsforge.mockReturnValue({ auth: {} });
    insforgeMocks.resolveServerUser.mockResolvedValue({ userId: 'user-1', email: 'User@Example.com' });
  });

  it('accept-pending returns 200 no_pending_invite when no pending invite exists', async () => {
    const { acceptPendingInviteHandler } = await import('./acceptHandler.js');
    insforgeMocks.getServiceInsforge.mockReturnValue(createServiceClient([]));
    const res = createRes();

    await acceptPendingInviteHandler({ method: 'POST', headers: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ ok: false, reason: 'no_pending_invite', error: 'No pending invite found.' });
  });

  it('accept-pending finds pending invites case-insensitively', async () => {
    const { acceptPendingInviteHandler } = await import('./acceptHandler.js');
    insforgeMocks.getServiceInsforge.mockReturnValue(createServiceClient([{
      id: 'invite-1',
      company_id: 'company-1',
      email: 'USER@example.com',
      role: 'admin',
      status: 'sent',
      expires_at: '2099-01-01T00:00:00.000Z'
    }]));
    const res = createRes();

    await acceptPendingInviteHandler({ method: 'POST', headers: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ ok: true, orgId: 'company-1', role: 'admin' });
  });

  it('accept falls back to pending email invite when token is not found', async () => {
    const { default: acceptInviteHandler } = await import('./acceptHandler.js');
    resolverMocks.resolveInviteToken.mockResolvedValue({
      ok: false,
      reason: 'not_found',
      status: 404,
      error: 'Invalid invite link.'
    });
    insforgeMocks.getServiceInsforge.mockReturnValue(createServiceClient([{
      id: 'invite-2',
      company_id: 'company-2',
      email: 'user@example.com',
      role: 'employee',
      status: 'PENDING',
      expires_at: '2099-01-01T00:00:00.000Z'
    }]));
    const res = createRes();

    await acceptInviteHandler({ method: 'POST', headers: {}, body: { token: 'stale-token' } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ ok: true, orgId: 'company-2', role: 'employee' });
  });
});
