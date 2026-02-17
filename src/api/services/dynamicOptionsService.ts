/**
 * DynamicOptions service: list and upsert options for "Select OR Type" dropdowns.
 * Options are company-scoped; built-in lists can be merged with dynamic options per field.
 */

import { insforge } from '../insforge/client';
import type { DynamicOption, UUID } from '../models/entities';
import { INCIDENT_CATEGORY_SUBCATEGORIES } from '../models/core';
import type { IncidentCategory } from '../models/core';
import { getErrorMessage } from '../insforge/errors';

export type ListOptionsInput = {
  companyId: UUID;
  moduleKey: string;
  fieldKey: string;
  /** If set, filter by status; otherwise return approved only for dropdowns. */
  status?: 'approved' | 'pending' | null;
};

export type OptionItem = { id: string; value: string; label: string };

/**
 * List dynamic options for a (company, module, field). Returns approved by default.
 * Caller merges with built-in options (see getBuiltInOptions / getMergedOptions).
 */
export async function listOptions(input: ListOptionsInput): Promise<DynamicOption[]> {
  let q = insforge.database
    .from('dynamic_options')
    .select('*')
    .eq('company_id', input.companyId)
    .eq('module_key', input.moduleKey)
    .eq('field_key', input.fieldKey)
    .order('usage_count', { ascending: false })
    .order('value', { ascending: true });

  if (input.status === undefined) {
    q = q.eq('status', 'approved');
  } else if (input.status !== null) {
    q = q.eq('status', input.status);
  }
  // status === null: return all (e.g. for duplicate check in upsert)

  const { data, error } = await q;
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as DynamicOption[];
}

/**
 * Field registry: built-in option lists and whether to merge with dynamic options.
 * Keys: moduleKey_fieldKey (or fieldKey only where module is implied).
 */
const BUILT_IN_OPTIONS: Record<string, readonly string[]> = {
  // incidents - subcategory is per-category, resolved in getBuiltInOptionsForIncidentSubcategory
  incidentType: ['Near Miss', 'Accident', 'Crime', 'Environmental impact', 'Equipment failure', 'Financial', 'Human resource occurrence', 'Industry specific incident', 'Natural event', 'Non conformance', 'Product interruption', 'Resource wastage', 'Other'],
  lossTypes: ['production loss', 'financial loss', 'reputational loss', 'damage', 'illness', 'injury', 'asset loss', 'civil liability', 'criminal liability', 'vicarious liability', 'sub-standard quality product/service'],
  ppeIssueReason: ['New Issue', 'Replacement (Torn)', 'Replacement (Lost)', 'Replacement (Expired)', 'Replacement (Incorrect Size)', 'Damage', 'Non-compliance Correction', 'Other'],
  ncrSource: ['audit', 'inspection', 'incident', 'risk_assessment', 'management_review', 'complaint'],
};

/** Get built-in options for a field (no merge with DB). */
export function getBuiltInOptions(moduleKey: string, fieldKey: string): string[] {
  const key = fieldKey === 'incidentType' ? 'incidentType' : fieldKey === 'ppeIssueReason' ? 'ppeIssueReason' : fieldKey === 'ncrSource' ? 'ncrSource' : fieldKey === 'lossTypes' ? 'lossTypes' : fieldKey;
  const list = BUILT_IN_OPTIONS[key];
  return list ? [...list] : [];
}

/** Incident subcategory built-ins are per category; pass category to get list. */
export function getBuiltInOptionsForIncidentSubcategory(category: string): string[] {
  const sub = INCIDENT_CATEGORY_SUBCATEGORIES[category as IncidentCategory];
  return sub ? [...sub] : [];
}

/**
 * Get merged options for dropdown: built-in + dynamic (approved), deduplicated by value (case-insensitive).
 */
export async function getMergedOptions(
  input: ListOptionsInput,
  builtInValues: string[]
): Promise<OptionItem[]> {
  const dynamic = await listOptions(input);
  const seen = new Set<string>();
  const result: OptionItem[] = [];

  for (const v of builtInValues) {
    const key = v.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push({ id: `builtin:${key}`, value: v.trim(), label: v.trim() });
  }
  for (const row of dynamic) {
    const key = row.value.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push({ id: row.id, value: row.value, label: row.value });
  }
  return result;
}

export type UpsertOptionInput = {
  companyId: UUID;
  moduleKey: string;
  fieldKey: string;
  value: string;
  createdByUserId?: UUID | null;
};

const MIN_LENGTH = 2;
const MAX_LENGTH = 200;

/**
 * Add or reuse a dynamic option. Trims value; validates length; case-insensitive duplicate check.
 * On conflict (same company/module/field/lower(value)) increments usage_count and returns existing row.
 */
export async function upsertOption(input: UpsertOptionInput): Promise<DynamicOption> {
  const trimmed = input.value.trim();
  if (trimmed.length < MIN_LENGTH) throw new Error(`Value must be at least ${MIN_LENGTH} characters.`);
  if (trimmed.length > MAX_LENGTH) throw new Error(`Value must be at most ${MAX_LENGTH} characters.`);

  const existingList = await listOptions({
    companyId: input.companyId,
    moduleKey: input.moduleKey,
    fieldKey: input.fieldKey,
    status: null
  });
  const existing = existingList.find((r) => r.value.trim().toLowerCase() === trimmed.toLowerCase());
  if (existing) {
    await insforge.database
      .from('dynamic_options')
      .update({ usage_count: (existing.usage_count ?? 0) + 1 })
      .eq('id', existing.id);
    return { ...existing, usage_count: (existing.usage_count ?? 0) + 1 };
  }

  const { data, error } = await insforge.database
    .from('dynamic_options')
    .insert({
      company_id: input.companyId,
      module_key: input.moduleKey,
      field_key: input.fieldKey,
      value: trimmed,
      status: 'approved',
      created_by_user_id: input.createdByUserId ?? null,
      usage_count: 1
    })
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create dynamic option.');
  return data as DynamicOption;
}

/**
 * Resolve display value for a record: use denormalized display field, or option label, or custom value.
 */
export function resolveDisplayValue(
  record: { subcategory?: string | null; subcategory_custom_text?: string | null; [k: string]: unknown },
  fieldKey: string
): string {
  if (fieldKey === 'incidentSubcategory' || fieldKey === 'subcategory') {
    return (record.subcategory ?? record.subcategory_custom_text ?? '').toString().trim() || '';
  }
  const display = record[fieldKey] ?? record[`${fieldKey}_name`] ?? record[`${fieldKey}CustomText`];
  return (display ?? '').toString().trim();
}
