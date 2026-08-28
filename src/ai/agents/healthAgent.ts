import { chatComplete, AI_MODELS } from '../aiClient';
import type { AgentChatMessage, AgentContext, AgentResponse } from '../agentTypes';
import { listHealthMedicals, listHealthRestrictedDuty, listHealthHygieneRecords } from '../../api/services/healthService';
import { parseAgentJsonReply, buildFallback, countBy } from '../agentSupport';

/**
 * Health module specialist agent: occupational medical exams, restricted
 * duty, and hygiene monitoring. POPIA applies as heavily here as it does to
 * hrAgent -- medical fitness/chronic-illness data is special personal
 * information under POPIA, so this agent applies the same
 * redactSensitiveFields gate hrAgent uses.
 */

const HEALTH_SYSTEM_PROMPT = (ctx: AgentContext) => `You are the Occupational Health specialist assistant inside Safe Cloud Africa, a South African OHS compliance platform.

Company: ${ctx.companyName}
Speaking to: ${ctx.userFullName} (role: ${ctx.role})

Ground rules:
- Only use facts given to you in the "DATA" block below. Never invent medical results, dates, or names.
- Context: medical surveillance frequency and fitness-for-work determinations sit under the OHS Act's Hazardous Chemical/Biological/Noise-Induced Hearing Loss regulations depending on exposure type; POPIA classifies health information as "special personal information" requiring stricter protection than ordinary employee data.
${ctx.redactSensitiveFields ? '- POPIA: this user has an "employee" role. NEVER reveal another employee\'s medical exam results, fitness status, or chronic illness details. Only aggregate counts (never named individuals) may be discussed for anyone but the asker.' : '- This user has a health/HR-management role and may see full employee-level medical detail included in the DATA block.'}
- Be concise and practical.
- Return ONLY compact JSON of this exact shape, no prose outside it: {"reply":"string"}`;

type Intent = 'medicals' | 'restricted_duty' | 'hygiene' | 'general';

function detectIntent(message: string): Intent {
  const m = message.toLowerCase();
  if (/(medical|fitness|expir|exam)/.test(m)) return 'medicals';
  if (/(restricted duty|light duty)/.test(m)) return 'restricted_duty';
  if (/(hygiene|noise|exposure|monitoring)/.test(m)) return 'hygiene';
  return 'general';
}

async function gatherMedicalsData(ctx: AgentContext) {
  const medicals = await listHealthMedicals({ companyId: ctx.companyId, actorRole: ctx.role, limit: 500 }).catch(() => []);
  if (ctx.redactSensitiveFields) {
    return { data: { totalCount: medicals.length, byFitnessStatus: countBy(medicals, (m) => m.fitness_status) } };
  }
  const today = new Date().toISOString().slice(0, 10);
  const expiringSoon = medicals.filter((m) => m.expiry_date && m.expiry_date >= today && m.expiry_date <= addDays(today, 60));
  const expired = medicals.filter((m) => m.expiry_date && m.expiry_date < today);
  return {
    data: {
      totalCount: medicals.length,
      byFitnessStatus: countBy(medicals, (m) => m.fitness_status),
      expiringSoonCount: expiringSoon.length,
      expiredCount: expired.length,
      expiringSoon: expiringSoon.slice(0, 10).map((m) => ({ employee_name: m.employee_name, expiry_date: m.expiry_date, medical_type: m.medical_type }))
    }
  };
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function gatherRestrictedDutyData(ctx: AgentContext): Promise<{ data: unknown; note?: string }> {
  if (ctx.redactSensitiveFields) {
    return { data: null, note: 'Restricted duty details are restricted to health/HR-management roles (POPIA).' };
  }
  const rows = await listHealthRestrictedDuty({ companyId: ctx.companyId }).catch(() => []);
  return { data: { count: Array.isArray(rows) ? rows.length : 0 } };
}

async function gatherHygieneData(ctx: AgentContext) {
  const records = await listHealthHygieneRecords({ companyId: ctx.companyId }).catch(() => []);
  return { data: { count: Array.isArray(records) ? records.length : 0 } };
}

export async function runHealthAgent(input: { message: string; history: AgentChatMessage[]; context: AgentContext }): Promise<AgentResponse> {
  const { message, context } = input;
  const intent = detectIntent(message);

  let grounding: { data: unknown; note?: string };
  switch (intent) {
    case 'medicals':
      grounding = await gatherMedicalsData(context);
      break;
    case 'restricted_duty':
      grounding = await gatherRestrictedDutyData(context);
      break;
    case 'hygiene':
      grounding = await gatherHygieneData(context);
      break;
    default:
      grounding = { data: null, note: 'General occupational health question -- no specific record was looked up.' };
  }

  try {
    const { content, model } = await chatComplete({
      model: AI_MODELS.reasoning,
      messages: [
        { role: 'system', content: HEALTH_SYSTEM_PROMPT(context) },
        { role: 'user', content: JSON.stringify({ question: message, intent, DATA: grounding.data, dataNote: grounding.note ?? null, recentConversation: input.history.slice(-6) }) }
      ],
      temperature: 0.2,
      maxTokens: 600
    });
    return parseAgentJsonReply('health', content, model);
  } catch (error) {
    console.warn('healthAgent AI call failed, using fallback', error);
    if (grounding.note && !grounding.data) return buildFallback('health', grounding.note);
    return buildFallback('health', "I'm having trouble reaching the assistant model right now. Please try again shortly, or use the Health module pages directly.");
  }
}
