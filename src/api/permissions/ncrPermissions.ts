import type { CompanyRole } from '../models/core';
import type { QualityNcr, UUID } from '../models/entities';

const SENIOR_ROLES: CompanyRole[] = ['owner', 'admin', 'manager', 'supervisor'];

export const EXTERNAL_AUDIT_TYPES = new Set(['external', 'client', 'supplier', 'certification']);

const AUDIT_NCR_SOURCES = new Set(['audit', 'audit_finding', 'program_audit_finding']);

/** External/client/supplier/certification audit NCRs require auditor verification before close. */
export function ncrRequiresAuditorVerification(ncr: QualityNcr, linkedAuditType?: string | null): boolean {
  const source = String(ncr.source_entity_type ?? '').toLowerCase();
  if (!AUDIT_NCR_SOURCES.has(source)) return false;
  const auditType = String(linkedAuditType ?? '').toLowerCase();
  if (!auditType) return false;
  return EXTERNAL_AUDIT_TYPES.has(auditType);
}

export function ncrClosureSignoffMessage(ncr: QualityNcr, linkedAuditType?: string | null): string {
  if (ncrRequiresAuditorVerification(ncr, linkedAuditType)) {
    return 'Awaiting auditor verification (required for external audits).';
  }
  return 'Manager sign-off complete. Upload closure evidence, then close the NCR.';
}

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

export function canAuditorVerifyNcr(input: {
  ncr: QualityNcr;
  actorUserId: UUID;
  actorRole: CompanyRole | null | undefined;
}): boolean {
  if (input.actorRole === 'auditor' || input.actorRole === 'consultant') return true;
  return isSeniorRole(input.actorRole) || isNcrAssignedUser(input.ncr, input.actorUserId);
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
