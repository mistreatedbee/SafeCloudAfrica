import { chatComplete, AI_MODELS } from '../aiClient';
import type { AgentChatMessage, AgentContext, AgentProposedAction, AgentResponse } from '../agentTypes';
import {
  searchHrEmployees,
  listHrRecords,
  updateHrRecord,
  listHrLeaveRequests,
  type HrEmployee,
  type HrLeaveRequest
} from '../../api/services/hrService';

/**
 * HR module specialist agent.
 *
 * South African regulatory grounding this agent's replies must stay
 * consistent with (baked into the system prompt below, not re-derived by
 * the model): BCEA leave entitlements (21 consecutive days annual leave/yr,
 * sick leave cycle, family responsibility leave), LRA fair-process
 * requirements for discipline/incapacity, POPIA (employees may only see
 * their own personal data; anything about a colleague's record must be
 * redacted for role === 'employee'), EEA (no advice that could be read as
 * discriminatory screening), COID Act (workplace injury reporting is a
 * Safety-module concern, out of scope here -- the agent should say so and
 * not improvise).
 *
 * Data-access rule (anti-hallucination): the agent is never allowed to
 * answer with numbers/dates/names it wasn't handed in the prompt. Every
 * capability below fetches real rows via hrService first and only then asks
 * the model to phrase an answer restricted to that data.
 */

const HR_SYSTEM_PROMPT = (ctx: AgentContext) => `You are the HR specialist assistant inside Safe Cloud Africa, a South African occupational health & safety / HR compliance platform.

Company: ${ctx.companyName}
Speaking to: ${ctx.userFullName} (role: ${ctx.role})

Ground rules:
- Only use facts given to you in the "DATA" block below. Never invent employee names, dates, balances, or ratings. If the data needed isn't provided, say so and suggest where in the HR module to look.
- South African law context: BCEA governs leave (21 consecutive days annual leave/annual cycle, sick leave over a 36-month cycle, family responsibility leave), LRA requires a fair process for discipline/incapacity, COID Act covers workplace injury claims (tell the user that's a Safety-module matter, not HR), POPIA restricts personal information to those with a legitimate need.
${ctx.redactSensitiveFields ? '- POPIA: this user has an "employee" role. NEVER reveal another employee\'s ID number, medical, banking, disciplinary, or performance details. Only their own record (if the DATA block includes it) may be discussed in detail; for anyone else, answer only with role-appropriate aggregate information (e.g. counts), never named specifics.' : '- This user has an HR-management role and may see full employee-level detail included in the DATA block.'}
- Be concise and practical. When a written HR document (e.g. a performance review comment) is requested, draft it professionally and propose it as an action for the user to review and confirm -- never claim you already saved it.
- Return ONLY compact JSON of this exact shape, no prose outside it:
{"reply":"string","proposedActions":[{"actionType":"string","label":"string","summary":"string","payload":{}}]}
Omit "proposedActions" (or use an empty array) unless the user asked you to draft/save something specific.`;

type Intent = 'leave_balance' | 'performance_review_draft' | 'ack_reminders' | 'recruitment_screening' | 'leave_pattern' | 'general';

function detectIntent(message: string): Intent {
  const m = message.toLowerCase();
  if (/(leave balance|days.*(left|remaining)|how much leave)/.test(m)) return 'leave_balance';
  if (/(performance review|review comment|draft.*(review|comment|remarks)|manager remarks)/.test(m)) return 'performance_review_draft';
  if (/(acknowledg|document.*(sign|outstanding)|policy.*(sign|outstanding))/.test(m)) return 'ack_reminders';
  if (/(screen|applicant|candidate|shortlist|cv|resume|vacanc)/.test(m)) return 'recruitment_screening';
  if (/(leave pattern|frequent leave|monday.*friday|suspicious leave|absen)/.test(m)) return 'leave_pattern';
  return 'general';
}

async function resolveMentionedEmployee(companyId: UUIDLike, message: string, ctx: AgentContext): Promise<HrEmployee | null> {
  // If the asker is a plain employee, they can only ever mean themselves.
  if (ctx.redactSensitiveFields) {
    if (!ctx.employeeId) return null;
    const matches = await searchHrEmployees(companyId, { includeUnlinked: true, limit: 500 });
    return matches.find((e) => e.id === ctx.employeeId) ?? null;
  }
  const words = message.replace(/[^a-zA-Z\s'-]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return null;
  const candidates = await searchHrEmployees(companyId, { query: words.join(' '), includeUnlinked: true, limit: 20 }).catch(() => []);
  if (candidates.length > 0) return candidates[0];
  // Fall back to trying each capitalised-looking word as a name fragment.
  for (const w of words) {
    const found = await searchHrEmployees(companyId, { query: w, includeUnlinked: true, limit: 5 }).catch(() => []);
    if (found.length === 1) return found[0];
  }
  return null;
}

type UUIDLike = string;

async function gatherLeaveBalanceData(ctx: AgentContext, message: string): Promise<{ data: unknown; note?: string }> {
  const employee = await resolveMentionedEmployee(ctx.companyId, message, ctx);
  if (!employee) {
    return { data: null, note: 'No matching employee record was found or resolvable for this question.' };
  }
  if (ctx.redactSensitiveFields && employee.id !== ctx.employeeId) {
    return { data: null, note: 'The asker may only see their own leave balance (POPIA).' };
  }
  const balances = await listHrRecords(ctx.companyId, 'hr_leave_balances', { employee_id: employee.id }).catch(() => []);
  return {
    data: {
      employee: { id: employee.id, name: `${employee.first_name} ${employee.last_name}`, employee_no: employee.employee_no },
      balances: balances.map((b) => ({
        leave_type_id: b['leave_type_id'],
        balance_days: b['balance_days'] ?? b['days_remaining'] ?? null,
        accrued_days: b['accrued_days'] ?? null,
        taken_days: b['taken_days'] ?? null,
        cycle_start: b['cycle_start_date'] ?? null,
        cycle_end: b['cycle_end_date'] ?? null
      }))
    }
  };
}

async function gatherPerformanceReviewData(ctx: AgentContext, message: string): Promise<{ data: unknown; note?: string }> {
  if (ctx.redactSensitiveFields) {
    return { data: null, note: 'Only a manager/HR-admin role can draft or view performance review remarks for an employee.' };
  }
  const employee = await resolveMentionedEmployee(ctx.companyId, message, ctx);
  if (!employee) return { data: null, note: 'No matching employee record was found for this review.' };
  const reviews = await listHrRecords(ctx.companyId, 'hr_performance_reviews', { employee_id: employee.id }).catch(() => []);
  const latest = [...reviews].sort((a, b) => String(b['review_date'] ?? '').localeCompare(String(a['review_date'] ?? '')))[0];
  return {
    data: {
      employee: { id: employee.id, name: `${employee.first_name} ${employee.last_name}`, job_title: employee.job_title },
      latestReview: latest
        ? {
            id: latest['id'],
            cycle: latest['cycle'],
            overall_rating: latest['overall_rating'],
            manager_rating: latest['manager_rating'],
            employee_rating: latest['employee_rating'],
            strengths: latest['strengths'],
            weaknesses: latest['weaknesses'],
            existing_manager_remarks: latest['manager_remarks'],
            status: latest['status']
          }
        : null
    },
    note: latest ? undefined : 'No performance review record exists yet for this employee -- suggest creating one in HR > Performance Reviews first.'
  };
}

async function gatherAckReminderData(ctx: AgentContext): Promise<{ data: unknown }> {
  // Aggregate-only: counts, not who-signed-what for individual colleagues, to keep this safe for any role.
  const docs = await listHrRecords(ctx.companyId, 'hr_ack_documents', {}).catch(() => []);
  const receipts = await listHrRecords(ctx.companyId, 'hr_ack_receipts', {}).catch(() => []);
  const receiptsByDoc = new Map<string, number>();
  for (const r of receipts) {
    const docId = String(r['ack_document_id'] ?? '');
    receiptsByDoc.set(docId, (receiptsByDoc.get(docId) ?? 0) + 1);
  }
  const employees = await listRecipientCountSafe(ctx);
  return {
    data: {
      totalActiveDocuments: docs.filter((d) => !d['archived']).length,
      totalEmployees: employees,
      documents: docs
        .filter((d) => !d['archived'])
        .map((d) => ({
          id: d['id'],
          title: d['title'],
          acknowledgedCount: receiptsByDoc.get(String(d['id'])) ?? 0
        }))
    }
  };
}

async function listRecipientCountSafe(ctx: AgentContext): Promise<number> {
  try {
    const { listHrEmployees } = await import('../../api/services/hrService');
    const all = await listHrEmployees(ctx.companyId);
    return all.filter((e) => e.employment_status === 'ACTIVE' || e.employment_status === 'ONBOARDING').length;
  } catch {
    return 0;
  }
}

async function gatherRecruitmentData(ctx: AgentContext, message: string): Promise<{ data: unknown; note?: string }> {
  if (ctx.redactSensitiveFields) {
    return { data: null, note: 'Recruitment screening is restricted to manager/HR-admin roles.' };
  }
  const vacancies = await listHrRecords(ctx.companyId, 'hr_vacancies', {}).catch(() => []);
  const applicants = await listHrRecords(ctx.companyId, 'hr_applicants', {}).catch(() => []);
  const mentionedVacancy = vacancies.find((v) =>
    message.toLowerCase().includes(String(v['title'] ?? '').toLowerCase().slice(0, 30)) && String(v['title'] ?? '').length > 3
  );
  const relevantApplicants = mentionedVacancy
    ? applicants.filter((a) => a['vacancy_id'] === mentionedVacancy['id'])
    : applicants.slice(0, 20);
  return {
    data: {
      vacancies: vacancies.map((v) => ({ id: v['id'], title: v['title'], status: v['status'] })),
      applicants: relevantApplicants.map((a) => ({
        id: a['id'],
        name: a['name'] ?? a['applicant_name'],
        vacancy_id: a['vacancy_id'],
        status: a['status'],
        notes: a['notes'] ?? null,
        qualifications: a['qualifications'] ?? null,
        experience_years: a['experience_years'] ?? null
      }))
    }
  };
}

async function gatherLeavePatternData(ctx: AgentContext, message: string): Promise<{ data: unknown; note?: string }> {
  if (ctx.redactSensitiveFields) {
    return { data: null, note: 'Leave pattern analysis is restricted to manager/HR-admin roles.' };
  }
  const employee = await resolveMentionedEmployee(ctx.companyId, message, ctx);
  const requests: HrLeaveRequest[] = employee
    ? await listHrLeaveRequests(ctx.companyId, employee.id).catch(() => [])
    : await listHrLeaveRequests(ctx.companyId).catch(() => []);
  const approved = requests.filter((r) => r.status === 'APPROVED');
  const dayOfWeekCounts: Record<string, number> = {};
  for (const r of approved) {
    const d = new Date(r.start_date);
    const day = d.toLocaleDateString('en-US', { weekday: 'long' });
    dayOfWeekCounts[day] = (dayOfWeekCounts[day] ?? 0) + 1;
  }
  return {
    data: {
      employee: employee ? { id: employee.id, name: `${employee.first_name} ${employee.last_name}` } : null,
      totalApprovedRequests: approved.length,
      requestCountByStartDayOfWeek: dayOfWeekCounts,
      recentRequests: approved.slice(0, 15).map((r) => ({ start_date: r.start_date, end_date: r.end_date, total_days: r.total_days, reason: r.reason }))
    }
  };
}

function buildFallback(reply: string): AgentResponse {
  return { agentId: 'hr', reply, source: 'fallback' };
}

export async function runHrAgent(input: { message: string; history: AgentChatMessage[]; context: AgentContext }): Promise<AgentResponse> {
  const { message, context } = input;
  const intent = detectIntent(message);

  let grounding: { data: unknown; note?: string };
  switch (intent) {
    case 'leave_balance':
      grounding = await gatherLeaveBalanceData(context, message);
      break;
    case 'performance_review_draft':
      grounding = await gatherPerformanceReviewData(context, message);
      break;
    case 'ack_reminders':
      grounding = await gatherAckReminderData(context);
      break;
    case 'recruitment_screening':
      grounding = await gatherRecruitmentData(context, message);
      break;
    case 'leave_pattern':
      grounding = await gatherLeavePatternData(context, message);
      break;
    default:
      grounding = { data: null, note: 'General HR question -- no specific record was looked up.' };
  }

  try {
    const { content, model } = await chatComplete({
      model: AI_MODELS.reasoning,
      messages: [
        { role: 'system', content: HR_SYSTEM_PROMPT(context) },
        {
          role: 'user',
          content: JSON.stringify({
            question: message,
            intent,
            DATA: grounding.data,
            dataNote: grounding.note ?? null,
            recentConversation: input.history.slice(-6)
          })
        }
      ],
      temperature: 0.2,
      maxTokens: 700
    });

    const cleaned = content.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(cleaned) as { reply?: string; proposedActions?: Partial<AgentProposedAction>[] };
    const reply = typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply.trim() : "I couldn't work out an answer -- could you rephrase that?";
    const proposedActions: AgentProposedAction[] = (Array.isArray(parsed.proposedActions) ? parsed.proposedActions : [])
      .filter((a): a is Required<Pick<AgentProposedAction, 'actionType' | 'label' | 'summary' | 'payload'>> =>
        typeof a?.actionType === 'string' && typeof a?.label === 'string' && typeof a?.summary === 'string')
      .map((a, i) => ({
        id: `${Date.now()}-${i}`,
        actionType: a.actionType!,
        label: a.label!,
        summary: a.summary!,
        payload: (a.payload && typeof a.payload === 'object' ? a.payload : {}) as Record<string, unknown>
      }));

    return { agentId: 'hr', reply, proposedActions: proposedActions.length ? proposedActions : undefined, source: 'ai', model };
  } catch (error) {
    console.warn('hrAgent AI call failed, using fallback', error);
    if (grounding.note && !grounding.data) {
      return buildFallback(grounding.note);
    }
    return buildFallback("I'm having trouble reaching the assistant model right now. Please try again shortly, or use the HR module pages directly.");
  }
}

// --- Write-confirmation handlers -------------------------------------------------
// Called only from agentClient.confirmAgentAction(), only after the user has
// explicitly clicked "confirm" on a proposed action shown in the UI. These
// are the ONLY functions in the HR agent allowed to touch the database, and
// they only ever do so via the existing, already-audited hrService functions.

async function saveManagerRemarks(payload: Record<string, unknown>, ctx: AgentContext): Promise<string> {
  const reviewId = String(payload.reviewId ?? '');
  const managerRemarks = String(payload.managerRemarks ?? '').trim();
  if (!reviewId || !managerRemarks) throw new Error('Missing review or comment text.');
  if (ctx.redactSensitiveFields) throw new Error('Not permitted for this role.');
  await updateHrRecord('hr_performance_reviews', {
    companyId: ctx.companyId,
    rowId: reviewId,
    actorUserId: ctx.userId,
    patch: { manager_remarks: managerRemarks }
  });
  return 'Draft comment saved to the performance review.';
}

const ACTION_HANDLERS: Record<string, (payload: Record<string, unknown>, ctx: AgentContext) => Promise<string>> = {
  save_performance_review_comment: saveManagerRemarks
};

export async function runHrAction(action: AgentProposedAction, ctx: AgentContext): Promise<string> {
  const handler = ACTION_HANDLERS[action.actionType];
  if (!handler) throw new Error(`Unknown action type: ${action.actionType}`);
  return handler(action.payload, ctx);
}
