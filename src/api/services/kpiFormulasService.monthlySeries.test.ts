import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const settingsMock = vi.hoisted(() => ({
  getOrCreateKPISettings: vi.fn(),
  getMultiplier: vi.fn()
}));

const workHoursMock = vi.hoisted(() => ({
  listWorkHoursMonthly: vi.fn(),
  sumTotalHoursForPeriod: vi.fn()
}));

// Chainable DB mock. Each call to `from('incidents')` returns a new chain.
// The chain resolves to `{ data, error }` when awaited.  The `.or()` method is
// used to tell the two incident queries apart: the LTI/fatality query always
// calls `.or('is_lost_time_injury.eq.true,...')`, the window query does not.
function makeChain(data: unknown[], usesOr = false) {
  let _usesOr = usesOr;
  const chain: Record<string, unknown> = {};
  const noop = () => chain;
  chain.select = noop;
  chain.eq = noop;
  chain.gte = noop;
  chain.lte = noop;
  chain.order = noop;
  chain.limit = noop;
  chain.or = () => { _usesOr = true; return chain; };
  chain.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
    resolve({ data, error: null });
  return chain;
}

// Two separate incident result sets, swapped in per test.
let windowIncidents: unknown[] = [];
let ltiIncidents: unknown[] = [];

const dbMock = vi.hoisted(() => ({
  database: {
    from: vi.fn()
  }
}));

vi.mock('../insforge/client', () => ({ insforge: dbMock }));
vi.mock('./kpiSettingsService', () => settingsMock);
vi.mock('./workHoursMonthlyService', () => workHoursMock);
// Silence the operationalInputs import (not used by getSafetyKpiMonthlySeries)
vi.mock('./operationalInputsService', () => ({ listOperationalInputsMonthly: vi.fn().mockResolvedValue([]) }));
vi.mock('./incidentsService', () => ({ getIncidentCountsForKpi: vi.fn().mockResolvedValue({}) }));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a month-key string N months before (positive) or after now. */
function monthKey(offsetFromNow: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - offsetFromNow);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function makeWorkHoursRow(mk: string, hours = 1000) {
  const [year, month] = mk.split('-').map(Number);
  return { year, month, total_hours_worked_final: hours, site_id: null, department_id: null };
}

function makeIncident(mk: string, overrides: Record<string, unknown> = {}) {
  return {
    occurred_at: `${mk}-15T00:00:00.000Z`,
    lost_days: 0,
    is_recordable_injury: false,
    is_lost_time_injury: false,
    is_fatality: false,
    is_near_miss: false,
    is_accident: false,
    ...overrides
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  settingsMock.getOrCreateKPISettings.mockResolvedValue({
    rate_multiplier_mode: 'SMALL_BUSINESS',
    lti_reset_triggers: ['LTI']
  });
  settingsMock.getMultiplier.mockReturnValue(200_000);

  // Provide 24 months of work hours (1 000 h each) for the default setup.
  const allMonths = Array.from({ length: 24 }, (_, i) => makeWorkHoursRow(monthKey(23 - i)));
  workHoursMock.listWorkHoursMonthly.mockResolvedValue(allMonths);

  windowIncidents = [];
  ltiIncidents = [];

  // from('incidents') is called twice; the LTI query attaches .or() before
  // awaiting, so we track this via the chain.
  dbMock.database.from.mockImplementation((_table: string) => {
    // Return a chain that resolves to the appropriate dataset.
    // We differentiate by checking whether .or() was invoked on the chain.
    let resolvedAsLti = false;
    const chain: Record<string, unknown> = {};
    const noop = () => chain;
    chain.select = noop;
    chain.eq = noop;
    chain.gte = noop;
    chain.lte = noop;
    chain.order = noop;
    chain.limit = noop;
    chain.or = () => { resolvedAsLti = true; return chain; };
    chain.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      resolve({ data: resolvedAsLti ? ltiIncidents : windowIncidents, error: null });
    return chain;
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('getSafetyKpiMonthlySeries', () => {
  it('returns exactly 12 MonthPoints in ascending order', async () => {
    const { getSafetyKpiMonthlySeries } = await import('./kpiFormulasService');
    const result = await getSafetyKpiMonthlySeries('company-1' as any);
    expect(result).toHaveLength(12);
    expect(result[0].monthKey < result[11].monthKey).toBe(true);
    expect(result[11].monthKey).toBe(monthKey(0)); // newest = current month
  });

  it('rolling window: a single LTI incident appears in 12 consecutive windows then drops out', async () => {
    const { getSafetyKpiMonthlySeries } = await import('./kpiFormulasService');

    // allMonthKeys[11] is 12 months before current display-month-start.
    // monthKey(12) = 12 months ago = allMonthKeys[11].
    // An incident there falls in every display month's rolling 12-month window.
    const incidentMonth = monthKey(12);
    windowIncidents = [
      makeIncident(incidentMonth, { is_lost_time_injury: true, lost_days: 3 })
    ];
    ltiIncidents = windowIncidents; // same incident visible to LTI query too

    const result = await getSafetyKpiMonthlySeries('company-1' as any);

    // Every display month's window [i..i+11] covers allMonthKeys[i] to allMonthKeys[i+11].
    // The incident is in allMonthKeys[11]; for display month i the window is allMonthKeys[i..i+11],
    // so the incident appears when i ≤ 11 ≤ i+11 → 0 ≤ i ≤ 11 → all 12 display months.
    for (const pt of result) {
      expect(pt.ltifr).toBeGreaterThan(0);
      expect(pt.ltisr).toBeGreaterThan(0);
    }

    // Now place the incident one month earlier (allMonthKeys[10] = monthKey(13)).
    // For display month i, window covers allMonthKeys[i..i+11].
    // Incident at index 10 appears when i ≤ 10 ≤ i+11 → i ∈ [0, 10] → 11 display months.
    // M[11]'s window = allMonthKeys[11..22] which does NOT include index 10 → drops out.
    const droppedMonth = monthKey(13);
    windowIncidents = [makeIncident(droppedMonth, { is_lost_time_injury: true })];
    ltiIncidents = windowIncidents;

    const result2 = await getSafetyKpiMonthlySeries('company-1' as any);
    // All display months except the last should see the incident.
    for (let i = 0; i < 11; i++) {
      expect(result2[i].ltifr).toBeGreaterThan(0);
    }
    // The newest display month's window (allMonthKeys[11..22]) excludes allMonthKeys[10].
    expect(result2[11].ltifr).toBe(0);
  });

  it('freeManHours resets to that month\'s hours on an LTI and re-accumulates after', async () => {
    const { getSafetyKpiMonthlySeries } = await import('./kpiFormulasService');

    // Only provide work hours for the 12 display months, no earlier history.
    const displayKeys = Array.from({ length: 12 }, (_, i) => monthKey(11 - i));
    workHoursMock.listWorkHoursMonthly.mockResolvedValue(
      displayKeys.map((mk) => makeWorkHoursRow(mk, 1000))
    );

    // LTI in display month M[3] (monthKey(8) = 8 months ago).
    const resetMonthKey = monthKey(8); // display index 3 (0-indexed from oldest)
    ltiIncidents = [makeIncident(resetMonthKey, { is_lost_time_injury: true })];
    windowIncidents = ltiIncidents;

    const result = await getSafetyKpiMonthlySeries('company-1' as any);

    // M[0..2]: accumulate from start (no prior reset), 1000/2000/3000 h
    expect(result[0].freeManHours).toBe(1000);
    expect(result[1].freeManHours).toBe(2000);
    expect(result[2].freeManHours).toBe(3000);

    // M[3]: RESET — shows only that month's hours
    expect(result[3].freeManHours).toBe(1000);

    // M[4..11]: re-accumulate from the reset point
    expect(result[4].freeManHours).toBe(2000);
    expect(result[7].freeManHours).toBe(5000);
    expect(result[11].freeManHours).toBe(9000);
  });

  it('returns zero rates when no work hours data exists', async () => {
    const { getSafetyKpiMonthlySeries } = await import('./kpiFormulasService');
    workHoursMock.listWorkHoursMonthly.mockResolvedValue([]);
    windowIncidents = [makeIncident(monthKey(1), { is_lost_time_injury: true })];
    ltiIncidents = windowIncidents;

    const result = await getSafetyKpiMonthlySeries('company-1' as any);
    for (const pt of result) {
      expect(pt.ltifr).toBe(0);
      expect(pt.trir).toBe(0);
    }
  });
});
