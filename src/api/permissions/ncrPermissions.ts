import type { CompanyRole } from '../models/core';
import type { QualityNcr, UUID } from '../models/entities';

const SENIOR_ROLES: CompanyRole[] = ['owner', 'admin', 'manager', 'supervisor'];

export function isSeniorRole(role: CompanyRole | null | undefined): boolean {
  return !!role && SENIOR_ROLES.includes(role);
}

export function isNcrAssignedUser(ncr: QualityNcr, actorUserId: UUID): boolean {
  return (
    ncr.corrective_action_owner_user_id === actorUserId ||
    ncr.auditee_user_id === actorUserId ||
    ncr.auditor_user_id === actorUserId ||
    ncr.raised_by_user_id === actorUserId ||
    ncr.created_by_user_id === actorUserId
  );
}

/** Assigned person or their senior/manager may close an NCR after sign-offs. */
export function canCloseQualityNcr(input: {
  ncr: QualityNcr;
  actorUserId: UUID;
  actorRole: CompanyRole | null | undefined;
}): boolean {
  if (input.ncr.status === 'closed') return false;
  return isSeniorRole(input.actorRole) || isNcrAssignedUser(input.ncr, input.actorUserId);
}

export function canManagerSignOffNcr(actorRole: CompanyRole | null | undefined): boolean {
  return isSeniorRole(actorRole);
}

export function canAuditorVerifyNcr(actorRole: CompanyRole | null | undefined): boolean {
  return actorRole === 'auditor' || actorRole === 'consultant' || isSeniorRole(actorRole);
}

export function canRejectNcrClosure(actorRole: CompanyRole | null | undefined): boolean {
  return isSeniorRole(actorRole) || actorRole === 'auditor' || actorRole === 'consultant';
}

export function canSendNcrForReview(input: {
  ncr: QualityNcr;
  actorUserId: UUID;
  actorRole: CompanyRole | null | undefined;
}): boolean {
  if (input.ncr.status === 'closed') return false;
  return isSeniorRole(input.actorRole) || isNcrAssignedUser(input.ncr, input.actorUserId);
}
