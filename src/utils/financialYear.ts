/**
 * South African financial year: 1 March to end of February. FY "2025/26" runs
 * 1 Mar 2025 - 28/29 Feb 2026, and is the FY containing any date from 1 Mar 2025
 * through end Feb 2026 inclusive.
 */
export type FinancialYearOption = {
  /** Starting calendar year, e.g. 2025 for FY 2025/26. */
  startYear: number;
  label: string;
  /** Inclusive, YYYY-MM-DD. */
  fromDate: string;
  /** Inclusive, YYYY-MM-DD (28 or 29 Feb depending on leap year). */
  toDate: string;
};

function lastDayOfFebruary(calendarYear: number): number {
  // calendarYear here is the year containing the February in question (startYear + 1).
  const isLeap = (calendarYear % 4 === 0 && calendarYear % 100 !== 0) || calendarYear % 400 === 0;
  return isLeap ? 29 : 28;
}

export function financialYearForStartYear(startYear: number): FinancialYearOption {
  const endYear = startYear + 1;
  const feb = lastDayOfFebruary(endYear);
  const shortEnd = String(endYear).slice(-2);
  return {
    startYear,
    label: `FY ${startYear}/${shortEnd} (Mar ${startYear} – Feb ${endYear})`,
    fromDate: `${startYear}-03-01`,
    toDate: `${endYear}-02-${String(feb).padStart(2, '0')}`
  };
}

/** The FY start year containing `date` (defaults to today). Jan/Feb belong to the FY that started the previous calendar year. */
export function currentFinancialYearStartYear(date: Date = new Date()): number {
  const month = date.getMonth(); // 0-indexed; 0=Jan, 1=Feb, 2=Mar
  return month <= 1 ? date.getFullYear() - 1 : date.getFullYear();
}

/** Options spanning from (current FY - yearsBack) to (current FY + yearsForward), inclusive, most recent first is NOT assumed -- ascending order. */
export function buildFinancialYearOptions(yearsBack = 1, yearsForward = 1): FinancialYearOption[] {
  const current = currentFinancialYearStartYear();
  const options: FinancialYearOption[] = [];
  for (let y = current - yearsBack; y <= current + yearsForward; y++) {
    options.push(financialYearForStartYear(y));
  }
  return options;
}
