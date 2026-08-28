import { chatComplete, AI_MODELS } from '../aiClient';
import type { AgentChatMessage, AgentContext, AgentResponse } from '../agentTypes';
import { listLegalRequirements } from '../../api/services/legalRequirementsService';
import { parseAgentJsonReply, buildFallback, countBy } from '../agentSupport';

const canManage = new Set(['owner', 'admin', 'manager', 'consultant']);

/**
 * Legal module specialist agent: the legal register (applicable
 * legislation, compliance status, target dates). Read-only.
 */

const LEGAL_SYSTEM_PROMPT = (ctx: AgentContext) => `You are the Legal Compliance specialist assistant inside Safe Cloud Africa, a South African OHS/legal compliance platform.

Company: ${ctx.companyName}
Speaking to: ${ctx.userFullName} (role: ${ctx.role})

Ground rules:
- Only use facts given to you in the "DATA" block below. Never invent legislation names, dates, or compliance status.
- Context: the legal register tracks applicable South African legislation (OHS Act, COID Act, NEMA, BCEA, LRA, etc.) against a compliance status and, where non-compliant, actions needed with a target date. You may summarise or flag risk, but never claim to have determined legal compliance yourself -- that is a human/legal-advisor judgement.
- Be concise and practical.
- Return ONLY compact JSON of this exact shape, no prose outside it: {"reply":"string"}`;

type Intent = 'compliance_status' | 'general';

function detectIntent(message: string): Intent {
  const m = message.toLowerCase();
  if (/(complian|legal register|legislation|overdue|non.?complian)/.test(m)) return 'compliance_status';
  return 'general';
}

async function gatherComplianceData(ctx: AgentContext): Promise<{ data: unknown; note?: string }> {
  if (!canManage.has(ctx.role)) {
    return { data: null, note: 'The legal register is restricted to manager/admin/consultant roles.' };
  }
  const result = await listLegalRequirements({ companyId: ctx.companyId, pageSize: 500 }).catch(() => ({ rows: [], total: 0, page: 1, pageSize: 500 }));
  const today = new Date().toISOString().slice(0, 10);
  const overdue = result.rows.filter((r) => r.target_date && r.target_date < today && r.compliance_status !== 'COMPLIANT');
  return {
    data: {
      totalCount: result.total,
      byComplianceStatus: countBy(result.rows, (r) => r.compliance_status),
      overdueCount: overdue.length,
      overdue: overdue.slice(0, 10).map((r) => ({ id: r.id, requirement_standard: r.requirement_standard, target_date: r.target_date, compliance_status: r.compliance_status }))
    }
  };
}

export async function runLegalAgent(input: { message: string; history: AgentChatMessage[]; context: AgentContext }): Promise<AgentResponse> {
  const { message, context } = input;
  const intent = detectIntent(message);

  const grounding = intent === 'compliance_status'
    ? await gatherComplianceData(context)
    : { data: null, note: 'General legal compliance question -- no specific record was looked up.' };

  try {
    const { content, model } = await chatComplete({
      model: AI_MODELS.reasoning,
      messages: [
        { role: 'system', content: LEGAL_SYSTEM_PROMPT(context) },
        { role: 'user', content: JSON.stringify({ question: message, intent, DATA: grounding.data, dataNote: grounding.note ?? null, recentConversation: input.history.slice(-6) }) }
      ],
      temperature: 0.2,
      maxTokens: 600
    });
    return parseAgentJsonReply('legal', content, model);
  } catch (error) {
    console.warn('legalAgent AI call failed, using fallback', error);
    if (grounding.note && !grounding.data) return buildFallback('legal', grounding.note);
    return buildFallback('legal', "I'm having trouble reaching the assistant model right now. Please try again shortly, or use the Legal module pages directly.");
  }
}
