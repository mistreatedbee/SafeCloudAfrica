import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

const insforgeMocks = vi.hoisted(() => ({
  getServiceInsforge: vi.fn(),
  nowIso: vi.fn(() => '2026-10-27T00:00:00.000Z')
}));

vi.mock('../../api/_insforge.js', () => insforgeMocks);
vi.mock('../../api/_observability.js', () => ({
  logStructuredLine: vi.fn(),
  sendAlertWebhook: vi.fn()
}));
vi.mock('../../api/_response.js', () => ({
  applyNoStoreHeaders: vi.fn()
}));

function hashToken(token: string): string {
  return createHash('sha256').update(token.trim()).digest('hex');
}

function createRes() {
  const res: any = {
    statusCode: 0,
    body: undefined as any,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    }
  };
  return res;
}

function createServiceClient(options: {
  invitation: any;
  audit: any;
}) {
  const state = { invitation: options.invitation, audit: options.audit };
  const db = {
    from: vi.fn((table: string) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => {
          if (table === 'audit_invitation_tokens') return { data: state.invitation, error: null };
          if (table === 'audits') return { data: state.audit, error: null };
          return { data: null, error: null };
        }),
        update: vi.fn((patch: Record<string, unknown>) => {
          if (table === 'audit_invitation_tokens') state.invitation = { ...state.invitation, ...patch };
          if (table === 'audits') state.audit = { ...state.audit, ...patch };
          return chain;
        }),
        insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
        single: vi.fn(async () => {
          if (table === 'audit_invitation_tokens') return { data: state.invitation, error: null };
          if (table === 'audits') return { data: state.audit, error: null };
          return { data: null, error: null };
        })
      };
      return chain;
    })
  };
  return { database: db };
}

describe('server/audits/respondInvitationHandler', () => {
  beforeEach(() => {
    insforgeMocks.getServiceInsforge.mockReset();
  });

  it('rejects a missing token', async () => {
    const { default: handler } = await import('./respondInvitationHandler.js');
    const req = { method: 'POST', body: { responseStatus: 'accepted' } };
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects an invalid responseStatus', async () => {
    const { default: handler } = await import('./respondInvitationHandler.js');
    const req = { method: 'POST', body: { token: 'tok', responseStatus: 'maybe' } };
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when the token does not resolve to any invitation', async () => {
    insforgeMocks.getServiceInsforge.mockReturnValue(
      createServiceClient({ invitation: null, audit: null })
    );
    const { default: handler } = await import('./respondInvitationHandler.js');
    const req = { method: 'POST', body: { token: 'unknown-token', responseStatus: 'accepted' } };
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('accepts a valid token and schedules the audit', async () => {
    const plainToken = 'external-invite-token';
    const invitation = {
      id: 'inv-1',
      audit_id: 'audit-1',
      company_id: 'company-1',
      invitee_email: 'auditee@example.com',
      token_hash: hashToken(plainToken),
      response_status: 'pending',
      expires_at: '2099-01-01T00:00:00.000Z'
    };
    const audit = {
      id: 'audit-1',
      company_id: 'company-1',
      created_by_user_id: 'creator-1',
      approved_by_user_id: null
    };
    insforgeMocks.getServiceInsforge.mockReturnValue(createServiceClient({ invitation, audit }));

    const { default: handler } = await import('./respondInvitationHandler.js');
    const req = {
      method: 'POST',
      body: { token: plainToken, responseStatus: 'accepted', selectedDate: '2026-11-01' }
    };
    const res = createRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.audit.status).toBe('scheduled');
    expect(res.body.audit.date_approval_status).toBe('approved');
  });

  it('rejects a token that has already been responded to', async () => {
    const plainToken = 'already-used-token';
    const invitation = {
      id: 'inv-2',
      audit_id: 'audit-2',
      company_id: 'company-1',
      token_hash: hashToken(plainToken),
      response_status: 'accepted',
      expires_at: '2099-01-01T00:00:00.000Z'
    };
    insforgeMocks.getServiceInsforge.mockReturnValue(
      createServiceClient({ invitation, audit: { id: 'audit-2', company_id: 'company-1' } })
    );

    const { default: handler } = await import('./respondInvitationHandler.js');
    const req = { method: 'POST', body: { token: plainToken, responseStatus: 'declined' } };
    const res = createRes();
    await handler(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body.reason).toBe('already_responded');
  });

  it('rejects a method other than POST', async () => {
    const { default: handler } = await import('./respondInvitationHandler.js');
    const req = { method: 'GET', body: {} };
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });
});
