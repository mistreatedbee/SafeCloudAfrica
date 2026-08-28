import { chatComplete, AI_MODELS } from '../aiClient';
import type { AgentChatMessage, AgentContext, AgentResponse } from '../agentTypes';
import { getComplianceDashboardData } from '../../api/services/complianceScoringService';
import { parseAgentJsonReply, buildFallback } from '../agentSupport';

const canManage = new Set(['owner', 'admin', 'manager', 'consultant', 'auditor']);

/**
 * Alert specialist agent: "what needs my attention right now" across every
 * module, sourced from the same overdueActions/topRisks/aiInsight the
 * Compliance Dashboard already computes -- no new aggregation logic here
 * either. Interactive/on-demand only.
 *
 * A proactive weekly EMAIL digest was in the original spec but is
 * deliberately not built in this pass: this codebase already runs
 * cronDailyComplianceReminders.js (document review, expiring training/
 * medical, upcoming audits) and cronOverdueEscalations.js (overdue CAPA,
 * NCR, missing pre-audit docs) as InsForge Edge Function crons -- see
 * scripts/insforge-functions/README.md. A new weekly digest would overlap
 * significantly with what those two already send daily. If a *weekly
 * roll-up email* distinct from the daily reminders is wanted, scope it as
 * its own ticket (subject line, recipients, cadence) rather than guessing
 * at the format here.
 */

const ALERT_SYSTEM_PROMPT = (ctx: AgentContext) => `You are the Alerts specialist assistant inside Safe Cloud Africa, a South African OHS compliance platform.

Company: ${ctx.companyName}
Speaking to: ${ctx.userFullName} (role: ${ctx.role})

Ground rules:
- Only use facts given to you in the "DATA" block below. Never invent counts, names, or dates.
- Context: DATA.overdueActions and DATA.topRisks are already-computed cross-module items needing attention; DATA.aiInsight.recommendations are pre-computed suggested next steps with a reason. You are summarising and prioritising this list for the user, not generating new analysis.
- Be concise: lead with the single most urgent item, then a short list of the rest. If nothing is overdue, say so plainly rather than padding the answer.
- The DATA block's sessionContext tells you what page the user is on and the last error they saw (if any, and if relevant to their question) -- use it so they do not have to re-explain where they are or what just happened, but do not mention sessionContext by name or dump it back verbatim.
- Return ONLY compact JSON of this exact shape, no prose outside it: {"reply":"string"}`;

async function gatherAlertData(ctx: AgentContext): Promise<{ data: unknown; note?: string }> {
  if (!canManage.has(ctx.role)) {
    return { data: null, note: 'This cross-module attention summary is restricted to manager-tier and above roles.' };
  }
  const dashboard = await getComplianceDashboardData(ctx.companyId);
  if (!dashboard) return { data: null, note: 'No alert data is available yet for this company.' };
  return {
    data: {
      overallRiskFlag: dashboard.aiInsight.nextMonthRiskFlag,
      recommendations: dashboard.aiInsight.recommendations,
      topGaps: dashboard.aiInsight.topGaps,
      overdueActions: dashboard.overdueActions.slice(0, 20),
      topRisks: dashboard.topRisks.slice(0, 10),
      redDomains: dashboard.domains.filter((d) => d.ragStatus === 'red').map((d) => ({ label: d.label, scorePercentage: d.scorePercentage, overdueCount: d.overdueCount }))
    }
  };
}

export async function runAlertAgent(input: { message: string; history: AgentChatMessage[]; context: AgentContext }): Promise<AgentResponse> {
  const grounding = await gatherAlertData(input.context);

  try {
    const { content, model } = await chatComplete({
      model: AI_MODELS.reasoning,
      messages: [
        { role: 'system', content: ALERT_SYSTEM_PROMPT(input.context) },
        { role: 'user', content: JSON.stringify({ question: input.message, DATA: grounding.data, dataNote: grounding.note ?? null, recentConversation: input.history.slice(-6), sessionContext: { currentPage: input.context.currentPageLabel ?? null, recentError: input.context.recentErrorMessage ?? null } }) }
      ],
      temperature: 0.2,
      maxTokens: 600
    });
    return parseAgentJsonReply('alert', content, model);
  } catch (error) {
    console.warn('alertAgent AI call failed, using fallback', error);
    if (grounding.note && !grounding.data) return buildFallback('alert', grounding.note);
    return buildFallback('alert', "I'm having trouble reaching the assistant model right now. Please try again shortly, or open the Compliance Dashboard directly.");
  }
}
