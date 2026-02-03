// Safe Cloud Africa Color Palette
// ISO-aligned safety management system colors

export const colors = {
  // Primary Colors - Trust, professionalism, governance
  navy: {
    DEFAULT: '#0A2540',
    50: '#E8EDF2',
    100: '#C5D1DE',
    200: '#9FB3C7',
    300: '#7895B0',
    400: '#5A7D9E',
    500: '#3D658C',
    600: '#2A4D73',
    700: '#1A3A5C',
    800: '#0A2540',
    900: '#061829'
  },

  // Teal - Safety, systems, technology
  teal: {
    DEFAULT: '#0FB9B1',
    50: '#E6F9F8',
    100: '#B3EDEA',
    200: '#80E1DC',
    300: '#4DD5CE',
    400: '#26CBC3',
    500: '#0FB9B1',
    600: '#0D9A94',
    700: '#0A7B77',
    800: '#085C5A',
    900: '#053D3C'
  },

  // Success Green - Compliance, completed tasks
  success: {
    DEFAULT: '#2ECC71',
    light: '#E9F9EF',
    dark: '#1C8449'
  },

  // Warning Amber - Alerts, reminders, overdue
  warning: {
    DEFAULT: '#F5A623',
    light: '#FEF6E6',
    dark: '#AD6E15'
  },

  // Critical Red - Incidents, non-conformances, high risk
  critical: {
    DEFAULT: '#E74C3C',
    light: '#FDEDEB',
    dark: '#9B3026'
  },

  // Neutral Colors
  charcoal: '#2E2E2E',
  surface: '#F4F6F8',
  white: '#FFFFFF'
} as const;

// Risk matrix colors (5x5 grid)
export const riskColors = {
  critical: '#E74C3C', // 20-25 (Red)
  high: '#F39C12', // 15-19 (Orange)
  medium: '#F5A623', // 10-14 (Amber)
  low: '#2ECC71', // 5-9 (Green)
  minimal: '#27AE60' // 1-4 (Dark Green)
} as const;

// Status colors for badges
export const statusColors = {
  completed: { bg: '#E9F9EF', text: '#1C8449', border: '#2ECC71' },
  inProgress: { bg: '#E6F9F8', text: '#0A7B77', border: '#0FB9B1' },
  pending: { bg: '#FEF6E6', text: '#AD6E15', border: '#F5A623' },
  overdue: { bg: '#FDEDEB', text: '#9B3026', border: '#E74C3C' },
  draft: { bg: '#F5F5F5', text: '#616161', border: '#BDBDBD' }
} as const;

// Module colors for identification
export const moduleColors = {
  safety: '#0FB9B1',
  quality: '#3498DB',
  environment: '#2ECC71',
  health: '#E74C3C',
  legal: '#9B59B6',
  hr: '#F5A623',
  security: '#0A2540',
  general: '#7895B0'
} as const;