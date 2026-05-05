import { insforge } from '../insforge/client';
import type {
  SupportTicket,
  SupportTicketCategory,
  SupportTicketPriority
} from './supportService';

export type SupportAssistantMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type SupportAssistantAiInput = {
  messages: SupportAssistantMessage[];
  selectedOption?: string | null;
  companyName?: string | null;
  role?: string | null;
  recentTickets?: SupportTicket[];
};

export type SupportAssistantAiResponse = {
  reply: string;
  suggestedCategory?: SupportTicketCategory;
  suggestedPriority?: SupportTicketPriority;
  shouldEscalate?: boolean;
  quickActions?: string[];
};

const DEFAULT_REPLY =
  "I'm not sure I fully understand. Would you like me to send this to the administrator?";

const SUPPORT_ASSISTANT_MODEL =
  String(((import.meta as any)?.env?.VITE_SUPPORT_ASSISTANT_MODEL as string | undefined) ?? '').trim()
  || 'openai/gpt-4o-mini';

const SUPPORT_SYSTEM_PROMPT = `You are Safe Cloud Africa's support assistant.
Help users with short, practical guidance for support, licensing, module access, document/compliance help, and login/account problems.
Do not claim to renew licenses, unlock modules, reset passwords, or fix admin-only issues yourself.
When admin action is needed, clearly offer to send a support ticket to the administrator.
Return only compact JSON with this exact shape:
{"reply":"string","suggestedCategory":"technical_issue|license_subscription|module_access|user_organisation_access|document_compliance_help|general_query","suggestedPriority":"low|medium|high|critical","shouldEscalate":boolean,"quickActions":["string"]}`;

const CATEGORY_BY_KEYWORD: Array<{
  match: RegExp;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  reply: string;
  quickActions?: string[];
}> = [
  {
    match: /\b(licen[cs]e|subscription|renew|expiry|expired|invoice|billing|payment)\b/i,
    category: 'license_subscription',
    priority: 'high',
    reply:
      'For license or subscription requests, an administrator needs to review the organisation, current plan, and renewal or billing notes. I can send this to the administrator for review.',
    quickActions: ['Send to administrator', 'Add more details']
  },
  {
    match: /\b(module|unlock|activate|activation|access package|feature)\b/i,
    category: 'module_access',
    priority: 'medium',
    reply:
      'Module access must be approved by an administrator. Please include the module name, why it is needed, and how many users or sites are affected.',
    quickActions: ['Send to administrator', 'Add more details']
  },
  {
    match: /\b(document upload|upload document|pdf|word|excel|file upload|document|compliance|iso|export|report)\b/i,
    category: 'document_compliance_help',
    priority: 'medium',
    reply:
      'For document help, check Document Management and confirm whether the issue is uploading, editing, finding, or exporting a document. Supported attachments here include screenshots, PDF, Word, and Excel files.',
    quickActions: ['Send to administrator', 'Add more details']
  },
  {
    match: /\b(login|log in|password|invalid token|token|sign in|session)\b/i,
    category: 'user_organisation_access',
    priority: 'high',
    reply:
      'For login or invalid token issues, try signing out, refreshing the browser, and signing in again. If it continues, I can send the details to the administrator.',
    quickActions: ['Send to administrator', 'Add more details']
  },
  {
    match: /\b(error|crash|broken|not loading|button|bug|issue|screenshot|page)\b/i,
    category: 'technical_issue',
    priority: 'high',
    reply:
      'Please share the page or module name, what you expected to happen, what actually happened, and attach a screenshot if you can. I can send this to the administrator as a technical issue.',
    quickActions: ['Send to administrator', 'Add screenshot/details']
  },
  {
    match: /\b(admin|administrator|super admin|support)\b/i,
    category: 'user_organisation_access',
    priority: 'medium',
    reply:
      'I can send this to the administrator for review. Add any user names, roles, organisation details, or deadline that would help them respond faster.',
    quickActions: ['Send to administrator', 'Add more details']
  }
];

const VALID_CATEGORIES: SupportTicketCategory[] = [
  'technical_issue',
  'license_subscription',
  'module_access',
  'user_organisation_access',
  'document_compliance_help',
  'general_query'
];

const VALID_PRIORITIES: SupportTicketPriority[] = ['low', 'medium', 'high', 'critical'];

function normalizeCategory(value: unknown): SupportTicketCategory | undefined {
  return VALID_CATEGORIES.includes(value as SupportTicketCategory) ? value as SupportTicketCategory : undefined;
}

function normalizePriority(value: unknown): SupportTicketPriority | undefined {
  return VALID_PRIORITIES.includes(value as SupportTicketPriority) ? value as SupportTicketPriority : undefined;
}

function sanitizeQuickActions(actions: unknown): string[] {
  if (!Array.isArray(actions)) return ['Send to administrator', 'Try again'];
  return actions
    .filter((action): action is string => typeof action === 'string' && action.trim().length > 0)
    .map((action) => action.trim())
    .slice(0, 3);
}

function parseAiResponse(raw: string): SupportAssistantAiResponse {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  const parsed = JSON.parse(cleaned) as SupportAssistantAiResponse;
  return {
    reply: typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply.trim() : DEFAULT_REPLY,
    suggestedCategory: normalizeCategory(parsed.suggestedCategory),
    suggestedPriority: normalizePriority(parsed.suggestedPriority),
    shouldEscalate: Boolean(parsed.shouldEscalate),
    quickActions: sanitizeQuickActions(parsed.quickActions)
  };
}

export function getRuleBasedSupportAssistantResponse(text: string): SupportAssistantAiResponse {
  const matched = CATEGORY_BY_KEYWORD.find((entry) => entry.match.test(text));
  if (matched) {
    return {
      reply: matched.reply,
      suggestedCategory: matched.category,
      suggestedPriority: matched.priority,
      shouldEscalate: true,
      quickActions: matched.quickActions ?? ['Send to administrator', 'Add more details']
    };
  }

  return {
    reply: DEFAULT_REPLY,
    suggestedCategory: 'general_query',
    suggestedPriority: 'medium',
    shouldEscalate: true,
    quickActions: ['Yes, contact admin', 'Try again']
  };
}

export async function askSupportAssistant(input: SupportAssistantAiInput): Promise<SupportAssistantAiResponse> {
  const lastUserMessage = [...input.messages].reverse().find((message) => message.role === 'user')?.content ?? '';
  const fallback = getRuleBasedSupportAssistantResponse(lastUserMessage);

  try {
    const recentTicketSummary = (input.recentTickets ?? [])
      .slice(0, 2)
      .map((ticket) => `${ticket.reference_number}: ${ticket.subject} (${ticket.status})`)
      .join('; ');

    const response = await insforge.ai.chat.completions.create({
      model: SUPPORT_ASSISTANT_MODEL,
      messages: [
        { role: 'system', content: SUPPORT_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            companyName: input.companyName ?? null,
            role: input.role ?? null,
            selectedOption: input.selectedOption ?? null,
            recentTickets: recentTicketSummary || null,
            conversation: input.messages.slice(-8)
          })
        }
      ],
      temperature: 0.2,
      max_tokens: 220
    });

    const content = String(response?.choices?.[0]?.message?.content ?? '').trim();
    if (!content) return fallback;
    return parseAiResponse(content);
  } catch (error) {
    console.warn('Support assistant AI fallback used', error);
    return fallback;
  }
}
