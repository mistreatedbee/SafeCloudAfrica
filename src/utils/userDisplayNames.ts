import type { UserProfile } from '../api/models/entities';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidLike(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

type ProfileLike = Pick<UserProfile, 'full_name' | 'email' | 'employee_number' | 'user_id'> | null | undefined;

/** Prefer full name, then email, then employee number — never raw user id when a profile exists. */
export function formatUserProfileLabel(profile: ProfileLike, userId?: string | null): string {
  if (profile) {
    const name = profile.full_name?.trim();
    if (name) return name;
    const email = profile.email?.trim();
    if (email) return email;
    const employeeNumber = profile.employee_number?.trim();
    if (employeeNumber) return employeeNumber;
  }

  if (userId && isUuidLike(userId)) return `User ${userId.slice(0, 8)}`;
  if (typeof userId === 'string' && userId.trim()) return userId.trim();
  return 'Unknown user';
}

export function buildProfileLabelMap(profiles: UserProfile[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const profile of profiles) {
    map.set(String(profile.user_id), formatUserProfileLabel(profile));
  }
  return map;
}

export function resolveUserLabel(
  profileMap: Map<string, string>,
  userId: string | null | undefined,
  fallbackName?: string | null
): string {
  if (fallbackName?.trim()) return fallbackName.trim();
  if (!userId) return '—';
  return profileMap.get(String(userId)) ?? formatUserProfileLabel(null, userId);
}

/** Email template fields that commonly hold a user id instead of a display name. */
export const EMAIL_USER_VARIABLE_KEYS = new Set([
  'owner',
  'requester',
  'employee',
  'assignee',
  'inspector',
  'auditor',
  'raisedBy',
  'verifiedBy',
  'responsible',
  'allocatedBy',
  'createdBy',
  'closedBy',
  'reviewer',
  'assignedTo',
  'responsiblePerson',
  'confirmedBy'
]);

export function collectResolvableUserIds(
  variables: Record<string, string | number | boolean | null | undefined> | undefined
): string[] {
  if (!variables) return [];
  const ids = new Set<string>();
  for (const [key, value] of Object.entries(variables)) {
    if (value == null || value === '') continue;
    const str = String(value).trim();
    if (isUuidLike(str) && EMAIL_USER_VARIABLE_KEYS.has(key)) {
      ids.add(str);
    }
  }
  return Array.from(ids);
}

export function applyProfileLabelMap(
  variables: Record<string, string | number | boolean | null | undefined> | undefined,
  nameMap: Map<string, string>
): Record<string, string | number | boolean | null | undefined> {
  if (!variables) return {};
  const resolved = { ...variables };
  for (const [key, value] of Object.entries(resolved)) {
    if (value == null || value === '') continue;
    const str = String(value).trim();
    if (isUuidLike(str) && (EMAIL_USER_VARIABLE_KEYS.has(key) || nameMap.has(str))) {
      resolved[key] = nameMap.get(str) ?? str;
    }
  }
  return resolved;
}
