/* @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMock = vi.fn();
const fetchWithInsforgeAuthMock = vi.fn();
const ensureInsforgeSessionMock = vi.fn();

vi.mock('../insforge/client', () => ({
  insforge: {
    database: {
      rpc: (...args: unknown[]) => rpcMock(...args),
      from: vi.fn()
    }
  }
}));

vi.mock('../insforge/authenticatedFetch', () => ({
  fetchWithInsforgeAuth: (...args: unknown[]) => fetchWithInsforgeAuthMock(...args)
}));

vi.mock('../insforge/ensureSession', () => ({
  ensureInsforgeSession: (...args: unknown[]) => ensureInsforgeSessionMock(...args),
  withInsforgeSession: vi.fn()
}));

import { acceptInviteByToken, validateInvitationToken } from './tenantService';

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    statusText: ''
  } as Response;
}

describe('tenantService invite API fallback behavior', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fetchWithInsforgeAuthMock.mockReset();
    ensureInsforgeSessionMock.mockReset();
    ensureInsforgeSessionMock.mockResolvedValue({ accessToken: 'token', userId: 'user-1' });
    vi.stubGlobal('fetch', vi.fn());
  });

  it('does not call legacy invite token RPCs when validation API route is unavailable', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(404, {}));

    const result = await validateInvitationToken('invite-token-1');

    expect(result).toEqual({ code: 'BACKEND_UNAVAILABLE', invite: null });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('does not fall back to client-side membership writes when token acceptance route is unavailable', async () => {
    fetchWithInsforgeAuthMock.mockResolvedValue(jsonResponse(404, {}));

    await expect(acceptInviteByToken({ token: 'invite-token-1', userId: 'user-1' }))
      .rejects
      .toThrow('INVITE_BACKEND_UNAVAILABLE');
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
