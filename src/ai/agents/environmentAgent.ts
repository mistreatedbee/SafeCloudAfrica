import { chatComplete, AI_MODELS } from '../aiClient';
import type { AgentChatMessage, AgentContext, AgentResponse } from '../agentTypes';
import { listEnvironmentAspects, listEnvironmentMonitoring } from '../../api/services/environmentService';
import { parseAgentJsonReply, buildFallback, countBy } from '../agentSupport';

/**
 * Environment module specialist agent: environmental aspects register and
 * monitoring results (water/air/waste). Grounded in NEMA's general "duty of
 * care" principle (identify and manage significant environmental aspects)
 * without claiming legal-compliance sign-off itself.
 */

const ENVIRONMENT_SYSTEM_PROMPT = (ctx: AgentContext) => `You are the Environment specialist assistant inside Safe Cloud Africa, a South African OHS/environmental compliance platform.

Company: ${ctx.companyName}
Speaking to: ${ctx.userFullName} (role: ${ctx.role})

Ground rules:
- Only use facts given to you in the "DATA" block below. Never invent aspect names, monitoring results, or dates.
- Context: NEMA (National Environmental Management Act) establishes a general duty of care -- significant environmental aspects (water, air, waste, spills) must be identified and managed, with monitoring evidence kept. You may point out that an aspect looks unmanaged or a monitoring result looks like a fail, but never claim compliance has been assessed or reported to a regulator.
- Be concise and practical.
- The DATA block's sessionContext tells you what page the user is on and the last error they saw (if any, and if relevant to their question) -- use it so they do not have to re-explain where they are or what just happened, but do not mention sessionContext by name or dump it back verbatim.
- Return ONLY compact JSON of this exact shape, no prose outside it: {"reply":"string"}`;

type Intent = 'aspects' | 'monitoring' | 'general';

function detectIntent(message: string): Intent {
  const m = message.toLowerCase();
  if (/(aspect|significant environmental)/.test(m)) return 'aspects';
  if (/(monitor|water|air quality|waste|spill|emission)/.test(m)) return 'monitoring';
  return 'general';
}

async function gatherAspectsData(ctx: AgentContext) {
  const aspects = await listEnvironmentAspects(ctx.companyId).catch(() => []);
  return {
    data: {
      totalCount: aspects.length,
      activeCount: aspects.filter((a) => a.status === 'active').length,
      byStatus: countBy(aspects, (a) => a.status)
    }
  };
}

async function gatherMonitoringData(ctx: AgentContext) {
  const records = await listEnvironmentMonitoring(ctx.companyId, 100).catch(() => []);
  return {
    data: {
      recentCount: records.length,
      byType: countBy(records, (r) => r.type)
    }
  };
}

export async function runEnvironmentAgent(input: { message: string; history: AgentChatMessage[]; context: AgentContext }): Promise<AgentResponse> {
  const { message, context } = input;
  const intent = detectIntent(message);

  let grounding: { data: unknown; note?: string };
  switch (intent) {
    case 'aspects':
      grounding = await gatherAspectsData(context);
      break;
    case 'monitoring':
      grounding = await gatherMonitoringData(context);
      break;
    default:
      grounding = { data: null, note: 'General environment question -- no specific record was looked up.' };
  }

  try {
    const { content, model } = await chatComplete({
      model: AI_MODELS.reasoning,
      messages: [
        { role: 'system', content: ENVIRONMENT_SYSTEM_PROMPT(context) },
        { role: 'user', content: JSON.stringify({ question: message, intent, DATA: grounding.data, dataNote: grounding.note ?? null, recentConversation: input.history.slice(-6), sessionContext: { currentPage: input.context.currentPageLabel ?? null, recentError: input.context.recentErrorMessage ?? null } }) }
      ],
      temperature: 0.2,
      maxTokens: 600
    });
    return parseAgentJsonReply('environment', content, model);
  } catch (error) {
    console.warn('environmentAgent AI call failed, using fallback', error);
    return buildFallback('environment', grounding.note && !grounding.data ? grounding.note : "I'm having trouble reaching the assistant model right now. Please try again shortly, or use the Environment module pages directly.");
  }
}
