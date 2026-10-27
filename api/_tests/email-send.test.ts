import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveRequestActor: vi.fn(),
  sendTransactionalEmail: vi.fn()
}));

vi.mock('../_insforge.js', () => ({
  resolveRequestActor: mocks.resolveRequestActor
}));

vi.mock('../email/_shared.js', () => ({
  sendTransactionalEmail: mocks.sendTransactionalEmail
}));

function createRes() {
  const res: any = {
    statusCode: 0,
    body: undefined as any,
    headers: {} as Record<string, string>,
    setHeader(key: string, value: string) {
      res.headers[key] = value;
    },
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

describe('api/email/send handler', () => {
  beforeEach(() => {
    mocks.resolveRequestActor.mockReset();
    mocks.sendTransactionalEmail.mockReset();
  });

  it('rejects unauthenticated requests without sending email', async () => {
    mocks.resolveRequestActor.mockResolvedValue({ userId: null, organizationId: null });

    const { default: handler } = await import('../email/send.js');
    const req = { method: 'POST', body: { to: 'victim@example.com', subject: 'hi' } };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ ok: false });
    expect(mocks.sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it('sends email for an authenticated actor', async () => {
    mocks.resolveRequestActor.mockResolvedValue({ userId: 'user-1', organizationId: 'org-1' });
    mocks.sendTransactionalEmail.mockResolvedValue({ ok: true });

    const { default: handler } = await import('../email/send.js');
    const req = { method: 'POST', body: { to: 'teammate@example.com', subject: 'hi' } };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mocks.sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ actor: { userId: 'user-1', organizationId: 'org-1' } })
    );
  });

  it('rejects non-POST methods', async () => {
    mocks.resolveRequestActor.mockResolvedValue({ userId: 'user-1', organizationId: 'org-1' });

    const { default: handler } = await import('../email/send.js');
    const req = { method: 'GET', body: {} };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(405);
    expect(mocks.sendTransactionalEmail).not.toHaveBeenCalled();
  });
});
