import { chatComplete, AI_MODELS } from '../aiClient';
import type { AgentChatMessage, AgentContext, AgentResponse } from '../agentTypes';
import { getPpeCompliance } from '../../api/services/ppeService';
import { getPpeLowStockCount } from '../../api/services/ppeAnalyticsService';
import { listPpeIssueTracker } from '../../api/services/ppeIssueTrackerService';
import { parseAgentJsonReply, buildFallback, countBy } from '../agentSupport';

/**
 * PPE module specialist agent: issue compliance %, low-stock items, and
 * open PPE issue-tracker cases (non-conformances raised against PPE use).
 * Read-only.
 */

const PPE_SYSTEM_PROMPT = (ctx: AgentContext) => `You are the PPE specialist assistant inside Safe Cloud Africa, a South African OHS compliance platform.

Company: ${ctx.companyName}
Speaking to: ${ctx.userFullName} (role: ${ctx.role})

Ground rules:
- Only use facts given to you in the "DATA" block below. Never invent stock counts, employee names, or dates.
- Context: PPE compliance is tracked as a percentage of employees with current, correctly-issued PPE for their role; the PPE issue tracker holds non-conformances (e.g. PPE not worn, wrong size, damaged) that go through manager sign-off and safety-officer verification before closure.
- Be concise and practical.
- The DATA block's sessionContext tells you what page the user is on and the last error they saw (if any, and if relevant to their question) -- use it so they do not have to re-explain where they are or what just happened, but do not mention sessionContext by name or dump it back verbatim.
- Return ONLY compact JSON of this exact shape, no prose outside it: {"reply":"string"}`;

type Intent = 'compliance' | 'stock' | 'issue_tracker' | 'general';

function detectIntent(message: string): Intent {
  const m = message.toLowerCase();
  if (/(complian|issued|coverage)/.test(m)) return 'compliance';
  if (/(stock|reorder|low stock|inventory)/.test(m)) return 'stock';
  if (/(non.?conformance|issue tracker|sign.?off|verif)/.test(m)) return 'issue_tracker';
  return 'general';
}

async function gatherComplianceData(ctx: AgentContext) {
  const compliancePercent = await getPpeCompliance(ctx.companyId).catch(() => null);
  return { data: { compliancePercent } };
}

async function gatherStockData(ctx: AgentContext) {
  const lowStockCount = await getPpeLowStockCount(ctx.companyId).catch(() => 0);
  return { data: { lowStockCount } };
}

async function gatherIssueTrackerData(ctx: AgentContext) {
  const rows = await listPpeIssueTracker({ companyId: ctx.companyId, limit: 300 }).catch(() => []);
  return {
    data: {
      totalCount: rows.length,
      byStatus: countBy(rows, (r) => r.status)
    }
  };
}

export async function runPpeAgent(input: { message: string; history: AgentChatMessage[]; context: AgentContext }): Promise<AgentResponse> {
  const { message, context } = input;
  const intent = detectIntent(message);

  let grounding: { data: unknown; note?: string };
  switch (intent) {
    case 'compliance':
      grounding = await gatherComplianceData(context);
      break;
    case 'stock':
      grounding = await gatherStockData(context);
      break;
    case 'issue_tracker':
      grounding = await gatherIssueTrackerData(context);
      break;
    default:
      grounding = { data: null, note: 'General PPE question -- no specific record was looked up.' };
  }

  try {
    const { content, model } = await chatComplete({
      model: AI_MODELS.reasoning,
      messages: [
        { role: 'system', content: PPE_SYSTEM_PROMPT(context) },
        { role: 'user', content: JSON.stringify({ question: message, intent, DATA: grounding.data, dataNote: grounding.note ?? null, recentConversation: input.history.slice(-6), sessionContext: { currentPage: input.context.currentPageLabel ?? null, recentError: input.context.recentErrorMessage ?? null } }) }
      ],
      temperature: 0.2,
      maxTokens: 600
    });
    return parseAgentJsonReply('ppe', content, model);
  } catch (error) {
    console.warn('ppeAgent AI call failed, using fallback', error);
    return buildFallback('ppe', "I'm having trouble reaching the assistant model right now. Please try again shortly, or use the PPE module pages directly.");
  }
}
