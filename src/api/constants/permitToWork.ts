export const PERMIT_TYPE_OPTIONS = [
  { value: 'working_at_heights', label: 'Working at Heights' },
  { value: 'hot_work', label: 'Hot Work Permit' },
  { value: 'electrical_work', label: 'Electrical Work Permit' },
  { value: 'loto', label: 'LOTO Permit' },
  { value: 'confined_space', label: 'Confined Space Permit' },
  { value: 'excavation', label: 'Excavation Permit' },
  { value: 'lifting', label: 'Lifting Permit' },
  { value: 'chemical_work', label: 'Chemical Work Permit' },
  { value: 'demolition', label: 'Demolition Permit' },
  { value: 'radiation', label: 'Radiation Permit' },
  { value: 'general', label: 'General Work Permit' }
] as const;

export type PermitType = (typeof PERMIT_TYPE_OPTIONS)[number]['value'];

export const PERMIT_TYPE_LABELS: Record<PermitType, string> = Object.fromEntries(
  PERMIT_TYPE_OPTIONS.map((o) => [o.value, o.label])
) as Record<PermitType, string>;
