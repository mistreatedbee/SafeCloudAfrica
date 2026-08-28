import type { AgentChatMessage, AgentContext, AgentResponse } from '../agentTypes';
import { runHrAgent } from './hrAgent';
import { runSafetyAgent } from './safetyAgent';

/**
 * Routes a user turn to the right module agent(s) and merges their replies.
 *
 * Wired up so far: hr, safety. Adding the next agent is: import its
 * run<Module>Agent, add a MODULE_KEYWORDS entry, add a dispatch case below,
 * and add its id to AgentId in agentTypes.ts. For a query that names more
 * than one module, this calls the matched agents in parallel (Promise.all)
 * and merges replies -- see the merge branch below.
 */

type ModuleGuess = 'hr' | 'safety';

const MODULE_KEYWORDS: Array<{ module: ModuleGuess; pattern: RegExp }> = [
  { module: 'hr', pattern: /(leave|employee|staff|performance review|disciplinary|recruit|applicant|vacanc|acknowledg|payroll|timesheet|hr\b)/i },
  { module: 'safety', pattern: /(incident|risk assessment|hira|inspection|non.?conformance|investigation|coid|osh act|hazard)/i }
];

function guessModules(message: string, hint?: string): ModuleGuess[] {
  const matches = MODULE_KEYWORDS.filter((entry) => entry.pattern.test(message)).map((e) => e.module);
  if (matches.length > 0) return Array.from(new Set(matches));
  if (hint === 'hr' || hint === 'safety') return [hint];
  // No keyword or hint match: default to hr, the most general-purpose agent
  // so far, rather than dead-ending the conversation.
  return ['hr'];
}

export async function runOrchestrator(input: { message: string; history: AgentChatMessage[]; context: AgentContext }): Promise<AgentResponse> {
  const modules = guessModules(input.message, input.context.currentModuleHint);

  const results = await Promise.all(
    modules.map(async (module) => {
      if (module === 'hr') return runHrAgent(input);
      if (module === 'safety') return runSafetyAgent(input);
      // Unreachable; kept so adding a module to MODULE_KEYWORDS without
      // wiring its runner fails loudly instead of silently.
      throw new Error(`No agent wired for module: ${module}`);
    })
  );

  if (results.length === 1) return results[0];

  // Multi-agent merge: concatenate replies with light headings and pool
  // proposed actions.
  return {
    agentId: 'orchestrator',
    reply: results.map((r) => r.reply).join('\n\n'),
    proposedActions: results.flatMap((r) => r.proposedActions ?? []),
    source: results.every((r) => r.source === 'ai') ? 'ai' : 'fallback'
  };
}
