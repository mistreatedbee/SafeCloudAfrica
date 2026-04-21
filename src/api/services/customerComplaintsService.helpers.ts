import type { CustomerComplaintStatus, UUID } from '../models/entities';

export function normalizeComplaintClosedAt(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  if (trimmed.includes('T')) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T00:00:00.000Z`;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString();
}

export function resolveComplaintClosureFields(input: {
  nextStatus: CustomerComplaintStatus;
  actorUserId: UUID;
  actionTaken?: string | null;
  existingActionTaken?: string | null;
  closedAt?: string | null;
  existingClosedAt?: string | null;
  closedByUserId?: UUID | null;
  existingClosedByUserId?: UUID | null;
  nowIso?: string;
}): {
  actionTaken: string | null;
  closedAt: string | null;
  closedByUserId: UUID | null;
} {
  if (input.nextStatus !== 'CLOSED') {
    return {
      actionTaken: input.actionTaken?.trim() || input.existingActionTaken?.trim() || null,
      closedAt: null,
      closedByUserId: null
    };
  }

  const actionTaken = String(input.actionTaken ?? input.existingActionTaken ?? '').trim();
  if (!actionTaken) throw new Error('Action taken is required before closing a complaint.');

  const normalizedClosedAt =
    normalizeComplaintClosedAt(input.closedAt) ??
    normalizeComplaintClosedAt(input.existingClosedAt) ??
    input.nowIso ??
    new Date().toISOString();

  return {
    actionTaken,
    closedAt: normalizedClosedAt,
    closedByUserId: input.closedByUserId ?? input.existingClosedByUserId ?? input.actorUserId
  };
}
