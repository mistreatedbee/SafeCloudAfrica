import type { AgentChatMessage, AgentContext, AgentResponse } from '../agentTypes';
import { runHrAgent } from './hrAgent';

/**
 * Routes a user turn to the right module agent(s) and merges their replies.
 *
 * Phase 1 only wires up hrAgent, so routing is trivial today -- but this is
 * built as a real dispatcher (not a stub) so wiring in safetyAgent,
 * ppeAgent, etc. later is a matter of adding an entry to AGENT_ROUTES and a
 * keyword set, not restructuring this file. For a query that names more than
 * one module once multiple agents exist, this should call the matched
 * agents in parallel (Promise.all) and merge replies -- the merge branch
 * below already handles a multi-agent result list.
 */

type ModuleGuess = 'hr';

const MODULE_KEYWORDS: Array<{ module: ModuleGuess; pattern: RegExp }> = [
  { module: 'hr', pattern: /(leave|employee|staff|performance review|disciplinary|recruit|applicant|vacanc|acknowledg|payroll|timesheet|hr\b)/i }
];

function guessModules(message: string, hint?: string): ModuleGuess[] {
  const matches = MODULE_KEYWORDS.filter((entry) => entry.pattern.test(message)).map((e) => e.module);
  if (matches.length > 0) return Array.from(new Set(matches));
  if (hint === 'hr') return ['hr'];
  // Phase 1 has exactly one specialist agent; default any unmatched query to it
  // rather than dead-ending the conversation.
  return ['hr'];
}

export async function runOrchestrator(input: { message: string; history: AgentChatMessage[]; context: AgentContext }): Promise<AgentResponse> {
  const modules = guessModules(input.message, input.context.currentModuleHint);

  const results = await Promise.all(
    modules.map(async (module) => {
      if (module === 'hr') return runHrAgent(input);
      // Unreachable in Phase 1; kept so adding a module to MODULE_KEYWORDS
      // without wiring its runner fails loudly instead of silently.
      throw new Error(`No agent wired for module: ${module}`);
    })
  );

  if (results.length === 1) return results[0];

  // Multi-agent merge (exercised once a second agent ships): concatenate
  // replies with light headings and pool proposed actions.
  return {
    agentId: 'orchestrator',
    reply: results.map((r) => r.reply).join('\n\n'),
    proposedActions: results.flatMap((r) => r.proposedActions ?? []),
    source: results.every((r) => r.source === 'ai') ? 'ai' : 'fallback'
  };
}
