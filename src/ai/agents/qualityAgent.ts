import { chatComplete, AI_MODELS } from '../aiClient';
import type { AgentChatMessage, AgentContext, AgentResponse } from '../agentTypes';
import { listQualityNcrs } from '../../api/services/qualityNcrsService';
import { listCustomerComplaints } from '../../api/services/customerComplaintsService';
import { listInternalExternalIssues } from '../../api/services/internalExternalIssuesService';
import { parseAgentJsonReply, buildFallback, countBy } from '../agentSupport';

/**
 * Quality module specialist agent: NCR/CAPA, customer complaints, internal/
 * external issues.
 *
 * Read-only for now (no write capability) -- there is no obvious single
 * free-text field a quick "draft" would target the way hrAgent's review
 * comment or safetyAgent's investigation note do. Adding a
 * "draft root cause / corrective action" write is a natural next step once
 * this read-only pass is reviewed; see hrAgent.ts / safetyAgent.ts for the
 * ACTION_HANDLERS pattern to follow.
 */

const QUALITY_SYSTEM_PROMPT = (ctx: AgentContext) => `You are the Quality specialist assistant inside Safe Cloud Africa, a South African OHS/quality compliance platform.

Company: ${ctx.companyName}
Speaking to: ${ctx.userFullName} (role: ${ctx.role})

Ground rules:
- Only use facts given to you in the "DATA" block below. Never invent NCR numbers, complaint counts, or dates.
- Context: NCRs (non-conformance reports) follow root cause -> corrective action -> manager sign-off -> auditor verification -> closure. ISO 9001-style thinking applies (containment before root cause, verification of effectiveness before closure).
- Be concise and practical.
- The DATA block's sessionContext tells you what page the user is on and the last error they saw (if any, and if relevant to their question) -- use it so they do not have to re-explain where they are or what just happened, but do not mention sessionContext by name or dump it back verbatim.
- Return ONLY compact JSON of this exact shape, no prose outside it: {"reply":"string"}`;

type Intent = 'ncr_status' | 'complaints' | 'issues_register' | 'general';

function detectIntent(message: string): Intent {
  const m = message.toLowerCase();
  if (/(ncr|non.?conformance|capa|corrective action|root cause)/.test(m)) return 'ncr_status';
  if (/(complaint|customer)/.test(m)) return 'complaints';
  if (/(internal.*issue|external.*issue|issues register|risk.*opportunit)/.test(m)) return 'issues_register';
  return 'general';
}

async function gatherNcrData(ctx: AgentContext) {
  const open = await listQualityNcrs({ companyId: ctx.companyId, status: 'open', limit: 200 });
  const all = await listQualityNcrs({ companyId: ctx.companyId, limit: 500 });
  return {
    data: {
      openCount: open.length,
      totalCount: all.length,
      bySeverity: countBy(all, (n) => n.severity),
      overdueCorrectiveActions: all.filter((n) => n.corrective_action_due_date && n.corrective_action_due_date < new Date().toISOString().slice(0, 10) && !n.closed_at).length,
      recent: open.slice(0, 10).map((n) => ({ id: n.id, nc_number: n.nc_number, title: n.title, severity: n.severity, status: n.status, corrective_action_due_date: n.corrective_action_due_date }))
    }
  };
}

async function gatherComplaintsData(ctx: AgentContext) {
  const complaints = await listCustomerComplaints({ companyId: ctx.companyId, limit: 500 });
  return {
    data: {
      totalCount: complaints.length,
      byStatus: countBy(complaints, (c) => c.status),
      recent: complaints.slice(0, 10).map((c) => ({ id: c.id, status: c.status }))
    }
  };
}

async function gatherIssuesData(ctx: AgentContext) {
  const issues = await listInternalExternalIssues({ companyId: ctx.companyId, actorRole: ctx.role, limit: 500 });
  return { data: { totalCount: issues.length, byNature: countBy(issues, (i) => i.nature), byStatus: countBy(issues, (i) => i.status) } };
}

export async function runQualityAgent(input: { message: string; history: AgentChatMessage[]; context: AgentContext }): Promise<AgentResponse> {
  const { message, context } = input;
  const intent = detectIntent(message);

  let grounding: { data: unknown; note?: string };
  switch (intent) {
    case 'ncr_status':
      grounding = await gatherNcrData(context);
      break;
    case 'complaints':
      grounding = await gatherComplaintsData(context);
      break;
    case 'issues_register':
      grounding = await gatherIssuesData(context);
      break;
    default:
      grounding = { data: null, note: 'General quality question -- no specific record was looked up.' };
  }

  try {
    const { content, model } = await chatComplete({
      model: AI_MODELS.reasoning,
      messages: [
        { role: 'system', content: QUALITY_SYSTEM_PROMPT(context) },
        { role: 'user', content: JSON.stringify({ question: message, intent, DATA: grounding.data, dataNote: grounding.note ?? null, recentConversation: input.history.slice(-6), sessionContext: { currentPage: input.context.currentPageLabel ?? null, recentError: input.context.recentErrorMessage ?? null } }) }
      ],
      temperature: 0.2,
      maxTokens: 600
    });
    return parseAgentJsonReply('quality', content, model);
  } catch (error) {
    console.warn('qualityAgent AI call failed, using fallback', error);
    return buildFallback('quality', grounding.note && !grounding.data ? grounding.note : "I'm having trouble reaching the assistant model right now. Please try again shortly, or use the Quality module pages directly.");
  }
}
