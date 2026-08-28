import type { AgentId, AgentResponse } from './agentTypes';

/**
 * Shared helpers for read-only module agents (no proposedActions parsing --
 * hrAgent.ts and safetyAgent.ts have their own inline variant of this since
 * they also parse a proposedActions[] array; this is the simpler shape for
 * every agent added after them that has no write capability yet).
 */

export function buildFallback(agentId: AgentId, reply: string): AgentResponse {
  return { agentId, reply, source: 'fallback' };
}

export function parseAgentJsonReply(agentId: AgentId, rawContent: string, model: string): AgentResponse {
  const cleaned = rawContent.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  try {
    const parsed = JSON.parse(cleaned) as { reply?: string };
    const reply = typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply.trim() : "I couldn't work out an answer -- could you rephrase that?";
    return { agentId, reply, source: 'ai', model };
  } catch {
    // Model didn't return valid JSON -- fall back to showing the raw text
    // rather than a hard error, since it's often still a usable answer.
    return { agentId, reply: rawContent.trim() || "I couldn't work out an answer -- could you rephrase that?", source: 'ai', model };
  }
}

export function countBy<T>(rows: T[], key: (row: T) => string | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const k = key(row) ?? 'Unknown';
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
