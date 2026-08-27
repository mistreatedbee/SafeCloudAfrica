import { describe, expect, it } from 'vitest';
import {
  formatInspectionPeriod,
  getInspectionPeriodKey,
  formatInspectionFrequencyLabel
} from './inspectionFrequency';

describe('inspectionFrequency', () => {
  it('formats daily period as day of week', () => {
    expect(formatInspectionPeriod('daily', '2026-08-27')).toBe('Thursday');
  });

  it('formats monthly period', () => {
    expect(formatInspectionPeriod('monthly', '2026-08-27')).toMatch(/August 2026/);
  });

  it('formats quarterly period', () => {
    expect(formatInspectionPeriod('quarterly', '2026-08-27')).toBe('Q3 2026');
  });

  it('formats annual period', () => {
    expect(formatInspectionPeriod('annually', '2026-08-27')).toBe('2026');
  });

  it('builds stable period keys', () => {
    expect(getInspectionPeriodKey('weekly', '2026-08-27')).toMatch(/^\d{4}-W\d{2}$/);
    expect(getInspectionPeriodKey('quarterly', '2026-08-27')).toBe('2026-Q3');
    expect(getInspectionPeriodKey('monthly', '2026-08-27')).toBe('2026-08');
  });

  it('labels frequency values', () => {
    expect(formatInspectionFrequencyLabel('quarterly')).toBe('Quarterly');
  });
});
