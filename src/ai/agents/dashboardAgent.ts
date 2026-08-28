import { chatComplete, AI_MODELS } from '../aiClient';
import type { AgentChatMessage, AgentContext, AgentResponse } from '../agentTypes';
import { getComplianceDashboardData } from '../../api/services/complianceScoringService';
import { parseAgentJsonReply, buildFallback } from '../agentSupport';

const canManage = new Set(['owner', 'admin', 'manager', 'consultant', 'auditor']);

/**
 * Cross-module Dashboard specialist agent: answers "big picture" questions
 * spanning every module by reading the same rollup the Compliance Dashboard
 * page itself is built from (getComplianceDashboardData) -- this agent adds
 * no new aggregation logic of its own, it only phrases what that function
 * already computed. Read-only.
 */

const DASHBOARD_SYSTEM_PROMPT = (ctx: AgentContext) => `You are the Compliance Dashboard specialist assistant inside Safe Cloud Africa, a South African OHS compliance platform.

Company: ${ctx.companyName}
Speaking to: ${ctx.userFullName} (role: ${ctx.role})

Ground rules:
- Only use facts given to you in the "DATA" block below. Never invent scores, percentages, or module names.
- Context: DATA.domains gives a per-module compliance score, RAG status (green/yellow/red), and overdue/attention counts. DATA.overall is the weighted overall score. DATA.trendHistory shows month-over-month movement. This is the same data the Compliance Dashboard page shows.
- Be concise and practical: lead with the number, then the one or two modules that most need attention.
- The DATA block's sessionContext tells you what page the user is on and the last error they saw (if any, and if relevant to their question) -- use it so they do not have to re-explain where they are or what just happened, but do not mention sessionContext by name or dump it back verbatim.
- Return ONLY compact JSON of this exact shape, no prose outside it: {"reply":"string"}`;

async function gatherDashboardData(ctx: AgentContext): Promise<{ data: unknown; note?: string }> {
  if (!canManage.has(ctx.role)) {
    return { data: null, note: 'The compliance dashboard is restricted to manager-tier and above roles.' };
  }
  const dashboard = await getComplianceDashboardData(ctx.companyId);
  if (!dashboard) return { data: null, note: 'No compliance dashboard data is available yet for this company.' };
  return {
    data: {
      overall: dashboard.overall,
      domains: dashboard.domains.map((d) => ({
        domainKey: d.domainKey,
        label: d.label,
        scorePercentage: d.scorePercentage,
        ragStatus: d.ragStatus,
        overdueCount: d.overdueCount,
        attentionCount: d.attentionCount,
        trendDelta: d.trendDelta
      })),
      aiInsight: dashboard.aiInsight,
      trendHistory: dashboard.trendHistory.slice(-6)
    }
  };
}

export async function runDashboardAgent(input: { message: string; history: AgentChatMessage[]; context: AgentContext }): Promise<AgentResponse> {
  const grounding = await gatherDashboardData(input.context);

  try {
    const { content, model } = await chatComplete({
      model: AI_MODELS.reasoning,
      messages: [
        { role: 'system', content: DASHBOARD_SYSTEM_PROMPT(input.context) },
        { role: 'user', content: JSON.stringify({ question: input.message, DATA: grounding.data, dataNote: grounding.note ?? null, recentConversation: input.history.slice(-6), sessionContext: { currentPage: input.context.currentPageLabel ?? null, recentError: input.context.recentErrorMessage ?? null } }) }
      ],
      temperature: 0.2,
      maxTokens: 600
    });
    return parseAgentJsonReply('dashboard', content, model);
  } catch (error) {
    console.warn('dashboardAgent AI call failed, using fallback', error);
    if (grounding.note && !grounding.data) return buildFallback('dashboard', grounding.note);
    return buildFallback('dashboard', "I'm having trouble reaching the assistant model right now. Please try again shortly, or open the Compliance Dashboard directly.");
  }
}
