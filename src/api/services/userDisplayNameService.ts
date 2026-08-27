import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import type { UserProfile, UUID } from '../models/entities';
import {
  applyProfileLabelMap,
  collectResolvableUserIds,
  formatUserProfileLabel,
  isUuidLike
} from '../../utils/userDisplayNames';

export { formatUserProfileLabel, isUuidLike };

export async function fetchUserDisplayNameMap(
  companyId: UUID,
  userIds: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(userIds.filter((id): id is string => Boolean(id) && isUuidLike(id))));
  if (unique.length === 0) return new Map();

  const { data, error } = await insforge.database
    .from('user_profiles')
    .select('user_id, full_name, email, employee_number')
    .eq('company_id', companyId)
    .in('user_id', unique);
  if (error) throw new Error(getErrorMessage(error));

  const map = new Map<string, string>();
  for (const row of (data ?? []) as UserProfile[]) {
    map.set(String(row.user_id), formatUserProfileLabel(row));
  }
  for (const id of unique) {
    if (!map.has(id)) map.set(id, formatUserProfileLabel(null, id));
  }
  return map;
}

export async function resolveUserDisplayName(companyId: UUID, userId: string | null | undefined): Promise<string> {
  if (!userId) return '—';
  if (!isUuidLike(userId)) return userId;
  const map = await fetchUserDisplayNameMap(companyId, [userId]);
  return map.get(userId) ?? formatUserProfileLabel(null, userId);
}

export async function resolveEmailVariablesUserNames(
  companyId: UUID,
  variables?: Record<string, string | number | boolean | null | undefined>
): Promise<Record<string, string | number | boolean | null | undefined>> {
  const ids = collectResolvableUserIds(variables);
  if (ids.length === 0) return variables ?? {};
  const nameMap = await fetchUserDisplayNameMap(companyId, ids);
  return applyProfileLabelMap(variables, nameMap);
}
