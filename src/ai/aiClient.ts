import { insforge } from '../api/insforge/client';

/**
 * Shared entry point for every AI feature in this app. Generalises the
 * calling convention already proven in src/api/services/supportAssistantAiService.ts
 * (JSON-mode system prompt, fence-stripped parse, model fallback) so new AI
 * agents don't each reinvent request/response handling.
 */

export const AI_MODELS = {
  /** Cheap, fast: classification, extraction, structured document drafting. */
  fast: 'openai/gpt-4o-mini',
  /** Reasoning-heavy: investigations, executive advisory, audit findings. */
  reasoning: 'anthropic/claude-3.5-sonnet',
  /** Vision-capable chat model for inspection-photo analysis. */
  vision: 'openai/gpt-4o-mini',
  /** Embeddings for the RAG index (matches vector(1536) in the migration). */
  embedding: 'openai/text-embedding-3-small'
} as const;

export type AiChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export class AiResponseParseError extends Error {
  constructor(public readonly raw: string, cause: unknown) {
    super(`AI response was not valid JSON: ${String((cause as Error)?.message ?? cause)}`);
    this.name = 'AiResponseParseError';
  }
}

function stripCodeFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

/**
 * Low-level chat completion call. Returns the raw assistant text plus the
 * model actually used. Callers decide how to parse/fallback -- this
 * function never throws for a "the AI declined to answer" case, only for
 * transport failures, so agent code can always show the user something.
 */
export async function chatComplete(input: {
  model?: string;
  messages: AiChatMessage[];
  temperature?: number;
  maxTokens?: number;
}): Promise<{ content: string; model: string }> {
  const model = input.model ?? AI_MODELS.fast;
  const response = await insforge.ai.chat.completions.create({
    model,
    messages: input.messages,
    temperature: input.temperature ?? 0.2,
    maxTokens: input.maxTokens ?? 1200
  });
  const content = String((response as any)?.choices?.[0]?.message?.content ?? '').trim();
  return { content, model };
}

/**
 * JSON-mode completion: instructs the model (via the system prompt) to
 * return only JSON, then parses it. Throws AiResponseParseError if the
 * model's output isn't valid JSON after fence-stripping -- callers should
 * catch this and fall back to a rule-based or "try again" response, the
 * same way askSupportAssistant() does.
 */
export async function completeJson<T>(input: {
  model?: string;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<{ data: T; raw: string; model: string }> {
  const { content, model } = await chatComplete({
    model: input.model,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    messages: [
      { role: 'system', content: input.system },
      { role: 'user', content: input.user }
    ]
  });

  const cleaned = stripCodeFence(content);
  try {
    return { data: JSON.parse(cleaned) as T, raw: content, model };
  } catch (err) {
    throw new AiResponseParseError(content, err);
  }
}

/**
 * Embeddings for the RAG index. Accepts one or many chunks; always returns
 * an array (one embedding per input) so callers don't need to branch.
 */
export async function embedText(input: string | string[], model: string = AI_MODELS.embedding): Promise<number[][]> {
  const response = await insforge.ai.embeddings.create({ model, input });
  const rows = (response as any)?.data ?? [];
  return rows.map((row: any) => row.embedding as number[]);
}
