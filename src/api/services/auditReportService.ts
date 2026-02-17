import type { Audit, AuditReport, UUID } from '../models/entities';
import { getAudit } from './auditsService';
import { listAuditQuestions, listAuditResponses, type AuditQuestion, type AuditResponse } from './auditsService';
import { listProgramAuditFindings } from './programAuditFindingsService';
import { getPreAuditSubmission } from './preAuditSubmissionsService';
import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';

export async function listAuditReports(auditId: UUID): Promise<AuditReport[]> {
  const { data, error } = await insforge.database
    .from('audit_reports')
    .select('*')
    .eq('audit_id', auditId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as AuditReport[];
}

export async function generateAuditReport(
  auditId: UUID,
  companyId: UUID,
  createdByUserId: UUID
): Promise<AuditReport> {
  const [audit, questions, responses, findings, preSubmission] = await Promise.all([
    getAudit(auditId),
    listAuditQuestions(auditId),
    listAuditResponses(auditId),
    listProgramAuditFindings({ companyId, auditId }),
    getPreAuditSubmission(auditId)
  ]);

  if (!audit) throw new Error('Audit not found.');

  const responsesByQuestion = new Map<string, AuditResponse>();
  responses.forEach((r) => responsesByQuestion.set(r.audit_question_id, r));

  let totalAllocated = 0;
  let totalAchieved = 0;
  questions.forEach((q) => {
    const alloc = (q as any).allocated_score ?? 0;
    const resp = responsesByQuestion.get(q.id);
    const achieved = (resp as any)?.achieved_score ?? (resp?.is_compliant ? alloc : 0);
    totalAllocated += Number(alloc) || 0;
    totalAchieved += Number(achieved) || 0;
  });
  const compliancePercent =
    totalAllocated > 0 ? Math.round((totalAchieved / totalAllocated) * 100) : 0;

  const openFindings = findings.filter((f) => f.status !== 'closed').length;
  const closedFindings = findings.filter((f) => f.status === 'closed').length;
  const overdueFindings = findings.filter(
    (f) => f.due_date && f.status !== 'closed' && new Date(f.due_date) < new Date()
  ).length;

  const reportData = {
    overview: {
      auditTitle: audit.title ?? audit.objectives,
      scope: audit.scope_of_audit,
      department: (audit as any).departments_auditee_ids,
      auditDate: audit.selected_date,
      auditType: audit.audit_type,
      standardCriteria: audit.audit_criteria
    },
    participants: {
      leadAuditor: (audit as any).lead_auditor_user_id,
      auditTeam: audit.auditor_user_ids,
      companyRepresentatives: (audit as any).company_representative_user_ids
    },
    auditResults: {
      overallScore: totalAchieved,
      totalAllocated,
      compliancePercent,
      findingsCount: audit.findings_count,
      nonconformancesCount: audit.nonconformances_count,
      observationsCount: audit.observations_count
    },
    correctiveActionsSummary: {
      total: findings.length,
      open: openFindings,
      closed: closedFindings,
      overdue: overdueFindings
    },
    sections: questions.map((q: AuditQuestion) => {
      const resp = responsesByQuestion.get(q.id);
      return {
        section: q.section,
        question: q.question,
        expectedEvidence: q.expected_evidence,
        allocatedScore: (q as any).allocated_score,
        achievedScore: (resp as any)?.achieved_score,
        finding: resp?.finding,
        deviationType: resp?.deviation_type,
        riskRating: resp?.risk_rating
      };
    }),
    evidenceRegister: {
      preAuditDocs: preSubmission?.uploaded_docs ?? [],
      responseEvidence: responses.map((r) => ({
        questionId: r.audit_question_id,
        evidenceUrl: r.evidence_document_url,
        evidenceFiles: (r as any).evidence_files
      }))
    }
  };

  const { data, error } = await insforge.database
    .from('audit_reports')
    .insert({
      audit_id: auditId,
      company_id: companyId,
      generated_report_data: reportData,
      pdf_url: null,
      created_by_user_id: createdByUserId
    })
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create audit report.');

  await createActivityLog({
    companyId,
    actorUserId: createdByUserId,
    action: 'audits.report_generated',
    entityType: 'audit_report',
    entityId: (data as AuditReport).id,
    metadata: { audit_id: auditId }
  });

  return data as AuditReport;
}

export function renderReportAsHtml(report: AuditReport): string {
  const d = report.generated_report_data as any;
  const o = d?.overview ?? {};
  const r = d?.auditResults ?? {};
  const ca = d?.correctiveActionsSummary ?? {};
  const sections = d?.sections ?? [];
  let html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Audit Report</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 24px;">
  <h1>Audit Report</h1>
  <h2>Overview</h2>
  <p><strong>Title:</strong> ${escapeHtml(o.auditTitle ?? '')}</p>
  <p><strong>Scope:</strong> ${escapeHtml(o.scope ?? '')}</p>
  <p><strong>Audit Date:</strong> ${o.auditDate ? new Date(o.auditDate).toLocaleDateString() : '—'}</p>
  <p><strong>Audit Type:</strong> ${escapeHtml(o.auditType ?? '')}</p>
  <p><strong>Standard / Criteria:</strong> ${escapeHtml(o.standardCriteria ?? '')}</p>
  <h2>Audit Results</h2>
  <p><strong>Compliance:</strong> ${r.compliancePercent ?? 0}%</p>
  <p><strong>Score:</strong> ${r.achievedScore ?? r.overallScore ?? 0} / ${r.totalAllocated ?? 0}</p>
  <p><strong>Non-conformances:</strong> ${r.nonconformancesCount ?? 0} | <strong>Observations:</strong> ${r.observationsCount ?? 0}</p>
  <h2>Corrective Actions Summary</h2>
  <p>Total: ${ca.total ?? 0} | Open: ${ca.open ?? 0} | Closed: ${ca.closed ?? 0} | Overdue: ${ca.overdue ?? 0}</p>
  <h2>Checklist Results</h2>
  <table border="1" cellpadding="8" cellspacing="0" style="width:100%; border-collapse: collapse;">
    <thead><tr><th>Section</th><th>Question</th><th>Allocated</th><th>Achieved</th><th>Finding</th><th>Risk</th></tr></thead>
    <tbody>
  `;
  sections.forEach((s: any) => {
    html += `<tr>
      <td>${escapeHtml(s.section ?? '')}</td>
      <td>${escapeHtml(s.question ?? '')}</td>
      <td>${s.allocatedScore ?? '—'}</td>
      <td>${s.achievedScore ?? '—'}</td>
      <td>${escapeHtml(s.finding ?? '')}</td>
      <td>${escapeHtml(s.riskRating ?? '')}</td>
    </tr>`;
  });
  html += `
    </tbody>
  </table>
  <p style="margin-top: 24px;"><small>Generated ${new Date(report.created_at).toLocaleString()}</small></p>
</body>
</html>`;
  return html;
}

function escapeHtml(s: string): string {
  if (typeof s !== 'string') return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
