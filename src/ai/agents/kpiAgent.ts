import { chatComplete, AI_MODELS } from '../aiClient';
import type { AgentChatMessage, AgentContext, AgentResponse } from '../agentTypes';
import { listKPIAssessments } from '../../api/services/kpiAssessmentService';
import { parseAgentJsonReply, buildFallback, countBy } from '../agentSupport';

const canManage = new Set(['owner', 'admin', 'manager', 'supervisor']);

/**
 * KPI module specialist agent: employee/department KPI assessments (score,
 * achievement %, status). Read-only. Same POPIA-style role gate as hrAgent
 * for named-employee detail, since KPI assessments are performance records.
 */

const KPI_SYSTEM_PROMPT = (ctx: AgentContext) => `You are the KPI specialist assistant inside Safe Cloud Africa, a South African OHS/HR compliance platform.

Company: ${ctx.companyName}
Speaking to: ${ctx.userFullName} (role: ${ctx.role})

Ground rules:
- Only use facts given to you in the "DATA" block below. Never invent scores, names, or dates.
- Context: KPI assessments score performance against weighted key performance areas per period; status moves draft -> submitted -> finalized.
${ctx.redactSensitiveFields ? '- This user has an "employee" role: never reveal a named colleague\'s score or rating -- only aggregate counts.' : '- This user has a manager-tier role and may see assessment-level detail included in the DATA block.'}
- Be concise and practical.
- The DATA block's sessionContext tells you what page the user is on and the last error they saw (if any, and if relevant to their question) -- use it so they do not have to re-explain where they are or what just happened, but do not mention sessionContext by name or dump it back verbatim.
- Return ONLY compact JSON of this exact shape, no prose outside it: {"reply":"string"}`;

type Intent = 'assessment_status' | 'general';

function detectIntent(message: string): Intent {
  const m = message.toLowerCase();
  if (/(kpi|assessment|score|rating|achievement)/.test(m)) return 'assessment_status';
  return 'general';
}

async function gatherAssessmentData(ctx: AgentContext): Promise<{ data: unknown; note?: string }> {
  if (!canManage.has(ctx.role)) {
    return { data: null, note: 'KPI assessment detail is restricted to manager/supervisor/admin roles; ask HR/your manager for your own scores.' };
  }
  const assessments = await listKPIAssessments({ organizationId: ctx.companyId, limit: 500 });
  const today = new Date().toISOString().slice(0, 10);
  const overdue = assessments.filter((a) => a.status === 'draft' && a.period_end_date < today);
  const scored = assessments.filter((a) => a.overall_score != null);
  const avgScore = scored.length ? scored.reduce((sum, a) => sum + (a.overall_score ?? 0), 0) / scored.length : null;
  return {
    data: {
      totalCount: assessments.length,
      byStatus: countBy(assessments, (a) => a.status),
      overdueDraftCount: overdue.length,
      averageOverallScore: avgScore != null ? Math.round(avgScore * 100) / 100 : null,
      overdue: overdue.slice(0, 10).map((a) => ({ id: a.assessment_id, employee_name: a.employee_name_snapshot, period_end_date: a.period_end_date }))
    }
  };
}

export async function runKpiAgent(input: { message: string; history: AgentChatMessage[]; context: AgentContext }): Promise<AgentResponse> {
  const { message, context } = input;
  const intent = detectIntent(message);

  const grounding = intent === 'assessment_status'
    ? await gatherAssessmentData(context)
    : { data: null, note: 'General KPI question -- no specific record was looked up.' };

  try {
    const { content, model } = await chatComplete({
      model: AI_MODELS.reasoning,
      messages: [
        { role: 'system', content: KPI_SYSTEM_PROMPT(context) },
        { role: 'user', content: JSON.stringify({ question: message, intent, DATA: grounding.data, dataNote: grounding.note ?? null, recentConversation: input.history.slice(-6), sessionContext: { currentPage: input.context.currentPageLabel ?? null, recentError: input.context.recentErrorMessage ?? null } }) }
      ],
      temperature: 0.2,
      maxTokens: 600
    });
    return parseAgentJsonReply('kpi', content, model);
  } catch (error) {
    console.warn('kpiAgent AI call failed, using fallback', error);
    if (grounding.note && !grounding.data) return buildFallback('kpi', grounding.note);
    return buildFallback('kpi', "I'm having trouble reaching the assistant model right now. Please try again shortly, or use the KPI module pages directly.");
  }
}
