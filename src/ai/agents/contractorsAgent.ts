import { chatComplete, AI_MODELS } from '../aiClient';
import type { AgentChatMessage, AgentContext, AgentResponse } from '../agentTypes';
import { listContractors } from '../../api/services/contractorsService';
import { listVisitors } from '../../api/services/visitorsService';
import { parseAgentJsonReply, buildFallback, countBy } from '../agentSupport';

/**
 * Contractors & Visitors specialist agent: onboarding/induction/document
 * status for contractors, and check-in/briefing status for visitors.
 * Read-only.
 */

const CONTRACTORS_SYSTEM_PROMPT = (ctx: AgentContext) => `You are the Contractors & Visitors specialist assistant inside Safe Cloud Africa, a South African OHS compliance platform.

Company: ${ctx.companyName}
Speaking to: ${ctx.userFullName} (role: ${ctx.role})

Ground rules:
- Only use facts given to you in the "DATA" block below. Never invent contractor/visitor names, dates, or statuses.
- Context: contractors need approved documents and a completed induction before they may work on site; visitors need a completed safety briefing before sign-in is considered compliant.
- Be concise and practical.
- The DATA block's sessionContext tells you what page the user is on and the last error they saw (if any, and if relevant to their question) -- use it so they do not have to re-explain where they are or what just happened, but do not mention sessionContext by name or dump it back verbatim.
- Return ONLY compact JSON of this exact shape, no prose outside it: {"reply":"string"}`;

type Intent = 'contractors' | 'visitors' | 'general';

function detectIntent(message: string): Intent {
  const m = message.toLowerCase();
  if (/(contractor|induction|document.*(approv|pending))/.test(m)) return 'contractors';
  if (/(visitor|briefing|check.?in|check.?out)/.test(m)) return 'visitors';
  return 'general';
}

async function gatherContractorsData(ctx: AgentContext) {
  const contractors = await listContractors(ctx.companyId);
  return {
    data: {
      totalCount: contractors.length,
      byStatus: countBy(contractors, (c) => c.status),
      byDocumentsStatus: countBy(contractors, (c) => c.documents_status ?? 'unset'),
      byInductionStatus: countBy(contractors, (c) => c.induction_status ?? 'unset')
    }
  };
}

async function gatherVisitorsData(ctx: AgentContext) {
  const visitors = await listVisitors(ctx.companyId);
  return {
    data: {
      totalCount: visitors.length,
      byStatus: countBy(visitors, (v) => v.status),
      pendingBriefingCount: visitors.filter((v) => v.briefing === 'pending').length
    }
  };
}

export async function runContractorsAgent(input: { message: string; history: AgentChatMessage[]; context: AgentContext }): Promise<AgentResponse> {
  const { message, context } = input;
  const intent = detectIntent(message);

  let grounding: { data: unknown };
  switch (intent) {
    case 'contractors':
      grounding = await gatherContractorsData(context);
      break;
    case 'visitors':
      grounding = await gatherVisitorsData(context);
      break;
    default:
      grounding = { data: null };
  }

  try {
    const { content, model } = await chatComplete({
      model: AI_MODELS.reasoning,
      messages: [
        { role: 'system', content: CONTRACTORS_SYSTEM_PROMPT(context) },
        { role: 'user', content: JSON.stringify({ question: message, intent, DATA: grounding.data, recentConversation: input.history.slice(-6), sessionContext: { currentPage: input.context.currentPageLabel ?? null, recentError: input.context.recentErrorMessage ?? null } }) }
      ],
      temperature: 0.2,
      maxTokens: 600
    });
    return parseAgentJsonReply('contractors', content, model);
  } catch (error) {
    console.warn('contractorsAgent AI call failed, using fallback', error);
    return buildFallback('contractors', "I'm having trouble reaching the assistant model right now. Please try again shortly, or use the Contractors & Visitors page directly.");
  }
}
