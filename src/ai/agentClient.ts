import { withInsforgeSession } from '../api/insforge/ensureSession';
import { toUserFacingError } from '../utils/userFacingMessage';
import type { AgentChatMessage, AgentContext, AgentProposedAction, AgentResponse } from './agentTypes';
import { runOrchestrator } from './agents/orchestratorAgent';
import { runHrAction } from './agents/hrAgent';

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
      const message = await runHrAction(input.action, input.context);
      return { ok: true, message };
    } catch (error) {
      return { ok: false, message: toUserFacingError(error, "That couldn't be saved. Please try again.") };
    }
  });
}
