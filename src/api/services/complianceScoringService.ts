import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import type {
  ComplianceDomainKey,
  ComplianceIsoRecordLink,
  ComplianceScoreRun,
  ComplianceScoreRunDomain,
  MonthlyComplianceReport,
  UUID
} from '../models/entities';
import { createActivityLog } from './activityLogService';
import { getRolling12Period, getCustomPeriod } from './kpiFormulasService';
import { getISOClauses, type ISOStandard } from './isoMappingService';

export const COMPLIANCE_DOMAIN_WEIGHTS: Record<ComplianceDomainKey, number> = {
  documents: 20,
  training: 20,
  risks: 20,
  incidents: 20,
  audits: 20
};

export type ComplianceRagStatus = 'green' | 'yellow' | 'red';

export type ComplianceScore = {
  id: UUID;
  company_id: UUID;
  module: ComplianceDomainKey | 'overall';
  score: number;
  percentage_complete: number;
  total_items: number;
  completed_items: number;
  overdue_items: number;
  high_priority_items: number;
  last_calculated_at: string;
  updated_at: string;
};

export type ComplianceDomainSummary = {
  domainKey: ComplianceDomainKey;
  label: string;
  weight: number;
  scorePercentage: number;
  ragStatus: ComplianceRagStatus;
  totalCount: number;
  compliantCount: number;
  overdueCount: number;
  attentionCount: number;
  trendDelta: number;
  drilldownRecords: Array<Record<string, unknown>>;
};

export type ComplianceAiInsight = {
  predictedDeteriorationRisk: number;
  nextMonthRiskFlag: 'low' | 'medium' | 'high' | 'critical';
  topGaps: Array<{ domain: ComplianceDomainKey; label: string; impact: number }>;
  recommendations: Array<{ title: string; reason: string; action: string }>;
};

export type ComplianceDashboardData = {
  overall: {
    scorePercentage: number;
    ragStatus: ComplianceRagStatus;
    weightedScore: number;
    generatedAt: string;
  };
  domains: ComplianceDomainSummary[];
  aiInsight: ComplianceAiInsight;
  trendHistory: Array<{ month: string; scorePercentage: number; ragStatus: ComplianceRagStatus }>;
  isoSummary: Array<{
    standard: ISOStandard;
    scorePercentage: number;
    totalLinks: number;
    compliantLinks: number;
    byClause: Array<{
      clauseNumber: string;
      clauseTitle: string;
      scorePercentage: number;
      recordCount: number;
    }>;
  }>;
  topRisks: Array<Record<string, unknown>>;
  overdueActions: Array<Record<string, unknown>>;
};

type DomainMetricAccumulator = {
  totalCount: number;
  compliantCount: number;
  overdueCount: number;
  attentionCount: number;
  drilldownRecords: Array<Record<string, unknown>>;
};

function toIsoMonth(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function toMonthDate(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export function calculateComplianceRagStatus(scorePercentage: number): ComplianceRagStatus {
  if (scorePercentage >= 85) return 'green';
  if (scorePercentage >= 70) return 'yellow';
  return 'red';
}

function safePercentage(numerator: number, denominator: number): number {
  if (denominator <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((numerator / denominator) * 10000) / 100));
}

function sanitizeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function buildAiInsight(domains: ComplianceDomainSummary[]): ComplianceAiInsight {
  const orderedGaps = [...domains]
    .map((domain) => ({
      domain: domain.domainKey,
      label: domain.label,
      impact: Number((100 - domain.scorePercentage).toFixed(2))
    }))
    .sort((a, b) => b.impact - a.impact);

  const averageGap =
    orderedGaps.length > 0
      ? orderedGaps.reduce((sum, item) => sum + item.impact, 0) / orderedGaps.length
      : 0;

  const predictedDeteriorationRisk = Math.min(
    100,
    Math.round(
      averageGap +
        domains.reduce((sum, domain) => sum + domain.overdueCount * 2 + domain.attentionCount, 0) /
          Math.max(domains.length, 1)
    )
  );

  const nextMonthRiskFlag =
    predictedDeteriorationRisk >= 75 ? 'critical' :
    predictedDeteriorationRisk >= 55 ? 'high' :
    predictedDeteriorationRisk >= 30 ? 'medium' :
    'low';

  return {
    predictedDeteriorationRisk,
    nextMonthRiskFlag,
    topGaps: orderedGaps.slice(0, 3),
    recommendations: orderedGaps.slice(0, 3).map((gap) => ({
      title: `Improve ${gap.label}`,
      reason: `${gap.label} is contributing a ${gap.impact.toFixed(1)} point compliance gap.`,
      action:
        gap.domain === 'documents' ? 'Review overdue documents and publish approvals.' :
        gap.domain === 'training' ? 'Complete expired or overdue employee training assignments.' :
        gap.domain === 'risks' ? 'Close overdue risk actions and schedule pending reviews.' :
        gap.domain === 'incidents' ? 'Close aged incidents and linked corrective actions.' :
        'Respond to overdue audit findings and finalize scheduled audits.'
    }))
  };
}

async function getComplianceScoreTableRow(companyId: UUID, module: ComplianceDomainKey | 'overall'): Promise<ComplianceScore | null> {
  const { data, error } = await insforge.database
    .from('compliance_scores')
    .select('*')
    .eq('company_id', companyId)
    .eq('module', module)
    .maybeSingle();

  if (error) throw new Error(getErrorMessage(error));
  return (data ?? null) as ComplianceScore | null;
}

export async function getComplianceScore(companyId: UUID, module: ComplianceDomainKey | 'overall'): Promise<ComplianceScore | null> {
  return getComplianceScoreTableRow(companyId, module);
}

export async function listComplianceScores(companyId: UUID): Promise<ComplianceScore[]> {
  const { data, error } = await insforge.database
    .from('compliance_scores')
    .select('*')
    .eq('company_id', companyId)
    .order('module', { ascending: true });
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as ComplianceScore[];
}

async function listRecentComplianceScoreRuns(companyId: UUID, limit = 12): Promise<ComplianceScoreRun[]> {
  const { data, error } = await insforge.database
    .from('compliance_score_runs')
    .select('*')
    .eq('company_id', companyId)
    .order('effective_month', { ascending: false })
    .order('generated_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as ComplianceScoreRun[];
}

async function listComplianceScoreRunDomains(runId: UUID): Promise<ComplianceScoreRunDomain[]> {
  const { data, error } = await insforge.database
    .from('compliance_score_run_domains')
    .select('*')
    .eq('run_id', runId)
    .order('domain_key', { ascending: true });
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as ComplianceScoreRunDomain[];
}

export async function listComplianceIsoLinks(companyId: UUID): Promise<ComplianceIsoRecordLink[]> {
  const { data, error } = await insforge.database
    .from('compliance_iso_record_links')
    .select('*')
    .eq('company_id', companyId)
    .order('standard_key', { ascending: true })
    .order('clause_number', { ascending: true });
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as ComplianceIsoRecordLink[];
}

export async function upsertComplianceIsoLink(input: {
  companyId: UUID;
  standardKey: ISOStandard;
  clauseNumber: string;
  clauseTitle: string;
  moduleKey?: string | null;
  sourceTable: string;
  sourceRecordId: UUID;
  complianceStatus: ComplianceIsoRecordLink['compliance_status'];
  evidenceDocumentIds?: UUID[] | null;
  evidenceLinks?: Array<Record<string, unknown>>;
  notes?: string | null;
  linkedByUserId?: UUID | null;
}): Promise<ComplianceIsoRecordLink> {
  const { data, error } = await insforge.database
    .from('compliance_iso_record_links')
    .upsert(
      {
        company_id: input.companyId,
        standard_key: input.standardKey,
        clause_number: input.clauseNumber,
        clause_title: input.clauseTitle,
        module_key: input.moduleKey ?? null,
        source_table: input.sourceTable,
        source_record_id: input.sourceRecordId,
        compliance_status: input.complianceStatus,
        evidence_document_ids: input.evidenceDocumentIds ?? null,
        evidence_links: input.evidenceLinks ?? [],
        notes: input.notes ?? null,
        linked_by_user_id: input.linkedByUserId ?? null,
        updated_at: new Date().toISOString()
      },
      {
        onConflict: 'company_id,standard_key,clause_number,source_table,source_record_id'
      }
    )
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to upsert ISO compliance link.');
  return data as ComplianceIsoRecordLink;
}

async function collectDomainMetrics(companyId: UUID): Promise<Record<ComplianceDomainKey, ComplianceDomainSummary>> {
  const todayIso = new Date().toISOString();
  const todayDate = todayIso.slice(0, 10);

  const [
    documentsResult,
    trainingResult,
    risksResult,
    incidentsResult,
    correctiveActionsResult,
    auditsResult,
    auditQuestionsResult,
    auditResponsesResult
  ] = await Promise.all([
    insforge.database
      .from('documents')
      .select('id,title,status,review_due_at,updated_at,module')
      .eq('company_id', companyId)
      .limit(1000),
    insforge.database
      .from('training_records')
      .select('id,user_id,status,completed_at,expires_at,course_id')
      .eq('company_id', companyId)
      .limit(2000),
    insforge.database
      .from('risk_assessments')
      .select('id,title,status,assessment_date,review_due_at,high_risks,total_risks,updated_at')
      .eq('company_id', companyId)
      .limit(1000),
    insforge.database
      .from('incidents')
      .select('id,title,status,severity,occurred_at,updated_at')
      .eq('company_id', companyId)
      .limit(1000),
    insforge.database
      .from('corrective_actions')
      .select('id,title,status,source_type,source_id,due_date,completed_date,priority')
      .eq('company_id', companyId)
      .limit(2000),
    insforge.database
      .from('audits')
      .select('id,title,objectives,status,selected_date,proposed_dates,created_at,report_submitted_at,findings_count,nonconformances_count')
      .eq('company_id', companyId)
      .limit(1000),
    insforge.database
      .from('audit_questions')
      .select('id,audit_id,allocated_score')
      .limit(4000),
    insforge.database
      .from('audit_responses')
      .select('id,audit_question_id,is_compliant,achieved_score')
      .limit(4000)
  ]);

  for (const result of [
    documentsResult,
    trainingResult,
    risksResult,
    incidentsResult,
    correctiveActionsResult,
    auditsResult,
    auditQuestionsResult,
    auditResponsesResult
  ]) {
    if (result.error) throw new Error(getErrorMessage(result.error));
  }

  const documents = sanitizeArray(documentsResult.data as Array<Record<string, unknown>>);
  const trainingRecords = sanitizeArray(trainingResult.data as Array<Record<string, unknown>>);
  const risks = sanitizeArray(risksResult.data as Array<Record<string, unknown>>);
  const incidents = sanitizeArray(incidentsResult.data as Array<Record<string, unknown>>);
  const correctiveActions = sanitizeArray(correctiveActionsResult.data as Array<Record<string, unknown>>);
  const audits = sanitizeArray(auditsResult.data as Array<Record<string, unknown>>);
  const auditQuestions = sanitizeArray(auditQuestionsResult.data as Array<Record<string, unknown>>);
  const auditResponses = sanitizeArray(auditResponsesResult.data as Array<Record<string, unknown>>);

  const metricAccumulators: Record<ComplianceDomainKey, DomainMetricAccumulator> = {
    documents: { totalCount: 0, compliantCount: 0, overdueCount: 0, attentionCount: 0, drilldownRecords: [] },
    training: { totalCount: 0, compliantCount: 0, overdueCount: 0, attentionCount: 0, drilldownRecords: [] },
    risks: { totalCount: 0, compliantCount: 0, overdueCount: 0, attentionCount: 0, drilldownRecords: [] },
    incidents: { totalCount: 0, compliantCount: 0, overdueCount: 0, attentionCount: 0, drilldownRecords: [] },
    audits: { totalCount: 0, compliantCount: 0, overdueCount: 0, attentionCount: 0, drilldownRecords: [] }
  };

  for (const document of documents) {
    metricAccumulators.documents.totalCount += 1;
    const isApproved = document.status === 'approved';
    const isOverdue = Boolean(document.review_due_at) && String(document.review_due_at).slice(0, 10) < todayDate;
    if (isApproved && !isOverdue) metricAccumulators.documents.compliantCount += 1;
    if (isOverdue) metricAccumulators.documents.overdueCount += 1;
    if (!isApproved) metricAccumulators.documents.attentionCount += 1;
    metricAccumulators.documents.drilldownRecords.push({
      id: document.id,
      label: document.title,
      status: document.status,
      dueDate: document.review_due_at,
      module: document.module
    });
  }

  for (const record of trainingRecords) {
    metricAccumulators.training.totalCount += 1;
    const isCompleted = record.status === 'COMPLETED';
    const isExpired = Boolean(record.expires_at) && String(record.expires_at) < todayIso;
    const needsAttention = record.status === 'REQUIRED' || record.status === 'OVERDUE' || isExpired;
    if (isCompleted && !isExpired) metricAccumulators.training.compliantCount += 1;
    if (isExpired || record.status === 'OVERDUE') metricAccumulators.training.overdueCount += 1;
    if (needsAttention) metricAccumulators.training.attentionCount += 1;
    metricAccumulators.training.drilldownRecords.push({
      id: record.id,
      label: record.course_id ?? record.id,
      status: record.status,
      userId: record.user_id,
      expiresAt: record.expires_at
    });
  }

  for (const risk of risks) {
    metricAccumulators.risks.totalCount += 1;
    const overdue = Boolean(risk.review_due_at) && String(risk.review_due_at) < todayIso;
    const compliant = ['approved', 'active', 'closed'].includes(String(risk.status)) && Number(risk.high_risks ?? 0) === 0;
    if (compliant) metricAccumulators.risks.compliantCount += 1;
    if (overdue) metricAccumulators.risks.overdueCount += 1;
    if (Number(risk.high_risks ?? 0) > 0 || !compliant) metricAccumulators.risks.attentionCount += 1;
    metricAccumulators.risks.drilldownRecords.push({
      id: risk.id,
      label: risk.title,
      status: risk.status,
      highRisks: risk.high_risks,
      reviewDueAt: risk.review_due_at
    });
  }

  const incidentActionsBySource = new Map<string, Array<Record<string, unknown>>>();
  for (const action of correctiveActions) {
    const key = `${action.source_type}:${action.source_id}`;
    const list = incidentActionsBySource.get(key) ?? [];
    list.push(action);
    incidentActionsBySource.set(key, list);
  }

  for (const incident of incidents) {
    metricAccumulators.incidents.totalCount += 1;
    const linkedActions = incidentActionsBySource.get(`incident:${incident.id}`) ?? [];
    const overdueLinkedActions = linkedActions.filter(
      (action) =>
        action.due_date &&
        String(action.due_date).slice(0, 10) < todayDate &&
        !['completed', 'verified', 'closed'].includes(String(action.status))
    );
    const compliant = incident.status === 'closed' && overdueLinkedActions.length === 0;
    if (compliant) metricAccumulators.incidents.compliantCount += 1;
    if (overdueLinkedActions.length > 0) metricAccumulators.incidents.overdueCount += overdueLinkedActions.length;
    if (incident.status !== 'closed' || overdueLinkedActions.length > 0) metricAccumulators.incidents.attentionCount += 1;
    metricAccumulators.incidents.drilldownRecords.push({
      id: incident.id,
      label: incident.title,
      status: incident.status,
      severity: incident.severity,
      occurredAt: incident.occurred_at,
      overdueActionCount: overdueLinkedActions.length
    });
  }

  const questionsByAuditId = new Map<UUID, Array<Record<string, unknown>>>();
  for (const question of auditQuestions) {
    const list = questionsByAuditId.get(question.audit_id as UUID) ?? [];
    list.push(question);
    questionsByAuditId.set(question.audit_id as UUID, list);
  }

  const responseByQuestionId = new Map<UUID, Record<string, unknown>>();
  for (const response of auditResponses) {
    if (!responseByQuestionId.has(response.audit_question_id as UUID)) {
      responseByQuestionId.set(response.audit_question_id as UUID, response);
    }
  }

  for (const audit of audits) {
    metricAccumulators.audits.totalCount += 1;
    const selectedDate = audit.selected_date ? String(audit.selected_date).slice(0, 10) : null;
    const overdue = selectedDate ? selectedDate < todayDate && !['completed', 'archived'].includes(String(audit.status)) : false;
    const questions = questionsByAuditId.get(audit.id as UUID) ?? [];
    const totalPossibleScore = questions.reduce((sum, question) => sum + (Number(question.allocated_score) || 1), 0);
    const achievedScore = questions.reduce((sum, question) => {
      const response = responseByQuestionId.get(question.id as UUID);
      if (!response) return sum;
      if (response.achieved_score != null) return sum + Number(response.achieved_score || 0);
      return sum + (response.is_compliant ? Number(question.allocated_score) || 1 : 0);
    }, 0);
    const auditScore = totalPossibleScore > 0 ? achievedScore / totalPossibleScore : (audit.status === 'completed' ? 1 : 0);
    const compliant = audit.status === 'completed' && Number(audit.nonconformances_count ?? 0) === 0 && auditScore >= 0.85;
    if (compliant) metricAccumulators.audits.compliantCount += 1;
    if (overdue) metricAccumulators.audits.overdueCount += 1;
    if (!compliant || Number(audit.findings_count ?? 0) > 0) metricAccumulators.audits.attentionCount += 1;
    metricAccumulators.audits.drilldownRecords.push({
      id: audit.id,
      label: audit.title ?? audit.objectives ?? audit.id,
      status: audit.status,
      selectedDate,
      findingsCount: audit.findings_count,
      nonconformancesCount: audit.nonconformances_count,
      scorePercentage: Number((auditScore * 100).toFixed(2))
    });
  }

  const recentRuns = await listRecentComplianceScoreRuns(companyId, 2).catch(() => []);
  const previousRun = recentRuns.length > 0 ? recentRuns[0] : null;
  const previousDomains = previousRun ? await listComplianceScoreRunDomains(previousRun.id).catch(() => []) : [];
  return {
    documents: {
      domainKey: 'documents',
      label: 'Documents',
      weight: COMPLIANCE_DOMAIN_WEIGHTS.documents,
      scorePercentage: safePercentage(
        metricAccumulators.documents.compliantCount,
        metricAccumulators.documents.totalCount
      ),
      ragStatus: 'red',
      totalCount: metricAccumulators.documents.totalCount,
      compliantCount: metricAccumulators.documents.compliantCount,
      overdueCount: metricAccumulators.documents.overdueCount,
      attentionCount: metricAccumulators.documents.attentionCount,
      trendDelta: 0,
      drilldownRecords: metricAccumulators.documents.drilldownRecords.slice(0, 25)
    },
    training: {
      domainKey: 'training',
      label: 'Training',
      weight: COMPLIANCE_DOMAIN_WEIGHTS.training,
      scorePercentage: safePercentage(metricAccumulators.training.compliantCount, metricAccumulators.training.totalCount),
      ragStatus: 'red',
      totalCount: metricAccumulators.training.totalCount,
      compliantCount: metricAccumulators.training.compliantCount,
      overdueCount: metricAccumulators.training.overdueCount,
      attentionCount: metricAccumulators.training.attentionCount,
      trendDelta: 0,
      drilldownRecords: metricAccumulators.training.drilldownRecords.slice(0, 25)
    },
    risks: {
      domainKey: 'risks',
      label: 'Risks',
      weight: COMPLIANCE_DOMAIN_WEIGHTS.risks,
      scorePercentage: safePercentage(metricAccumulators.risks.compliantCount, metricAccumulators.risks.totalCount),
      ragStatus: 'red',
      totalCount: metricAccumulators.risks.totalCount,
      compliantCount: metricAccumulators.risks.compliantCount,
      overdueCount: metricAccumulators.risks.overdueCount,
      attentionCount: metricAccumulators.risks.attentionCount,
      trendDelta: 0,
      drilldownRecords: metricAccumulators.risks.drilldownRecords.slice(0, 25)
    },
    incidents: {
      domainKey: 'incidents',
      label: 'Incidents',
      weight: COMPLIANCE_DOMAIN_WEIGHTS.incidents,
      scorePercentage: safePercentage(
        metricAccumulators.incidents.compliantCount,
        metricAccumulators.incidents.totalCount
      ),
      ragStatus: 'red',
      totalCount: metricAccumulators.incidents.totalCount,
      compliantCount: metricAccumulators.incidents.compliantCount,
      overdueCount: metricAccumulators.incidents.overdueCount,
      attentionCount: metricAccumulators.incidents.attentionCount,
      trendDelta: 0,
      drilldownRecords: metricAccumulators.incidents.drilldownRecords.slice(0, 25)
    },
    audits: {
      domainKey: 'audits',
      label: 'Audits',
      weight: COMPLIANCE_DOMAIN_WEIGHTS.audits,
      scorePercentage: safePercentage(metricAccumulators.audits.compliantCount, metricAccumulators.audits.totalCount),
      ragStatus: 'red',
      totalCount: metricAccumulators.audits.totalCount,
      compliantCount: metricAccumulators.audits.compliantCount,
      overdueCount: metricAccumulators.audits.overdueCount,
      attentionCount: metricAccumulators.audits.attentionCount,
      trendDelta: 0,
      drilldownRecords: metricAccumulators.audits.drilldownRecords.slice(0, 25)
    }
  } satisfies Record<ComplianceDomainKey, ComplianceDomainSummary>;
}

function finalizeDomains(domains: Record<ComplianceDomainKey, ComplianceDomainSummary>): ComplianceDomainSummary[] {
  return (Object.keys(domains) as ComplianceDomainKey[]).map((key) => {
    const previousScore = 0;
    const domain = domains[key];
    const scorePercentage = Number(domain.scorePercentage.toFixed(2));
    return {
      ...domain,
      scorePercentage,
      ragStatus: calculateComplianceRagStatus(scorePercentage),
      trendDelta: Number((scorePercentage - previousScore).toFixed(2))
    };
  });
}

async function upsertLegacyComplianceRow(
  companyId: UUID,
  module: ComplianceDomainKey | 'overall',
  scorePercentage: number,
  totals: { totalCount: number; compliantCount: number; overdueCount: number; attentionCount: number }
): Promise<ComplianceScore> {
  const existing = await getComplianceScoreTableRow(companyId, module);
  const payload = {
    company_id: companyId,
    module,
    score: scorePercentage,
    percentage_complete: scorePercentage,
    total_items: totals.totalCount,
    completed_items: totals.compliantCount,
    overdue_items: totals.overdueCount,
    high_priority_items: totals.attentionCount,
    last_calculated_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const query = existing
    ? insforge.database.from('compliance_scores').update(payload).eq('id', existing.id)
    : insforge.database.from('compliance_scores').insert(payload);

  const { data, error } = await query.select('*').single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to persist legacy compliance score row.');
  return data as ComplianceScore;
}

export async function calculateComplianceScore(
  companyId: UUID,
  module: ComplianceDomainKey,
  updatedByUserId: UUID
): Promise<ComplianceScore> {
  const domains = finalizeDomains(await collectDomainMetrics(companyId));
  const selected = domains.find((domain) => domain.domainKey === module);
  if (!selected) throw new Error(`Unsupported compliance domain: ${module}`);

  const safeScore = Number.isFinite(selected.scorePercentage) ? selected.scorePercentage : 0;
  const legacyRow = await upsertLegacyComplianceRow(companyId, module, safeScore, {
    totalCount: selected.totalCount ?? 0,
    compliantCount: selected.compliantCount ?? 0,
    overdueCount: selected.overdueCount ?? 0,
    attentionCount: selected.attentionCount ?? 0
  });

  await createActivityLog({
    companyId,
    actorUserId: updatedByUserId,
    action: 'compliance_scores.calculate_domain',
    entityType: 'compliance_score',
    entityId: legacyRow.id,
    metadata: {
      module,
      scorePercentage: selected.scorePercentage,
      ragStatus: selected.ragStatus
    }
  });

  return legacyRow;
}

export async function calculateOverallScore(companyId: UUID, updatedByUserId: UUID): Promise<ComplianceScore> {
  const rawDomains = await collectDomainMetrics(companyId);
  const domains = finalizeDomains(rawDomains);
  const rawWeightedScore = domains.length === 0
    ? 0
    : domains.reduce((sum, domain) => sum + (Number.isFinite(domain.scorePercentage) ? domain.scorePercentage : 0) * (domain.weight / 100), 0);
  const weightedScore = Number(rawWeightedScore.toFixed(2));
  const ragStatus = calculateComplianceRagStatus(weightedScore);
  const aiInsight = buildAiInsight(domains);
  const effectiveMonth = toMonthDate();

  const { data: runData, error: runError } = await insforge.database
    .from('compliance_score_runs')
    .insert({
      company_id: companyId,
      score_kind: 'overall',
      score_percentage: weightedScore,
      rag_status: ragStatus,
      weighted_score: weightedScore,
      generated_by_user_id: updatedByUserId === 'system' ? null : updatedByUserId,
      effective_month: effectiveMonth,
      ai_predicted_deterioration_risk: aiInsight.predictedDeteriorationRisk,
      ai_next_month_risk_flag: aiInsight.nextMonthRiskFlag,
      ai_recommendations: aiInsight.recommendations,
      ai_top_gaps: aiInsight.topGaps,
      metadata: {
        domainCount: domains.length
      }
    })
    .select('*')
    .single();
  if (runError) throw new Error(getErrorMessage(runError));
  if (!runData) throw new Error('Failed to create compliance score run.');

  const run = runData as ComplianceScoreRun;

  for (const domain of domains) {
    const { error } = await insforge.database.from('compliance_score_run_domains').upsert(
      {
        run_id: run.id,
        company_id: companyId,
        domain_key: domain.domainKey,
        domain_label: domain.label,
        weight: domain.weight,
        score_percentage: domain.scorePercentage,
        rag_status: domain.ragStatus,
        total_count: domain.totalCount,
        compliant_count: domain.compliantCount,
        overdue_count: domain.overdueCount,
        attention_count: domain.attentionCount,
        trend_delta: domain.trendDelta,
        drilldown_records: domain.drilldownRecords
      },
      { onConflict: 'run_id,domain_key' }
    );
    if (error) throw new Error(getErrorMessage(error));

    await upsertLegacyComplianceRow(companyId, domain.domainKey, domain.scorePercentage, {
      totalCount: domain.totalCount,
      compliantCount: domain.compliantCount,
      overdueCount: domain.overdueCount,
      attentionCount: domain.attentionCount
    });
  }

  const totalCount = domains.reduce((sum, domain) => sum + domain.totalCount, 0);
  const compliantCount = domains.reduce((sum, domain) => sum + domain.compliantCount, 0);
  const overdueCount = domains.reduce((sum, domain) => sum + domain.overdueCount, 0);
  const attentionCount = domains.reduce((sum, domain) => sum + domain.attentionCount, 0);

  const legacyOverall = await upsertLegacyComplianceRow(companyId, 'overall', weightedScore, {
    totalCount,
    compliantCount,
    overdueCount,
    attentionCount
  });

  if (updatedByUserId !== 'system') {
    await createActivityLog({
      companyId,
      actorUserId: updatedByUserId,
      action: 'compliance_scores.calculate_overall',
      entityType: 'compliance_score',
      entityId: run.id,
      metadata: {
        weightedScore,
        ragStatus,
        effectiveMonth,
        predictedDeteriorationRisk: aiInsight.predictedDeteriorationRisk
      }
    });
  }

  return legacyOverall;
}

function mapRunDomainToSummary(domain: ComplianceScoreRunDomain): ComplianceDomainSummary {
  return {
    domainKey: domain.domain_key as ComplianceDomainKey,
    label: domain.domain_label,
    weight: Number(domain.weight ?? COMPLIANCE_DOMAIN_WEIGHTS[domain.domain_key as ComplianceDomainKey] ?? 20),
    scorePercentage: Number(domain.score_percentage ?? 0),
    ragStatus: (domain.rag_status as ComplianceRagStatus) ?? 'red',
    totalCount: Number(domain.total_count ?? 0),
    compliantCount: Number(domain.compliant_count ?? 0),
    overdueCount: Number(domain.overdue_count ?? 0),
    attentionCount: Number(domain.attention_count ?? 0),
    trendDelta: Number(domain.trend_delta ?? 0),
    drilldownRecords: sanitizeArray(domain.drilldown_records as Array<Record<string, unknown>>)
  };
}

async function getIsoSummary(companyId: UUID): Promise<ComplianceDashboardData['isoSummary']> {
  const links = await listComplianceIsoLinks(companyId).catch(() => []);
  const standards: ISOStandard[] = ['iso45001', 'iso9001', 'iso14001'];

  return standards.map((standard) => {
    const standardLinks = links.filter((link) => link.standard_key === standard);
    const compliantLinks = standardLinks.filter((link) => link.compliance_status === 'compliant').length;
    const clauses = getISOClauses(standard);
    const byClause = Object.values(clauses).map((clause) => {
      const clauseLinks = standardLinks.filter((link) => link.clause_number === clause.clauseNumber);
      const clauseCompliant = clauseLinks.filter((link) => link.compliance_status === 'compliant').length;
      return {
        clauseNumber: clause.clauseNumber,
        clauseTitle: clause.title,
        scorePercentage: safePercentage(clauseCompliant, clauseLinks.length),
        recordCount: clauseLinks.length
      };
    });

    return {
      standard,
      scorePercentage: safePercentage(compliantLinks, standardLinks.length),
      totalLinks: standardLinks.length,
      compliantLinks,
      byClause
    };
  });
}

async function getTopRisks(companyId: UUID): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await insforge.database
    .from('risk_assessments')
    .select('id,title,high_risks,total_risks,status,review_due_at')
    .eq('company_id', companyId)
    .order('high_risks', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(5);
  if (error) throw new Error(getErrorMessage(error));
  return sanitizeArray(data as Array<Record<string, unknown>>);
}

async function getOverdueActions(companyId: UUID): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await insforge.database
    .from('corrective_actions')
    .select('id,title,status,due_date,priority,source_type')
    .eq('company_id', companyId)
    .lt('due_date', new Date().toISOString().slice(0, 10))
    .not('status', 'in', '("completed","verified","closed")')
    .order('due_date', { ascending: true })
    .limit(10);
  if (error) throw new Error(getErrorMessage(error));
  return sanitizeArray(data as Array<Record<string, unknown>>);
}

export async function getComplianceDashboardData(companyId: UUID): Promise<ComplianceDashboardData> {
  let latestRun = (await listRecentComplianceScoreRuns(companyId, 1))[0] ?? null;
  if (!latestRun) {
    // System-generated run to guarantee dashboard availability.
    await calculateOverallScore(companyId, 'system');
    latestRun = (await listRecentComplianceScoreRuns(companyId, 1))[0] ?? null;
  }
  if (!latestRun) {
    throw new Error('Unable to generate compliance dashboard data.');
  }

  const [runDomains, recentRuns, isoSummary, topRisks, overdueActions] = await Promise.all([
    listComplianceScoreRunDomains(latestRun.id),
    listRecentComplianceScoreRuns(companyId, 12),
    getIsoSummary(companyId),
    getTopRisks(companyId),
    getOverdueActions(companyId)
  ]);

  const domains = runDomains.map(mapRunDomainToSummary);
  const aiInsight: ComplianceAiInsight = {
    predictedDeteriorationRisk: Number(latestRun.ai_predicted_deterioration_risk ?? 0),
    nextMonthRiskFlag: (latestRun.ai_next_month_risk_flag as ComplianceAiInsight['nextMonthRiskFlag']) ?? 'low',
    topGaps: sanitizeArray(latestRun.ai_top_gaps as ComplianceAiInsight['topGaps']),
    recommendations: sanitizeArray(latestRun.ai_recommendations as ComplianceAiInsight['recommendations'])
  };

  return {
    overall: {
      scorePercentage: Number(latestRun.score_percentage ?? 0),
      ragStatus: (latestRun.rag_status as ComplianceRagStatus) ?? 'red',
      weightedScore: Number(latestRun.weighted_score ?? latestRun.score_percentage ?? 0),
      generatedAt: latestRun.generated_at
    },
    domains,
    aiInsight,
    trendHistory: recentRuns
      .slice()
      .reverse()
      .map((run) => ({
        month: toIsoMonth(new Date(run.effective_month)),
        scorePercentage: Number(run.score_percentage ?? 0),
        ragStatus: (run.rag_status as ComplianceRagStatus) ?? 'red'
      })),
    isoSummary,
    topRisks,
    overdueActions
  };
}

export async function generateMonthlyComplianceReport(input: {
  companyId: UUID;
  reportMonth?: string;
  recipientEmails: string[];
  createdByUserId?: UUID | null;
}): Promise<MonthlyComplianceReport> {
  const reportMonth = input.reportMonth ?? toMonthDate();

  // Build a KpiPeriod for just the report month (YYYY-MM-01 to last day of month).
  const rmDate = new Date(reportMonth);
  const rmYear = rmDate.getUTCFullYear();
  const rmMonthNum = rmDate.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(rmYear, rmMonthNum, 0)).toISOString().slice(0, 10);
  const monthPeriod = getCustomPeriod(
    `${String(rmYear)}-${String(rmMonthNum).padStart(2, '0')}-01`,
    lastDay
  );

  const kpi = await import('./kpiFormulasService');
  const [dashboard, existingRun, safetyKpis, complianceKpis, qualityKpis, environmentalKpis, ltiFreeHours, safetyRolling12] =
    await Promise.all([
      getComplianceDashboardData(input.companyId),
      listRecentComplianceScoreRuns(input.companyId, 1).then((rows) => rows[0] ?? null),
      kpi.getSafetyKpis(input.companyId, { period: monthPeriod }),
      kpi.getComplianceKpis(input.companyId, { period: monthPeriod }),
      kpi.getQualityKpis(input.companyId, { period: monthPeriod }),
      kpi.getEnvironmentalKpis(input.companyId, { period: monthPeriod }),
      kpi.getLtiFreeHours(input.companyId),
      kpi.getSafetyKpis(input.companyId, { period: getRolling12Period() })
    ]);

  const { data, error } = await insforge.database
    .from('monthly_compliance_reports')
    .upsert(
      {
        company_id: input.companyId,
        report_month: reportMonth,
        generated_from_run_id: existingRun?.id ?? null,
        recipient_emails: input.recipientEmails,
        status: 'queued',
        summary: {
          overall: dashboard.overall,
          topRisks: dashboard.topRisks,
          overdueActions: dashboard.overdueActions,
          topGaps: dashboard.aiInsight.topGaps,
          safety: safetyKpis,
          safetyRolling12,
          compliance: complianceKpis,
          quality: qualityKpis,
          environmental: environmentalKpis,
          ltiFreeHours
        },
        created_by_user_id: input.createdByUserId ?? null,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'company_id,report_month' }
    )
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create monthly compliance report.');
  return data as MonthlyComplianceReport;
}

export async function markMonthlyComplianceReportSent(input: {
  reportId: UUID;
  status: 'sent' | 'failed';
  deliveryError?: string | null;
}): Promise<void> {
  const { error } = await insforge.database
    .from('monthly_compliance_reports')
    .update({
      status: input.status,
      sent_at: input.status === 'sent' ? new Date().toISOString() : null,
      delivery_error: input.deliveryError ?? null,
      updated_at: new Date().toISOString()
    })
    .eq('id', input.reportId);
  if (error) throw new Error(getErrorMessage(error));
}

export async function getComplianceSummary(companyId: UUID): Promise<{
  overallScore: ComplianceScore | null;
  moduleScores: ComplianceScore[];
  statusByModule: Record<string, { score: number; status: string }>;
  latestRun: ComplianceScoreRun | null;
  domains: ComplianceDomainSummary[];
  aiInsight: ComplianceAiInsight | null;
}> {
  const [allScores, latestRun] = await Promise.all([
    listComplianceScores(companyId),
    listRecentComplianceScoreRuns(companyId, 1).then((rows) => rows[0] ?? null)
  ]);

  const overallScore = allScores.find((score) => score.module === 'overall') ?? null;
  const moduleScores = allScores.filter((score) => score.module !== 'overall');

  const statusByModule: Record<string, { score: number; status: string }> = {};
  for (const score of moduleScores) {
    statusByModule[score.module] = {
      score: score.score,
      status:
        score.score >= 85 ? 'green' :
        score.score >= 70 ? 'yellow' :
        'red'
    };
  }

  const domains = latestRun ? (await listComplianceScoreRunDomains(latestRun.id)).map(mapRunDomainToSummary) : [];
  const aiInsight = latestRun
    ? {
        predictedDeteriorationRisk: Number(latestRun.ai_predicted_deterioration_risk ?? 0),
        nextMonthRiskFlag: (latestRun.ai_next_month_risk_flag as ComplianceAiInsight['nextMonthRiskFlag']) ?? 'low',
        topGaps: sanitizeArray(latestRun.ai_top_gaps as ComplianceAiInsight['topGaps']),
        recommendations: sanitizeArray(latestRun.ai_recommendations as ComplianceAiInsight['recommendations'])
      }
    : null;

  return {
    overallScore,
    moduleScores,
    statusByModule,
    latestRun,
    domains,
    aiInsight
  };
}

export function buildComplianceExcelRows(data: ComplianceDashboardData): Array<Record<string, string | number>> {
  const rows: Array<Record<string, string | number>> = [
    {
      section: 'Overall',
      label: 'Compliance score',
      value: data.overall.scorePercentage,
      rag_status: data.overall.ragStatus
    }
  ];

  for (const domain of data.domains) {
    rows.push({
      section: 'Domain',
      label: domain.label,
      value: domain.scorePercentage,
      rag_status: domain.ragStatus,
      overdue: domain.overdueCount,
      attention: domain.attentionCount
    });
  }

  for (const risk of data.topRisks) {
    rows.push({
      section: 'Top risk',
      label: String(risk.title ?? risk.id ?? 'Risk'),
      value: Number(risk.high_risks ?? 0),
      rag_status: String(risk.status ?? '')
    });
  }

  for (const action of data.overdueActions) {
    rows.push({
      section: 'Overdue action',
      label: String(action.title ?? action.id ?? 'Action'),
      value: String(action.due_date ?? ''),
      rag_status: String(action.priority ?? '')
    });
  }

  return rows;
}
