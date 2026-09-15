import { describe, expect, it } from 'vitest';
import { computeHours, type UpsertWorkHoursMonthlyInput } from './workHoursMonthlyService';

const baseInput: UpsertWorkHoursMonthlyInput = {
  companyId: 'company-1',
  year: 2026,
  month: 9,
  totalEmployees: 10,
  salariedEmployees: 10,
  wageEmployees: 0,
  standardHoursPerDay: 9,
  daysWorked: 21.75,
  employeeAbsentHours: 18,
  createdByUserId: 'user-1'
};

describe('computeHours', () => {
  it('matches the client-confirmed formula: 10 x 9 x 21.75 - 18 = 1939.5', () => {
    const result = computeHours(baseInput);
    expect(result.salariedHoursCalculated).toBeCloseTo(1957.5, 5);
    expect(result.absentHours).toBe(18);
    expect(result.totalHoursWorkedFinal).toBeCloseTo(1939.5, 5);
  });

  it('deducts absent hours as a flat amount, not multiplied by headcount or days again', () => {
    // Splitting headcount across salaried/wage must not change the gross or the deduction.
    const split = computeHours({
      ...baseInput,
      salariedEmployees: 4,
      wageEmployees: 6
    });
    expect(split.salariedHoursCalculated + split.wageHoursCalculated).toBeCloseTo(1957.5, 5);
    expect(split.absentHours).toBe(18);
    expect(split.totalHoursWorkedFinal).toBeCloseTo(1939.5, 5);
  });

  it('falls back to absentDays x hours_per_day only when no explicit absent hours are given', () => {
    const result = computeHours({
      ...baseInput,
      employeeAbsentHours: undefined,
      employeeAbsentDays: 2
    });
    expect(result.absentHours).toBe(18); // 2 days x 9 hours/day
    expect(result.totalHoursWorkedFinal).toBeCloseTo(1939.5, 5);
  });

  it('never lets the total go negative', () => {
    const result = computeHours({
      ...baseInput,
      salariedEmployees: 1,
      standardHoursPerDay: 1,
      daysWorked: 1,
      employeeAbsentHours: 1000
    });
    expect(result.totalHoursWorkedFinal).toBe(0);
  });
});
