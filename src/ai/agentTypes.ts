import type { UUID } from '../api/models/entities';
import type { CompanyRole } from '../api/models/core';

/**
 * Shared types for the module-agent system (Phase 1: orchestrator + hrAgent).
 * See src/ai/AGENTS.md for the system overview and how to add a new agent.
 */

/** Slug identifying a specialist agent. Extend this union as new agents ship. */
export type AgentId = 'hr' | 'safety' | 'orchestrator';

export type AgentChatRole = 'user' | 'assistant';

export type AgentChatMessage = {
  role: AgentChatRole;
  content: string;
};

/**
 * A write the agent wants to perform on the user's behalf. The agent NEVER
 * writes to the database itself -- it only ever proposes an action shaped
 * like this. The UI must show the proposal to the user and get an explicit
 * confirm click before agentClient.confirmAction() calls the real,
 * already-audited service function. See hrAgent.ts's ACTION_HANDLERS.
 */
export type AgentProposedAction = {
  /** Unique id for this proposal within the conversation turn, e.g. crypto.randomUUID(). */
  id: string;
  /** Which agent owns actionType's handler -- set by the agent itself, used by agentClient to route confirmAgentAction(). */
  agentId: AgentId;
  /** Which handler in the owning agent's ACTION_HANDLERS map performs this write. */
  actionType: string;
  /** Short human label shown on the confirm button, e.g. "Save draft comment to review". */
  label: string;
  /** Human-readable summary of what will change, shown to the user before they confirm. */
  summary: string;
  /** Opaque payload passed to the handler when confirmed. Must be plain JSON. */
  payload: Record<string, unknown>;
};

export type AgentResponse = {
  agentId: AgentId;
  /** Plain-text (markdown-lite) reply shown in the chat transcript. */
  reply: string;
  /** Zero or more writes the agent would like to perform, pending user confirmation. */
  proposedActions?: AgentProposedAction[];
  /** True if this used the AI model; false if a fallback/rule-based reply was used. */
  source: 'ai' | 'fallback';
  model?: string;
};

/**
 * Everything an agent needs about "who is asking, from where, as what role" --
 * built once per turn by buildAgentContext() and never trusted from client
 * input beyond what the authenticated session already proves.
 */
export type AgentContext = {
  companyId: UUID;
  companyName: string;
  userId: UUID;
  userFullName: string;
  role: CompanyRole;
  /** The HR employee row linked to this user, if any (most employees have no user_id, so this is looked up the other way). */
  employeeId: UUID | null;
  /** True when POPIA field redaction must be applied to agent output (role === 'employee' asking about others). */
  redactSensitiveFields: boolean;
  /** Which page/module the user was on when they opened the assistant, for lightweight routing hints. */
  currentModuleHint?: string;
};
