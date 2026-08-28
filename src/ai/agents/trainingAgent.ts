import { chatComplete, AI_MODELS } from '../aiClient';
import type { AgentChatMessage, AgentContext, AgentResponse } from '../agentTypes';
import { listOutstandingTraining, getTrainingComplianceSummary, listExpiringSoonTraining } from '../../api/services/trainingService';
import { parseAgentJsonReply, buildFallback, countBy } from '../agentSupport';

/**
 * Training module specialist agent: compliance %, outstanding training
 * (required-not-completed and completed-but-expired), and upcoming
 * expirations. Read-only. Mirrors the "outstanding" definition fixed for
 * the Reports & Costs tab in trainingService.ts -- see that ticket's notes
 * for why "outstanding" must include both not-started and expired.
 */

const TRAINING_SYSTEM_PROMPT = (ctx: AgentContext) => `You are the Training specialist assistant inside Safe Cloud Africa, a South African OHS/HR compliance platform.

Company: ${ctx.companyName}
Speaking to: ${ctx.userFullName} (role: ${ctx.role})

Ground rules:
- Only use facts given to you in the "DATA" block below. Never invent course names, dates, or counts.
- Context: "outstanding" training means either required-but-never-completed OR completed-but-now-expired -- both count against compliance. The South African financial year for cost reporting runs 1 March to end of February.
${ctx.redactSensitiveFields ? '- This user has an "employee" role: only discuss aggregate/company-wide counts, never a named colleague\'s individual outstanding training.' : '- This user has a manager-tier role and may see individual outstanding-training detail included in the DATA block.'}
- Be concise and practical.
- The DATA block's sessionContext tells you what page the user is on and the last error they saw (if any, and if relevant to their question) -- use it so they do not have to re-explain where they are or what just happened, but do not mention sessionContext by name or dump it back verbatim.
- Return ONLY compact JSON of this exact shape, no prose outside it: {"reply":"string"}`;

type Intent = 'outstanding' | 'expiring_soon' | 'general';

function detectIntent(message: string): Intent {
  const m = message.toLowerCase();
  if (/(outstanding|overdue|not (started|done)|compliance)/.test(m)) return 'outstanding';
  if (/(expir|renew|upcoming)/.test(m)) return 'expiring_soon';
  return 'general';
}

async function gatherOutstandingData(ctx: AgentContext) {
  const compliance = await getTrainingComplianceSummary(ctx.companyId).catch(() => ({ required: 0, met: 0, percent: 100 }));
  if (ctx.redactSensitiveFields) {
    return { data: { compliancePercent: compliance.percent, requiredCount: compliance.required, metCount: compliance.met } };
  }
  const outstanding = await listOutstandingTraining(ctx.companyId).catch(() => []);
  return {
    data: {
      compliancePercent: compliance.percent,
      requiredCount: compliance.required,
      metCount: compliance.met,
      outstandingCount: outstanding.length,
      byReason: countBy(outstanding, (r) => r.outstandingReason),
      sample: outstanding.slice(0, 10).map((r) => ({ id: r.id, outstandingReason: r.outstandingReason, expires_at: r.expires_at, status: r.status }))
    }
  };
}

async function gatherExpiringSoonData(ctx: AgentContext): Promise<{ data: unknown; note?: string }> {
  if (ctx.redactSensitiveFields) {
    return { data: null, note: 'Individual expiring-training detail is restricted to manager/HR-admin roles; check the My Training tab for your own upcoming expirations.' };
  }
  const rows = await listExpiringSoonTraining(ctx.companyId, 60).catch(() => []);
  return {
    data: {
      count: rows.length,
      sample: rows.slice(0, 10).map((r) => ({ id: r.id, expires_at: r.expires_at }))
    }
  };
}

export async function runTrainingAgent(input: { message: string; history: AgentChatMessage[]; context: AgentContext }): Promise<AgentResponse> {
  const { message, context } = input;
  const intent = detectIntent(message);

  let grounding: { data: unknown; note?: string };
  switch (intent) {
    case 'outstanding':
      grounding = await gatherOutstandingData(context);
      break;
    case 'expiring_soon':
      grounding = await gatherExpiringSoonData(context);
      break;
    default:
      grounding = { data: null, note: 'General training question -- no specific record was looked up.' };
  }

  try {
    const { content, model } = await chatComplete({
      model: AI_MODELS.reasoning,
      messages: [
        { role: 'system', content: TRAINING_SYSTEM_PROMPT(context) },
        { role: 'user', content: JSON.stringify({ question: message, intent, DATA: grounding.data, dataNote: grounding.note ?? null, recentConversation: input.history.slice(-6), sessionContext: { currentPage: input.context.currentPageLabel ?? null, recentError: input.context.recentErrorMessage ?? null } }) }
      ],
      temperature: 0.2,
      maxTokens: 600
    });
    return parseAgentJsonReply('training', content, model);
  } catch (error) {
    console.warn('trainingAgent AI call failed, using fallback', error);
    if (grounding.note && !grounding.data) return buildFallback('training', grounding.note);
    return buildFallback('training', "I'm having trouble reaching the assistant model right now. Please try again shortly, or use the Training module pages directly.");
  }
}
