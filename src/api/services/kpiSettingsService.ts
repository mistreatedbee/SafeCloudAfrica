import { insforge } from '../insforge/client';
import type { KPISettings, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';

const DEFAULT_SETTINGS: Omit<KPISettings, 'company_id' | 'created_at' | 'updated_at'> = {
  rate_multiplier_mode: 'SMALL_BUSINESS',
  default_days_worked: 21,
  default_standard_hours_per_day: 8,
  include_contractors_in_stats: false,
  rolling_window_months: 12,
  lti_reset_triggers: ['LTI', 'FATALITY']
};

export function getMultiplier(settings: KPISettings): number {
  return settings.rate_multiplier_mode === 'CORPORATE' ? 1_000_000 : 200_000;
}

export async function getKPISettings(companyId: UUID): Promise<KPISettings | null> {
  const { data, error } = await insforge.database
    .from('kpi_settings')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throw new Error(getErrorMessage(error));
  return data as KPISettings | null;
}

export async function getOrCreateKPISettings(companyId: UUID): Promise<KPISettings> {
  const existing = await getKPISettings(companyId);
  if (existing) return existing;
  return upsertKPISettings(companyId, {});
}

export type UpsertKPISettingsInput = {
  rateMultiplierMode?: 'SMALL_BUSINESS' | 'CORPORATE';
  defaultDaysWorked?: number;
  defaultStandardHoursPerDay?: number;
  includeContractorsInStats?: boolean;
  rollingWindowMonths?: number;
  ltiResetTriggers?: string[];
};

export async function upsertKPISettings(companyId: UUID, input: UpsertKPISettingsInput): Promise<KPISettings> {
  const now = new Date().toISOString();
  const payload = {
    company_id: companyId,
    rate_multiplier_mode: input.rateMultiplierMode ?? DEFAULT_SETTINGS.rate_multiplier_mode,
    default_days_worked: input.defaultDaysWorked ?? DEFAULT_SETTINGS.default_days_worked,
    default_standard_hours_per_day: input.defaultStandardHoursPerDay ?? DEFAULT_SETTINGS.default_standard_hours_per_day,
    include_contractors_in_stats: input.includeContractorsInStats ?? DEFAULT_SETTINGS.include_contractors_in_stats,
    rolling_window_months: input.rollingWindowMonths ?? DEFAULT_SETTINGS.rolling_window_months,
    lti_reset_triggers: input.ltiResetTriggers ?? DEFAULT_SETTINGS.lti_reset_triggers,
    updated_at: now
  };

  const { data, error } = await insforge.database
    .from('kpi_settings')
    .upsert({ ...payload, created_at: payload.updated_at }, { onConflict: 'company_id' })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to upsert KPI settings');
  return data as KPISettings;
}
