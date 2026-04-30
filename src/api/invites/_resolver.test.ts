import { beforeEach, describe, expect, it } from 'vitest';
import { signInviteToken } from '../../../api/invites/_shared';
import { isMalformedInviteToken, toPublicInvitePayload } from '../../../server/invites/resolver';

describe('invite resolver helpers', () => {
  beforeEach(() => {
    process.env.INVITE_SIGNING_SECRET = 'test-invite-signing-secret-1234567890';
  });

  it('rejects blank tokens as malformed', () => {
    expect(isMalformedInviteToken('')).toBe(true);
    expect(isMalformedInviteToken('   ')).toBe(true);
  });

  it('accepts legacy raw invite tokens', () => {
    expect(isMalformedInviteToken('a'.repeat(64))).toBe(false);
  });

  it('accepts legacy non-hex invite tokens', () => {
    expect(isMalformedInviteToken('legacy-token-123')).toBe(false);
    expect(isMalformedInviteToken('11111111-1111-1111-1111-111111111111')).toBe(false);
  });

  it('accepts signed invite tokens', () => {
    const token = signInviteToken({
      inviteId: '11111111-1111-1111-1111-111111111111',
      companyId: '22222222-2222-2222-2222-222222222222',
      email: 'invitee@example.com',
      role: 'employee',
      expiresAtIso: '2026-12-31T00:00:00.000Z'
    });
    expect(isMalformedInviteToken(token)).toBe(false);
  });

  it('normalizes public invite payload fields', () => {
    expect(
      toPublicInvitePayload({
        id: 'invite-1',
        company_id: 'company-1',
        organization_name: 'Safe Cloud Africa',
        email: 'invitee@example.com',
        role: 'employee',
        status: 'pending',
        expires_at: '2026-12-31T00:00:00.000Z'
      })
    ).toEqual({
      id: 'invite-1',
      email: 'invitee@example.com',
      organisation_id: 'company-1',
      company_id: 'company-1',
      role: 'employee',
      expires_at: '2026-12-31T00:00:00.000Z',
      status: 'PENDING',
      organization_name: 'Safe Cloud Africa'
    });
  });
});
