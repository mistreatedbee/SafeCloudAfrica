import { insforge } from '../insforge/client';
import type { UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { getOrCreateKPISettings, getMultiplier } from './kpiSettingsService';
import { listWorkHoursMonthly, sumTotalHoursForPeriod } from './workHoursMonthlyService';
import { listOperationalInputsMonthly } from './operationalInputsService';
import { getIncidentCountsForKpi } from './incidentsService';
import type { WorkHoursMonthly } from '../models/entities';

export type KpiPeriod = {
  periodStart: { year: number; month: number };
  periodEnd: { year: number; month: number };
  dateFrom: string;
  dateTo: string;
  monthKeys: string[];
};

/** Last 12 full calendar months. */
export function getRolling12Period(): KpiPeriod {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth() - 12, 1);
  const monthKeys: string[] = [];
  for (let y = start.getFullYear(), m = start.getMonth() + 1; y < end.getFullYear() || (y === end.getFullYear() && m <= end.getMonth() + 1); ) {
    monthKeys.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return {
    periodStart: { year: start.getFullYear(), month: start.getMonth() + 1 },
    periodEnd: { year: end.getFullYear(), month: end.getMonth() + 1 },
    dateFrom: start.toISOString().slice(0, 10) + 'T00:00:00.000Z',
    dateTo: end.toISOString().slice(0, 10) + 'T23:59:59.999Z',
    monthKeys
  };
}

export function getCustomPeriod(dateFrom: string, dateTo: string): KpiPeriod {
  const start = new Date(dateFrom);
  const end = new Date(dateTo);
  const monthKeys: string[] = [];
  const y1 = start.getFullYear(), m1 = start.getMonth() + 1;
  const y2 = end.getFullYear(), m2 = end.getMonth() + 1;
  for (let y = y1, m = m1; y < y2 || (y === y2 && m <= m2); ) {
    monthKeys.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return {
    periodStart: { year: y1, month: m1 },
    periodEnd: { year: y2, month: m2 },
    dateFrom: dateFrom.slice(0, 10) + 'T00:00:00.000Z',
    dateTo: dateTo.slice(0, 10) + 'T23:59:59.999Z',
    monthKeys
  };
}

export type SafetyKpiResult = {
  totalHoursWorked: number;
  multiplier: number;
  trir: number;
  ltifr: number;
  severityRate: number;
  incidentFrequencyRate: number;
  fatalityRate: number;
  nearMissFrequencyRate: number;
  accidentFrequencyRate: number;
  recordableInjuries: number;
  lostTimeInjuries: number;
  fatalities: number;
  totalLostDays: number;
  nearMisses: number;
  accidents: number;
  totalIncidents: number;
  missingMonths: string[];
};

export async function getSafetyKpis(
  companyId: UUID,
  options?: { period?: KpiPeriod; siteId?: UUID | null; departmentId?: UUID | null }
): Promise<SafetyKpiResult> {
  const period = options?.period ?? getRolling12Period();
  const settings = await getOrCreateKPISettings(companyId);
  const multiplier = getMultiplier(settings);

  const hoursRows = await listWorkHoursMonthly({
    companyId,
    siteId: options?.siteId ?? null,
    departmentId: options?.departmentId ?? null,
    limit: 24
  });
  const totalHoursWorked = sumTotalHoursForPeriod(hoursRows, period.periodStart, period.periodEnd);
  const missingMonths = period.monthKeys.filter(
    (k) => !hoursRows.some((r) => `${r.year}-${String(r.month).padStart(2, '0')}` === k)
  );

  const counts = await getIncidentCountsForKpi({
    companyId,
    dateFrom: period.dateFrom,
    dateTo: period.dateTo,
    siteId: options?.siteId,
    departmentId: options?.departmentId
  });

  const safeDiv = (num: number, den: number): number =>
    den > 0 ? (num * multiplier) / den : 0;

  return {
    totalHoursWorked,
    multiplier,
    trir: safeDiv(counts.recordableInjuries, totalHoursWorked),
    ltifr: safeDiv(counts.lostTimeInjuries, totalHoursWorked),
    severityRate: safeDiv(counts.totalLostDays, totalHoursWorked),
    incidentFrequencyRate: safeDiv(counts.totalIncidents, totalHoursWorked),
    fatalityRate: safeDiv(counts.fatalities, totalHoursWorked),
    nearMissFrequencyRate: safeDiv(counts.nearMisses, totalHoursWorked),
    accidentFrequencyRate: safeDiv(counts.accidents, totalHoursWorked),
    recordableInjuries: counts.recordableInjuries,
    lostTimeInjuries: counts.lostTimeInjuries,
    fatalities: counts.fatalities,
    totalLostDays: counts.totalLostDays,
    nearMisses: counts.nearMisses,
    accidents: counts.accidents,
    totalIncidents: counts.totalIncidents,
    missingMonths
  };
}

export type LtiFreeHoursResult = {
  ltiFreeHours: number;
  lastResetDate: string | null;
  lastResetIncidentId: UUID | null;
  lastResetReason: string | null;
};

/** LTI-free hours from first WorkHoursMonthly or period start; resets on LTI/Fatality. */
export async function getLtiFreeHours(
  companyId: UUID,
  options?: { siteId?: UUID | null; departmentId?: UUID | null }
): Promise<LtiFreeHoursResult> {
  const settings = await getOrCreateKPISettings(companyId);
  const triggers = new Set(settings.lti_reset_triggers.map((t) => t.toUpperCase()));

  const hoursRows = await listWorkHoursMonthly({
    companyId,
    siteId: options?.siteId ?? null,
    departmentId: options?.departmentId ?? null,
    limit: 120
  });
  if (hoursRows.length === 0) {
    return { ltiFreeHours: 0, lastResetDate: null, lastResetIncidentId: null, lastResetReason: null };
  }

  const sorted = [...hoursRows].sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
  const q = insforge.database
    .from('incidents')
    .select('id, occurred_at, is_lost_time_injury, is_fatality, site_id, department_id')
    .eq('company_id', companyId)
    .or('is_lost_time_injury.eq.true,is_fatality.eq.true')
    .order('occurred_at', { ascending: false })
    .limit(50);
  const { data: ltiFatalities } = await q;
  let incidents = (ltiFatalities ?? []) as Array<{ id: UUID; occurred_at: string; is_lost_time_injury?: boolean; is_fatality?: boolean; site_id?: UUID | null; department_id?: UUID | null }>;
  if (options?.siteId != null) incidents = incidents.filter((i) => i.site_id === options.siteId);
  if (options?.departmentId != null) incidents = incidents.filter((i) => i.department_id === options.departmentId);

  let lastReset: { date: string; incidentId: UUID; reason: string; year: number; month: number } | null = null;
  for (const inc of incidents) {
    const reason = (inc.is_fatality && triggers.has('FATALITY')) ? 'FATALITY' : (inc.is_lost_time_injury && triggers.has('LTI')) ? 'LTI' : null;
    if (reason) {
      const d = new Date(inc.occurred_at);
      lastReset = { date: inc.occurred_at, incidentId: inc.id, reason, year: d.getFullYear(), month: d.getMonth() + 1 };
      break;
    }
  }

  let acc = 0;
  for (const row of sorted) {
    if (lastReset && (row.year < lastReset.year || (row.year === lastReset.year && row.month <= lastReset.month))) continue;
    acc += row.total_hours_worked_final;
  }

  return {
    ltiFreeHours: acc,
    lastResetDate: lastReset ? lastReset.date : null,
    lastResetIncidentId: lastReset ? lastReset.incidentId : null,
    lastResetReason: lastReset ? lastReset.reason : null
  };
}

export type ComplianceKpiResult = {
  ppeCompliancePercent: number | null;
  trainingCompletionPercent: number | null;
  inspectionCompliancePercent: number | null;
  correctiveActionClosurePercent: number | null;
  auditScorePercent: number | null;
  ppeObserved: number;
  ppeWearing: number;
  employeesTrained: number;
  totalEmployees: number;
  inspectionsPlanned: number;
  inspectionsCompleted: number;
  actionsRaised: number;
  actionsClosed: number;
  auditPointsScored: number;
  auditPointsTotal: number;
};

export async function getComplianceKpis(
  companyId: UUID,
  options?: { period?: KpiPeriod }
): Promise<ComplianceKpiResult> {
  const period = options?.period ?? getRolling12Period();

  const [operationalRows, hoursRows, trainingRecords, inspectionRuns, correctiveActions, auditsList] = await Promise.all([
    listOperationalInputsMonthly({ companyId, limit: 24 }),
    listWorkHoursMonthly({ companyId, limit: 24 }),
    insforge.database.from('training_records').select('user_id, completed_at').eq('company_id', companyId).eq('status', 'COMPLETED').not('completed_at', 'is', null).gte('completed_at', period.dateFrom).lte('completed_at', period.dateTo),
    insforge.database.from('inspection_runs').select('id, status, started_at, completed_at').eq('company_id', companyId).not('started_at', 'is', null).gte('started_at', period.dateFrom).lte('started_at', period.dateTo),
    insforge.database.from('corrective_actions').select('id, status, created_at').eq('company_id', companyId),
    insforge.database.from('audits').select('id').eq('company_id', companyId).eq('status', 'completed').gte('created_at', period.dateFrom).lte('created_at', period.dateTo)
  ]);

  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

  let ppeObserved = 0;
  let ppeWearing = 0;
  for (const r of operationalRows as any[]) {
    const key = `${r.year}-${String(r.month).padStart(2, '0')}`;
    if (period.monthKeys.includes(key)) {
      ppeObserved += Number(r.ppe_employees_observed) || 0;
      ppeWearing += Number(r.ppe_employees_wearing) || 0;
    }
  }
  const ppeCompliancePercent = pct(ppeWearing, ppeObserved);

  const distinctUsers = new Set((trainingRecords.data ?? []).map((r: any) => r.user_id));
  const totalEmployees =
    hoursRows.length > 0
      ? Math.round(hoursRows.reduce((s, r) => s + r.total_employees, 0) / hoursRows.length)
      : 0;
  const employeesTrained = distinctUsers.size;
  const trainingCompletionPercent = totalEmployees > 0 ? pct(employeesTrained, totalEmployees) : null;

  const runs = (inspectionRuns.data ?? []) as Array<{ id: UUID; status: string; completed_at: string | null }>;
  const inspectionsPlanned = runs.length;
  const inspectionsCompleted = runs.filter((r) => r.status === 'completed').length;
  const inspectionCompliancePercent = pct(inspectionsCompleted, inspectionsPlanned);

  const actions = (correctiveActions.data ?? []) as Array<{ id: UUID; status: string; created_at: string }>;
  const inPeriod = actions.filter((a) => a.created_at >= period.dateFrom && a.created_at <= period.dateTo);
  const actionsRaised = inPeriod.length;
  const actionsClosed = inPeriod.filter((a) => ['completed', 'verified', 'closed'].includes(a.status)).length;
  const correctiveActionClosurePercent = pct(actionsClosed, actionsRaised);

  let auditPointsScored = 0;
  let auditPointsTotal = 0;
  for (const a of auditsList.data ?? []) {
    const auditId = (a as any).id;
    const { data: qs } = await insforge.database.from('audit_questions').select('id, allocated_score').eq('audit_id', auditId);
    const questions = (qs ?? []) as Array<{ id: UUID; allocated_score: number | null }>;
    for (const q of questions) {
      const alloc = Number(q.allocated_score) || 0;
      auditPointsTotal += alloc;
      const { data: resp } = await insforge.database.from('audit_responses').select('achieved_score, is_compliant').eq('audit_question_id', q.id).limit(1).maybeSingle();
      const r = resp as any;
      auditPointsScored += r != null ? (Number(r.achieved_score) ?? (r.is_compliant ? alloc : 0)) : 0;
    }
  }
  const auditScorePercent = auditPointsTotal > 0 ? pct(auditPointsScored, auditPointsTotal) : null;

  return {
    ppeCompliancePercent,
    trainingCompletionPercent,
    inspectionCompliancePercent,
    correctiveActionClosurePercent,
    auditScorePercent,
    ppeObserved,
    ppeWearing,
    employeesTrained,
    totalEmployees,
    inspectionsPlanned,
    inspectionsCompleted,
    actionsRaised,
    actionsClosed,
    auditPointsScored,
    auditPointsTotal
  };
}

export type QualityKpiResult = {
  customerComplaintRate: number | null;
  nonConformanceRate: number | null;
  complaints: number;
  totalDeliveries: number;
  nonConformingItems: number;
  totalItemsInspected: number;
};

export async function getQualityKpis(companyId: UUID, options?: { period?: KpiPeriod }): Promise<QualityKpiResult> {
  const period = options?.period ?? getRolling12Period();

  const [operationalRows, ncrData] = await Promise.all([
    listOperationalInputsMonthly({ companyId, limit: 24 }),
    insforge.database.from('quality_ncrs').select('id, source, created_at').eq('company_id', companyId).gte('created_at', period.dateFrom).lte('created_at', period.dateTo)
  ]);

  let totalDeliveries = 0;
  let totalItemsInspected = 0;
  for (const r of operationalRows as any[]) {
    const key = `${r.year}-${String(r.month).padStart(2, '0')}`;
    if (period.monthKeys.includes(key)) {
      totalDeliveries += Number(r.total_deliveries) || 0;
      totalItemsInspected += Number(r.total_items_inspected) || 0;
    }
  }
  const ncrs = (ncrData.data ?? []) as Array<{ id: UUID; source: string }>;
  const complaints = ncrs.filter((n) => String(n.source || '').toLowerCase() === 'complaint').length;
  const nonConformingItems = ncrs.length;
  const customerComplaintRate = totalDeliveries > 0 ? Math.round((complaints / totalDeliveries) * 10000) / 100 : null;
  const nonConformanceRate = totalItemsInspected > 0 ? Math.round((nonConformingItems / totalItemsInspected) * 10000) / 100 : null;

  return {
    customerComplaintRate,
    nonConformanceRate,
    complaints,
    totalDeliveries,
    nonConformingItems,
    totalItemsInspected
  };
}

export type EnvironmentalKpiResult = {
  wasteRecyclingRate: number | null;
  spillFrequencyRate: number;
  energyConsumptionRate: number | null;
  environmentalIncidentRate: number;
  recycledWaste: number;
  totalWasteGenerated: number;
  totalEnergyUsed: number;
  productionOutput: number;
  spills: number;
  environmentalIncidents: number;
  totalHoursWorked: number;
  multiplier: number;
};

export async function getEnvironmentalKpis(
  companyId: UUID,
  options?: { period?: KpiPeriod }
): Promise<EnvironmentalKpiResult> {
  const period = options?.period ?? getRolling12Period();
  const settings = await getOrCreateKPISettings(companyId);
  const multiplier = getMultiplier(settings);

  const [operationalRows, hoursRows, counts] = await Promise.all([
    listOperationalInputsMonthly({ companyId, limit: 24 }),
    listWorkHoursMonthly({ companyId, limit: 24 }),
    getIncidentCountsForKpi({ companyId, dateFrom: period.dateFrom, dateTo: period.dateTo })
  ]);

  let recycledWaste = 0;
  let totalWasteGenerated = 0;
  let totalEnergyUsed = 0;
  let productionOutput = 0;
  for (const r of operationalRows as any[]) {
    const key = `${r.year}-${String(r.month).padStart(2, '0')}`;
    if (period.monthKeys.includes(key)) {
      recycledWaste += Number((r as any).recycled_waste) || 0;
      totalWasteGenerated += Number((r as any).total_waste_generated) || 0;
      totalEnergyUsed += Number((r as any).total_energy_used) || 0;
      productionOutput += Number((r as any).production_output) || 0;
    }
  }
  const totalHoursWorked = sumTotalHoursForPeriod(hoursRows, period.periodStart, period.periodEnd);
  const safeDiv = (num: number, den: number) => (den > 0 ? (num * multiplier) / den : 0);

  const wasteRecyclingRate = totalWasteGenerated > 0 ? Math.round((recycledWaste / totalWasteGenerated) * 10000) / 100 : null;
  const spillFrequencyRate = safeDiv(counts.spills, totalHoursWorked);
  const environmentalIncidentRate = safeDiv(counts.environmentalIncidents, totalHoursWorked);
  const energyConsumptionRate = productionOutput > 0 ? totalEnergyUsed / productionOutput : null;

  return {
    wasteRecyclingRate,
    spillFrequencyRate,
    energyConsumptionRate,
    environmentalIncidentRate,
    recycledWaste,
    totalWasteGenerated,
    totalEnergyUsed,
    productionOutput,
    spills: counts.spills,
    environmentalIncidents: counts.environmentalIncidents,
    totalHoursWorked,
    multiplier
  };
}
