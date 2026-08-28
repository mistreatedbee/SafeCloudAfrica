import { chatComplete, AI_MODELS } from '../aiClient';
import type { AgentChatMessage, AgentContext, AgentResponse } from '../agentTypes';
import { listModuleTargets } from '../../api/services/moduleTargetsService';
import { parseAgentJsonReply, buildFallback, countBy } from '../agentSupport';

/**
 * Objectives & Targets specialist agent: progress and status across every
 * module's targets (module_targets is shared across all modules, filtered
 * by `module` per record). Read-only.
 */

const OBJECTIVES_SYSTEM_PROMPT = (ctx: AgentContext) => `You are the Objectives & Targets specialist assistant inside Safe Cloud Africa, a South African OHS compliance platform.

Company: ${ctx.companyName}
Speaking to: ${ctx.userFullName} (role: ${ctx.role})

Ground rules:
- Only use facts given to you in the "DATA" block below. Never invent target names, values, or dates.
- Context: each target has a current_value vs target_value, a target_date, and a status (on track / achieved / not_achieved / on_hold / closed etc).
- Be concise and practical.
- The DATA block's sessionContext tells you what page the user is on and the last error they saw (if any, and if relevant to their question) -- use it so they do not have to re-explain where they are or what just happened, but do not mention sessionContext by name or dump it back verbatim.
- Return ONLY compact JSON of this exact shape, no prose outside it: {"reply":"string"}`;

async function gatherTargetsData(ctx: AgentContext) {
  const targets = await listModuleTargets({ companyId: ctx.companyId, limit: 500 });
  const today = new Date().toISOString().slice(0, 10);
  const overdue = targets.filter((t) => t.target_date && t.target_date < today && !t.achieved);
  return {
    data: {
      totalCount: targets.length,
      byModule: countBy(targets, (t) => t.module),
      byStatus: countBy(targets, (t) => t.status ?? 'unset'),
      overdueCount: overdue.length,
      overdue: overdue.slice(0, 10).map((t) => ({ id: t.id, module: t.module, name: t.name, target_date: t.target_date, current_value: t.current_value, target_value: t.target_value })),
      achievedCount: targets.filter((t) => t.achieved).length
    }
  };
}

export async function runObjectivesAgent(input: { message: string; history: AgentChatMessage[]; context: AgentContext }): Promise<AgentResponse> {
  const grounding = await gatherTargetsData(input.context);

  try {
    const { content, model } = await chatComplete({
      model: AI_MODELS.reasoning,
      messages: [
        { role: 'system', content: OBJECTIVES_SYSTEM_PROMPT(input.context) },
        { role: 'user', content: JSON.stringify({ question: input.message, DATA: grounding.data, recentConversation: input.history.slice(-6), sessionContext: { currentPage: input.context.currentPageLabel ?? null, recentError: input.context.recentErrorMessage ?? null } }) }
      ],
      temperature: 0.2,
      maxTokens: 600
    });
    return parseAgentJsonReply('objectives', content, model);
  } catch (error) {
    console.warn('objectivesAgent AI call failed, using fallback', error);
    return buildFallback('objectives', "I'm having trouble reaching the assistant model right now. Please try again shortly, or use the Objectives & Targets page directly.");
  }
}
