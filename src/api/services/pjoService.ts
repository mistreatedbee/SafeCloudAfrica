import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import type {
  PjoChecklistItem,
  PjoChecklistTemplate,
  PjoObservation,
  PjoResponse,
  UUID
} from '../models/entities';
import { createActivityLog } from './activityLogService';

export const PJO_QUESTIONS: readonly string[] = [
  'PPE Complete and Correct?',
  'Task/Job completed to company standard?',
  'Was the employee physically fit for the position?',
  'Did the employee have an understanding of his task/job?',
  'Did you uncover any environmental issues?',
  'Are there environmental risks (dust, noise, water contamination)?',
  'Did the employee adhere to Safety Rules?',
  'Was the employee trained and competent?',
  'Was the employee aware of the hazards associated with the job?',
  'Did the employee have the right tool(s) for the right job?',
  'Written Procedure in place?',
  'Did the employee adhere to WSWP?',
  'Was Non-Compliant Behaviour Observed',
  'Was the quality of work to client standard?',
  'Did the employee meet his target?',
  'What could go wrong during this task?',
  'Was a risk assessment or JSA completed? Can you walk me through it?',
  'What is the biggest risk in this task?',
  'Has anything changed from the original plan?',
  'Do you know the emergency procedures for this job?',
  'What would you do if something unexpected happens?',
  'Do you feel confident performing this job safely?',
  'Do you think additional training is needed?',
  'Were pre-use inspections completed?',
  'Are you under any time pressure?',
  'Are you fatigued or distracted?',
  'Is there anything making this job more difficult?',
  'Do you feel safe raising concerns?',
  'What would make this job safer or easier?',
  'Have there been incidents or near misses doing this job?',
  'If you were the supervisor, what would you change?',
  'Show me how you normally do this',
  'What worries you most about this job?',
  'Where do things usually go wrong?'
] as const;

export type PjoChecklistQuestion = {
  questionNo: number;
  questionText: string;
  category: string | null;
  templateId: UUID | null;
  templateItemId: UUID | null;
};

function isNonCompliantResponse(r: PjoResponse): boolean {
  const hasDeviation = (r.deviation ?? '').trim().length > 0;
  const hasLowRating = r.rating === 1;
  const explicitNo = r.yes_no === false;
  return explicitNo || hasLowRating || hasDeviation;
}

export type ListPjosInput = {
  companyId: UUID;
  employeeUserId?: UUID;
  department?: string;
  site?: string;
  status?: PjoObservation['status'];
  fromDate?: string; // YYYY-MM-DD
  toDate?: string; // YYYY-MM-DD
  limit?: number;
};

export async function listPjoTemplates(companyId: UUID): Promise<PjoChecklistTemplate[]> {
  const { data, error } = await insforge.database
    .from('pjo_checklist_templates')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as PjoChecklistTemplate[];
}

export async function getEffectivePjoChecklist(input: {
  companyId: UUID;
  templateId?: UUID | null;
}): Promise<PjoChecklistQuestion[]> {
  // If a specific template is requested, try to use it first.
  if (input.templateId) {
    const { data, error } = await insforge.database
      .from('pjo_checklist_items')
      .select('*')
      .eq('company_id', input.companyId)
      .eq('template_id', input.templateId)
      .eq('is_active', true)
      .order('question_no', { ascending: true });

    if (error) throw new Error(getErrorMessage(error));
    const items = (data ?? []) as PjoChecklistItem[];

    if (items.length > 0) {
      return items.map((item, idx) => ({
        questionNo: item.question_no ?? idx + 1,
        questionText: item.question_text,
        category: item.category ?? null,
        templateId: item.template_id,
        templateItemId: item.id
      }));
    }
  }

  // Fallback: built-in fixed checklist (31+ questions).
  return PJO_QUESTIONS.map((q, idx) => ({
    questionNo: idx + 1,
    questionText: q,
    category: null,
    templateId: null,
    templateItemId: null
  }));
}

export async function listPjos(input: ListPjosInput): Promise<PjoObservation[]> {
  const base = insforge.database
    .from('pjo_observations')
    .select('*')
    .eq('company_id', input.companyId);

  const q1 = input.employeeUserId
    ? base.eq('employee_user_id', input.employeeUserId)
    : base;
  const q2 = input.department ? q1.ilike('department', `%${input.department}%`) : q1;
  const q3 = input.site ? q2.ilike('site', `%${input.site}%`) : q2;
  const q4 = input.status ? q3.eq('status', input.status) : q3;
  const q5 = input.fromDate
    ? q4.gte('observed_at', input.fromDate)
    : q4;
  const q6 = input.toDate
    ? q5.lte('observed_at', input.toDate)
    : q5;

  const { data, error } = await q6
    .order('observed_at', { ascending: false })
    .limit(input.limit ?? 100);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as PjoObservation[];
}

export async function createPjo(input: {
  companyId: UUID;
  employeeUserId?: UUID | null;
  employeeName: string;
  conductedByUserId: UUID;
  reason: string;
  department?: string | null;
  site?: string | null;
  jobObserved: string;
  observedAt: string; // YYYY-MM-DD
  nextObservationAt?: string | null; // YYYY-MM-DD
  createdByUserId: UUID;
  templateId?: UUID | null;
}): Promise<PjoObservation> {
  const { data, error } = await insforge.database
    .from('pjo_observations')
    .insert({
      company_id: input.companyId,
      module: 'hr',
      employee_user_id: input.employeeUserId ?? null,
      employee_name: input.employeeName,
      conducted_by_user_id: input.conductedByUserId,
      reason: input.reason,
      department: input.department ?? null,
      site: input.site ?? null,
      job_observed: input.jobObserved,
      observed_at: input.observedAt,
      next_observation_at: input.nextObservationAt ?? null,
      status: 'open',
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create PJO.');

  const pjo = data as PjoObservation;

  const questions = await getEffectivePjoChecklist({
    companyId: input.companyId,
    templateId: input.templateId ?? null
  });

  const responseRows = questions.map((q) => ({
    company_id: input.companyId,
    pjo_id: pjo.id,
    question_no: q.questionNo,
    question_text: q.questionText,
    category: q.category,
    template_id: q.templateId,
    template_item_id: q.templateItemId,
    yes_no: null,
    rating: null,
    deviation: null,
    suggested_corrective_action: null,
    responsible_person: null,
    responsible_department: null,
    corrective_action_implemented: false,
    implemented_at: null,
    manager_signoff_user_id: null,
    manager_signoff_at: null,
    closed: false,
    closed_at: null,
    closed_by_user_id: null,
    ncr_id: null
  }));

  const { error: respError } = await insforge.database.from('pjo_responses').insert(responseRows);
  if (respError) throw new Error(getErrorMessage(respError));

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'pjo_observations.create',
    entityType: 'pjo_observation',
    entityId: pjo.id
  });

  return pjo;
}

export async function getPjoById(companyId: UUID, pjoId: UUID): Promise<PjoObservation | null> {
  const { data, error } = await insforge.database
    .from('pjo_observations')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', pjoId)
    .maybeSingle();
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? null) as PjoObservation | null;
}

export async function updatePjo(input: {
  companyId: UUID;
  pjoId: UUID;
  actorUserId: UUID;
  patch: Partial<
    Pick<
      PjoObservation,
      | 'employee_user_id'
      | 'employee_name'
      | 'reason'
      | 'department'
      | 'site'
      | 'job_observed'
      | 'observed_at'
      | 'next_observation_at'
      | 'status'
      | 'metadata'
    >
  >;
}): Promise<PjoObservation> {
  const { data, error } = await insforge.database
    .from('pjo_observations')
    .update({
      ...input.patch,
      updated_at: new Date().toISOString()
    })
    .eq('company_id', input.companyId)
    .eq('id', input.pjoId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update PJO.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'pjo_observations.update',
    entityType: 'pjo_observation',
    entityId: input.pjoId
  });

  return data as PjoObservation;
}

export async function closePjo(input: {
  companyId: UUID;
  pjoId: UUID;
  actorUserId: UUID;
}): Promise<PjoObservation> {
  const nowIso = new Date().toISOString();

  // Guard: only allow closing when all checklist responses are closed.
  const { data: openResponses, error: openError } = await insforge.database
    .from('pjo_responses')
    .select('id')
    .eq('company_id', input.companyId)
    .eq('pjo_id', input.pjoId)
    .eq('closed', false)
    .limit(1);
  if (openError) throw new Error(getErrorMessage(openError));
  if ((openResponses ?? []).length > 0) {
    throw new Error('Cannot close PJO while there are open checklist items. Please ensure all items are signed off.');
  }

  const { data, error } = await insforge.database
    .from('pjo_observations')
    .update({
      status: 'closed',
      closed_at: nowIso,
      closed_by_user_id: input.actorUserId,
      updated_at: nowIso
    })
    .eq('company_id', input.companyId)
    .eq('id', input.pjoId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to close PJO.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'pjo_observations.close',
    entityType: 'pjo_observation',
    entityId: input.pjoId
  });

  return data as PjoObservation;
}

export async function listPjoResponses(companyId: UUID, pjoId: UUID): Promise<PjoResponse[]> {
  const { data, error } = await insforge.database
    .from('pjo_responses')
    .select('*')
    .eq('company_id', companyId)
    .eq('pjo_id', pjoId)
    .order('question_no', { ascending: true });
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as PjoResponse[];
}

export async function updatePjoResponse(input: {
  companyId: UUID;
  responseId: UUID;
  actorUserId: UUID;
  patch: Partial<
    Pick<
      PjoResponse,
      | 'yes_no'
      | 'rating'
      | 'deviation'
      | 'suggested_corrective_action'
      | 'responsible_person'
      | 'responsible_department'
      | 'corrective_action_implemented'
      | 'implemented_at'
      | 'manager_signoff_user_id'
      | 'manager_signoff_at'
      | 'closed'
      | 'closed_at'
      | 'closed_by_user_id'
      | 'ncr_id'
    >
  >;
}): Promise<PjoResponse> {
  const { data, error } = await insforge.database
    .from('pjo_responses')
    .update({
      ...input.patch,
      updated_at: new Date().toISOString()
    })
    .eq('company_id', input.companyId)
    .eq('id', input.responseId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update PJO response.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'pjo_responses.update',
    entityType: 'pjo_response',
    entityId: input.responseId
  });

  return data as PjoResponse;
}

export type PjoSummary = {
  totalPjos: number;
  openPjos: number;
  closedPjos: number;
  totalResponses: number;
  nonCompliantResponses: number;
  compliancePercent: number;
  ncrCount: number;
};

export type PjoTrendPoint = {
  period: string;
  pjoCount: number;
  nonCompliantResponses: number;
  ncrCount: number;
};

export type PjoBreakdownRow = {
  key: string;
  label: string;
  pjoCount: number;
  responses: number;
  nonCompliantResponses: number;
  ncrCount: number;
};

export type PjoCategoryStatsRow = {
  category: string;
  responses: number;
  nonCompliantResponses: number;
  ncrCount: number;
};

export type PjoNcrStats = {
  totalNcrs: number;
  bySeverity: { severity: string; count: number }[];
  byStatus: { status: string; count: number }[];
};

async function fetchPjosAndResponses(filters: ListPjosInput): Promise<{
  pjos: PjoObservation[];
  responses: PjoResponse[];
}> {
  const pjos = await listPjos(filters);
  if (pjos.length === 0) {
    return { pjos: [], responses: [] };
  }

  const pjoIds = pjos.map((p) => p.id);
  const { data, error } = await insforge.database
    .from('pjo_responses')
    .select('*')
    .eq('company_id', filters.companyId)
    .in('pjo_id', pjoIds);
  if (error) throw new Error(getErrorMessage(error));
  const responses = (data ?? []) as PjoResponse[];
  return { pjos, responses };
}

export async function getPjoSummary(filters: ListPjosInput): Promise<PjoSummary> {
  const { pjos, responses } = await fetchPjosAndResponses(filters);

  const totalPjos = pjos.length;
  const openPjos = pjos.filter((p) => p.status === 'open').length;
  const closedPjos = totalPjos - openPjos;

  const totalResponses = responses.length;
  const nonCompliantResponses = responses.filter(isNonCompliantResponse).length;
  const ncrCount = responses.filter((r) => r.ncr_id !== null).length;

  const compliancePercent =
    totalResponses === 0 ? 100 : Math.max(0, Math.min(100, ((totalResponses - nonCompliantResponses) / totalResponses) * 100));

  return {
    totalPjos,
    openPjos,
    closedPjos,
    totalResponses,
    nonCompliantResponses,
    compliancePercent,
    ncrCount
  };
}

export async function getPjoTrends(filters: ListPjosInput & { interval: 'day' | 'month' }): Promise<PjoTrendPoint[]> {
  const { pjos, responses } = await fetchPjosAndResponses(filters);
  if (pjos.length === 0) return [];

  const bucketForDate = (isoDate: string): string => {
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return 'unknown';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return filters.interval === 'day' ? `${year}-${month}-${day}` : `${year}-${month}`;
  };

  const bucketByPjoId = new Map<UUID, string>();
  const buckets = new Map<string, PjoTrendPoint>();

  for (const p of pjos) {
    const period = bucketForDate(p.observed_at);
    bucketByPjoId.set(p.id, period);
    const existing = buckets.get(period) ?? {
      period,
      pjoCount: 0,
      nonCompliantResponses: 0,
      ncrCount: 0
    };
    existing.pjoCount += 1;
    buckets.set(period, existing);
  }

  for (const r of responses) {
    const period = bucketByPjoId.get(r.pjo_id);
    if (!period) continue;
    const existing = buckets.get(period);
    if (!existing) continue;
    if (isNonCompliantResponse(r)) {
      existing.nonCompliantResponses += 1;
    }
    if (r.ncr_id) {
      existing.ncrCount += 1;
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.period.localeCompare(b.period));
}

export async function getPjoBreakdownByEmployee(filters: ListPjosInput): Promise<PjoBreakdownRow[]> {
  const { pjos, responses } = await fetchPjosAndResponses(filters);
  const byKey = new Map<string, PjoBreakdownRow>();

  const responsesByPjo = new Map<UUID, PjoResponse[]>();
  for (const r of responses) {
    const arr = responsesByPjo.get(r.pjo_id) ?? [];
    arr.push(r);
    responsesByPjo.set(r.pjo_id, arr);
  }

  for (const p of pjos) {
    const key = (p.employee_user_id ?? p.employee_name ?? 'unknown') as unknown as string;
    const label = p.employee_name || 'Unknown employee';
    const existing = byKey.get(key) ?? {
      key,
      label,
      pjoCount: 0,
      responses: 0,
      nonCompliantResponses: 0,
      ncrCount: 0
    };
    existing.pjoCount += 1;

    const rList = responsesByPjo.get(p.id) ?? [];
    existing.responses += rList.length;
    existing.nonCompliantResponses += rList.filter(isNonCompliantResponse).length;
    existing.ncrCount += rList.filter((r) => r.ncr_id !== null).length;

    byKey.set(key, existing);
  }

  return Array.from(byKey.values()).sort((a, b) => a.label.localeCompare(b.label));
}

export async function getPjoBreakdownByDepartment(filters: ListPjosInput): Promise<PjoBreakdownRow[]> {
  const { pjos, responses } = await fetchPjosAndResponses(filters);
  const byKey = new Map<string, PjoBreakdownRow>();

  const responsesByPjo = new Map<UUID, PjoResponse[]>();
  for (const r of responses) {
    const arr = responsesByPjo.get(r.pjo_id) ?? [];
    arr.push(r);
    responsesByPjo.set(r.pjo_id, arr);
  }

  for (const p of pjos) {
    const key = p.department ?? 'Unspecified';
    const label = key || 'Unspecified';

    const existing = byKey.get(key) ?? {
      key,
      label,
      pjoCount: 0,
      responses: 0,
      nonCompliantResponses: 0,
      ncrCount: 0
    };
    existing.pjoCount += 1;

    const rList = responsesByPjo.get(p.id) ?? [];
    existing.responses += rList.length;
    existing.nonCompliantResponses += rList.filter(isNonCompliantResponse).length;
    existing.ncrCount += rList.filter((r) => r.ncr_id !== null).length;

    byKey.set(key, existing);
  }

  return Array.from(byKey.values()).sort((a, b) => a.label.localeCompare(b.label));
}

export async function getPjoBreakdownBySite(filters: ListPjosInput): Promise<PjoBreakdownRow[]> {
  const { pjos, responses } = await fetchPjosAndResponses(filters);
  const byKey = new Map<string, PjoBreakdownRow>();

  const responsesByPjo = new Map<UUID, PjoResponse[]>();
  for (const r of responses) {
    const arr = responsesByPjo.get(r.pjo_id) ?? [];
    arr.push(r);
    responsesByPjo.set(r.pjo_id, arr);
  }

  for (const p of pjos) {
    const key = p.site ?? 'Unspecified';
    const label = key || 'Unspecified';

    const existing = byKey.get(key) ?? {
      key,
      label,
      pjoCount: 0,
      responses: 0,
      nonCompliantResponses: 0,
      ncrCount: 0
    };
    existing.pjoCount += 1;

    const rList = responsesByPjo.get(p.id) ?? [];
    existing.responses += rList.length;
    existing.nonCompliantResponses += rList.filter(isNonCompliantResponse).length;
    existing.ncrCount += rList.filter((r) => r.ncr_id !== null).length;

    byKey.set(key, existing);
  }

  return Array.from(byKey.values()).sort((a, b) => a.label.localeCompare(b.label));
}

export async function getPjoQuestionCategoryStats(filters: ListPjosInput): Promise<PjoCategoryStatsRow[]> {
  const { responses } = await fetchPjosAndResponses(filters);
  if (responses.length === 0) return [];

  const byCategory = new Map<string, PjoCategoryStatsRow>();
  for (const r of responses) {
    const cat = (r.category ?? 'Uncategorised').trim() || 'Uncategorised';
    const existing = byCategory.get(cat) ?? {
      category: cat,
      responses: 0,
      nonCompliantResponses: 0,
      ncrCount: 0
    };
    existing.responses += 1;
    if (isNonCompliantResponse(r)) {
      existing.nonCompliantResponses += 1;
    }
    if (r.ncr_id) {
      existing.ncrCount += 1;
    }
    byCategory.set(cat, existing);
  }

  return Array.from(byCategory.values()).sort((a, b) => a.category.localeCompare(b.category));
}

export async function getPjoNcrStats(filters: ListPjosInput): Promise<PjoNcrStats> {
  const { responses } = await fetchPjosAndResponses(filters);
  const ncrIds = Array.from(
    new Set(
      responses
        .map((r) => r.ncr_id)
        .filter((id): id is UUID => Boolean(id))
    )
  );

  if (ncrIds.length === 0) {
    return { totalNcrs: 0, bySeverity: [], byStatus: [] };
  }

  const { data, error } = await insforge.database
    .from('quality_ncrs')
    .select('id,severity,status')
    .in('id', ncrIds);
  if (error) throw new Error(getErrorMessage(error));
  const ncrs = (data ?? []) as { id: UUID; severity: string; status: string }[];

  const bySeverityMap = new Map<string, number>();
  const byStatusMap = new Map<string, number>();

  for (const n of ncrs) {
    bySeverityMap.set(n.severity, (bySeverityMap.get(n.severity) ?? 0) + 1);
    byStatusMap.set(n.status, (byStatusMap.get(n.status) ?? 0) + 1);
  }

  return {
    totalNcrs: ncrs.length,
    bySeverity: Array.from(bySeverityMap.entries()).map(([severity, count]) => ({ severity, count })),
    byStatus: Array.from(byStatusMap.entries()).map(([status, count]) => ({ status, count }))
  };
}

