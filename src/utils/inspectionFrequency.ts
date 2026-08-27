export type InspectionFrequency =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'annually'
  | 'audit-linked'
  | 'ad_hoc';

export const INSPECTION_FREQUENCY_OPTIONS: Array<{ value: InspectionFrequency; label: string }> = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annually', label: 'Annually' },
  { value: 'audit-linked', label: 'Audit-linked' },
  { value: 'ad_hoc', label: 'Ad hoc' }
];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function parseDate(input?: string | Date | null): Date {
  if (!input) return new Date();
  if (input instanceof Date) return input;
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

/** ISO week number (Monday-based). */
function isoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

function quarter(date: Date): number {
  return Math.floor(date.getMonth() / 3) + 1;
}

/** Stable key for grouping runs by frequency period (e.g. 2026-W34, 2026-08, 2026-Q3). */
export function getInspectionPeriodKey(
  frequency: InspectionFrequency | string | null | undefined,
  dateInput?: string | Date | null
): string {
  const date = parseDate(dateInput);
  const year = date.getFullYear();
  const freq = (frequency ?? 'daily') as InspectionFrequency;

  switch (freq) {
    case 'weekly':
      return `${isoWeek(date).year}-W${String(isoWeek(date).week).padStart(2, '0')}`;
    case 'monthly':
      return `${year}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    case 'quarterly':
      return `${year}-Q${quarter(date)}`;
    case 'annually':
      return String(year);
    case 'audit-linked':
      return `audit-${year}`;
    case 'ad_hoc':
      return `adhoc-${date.toISOString().slice(0, 10)}`;
    case 'daily':
    default:
      return date.toISOString().slice(0, 10);
  }
}

/** Human-readable period label for UI. */
export function formatInspectionPeriod(
  frequency: InspectionFrequency | string | null | undefined,
  dateInput?: string | Date | null
): string {
  const date = parseDate(dateInput);
  const freq = (frequency ?? 'daily') as InspectionFrequency;

  switch (freq) {
    case 'weekly': {
      const { year, week } = isoWeek(date);
      return `Week ${week}, ${year}`;
    }
    case 'monthly':
      return date.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
    case 'quarterly':
      return `Q${quarter(date)} ${date.getFullYear()}`;
    case 'annually':
      return String(date.getFullYear());
    case 'audit-linked':
      return `Audit cycle ${date.getFullYear()}`;
    case 'ad_hoc':
      return `Ad hoc — ${date.toLocaleDateString('en-ZA')}`;
    case 'daily':
    default:
      return DAY_NAMES[date.getDay()];
  }
}

export function formatInspectionFrequencyLabel(
  frequency: InspectionFrequency | string | null | undefined
): string {
  const match = INSPECTION_FREQUENCY_OPTIONS.find((o) => o.value === frequency);
  if (match) return match.label;
  if (!frequency) return 'Daily';
  return String(frequency).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
