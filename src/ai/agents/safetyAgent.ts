import { chatComplete, AI_MODELS } from '../aiClient';
import type { AgentChatMessage, AgentContext, AgentProposedAction, AgentResponse } from '../agentTypes';
import { listIncidentsWithFilters, updateIncident } from '../../api/services/incidentsService';
import { listRiskAssessments } from '../../api/services/riskAssessmentsService';
import { listInspections } from '../../api/services/inspectionsService';

/**
 * Safety module specialist agent: incidents, risk assessments, inspections.
 *
 * South African regulatory grounding this agent's replies must stay
 * consistent with: OHS Act (general duty of care, incident reporting/
 * investigation), COID Act (Section 24 employer reporting of workplace
 * injuries to the Compensation Fund -- the agent should flag when an
 * incident looks COID-reportable but must never claim to have filed
 * anything), and this app's own risk-assessment approval workflow
 * (draft -> submitted -> active, requiring a supervisor sign-off before a
 * risk assessment is active).
 *
 * Data-access rule (anti-hallucination): identical discipline to hrAgent --
 * every capability fetches real rows first and only asks the model to
 * phrase an answer restricted to that data. No POPIA redaction concern here
 * (incidents/inspections/risk assessments aren't personal HR records), but
 * role gating still applies to the one write capability (investigation
 * notes) below.
 */

const SAFETY_SYSTEM_PROMPT = (ctx: AgentContext) => `You are the Safety specialist assistant inside Safe Cloud Africa, a South African occupational health & safety compliance platform.

Company: ${ctx.companyName}
Speaking to: ${ctx.userFullName} (role: ${ctx.role})

Ground rules:
- Only use facts given to you in the "DATA" block below. Never invent incident counts, dates, ratings, or names. If the data needed isn't provided, say so and point to the relevant module page.
- South African law context: the OHS Act requires incidents to be investigated and controls implemented; COID Act Section 24 requires the employer to report qualifying workplace injuries to the Compensation Fund (W.Cl.2) -- if the DATA suggests an incident may be COID-reportable, say so clearly but never claim the report has been filed. Risk assessments in this platform must be supervisor-approved (status: draft -> submitted -> active) before they are valid for use on site.
- Be concise and practical. When asked to draft investigation/root-cause notes, write them professionally and propose them as an action for the user to review and confirm -- never claim you already saved anything.
- Return ONLY compact JSON of this exact shape, no prose outside it:
{"reply":"string","proposedActions":[{"actionType":"string","label":"string","summary":"string","payload":{}}]}
Omit "proposedActions" (or use an empty array) unless the user asked you to draft/save something specific.`;

type Intent = 'open_incidents' | 'risk_assessment_status' | 'inspection_compliance' | 'investigation_draft' | 'incident_pattern' | 'general';

function detectIntent(message: string): Intent {
  const m = message.toLowerCase();
  if (/(open incident|how many incident|incident.*(this month|this week|recent))/.test(m)) return 'open_incidents';
  if (/(risk assessment|hira|overdue.*(review|sign.?off)|pending approval|supervisor sign)/.test(m)) return 'risk_assessment_status';
  if (/(inspection|overdue.*inspect|non.?conformance|nc count)/.test(m)) return 'inspection_compliance';
  if (/(draft.*(investigation|root cause|findings)|investigation notes|cause of incident)/.test(m)) return 'investigation_draft';
  if (/(pattern|trend|recurring|repeat.*incident|cluster)/.test(m)) return 'incident_pattern';
  return 'general';
}

const canManage = new Set(['owner', 'admin', 'manager', 'supervisor', 'consultant']);

async function gatherOpenIncidents(ctx: AgentContext): Promise<{ data: unknown }> {
  const open = await listIncidentsWithFilters({ companyId: ctx.companyId, status: 'open', limit: 200 }).catch(() => []);
  const investigating = await listIncidentsWithFilters({ companyId: ctx.companyId, status: 'investigating', limit: 200 }).catch(() => []);
  return {
    data: {
      openCount: open.length,
      investigatingCount: investigating.length,
      bySeverity: countBy([...open, ...investigating], (i) => i.severity),
      byCategory: countBy([...open, ...investigating], (i) => i.category),
      recent: [...open, ...investigating]
        .slice(0, 10)
        .map((i) => ({ id: i.id, title: i.title, severity: i.severity, status: i.status, category: i.category, occurred_at: i.occurred_at }))
    }
  };
}

function countBy<T>(rows: T[], key: (row: T) => string | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const k = key(row) ?? 'Unknown';
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

async function gatherRiskAssessmentStatus(ctx: AgentContext): Promise<{ data: unknown }> {
  const assessments = await listRiskAssessments({ companyId: ctx.companyId, actorUserId: ctx.userId, actorRole: ctx.role, limit: 500 }).catch(() => []);
  const today = new Date().toISOString().slice(0, 10);
  const overdueForReview = assessments.filter((a) => a.status === 'active' && a.next_review_date && a.next_review_date < today);
  const pendingApproval = assessments.filter((a) => a.status === 'submitted');
  return {
    data: {
      totalActive: assessments.filter((a) => a.status === 'active').length,
      pendingApprovalCount: pendingApproval.length,
      overdueForReviewCount: overdueForReview.length,
      pendingApproval: pendingApproval.slice(0, 10).map((a) => ({ id: a.id, title: a.title, supervisor_name: a.supervisor_name_snapshot })),
      overdueForReview: overdueForReview.slice(0, 10).map((a) => ({ id: a.id, title: a.title, next_review_date: a.next_review_date }))
    }
  };
}

async function gatherInspectionCompliance(ctx: AgentContext): Promise<{ data: unknown }> {
  const inspections = await listInspections({ companyId: ctx.companyId, limit: 500 }).catch(() => []);
  const today = new Date().toISOString().slice(0, 10);
  const overdue = inspections.filter((i) => i.status === 'scheduled' && i.scheduled_at && i.scheduled_at.slice(0, 10) < today);
  const totalNcrs = inspections.reduce((sum, i) => sum + (i.nonconformances_count ?? 0), 0);
  return {
    data: {
      totalInspections: inspections.length,
      overdueCount: overdue.length,
      totalNonConformances: totalNcrs,
      overdue: overdue.slice(0, 10).map((i) => ({ id: i.id, title: i.title, scheduled_at: i.scheduled_at, location: i.location }))
    }
  };
}

async function gatherInvestigationData(ctx: AgentContext, message: string): Promise<{ data: unknown; note?: string }> {
  if (!canManage.has(ctx.role)) {
    return { data: null, note: 'Drafting investigation notes is restricted to manager/supervisor/HR-admin roles.' };
  }
  const all = await listIncidentsWithFilters({ companyId: ctx.companyId, limit: 300 }).catch(() => []);
  const words = message.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3);
  const match = all.find((i) => words.some((w) => i.title.toLowerCase().includes(w)));
  if (!match) {
    return { data: { recentIncidents: all.slice(0, 10).map((i) => ({ id: i.id, title: i.title })) }, note: 'No specific incident matched by title -- ask the user which incident (list provided).' };
  }
  return {
    data: {
      incident: {
        id: match.id,
        title: match.title,
        category: match.category,
        severity: match.severity,
        status: match.status,
        description: match.description,
        existing_cause: match.cause_of_incident ?? match.cause ?? null,
        occurred_at: match.occurred_at,
        location: match.location
      }
    }
  };
}

async function gatherIncidentPatternData(ctx: AgentContext): Promise<{ data: unknown }> {
  const all = await listIncidentsWithFilters({ companyId: ctx.companyId, limit: 500 }).catch(() => []);
  return {
    data: {
      totalIncidents: all.length,
      byCategory: countBy(all, (i) => i.category),
      bySeverity: countBy(all, (i) => i.severity),
      byLocation: countBy(all, (i) => i.location)
    }
  };
}

function buildFallback(reply: string): AgentResponse {
  return { agentId: 'safety', reply, source: 'fallback' };
}

export async function runSafetyAgent(input: { message: string; history: AgentChatMessage[]; context: AgentContext }): Promise<AgentResponse> {
  const { message, context } = input;
  const intent = detectIntent(message);

  let grounding: { data: unknown; note?: string };
  switch (intent) {
    case 'open_incidents':
      grounding = await gatherOpenIncidents(context);
      break;
    case 'risk_assessment_status':
      grounding = await gatherRiskAssessmentStatus(context);
      break;
    case 'inspection_compliance':
      grounding = await gatherInspectionCompliance(context);
      break;
    case 'investigation_draft':
      grounding = await gatherInvestigationData(context, message);
      break;
    case 'incident_pattern':
      grounding = await gatherIncidentPatternData(context);
      break;
    default:
      grounding = { data: null, note: 'General safety question -- no specific record was looked up.' };
  }

  try {
    const { content, model } = await chatComplete({
      model: AI_MODELS.reasoning,
      messages: [
        { role: 'system', content: SAFETY_SYSTEM_PROMPT(context) },
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
        agentId: 'safety' as const,
        actionType: a.actionType!,
        label: a.label!,
        summary: a.summary!,
        payload: (a.payload && typeof a.payload === 'object' ? a.payload : {}) as Record<string, unknown>
      }));

    return { agentId: 'safety', reply, proposedActions: proposedActions.length ? proposedActions : undefined, source: 'ai', model };
  } catch (error) {
    console.warn('safetyAgent AI call failed, using fallback', error);
    if (grounding.note && !grounding.data) {
      return buildFallback(grounding.note);
    }
    return buildFallback("I'm having trouble reaching the assistant model right now. Please try again shortly, or use the Safety module pages directly.");
  }
}

// --- Write-confirmation handlers -------------------------------------------------
// Same pattern as hrAgent.ts: the agent only ever proposes; a real write only
// happens after an explicit user confirm, via updateIncident() (the existing,
// already-audited service function -- never raw database access here).

async function saveInvestigationNotes(payload: Record<string, unknown>, ctx: AgentContext): Promise<string> {
  if (!canManage.has(ctx.role)) throw new Error('Not permitted for this role.');
  const incidentId = String(payload.incidentId ?? '');
  const causeOfIncident = String(payload.causeOfIncident ?? '').trim();
  if (!incidentId || !causeOfIncident) throw new Error('Missing incident or notes text.');

  // Defense in depth: confirm the incident actually belongs to this company
  // before writing, even though updateIncident() itself is RLS-scoped.
  const owned = await listIncidentsWithFilters({ companyId: ctx.companyId, limit: 500 }).catch(() => []);
  if (!owned.some((i) => i.id === incidentId)) throw new Error('Incident not found for this company.');

  await updateIncident(incidentId, { causeOfIncident });
  return 'Draft investigation notes saved to the incident.';
}

const ACTION_HANDLERS: Record<string, (payload: Record<string, unknown>, ctx: AgentContext) => Promise<string>> = {
  save_incident_investigation_notes: saveInvestigationNotes
};

export async function runSafetyAction(action: AgentProposedAction, ctx: AgentContext): Promise<string> {
  const handler = ACTION_HANDLERS[action.actionType];
  if (!handler) throw new Error(`Unknown action type: ${action.actionType}`);
  return handler(action.payload, ctx);
}
