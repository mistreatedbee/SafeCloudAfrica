import { createHash } from 'node:crypto';

/**
 * Must match the client-side hashToken() in src/api/services/auditsService.ts
 * exactly (plain SHA-256 hex digest) so a token hashed at invite-creation time
 * resolves here at response time.
 */
export function hashAuditInvitationToken(rawToken: string): string {
  return createHash('sha256').update(rawToken.trim()).digest('hex');
}

export type AuditInvitationResponseStatus = 'accepted' | 'declined';

export function isValidResponseStatus(value: unknown): value is AuditInvitationResponseStatus {
  return value === 'accepted' || value === 'declined';
}
