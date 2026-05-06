import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import type { UUID } from '../models/entities';
import {
  getSupportTicketWithThread,
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
  type SupportTicket,
  type SupportTicketCategory,
  type SupportTicketPriority,
  type SupportTicketStatus,
  type SupportTicketWithThread
} from './supportService';

export type ChatbotMessageRole = 'user' | 'bot' | 'assistant' | 'system';
export type ChatbotResponseSource = 'user' | 'ai' | 'fallback' | 'guided' | 'system';

export type ChatbotConversation = {
  id: UUID;
  company_id: UUID;
  company_name_snapshot: string | null;
  user_id: UUID | null;
  user_name: string | null;
  user_email: string | null;
  selected_option: string | null;
  category: SupportTicketCategory;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  support_ticket_id: UUID | null;
  escalated: boolean;
  message_preview: string | null;
  ai_model: string | null;
  ai_enabled: boolean;
  created_at: string;
  updated_at: string;
  linked_ticket?: SupportTicket | null;
};

export type ChatbotMessage = {
  id: UUID;
  conversation_id: UUID;
  company_id: UUID;
  user_id: UUID | null;
  role: ChatbotMessageRole;
  body: string;
  response_source: ChatbotResponseSource;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type ChatbotConversationWithMessages = {
  conversation: ChatbotConversation;
  messages: ChatbotMessage[];
  ticketThread: SupportTicketWithThread | null;
};

export type ChatbotConversationFilters = {
  companyId?: UUID | null;
  category?: SupportTicketCategory | 'all';
  status?: SupportTicketStatus | 'all';
  priority?: SupportTicketPriority | 'all';
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
};

export type ChatbotDashboardStats = {
  totalConversations: number;
  ticketsCreated: number;
  newRequests: number;
  inProgress: number;
  escalated: number;
  resolved: number;
};

export type ChatbotActivityStats = {
  topUsers: Array<{ label: string; count: number }>;
  topOrganisations: Array<{ label: string; count: number }>;
  commonCategories: Array<{ category: SupportTicketCategory; count: number }>;
  commonOptions: Array<{ label: string; count: number }>;
};

type CreateChatbotConversationInput = {
  companyId: UUID;
  companyName?: string | null;
  userId: UUID;
  userName?: string | null;
  userEmail?: string | null;
  selectedOption?: string | null;
  category?: SupportTicketCategory;
  status?: SupportTicketStatus;
  priority?: SupportTicketPriority;
  aiModel?: string | null;
  aiEnabled?: boolean;
};

type LogChatbotMessageInput = {
  conversationId: UUID;
  companyId: UUID;
  userId?: UUID | null;
  role: ChatbotMessageRole;
  body: string;
  responseSource?: ChatbotResponseSource;
  metadata?: Record<string, unknown>;
};

type UpdateChatbotConversationInput = {
  conversationId: UUID;
  selectedOption?: string | null;
  category?: SupportTicketCategory;
  status?: SupportTicketStatus;
  priority?: SupportTicketPriority;
  supportTicketId?: UUID | null;
  escalated?: boolean;
  messagePreview?: string | null;
  aiModel?: string | null;
  aiEnabled?: boolean;
};

function maybeThrow(error: unknown): void {
  if (error) throw new Error(getErrorMessage(error));
}

export function isChatbotLogsSchemaMissingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : getErrorMessage(error);
  return /404|not found|chatbot_conversations|chatbot_messages/i.test(message);
}

function normalizeConversation(row: unknown, linkedTicket?: SupportTicket | null): ChatbotConversation {
  const r = row as Record<string, any>;
  return {
    ...(r as ChatbotConversation),
    category: SUPPORT_TICKET_CATEGORIES.some((item) => item.value === r.category) ? r.category : 'general_query',
    status: SUPPORT_TICKET_STATUSES.includes(r.status) ? r.status : 'new',
    priority: SUPPORT_TICKET_PRIORITIES.includes(r.priority) ? r.priority : 'medium',
    escalated: Boolean(r.escalated),
    ai_enabled: Boolean(r.ai_enabled),
    linked_ticket: linkedTicket ?? null
  };
}

function normalizeMessage(row: unknown): ChatbotMessage {
  const r = row as Record<string, any>;
  return {
    ...(r as ChatbotMessage),
    role: ['user', 'bot', 'assistant', 'system'].includes(r.role) ? r.role : 'bot',
    response_source: ['user', 'ai', 'fallback', 'guided', 'system'].includes(r.response_source) ? r.response_source : 'fallback',
    metadata: r.metadata ?? {}
  };
}

function compactPreview(body: string): string {
  return body.replace(/\s+/g, ' ').trim().slice(0, 240);
}

function sanitizeSearchTerm(term: string): string {
  return term.trim().replace(/[,%()]/g, ' ').replace(/\s+/g, ' ');
}

async function attachLinkedTickets(conversations: ChatbotConversation[]): Promise<ChatbotConversation[]> {
  const ticketIds = Array.from(new Set(conversations.map((item) => item.support_ticket_id).filter(Boolean))) as UUID[];
  if (ticketIds.length === 0) return conversations;

  const { data, error } = await insforge.database
    .from('support_tickets')
    .select('*')
    .in('id', ticketIds);
  maybeThrow(error);

  const ticketsById = new Map((data ?? []).map((ticket) => [String((ticket as any).id), ticket as SupportTicket]));
  return conversations.map((conversation) => ({
    ...conversation,
    linked_ticket: conversation.support_ticket_id ? ticketsById.get(conversation.support_ticket_id) ?? null : null
  }));
}

function buildConversationQuery(filters: ChatbotConversationFilters = {}) {
  let query = insforge.database
    .from('chatbot_conversations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 500);

  if (filters.companyId) query = query.eq('company_id', filters.companyId);
  if (filters.category && filters.category !== 'all') query = query.eq('category', filters.category);
  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
  if (filters.priority && filters.priority !== 'all') query = query.eq('priority', filters.priority);
  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom);
  if (filters.dateTo) query = query.lte('created_at', filters.dateTo);
  return query;
}

export async function createChatbotConversation(input: CreateChatbotConversationInput): Promise<ChatbotConversation> {
  const { data, error } = await insforge.database
    .from('chatbot_conversations')
    .insert([{
      company_id: input.companyId,
      company_name_snapshot: input.companyName ?? null,
      user_id: input.userId,
      user_name: input.userName ?? null,
      user_email: input.userEmail ?? null,
      selected_option: input.selectedOption ?? null,
      category: input.category ?? 'general_query',
      status: input.status ?? 'open',
      priority: input.priority ?? 'medium',
      ai_model: input.aiModel ?? null,
      ai_enabled: input.aiEnabled ?? false
    }])
    .select('*')
    .single();
  maybeThrow(error);
  if (!data) throw new Error('Failed to create chatbot conversation.');
  return normalizeConversation(data);
}

export async function updateChatbotConversation(input: UpdateChatbotConversationInput): Promise<ChatbotConversation> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('selectedOption' in input) patch.selected_option = input.selectedOption ?? null;
  if (input.category) patch.category = input.category;
  if (input.status) patch.status = input.status;
  if (input.priority) patch.priority = input.priority;
  if ('supportTicketId' in input) patch.support_ticket_id = input.supportTicketId ?? null;
  if (typeof input.escalated === 'boolean') patch.escalated = input.escalated;
  if ('messagePreview' in input) patch.message_preview = input.messagePreview ?? null;
  if ('aiModel' in input) patch.ai_model = input.aiModel ?? null;
  if (typeof input.aiEnabled === 'boolean') patch.ai_enabled = input.aiEnabled;

  const { data, error } = await insforge.database
    .from('chatbot_conversations')
    .update(patch)
    .eq('id', input.conversationId)
    .select('*')
    .single();
  maybeThrow(error);
  if (!data) throw new Error('Failed to update chatbot conversation.');
  return normalizeConversation(data);
}

export async function logChatbotMessage(input: LogChatbotMessageInput): Promise<ChatbotMessage> {
  const trimmed = input.body.trim();
  if (!trimmed) throw new Error('Cannot log an empty chatbot message.');

  const { data, error } = await insforge.database
    .from('chatbot_messages')
    .insert([{
      conversation_id: input.conversationId,
      company_id: input.companyId,
      user_id: input.userId ?? null,
      role: input.role,
      body: trimmed,
      response_source: input.responseSource ?? (input.role === 'user' ? 'user' : 'fallback'),
      metadata: input.metadata ?? {}
    }])
    .select('*')
    .single();
  maybeThrow(error);
  if (!data) throw new Error('Failed to log chatbot message.');

  await updateChatbotConversation({
    conversationId: input.conversationId,
    messagePreview: compactPreview(trimmed)
  });

  return normalizeMessage(data);
}

export async function listChatbotConversationsForSuperAdmin(
  filters: ChatbotConversationFilters = {}
): Promise<ChatbotConversation[]> {
  const { data, error } = await buildConversationQuery(filters);
  maybeThrow(error);
  const conversations = (data ?? []).map((row) => normalizeConversation(row));
  const withTickets = await attachLinkedTickets(conversations);
  if (!filters.search?.trim()) return withTickets;

  const term = sanitizeSearchTerm(filters.search).toLowerCase();
  return withTickets.filter((conversation) => [
    conversation.user_name,
    conversation.user_email,
    conversation.company_name_snapshot,
    conversation.selected_option,
    conversation.message_preview,
    conversation.linked_ticket?.reference_number,
    conversation.linked_ticket?.subject
  ].some((value) => String(value ?? '').toLowerCase().includes(term)));
}

export async function getChatbotConversationWithMessages(conversationId: UUID): Promise<ChatbotConversationWithMessages> {
  const { data: conversationRow, error: conversationError } = await insforge.database
    .from('chatbot_conversations')
    .select('*')
    .eq('id', conversationId)
    .single();
  maybeThrow(conversationError);
  if (!conversationRow) throw new Error('Chatbot conversation not found.');

  const conversation = normalizeConversation(conversationRow);
  const { data: messageRows, error: messageError } = await insforge.database
    .from('chatbot_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  maybeThrow(messageError);

  const ticketThread = conversation.support_ticket_id
    ? await getSupportTicketWithThread(conversation.support_ticket_id)
    : null;

  return {
    conversation: {
      ...conversation,
      linked_ticket: ticketThread?.ticket ?? null
    },
    messages: (messageRows ?? []).map((row) => normalizeMessage(row)),
    ticketThread
  };
}

export async function getChatbotDashboardStats(filters: ChatbotConversationFilters = {}): Promise<ChatbotDashboardStats> {
  const conversations = await listChatbotConversationsForSuperAdmin({ ...filters, limit: filters.limit ?? 1000 });
  return {
    totalConversations: conversations.length,
    ticketsCreated: conversations.filter((item) => Boolean(item.support_ticket_id)).length,
    newRequests: conversations.filter((item) => item.status === 'new').length,
    inProgress: conversations.filter((item) => item.status === 'open' || item.status === 'in_progress' || item.status === 'waiting_for_user').length,
    escalated: conversations.filter((item) => item.status === 'escalated' || item.escalated).length,
    resolved: conversations.filter((item) => item.status === 'resolved' || item.linked_ticket?.status === 'resolved').length
  };
}

export async function getChatbotActivityStats(filters: ChatbotConversationFilters = {}): Promise<ChatbotActivityStats> {
  const conversations = await listChatbotConversationsForSuperAdmin({ ...filters, limit: filters.limit ?? 1000 });
  const countBy = (items: Array<string | null | undefined>) => {
    const counts = new Map<string, number>();
    items.filter(Boolean).forEach((item) => counts.set(String(item), (counts.get(String(item)) ?? 0) + 1));
    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  };

  const categoryCounts = new Map<SupportTicketCategory, number>();
  conversations.forEach((conversation) => {
    categoryCounts.set(conversation.category, (categoryCounts.get(conversation.category) ?? 0) + 1);
  });

  return {
    topUsers: countBy(conversations.map((item) => item.user_name || item.user_email || item.user_id)),
    topOrganisations: countBy(conversations.map((item) => item.company_name_snapshot || item.company_id)),
    commonCategories: Array.from(categoryCounts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    commonOptions: countBy(conversations.map((item) => item.selected_option))
  };
}
