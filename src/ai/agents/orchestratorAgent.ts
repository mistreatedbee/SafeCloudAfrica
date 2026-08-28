import type { AgentChatMessage, AgentContext, AgentResponse } from '../agentTypes';
import { runHrAgent } from './hrAgent';
import { runSafetyAgent } from './safetyAgent';
import { runQualityAgent } from './qualityAgent';
import { runEnvironmentAgent } from './environmentAgent';
import { runHealthAgent } from './healthAgent';
import { runLegalAgent } from './legalAgent';
import { runKpiAgent } from './kpiAgent';
import { runTrainingAgent } from './trainingAgent';
import { runPpeAgent } from './ppeAgent';
import { runObjectivesAgent } from './objectivesAgent';
import { runContractorsAgent } from './contractorsAgent';

/**
 * Routes a user turn to the right module agent(s) and merges their replies.
 *
 * Not wired up (no real per-record backing service to ground answers in,
 * as of this pass -- see AGENTS.md): asset_management, hazardous_chemical
 * management (both UI-only "coming soon" pages), and platform "security"
 * settings (admin config, not a records module a chat query naturally
 * fits). Adding one later is: import its run<Module>Agent, add a
 * MODULE_KEYWORDS entry, add a dispatch case below, and add its id to
 * AgentId in agentTypes.ts. For a query that names more than one module,
 * this calls the matched agents in parallel (Promise.all) and merges
 * replies -- see the merge branch below.
 */

type ModuleGuess = 'hr' | 'safety' | 'quality' | 'environment' | 'health' | 'legal' | 'kpi' | 'training' | 'ppe' | 'objectives' | 'contractors';

const MODULE_KEYWORDS: Array<{ module: ModuleGuess; pattern: RegExp }> = [
  { module: 'hr', pattern: /(leave|employee|staff|performance review|disciplinary|recruit|applicant|vacanc|acknowledg|payroll|timesheet|hr\b)/i },
  { module: 'safety', pattern: /(incident|risk assessment|hira|inspection|non.?conformance|investigation|coid|osh act|hazard)/i },
  { module: 'quality', pattern: /(ncr|non.?conformance|capa|corrective action|customer complaint|quality)/i },
  { module: 'environment', pattern: /(environment|aspect|water|air quality|waste|spill|emission|nema)/i },
  { module: 'health', pattern: /(medical|fitness|occupational health|hygiene|restricted duty)/i },
  { module: 'legal', pattern: /(legal register|legislation|compliance status|legal complian)/i },
  { module: 'kpi', pattern: /(\bkpi\b|key performance)/i },
  { module: 'training', pattern: /(training|course|certificat|outstanding training)/i },
  { module: 'ppe', pattern: /(\bppe\b|personal protective equipment|reorder|low stock)/i },
  { module: 'objectives', pattern: /(objective|target)/i },
  { module: 'contractors', pattern: /(contractor|visitor|induction|briefing)/i }
];

function guessModules(message: string, hint?: string): ModuleGuess[] {
  const matches = MODULE_KEYWORDS.filter((entry) => entry.pattern.test(message)).map((e) => e.module);
  if (matches.length > 0) return Array.from(new Set(matches));
  if (MODULE_KEYWORDS.some((e) => e.module === hint)) return [hint as ModuleGuess];
  // No keyword or hint match: default to hr, the most general-purpose agent
  // so far, rather than dead-ending the conversation.
  return ['hr'];
}

const RUNNERS: Record<ModuleGuess, (input: { message: string; history: AgentChatMessage[]; context: AgentContext }) => Promise<AgentResponse>> = {
  hr: runHrAgent,
  safety: runSafetyAgent,
  quality: runQualityAgent,
  environment: runEnvironmentAgent,
  health: runHealthAgent,
  legal: runLegalAgent,
  kpi: runKpiAgent,
  training: runTrainingAgent,
  ppe: runPpeAgent,
  objectives: runObjectivesAgent,
  contractors: runContractorsAgent
};

export async function runOrchestrator(input: { message: string; history: AgentChatMessage[]; context: AgentContext }): Promise<AgentResponse> {
  const modules = guessModules(input.message, input.context.currentModuleHint);

  const results = await Promise.all(modules.map((module) => RUNNERS[module](input)));

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
