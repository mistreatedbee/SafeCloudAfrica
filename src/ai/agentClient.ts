import { withInsforgeSession } from '../api/insforge/ensureSession';
import { toUserFacingError } from '../utils/userFacingMessage';
import type { AgentChatMessage, AgentContext, AgentProposedAction, AgentResponse } from './agentTypes';
import type { UUID } from '../api/models/entities';
import { runOrchestrator } from './agents/orchestratorAgent';
import { runHrAction, draftManagerRemarksForEmployee } from './agents/hrAgent';
import { runSafetyAction, draftInvestigationNotesFromDraft } from './agents/safetyAgent';

const ACTION_RUNNERS: Record<string, (action: AgentProposedAction, ctx: AgentContext) => Promise<string>> = {
  hr: runHrAction,
  safety: runSafetyAction
};

/**
 * The single entry point the UI should call. Every call is wrapped in
 * withInsforgeSession so a stale/expiring session is refreshed proactively
 * before we spend a model call on a request that would just 401 -- the same
 * pattern every other InsForge-calling service in this app follows.
 */
export async function askAgent(input: {
  message: string;
  history: AgentChatMessage[];
  context: AgentContext;
}): Promise<AgentResponse> {
  return withInsforgeSession('ai-agent:ask', async () => {
    try {
      return await runOrchestrator(input);
    } catch (error) {
      return {
        agentId: 'orchestrator',
        reply: toUserFacingError(error, "I couldn't reach the assistant right now. Please try again in a moment."),
        source: 'fallback'
      } satisfies AgentResponse;
    }
  });
}

/**
 * Executes one proposed action after the user has explicitly confirmed it in
 * the UI. This is the ONLY path by which an agent's suggestion turns into a
 * real write -- it always goes through the owning agent's own handler map,
 * which in turn calls existing, already-audited service functions (never
 * raw database access from agent code).
 */
export async function confirmAgentAction(input: {
  action: AgentProposedAction;
  context: AgentContext;
}): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  return withInsforgeSession('ai-agent:confirm-action', async () => {
    try {
      const runner = ACTION_RUNNERS[input.action.agentId];
      if (!runner) throw new Error(`No action runner wired for agent: ${input.action.agentId}`);
      const message = await runner(input.action, input.context);
      return { ok: true, message };
    } catch (error) {
      return { ok: false, message: toUserFacingError(error, "That couldn't be saved. Please try again.") };
    }
  });
}

/**
 * In-form drafting entry points, used by an inline "AI draft" button inside
 * a record form itself rather than the floating chat. Same session-wrapper
 * discipline as the two entry points above; unlike askAgent/confirmAgentAction
 * these return plain drafted text for the form's own field/Save button to
 * own -- there is no separate confirm-to-write step because the form's
 * existing save action already is that step.
 */
export async function draftPerformanceReviewComment(
  context: AgentContext,
  employeeId: UUID
): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  return withInsforgeSession('ai-agent:draft-hr-review-comment', async () => {
    try {
      const text = await draftManagerRemarksForEmployee(context, employeeId);
      return { ok: true, text };
    } catch (error) {
      return { ok: false, message: toUserFacingError(error, "Couldn't draft a comment right now.") };
    }
  });
}

export async function draftIncidentCauseNote(
  context: AgentContext,
  draft: { title?: string; category?: string; severity?: string; location?: string; briefDescription?: string; natureOfIncident?: string }
): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  return withInsforgeSession('ai-agent:draft-safety-cause-note', async () => {
    try {
      const text = await draftInvestigationNotesFromDraft(context, draft);
      return { ok: true, text };
    } catch (error) {
      return { ok: false, message: toUserFacingError(error, "Couldn't draft a note right now.") };
    }
  });
}
