import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import type { CompanyRole, ModuleKey } from '../models/core';
import type { UUID } from '../models/entities';
import { uploadInsforgeStorageFile } from './insforgeStorageUpload';
import { createLicense, type CreateLicenseInput } from './licensesService';
import { logPlatformAdminAction } from './platformAdminAuditService';

export type SupportTicketCategory =
  | 'technical_issue'
  | 'license_subscription'
  | 'module_access'
  | 'user_organisation_access'
  | 'document_compliance_help'
  | 'general_query';

export type SupportTicketStatus =
  | 'new'
  | 'open'
  | 'in_progress'
  | 'waiting_for_user'
  | 'escalated'
  | 'resolved'
  | 'closed';

export type SupportTicketPriority = 'low' | 'medium' | 'high' | 'critical';
export type SupportTicketSource = 'manual' | 'assistant' | 'admin';
export type SupportMessageRole = 'user' | 'org_admin' | 'super_admin' | 'support';

export const SUPPORT_TICKET_CATEGORIES: Array<{ value: SupportTicketCategory; label: string; description: string }> = [
  { value: 'technical_issue', label: 'Technical Issue', description: 'Errors, loading problems, login, upload, or broken buttons' },
  { value: 'license_subscription', label: 'License / Subscription', description: 'Renewals, plans, expired licenses, payment, invoices' },
  { value: 'module_access', label: 'Module Access', description: 'Unlock, activate, disable, or troubleshoot modules' },
  { value: 'user_organisation_access', label: 'User / Organisation Access', description: 'Users, passwords, roles, permissions, organisation access' },
  { value: 'document_compliance_help', label: 'Document / Compliance Help', description: 'Documents, ISO questions, reports, exports' },
  { value: 'general_query', label: 'General Query', description: 'Anything else' }
];

export const SUPPORT_TICKET_STATUSES: SupportTicketStatus[] = [
  'new',
  'open',
  'in_progress',
  'waiting_for_user',
  'escalated',
  'resolved',
  'closed'
];

export const SUPPORT_TICKET_PRIORITIES: SupportTicketPriority[] = ['low', 'medium', 'high', 'critical'];

export type SupportTicket = {
  id: UUID;
  company_id: UUID;
  user_id?: UUID | null;
  user_email?: string | null;
  reference_number: string;
  company_name_snapshot: string | null;
  created_by_user_id: UUID | null;
  created_by_name: string | null;
  created_by_email: string | null;
  category: SupportTicketCategory;
  subcategory: string | null;
  subject: string;
  description: string;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  assigned_to_user_id: UUID | null;
  source: SupportTicketSource;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  closed_at: string | null;
  closed_by_user_id: UUID | null;
};

export type SupportTicketMessage = {
  id: UUID;
  ticket_id: UUID;
  company_id: UUID;
  sender_user_id: UUID | null;
  sender_name: string | null;
  sender_email: string | null;
  sender_role: SupportMessageRole | string;
  body: string;
  is_internal_note: boolean;
  created_at: string;
};

export type SupportTicketAttachment = {
  id: UUID;
  ticket_id: UUID;
  message_id: UUID | null;
  company_id: UUID;
  storage_bucket: string;
  storage_key: string;
  original_filename: string | null;
  mime_type: string | null;
  file_size: number | null;
  uploaded_by_user_id: UUID | null;
  created_at: string;
};

export type SupportTicketEvent = {
  id: UUID;
  ticket_id: UUID;
  company_id: UUID;
  actor_user_id: UUID | null;
  actor_name: string | null;
  event_type: string;
  from_value: string | null;
  to_value: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type SupportTicketWithThread = {
  ticket: SupportTicket;
  messages: SupportTicketMessage[];
  attachments: SupportTicketAttachment[];
  events: SupportTicketEvent[];
};

export type SupportTicketFilters = {
  companyId?: UUID | null;
  category?: SupportTicketCategory | 'all';
  status?: SupportTicketStatus | 'all';
  priority?: SupportTicketPriority | 'all';
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  assignedToUserId?: UUID | 'all';
  limit?: number;
};

export type CreateSupportTicketInput = {
  companyId: UUID;
  companyName?: string | null;
  createdByUserId: UUID;
  createdByName?: string | null;
  createdByEmail?: string | null;
  category: SupportTicketCategory;
  subcategory?: string | null;
  subject: string;
  description: string;
  priority?: SupportTicketPriority;
  source?: SupportTicketSource;
};

export type ReplyToSupportTicketInput = {
  ticketId: UUID;
  companyId: UUID;
  actorUserId: UUID;
  actorName?: string | null;
  actorEmail?: string | null;
  actorRole: SupportMessageRole;
  body: string;
};

export type SupportDashboardStats = {
  total: number;
  newTickets: number;
  openTickets: number;
  escalatedTickets: number;
  resolvedThisMonth: number;
  licenseRequests: number;
  moduleRequests: number;
};

function normalizeTicket(row: unknown): SupportTicket {
  const r = row as Record<string, any>;
  return {
    ...(r as SupportTicket),
    created_by_user_id: r.created_by_user_id ?? r.user_id ?? null,
    created_by_email: r.created_by_email ?? r.user_email ?? null,
    reference_number: r.reference_number ?? String(r.id ?? ''),
    status: normalizeStatus(r.status),
    category: normalizeCategory(r.category),
    priority: normalizePriority(r.priority),
    source: (r.source ?? 'manual') as SupportTicketSource
  };
}

function normalizeCategory(value: unknown): SupportTicketCategory {
  switch (value) {
    case 'bug':
      return 'technical_issue';
    case 'access':
      return 'user_organisation_access';
    case 'billing':
      return 'license_subscription';
    case 'feature-request':
      return 'module_access';
    case 'technical_issue':
    case 'license_subscription':
    case 'module_access':
    case 'user_organisation_access':
    case 'document_compliance_help':
    case 'general_query':
      return value;
    default:
      return 'general_query';
  }
}

function normalizeStatus(value: unknown): SupportTicketStatus {
  switch (value) {
    case 'in-progress':
      return 'in_progress';
    case 'open':
    case 'closed':
    case 'new':
    case 'in_progress':
    case 'waiting_for_user':
    case 'escalated':
    case 'resolved':
      return value;
    default:
      return 'new';
  }
}

function normalizePriority(value: unknown): SupportTicketPriority {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'critical') return value;
  return 'medium';
}

function maybeThrow(error: unknown): void {
  if (error) throw new Error(getErrorMessage(error));
}

function applyTicketFilters(query: any, filters: SupportTicketFilters): any {
  let q = query;
  if (filters.companyId) q = q.eq('company_id', filters.companyId);
  if (filters.category && filters.category !== 'all') q = q.eq('category', filters.category);
  if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status);
  if (filters.priority && filters.priority !== 'all') q = q.eq('priority', filters.priority);
  if (filters.assignedToUserId && filters.assignedToUserId !== 'all') q = q.eq('assigned_to_user_id', filters.assignedToUserId);
  if (filters.dateFrom) q = q.gte('created_at', filters.dateFrom);
  if (filters.dateTo) q = q.lte('created_at', filters.dateTo);
  const search = filters.search?.trim();
  if (search) {
    const escaped = search.replace(/[%_]/g, '\\$&');
    q = q.or(`reference_number.ilike.%${escaped}%,subject.ilike.%${escaped}%,created_by_email.ilike.%${escaped}%,company_name_snapshot.ilike.%${escaped}%`);
  }
  return q;
}

async function createTicketEvent(input: {
  ticketId: UUID;
  companyId: UUID;
  actorUserId?: UUID | null;
  actorName?: string | null;
  eventType: string;
  fromValue?: string | null;
  toValue?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await insforge.database.from('support_ticket_events').insert([{
      ticket_id: input.ticketId,
      company_id: input.companyId,
      actor_user_id: input.actorUserId ?? null,
      actor_name: input.actorName ?? null,
      event_type: input.eventType,
      from_value: input.fromValue ?? null,
      to_value: input.toValue ?? null,
      metadata: input.metadata ?? {}
    }]);
  } catch {
    // Event logging should not block the support workflow.
  }
}

async function notifyTicketCreator(input: {
  ticket: SupportTicket;
  title: string;
  message: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const userId = input.ticket.created_by_user_id ?? input.ticket.user_id;
  if (!userId) return;
  try {
    await insforge.database.from('notifications').insert([{
      company_id: input.ticket.company_id,
      user_id: userId,
      title: input.title,
      message: input.message,
      severity: input.severity ?? 'medium',
      read_at: null,
      metadata: {
        ticket_id: input.ticket.id,
        reference_number: input.ticket.reference_number,
        action: 'support_ticket',
        ...(input.metadata ?? {})
      }
    }]);
  } catch {
    // Notification failures should not block ticket updates.
  }
}

async function notifyPlatformAdmins(ticket: SupportTicket): Promise<void> {
  try {
    await insforge.database.rpc('notify_platform_admins_support_ticket', {
      p_company_id: ticket.company_id,
      p_ticket_id: ticket.id,
      p_reference_number: ticket.reference_number,
      p_category: ticket.category,
      p_priority: ticket.priority,
      p_subject: ticket.subject,
      p_requested_by_user_id: ticket.created_by_user_id,
      p_requested_by_email: ticket.created_by_email
    });
  } catch {
    // Backwards compatible if the migration/RPC has not been applied yet.
  }
}

export async function createSupportTicket(input: CreateSupportTicketInput): Promise<SupportTicket> {
  const { data, error } = await insforge.database.rpc('create_support_ticket_with_message', {
    p_company_id: input.companyId,
    p_company_name_snapshot: input.companyName ?? '',
    p_created_by_user_id: input.createdByUserId,
    p_created_by_name: input.createdByName ?? '',
    p_created_by_email: input.createdByEmail ?? '',
    p_category: input.category,
    p_subcategory: input.subcategory ?? '',
    p_subject: input.subject.trim(),
    p_description: input.description.trim(),
    p_priority: input.priority ?? 'medium',
    p_source: input.source ?? 'manual'
  });
  maybeThrow(error);
  if (!data) throw new Error('Failed to create support ticket.');
  return normalizeTicket(data);
}

export async function createSupportTicketFromAssistant(input: Omit<CreateSupportTicketInput, 'source'>): Promise<SupportTicket> {
  return createSupportTicket({ ...input, source: 'assistant' });
}

export async function listMySupportTickets(companyId: UUID, userId: UUID, limit = 50): Promise<SupportTicket[]> {
  const { data, error } = await insforge.database
    .from('support_tickets')
    .select('*')
    .eq('company_id', companyId)
    .eq('created_by_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  maybeThrow(error);
  return (data ?? []).map(normalizeTicket);
}

export async function listOrganisationSupportTickets(companyId: UUID, filters: SupportTicketFilters = {}): Promise<SupportTicket[]> {
  const base = insforge.database
    .from('support_tickets')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 200);
  const { data, error } = await applyTicketFilters(base, { ...filters, companyId });
  maybeThrow(error);
  return (data ?? []).map(normalizeTicket);
}

export async function listAllSupportTicketsForSuperAdmin(filters: SupportTicketFilters = {}): Promise<SupportTicket[]> {
  const base = insforge.database
    .from('support_tickets')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 300);
  const { data, error } = await applyTicketFilters(base, filters);
  maybeThrow(error);
  return (data ?? []).map(normalizeTicket);
}

export async function getSupportTicketWithThread(ticketId: UUID): Promise<SupportTicketWithThread | null> {
  const { data: ticketRow, error: ticketError } = await insforge.database
    .from('support_tickets')
    .select('*')
    .eq('id', ticketId)
    .maybeSingle();
  if (ticketError) throw new Error(getErrorMessage(ticketError));
  if (!ticketRow) return null;

  const ticket = normalizeTicket(ticketRow);
  const [messagesResult, attachmentsResult, eventsResult] = await Promise.all([
    insforge.database.from('support_ticket_messages').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: true }),
    insforge.database.from('support_ticket_attachments').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: false }),
    insforge.database.from('support_ticket_events').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: false }).limit(100)
  ]);

  maybeThrow(messagesResult.error);
  maybeThrow(attachmentsResult.error);
  maybeThrow(eventsResult.error);

  return {
    ticket,
    messages: (messagesResult.data ?? []) as SupportTicketMessage[],
    attachments: (attachmentsResult.data ?? []) as SupportTicketAttachment[],
    events: (eventsResult.data ?? []) as SupportTicketEvent[]
  };
}

export async function replyToSupportTicket(input: ReplyToSupportTicketInput): Promise<SupportTicketMessage> {
  const { data, error } = await insforge.database
    .from('support_ticket_messages')
    .insert([{
      ticket_id: input.ticketId,
      company_id: input.companyId,
      sender_user_id: input.actorUserId,
      sender_name: input.actorName ?? null,
      sender_email: input.actorEmail ?? null,
      sender_role: input.actorRole,
      body: input.body.trim(),
      is_internal_note: false
    }])
    .select('*')
    .single();
  maybeThrow(error);
  if (!data) throw new Error('Failed to add support reply.');

  const thread = await getSupportTicketWithThread(input.ticketId);
  if (thread?.ticket) {
    await createTicketEvent({
      ticketId: input.ticketId,
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      eventType: 'message_added',
      metadata: { sender_role: input.actorRole }
    });

    const nextStatus: SupportTicketStatus = input.actorRole === 'super_admin' || input.actorRole === 'support'
      ? 'waiting_for_user'
      : 'open';
    if (thread.ticket.status !== 'closed' && thread.ticket.status !== 'resolved') {
      try {
        await updateSupportTicketStatus({
          ticketId: input.ticketId,
          status: nextStatus,
          actorUserId: input.actorUserId,
          actorName: input.actorName,
          notify: input.actorRole === 'super_admin' || input.actorRole === 'support'
        });
      } catch {
        // Employees can reply to their own ticket, but RLS intentionally prevents
        // them from changing ticket status. Keep the reply successful.
      }
    }

    if (input.actorRole === 'super_admin' || input.actorRole === 'support') {
      await notifyTicketCreator({
        ticket: thread.ticket,
        title: 'Support replied',
        message: `Support replied to ${thread.ticket.reference_number}.`,
        metadata: { action: 'support_ticket_reply' }
      });
    } else {
      await notifyPlatformAdmins(thread.ticket);
    }
  }

  return data as SupportTicketMessage;
}

export async function addInternalSupportNote(input: ReplyToSupportTicketInput): Promise<SupportTicketMessage> {
  const { data, error } = await insforge.database
    .from('support_ticket_messages')
    .insert([{
      ticket_id: input.ticketId,
      company_id: input.companyId,
      sender_user_id: input.actorUserId,
      sender_name: input.actorName ?? null,
      sender_email: input.actorEmail ?? null,
      sender_role: 'super_admin',
      body: input.body.trim(),
      is_internal_note: true
    }])
    .select('*')
    .single();
  maybeThrow(error);
  if (!data) throw new Error('Failed to add internal note.');
  await createTicketEvent({
    ticketId: input.ticketId,
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    eventType: 'internal_note_added'
  });
  return data as SupportTicketMessage;
}

export async function uploadSupportAttachment(input: {
  ticketId: UUID;
  companyId: UUID;
  messageId?: UUID | null;
  file: File;
  uploadedByUserId: UUID;
}): Promise<SupportTicketAttachment> {
  const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120);
  const key = `${input.companyId}/${input.ticketId}/${Date.now()}-${safeName}`;
  const upload = await uploadInsforgeStorageFile({
    bucket: 'support-attachments',
    key,
    file: input.file,
    filename: input.file.name,
    metadata: {
      companyId: input.companyId,
      ticketId: input.ticketId
    }
  });

  const { data, error } = await insforge.database
    .from('support_ticket_attachments')
    .insert([{
      ticket_id: input.ticketId,
      message_id: input.messageId ?? null,
      company_id: input.companyId,
      storage_bucket: upload.bucket,
      storage_key: upload.key,
      original_filename: input.file.name,
      mime_type: input.file.type || null,
      file_size: input.file.size,
      uploaded_by_user_id: input.uploadedByUserId
    }])
    .select('*')
    .single();
  maybeThrow(error);
  if (!data) throw new Error('Failed to save support attachment.');
  await createTicketEvent({
    ticketId: input.ticketId,
    companyId: input.companyId,
    actorUserId: input.uploadedByUserId,
    eventType: 'attachment_added',
    metadata: { filename: input.file.name }
  });
  return data as SupportTicketAttachment;
}

export async function updateSupportTicketStatus(input: {
  ticketId: UUID;
  status: SupportTicketStatus;
  actorUserId: UUID;
  actorName?: string | null;
  notify?: boolean;
}): Promise<SupportTicket> {
  const current = await getSupportTicketWithThread(input.ticketId);
  if (!current) throw new Error('Support ticket not found.');
  const patch: Record<string, unknown> = {
    status: input.status,
    updated_at: new Date().toISOString()
  };
  if (input.status === 'resolved') patch.resolved_at = new Date().toISOString();
  if (input.status === 'closed') {
    patch.closed_at = new Date().toISOString();
    patch.closed_by_user_id = input.actorUserId;
  }

  const { data, error } = await insforge.database
    .from('support_tickets')
    .update(patch)
    .eq('id', input.ticketId)
    .select('*')
    .single();
  maybeThrow(error);
  if (!data) throw new Error('Failed to update support ticket.');
  const ticket = normalizeTicket(data);
  await createTicketEvent({
    ticketId: ticket.id,
    companyId: ticket.company_id,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    eventType: 'status_changed',
    fromValue: current.ticket.status,
    toValue: ticket.status
  });
  if (input.notify) {
    await notifyTicketCreator({
      ticket,
      title: 'Support status updated',
      message: `${ticket.reference_number} is now ${formatSupportStatus(ticket.status)}.`,
      metadata: { action: 'support_ticket_status_changed', status: ticket.status }
    });
  }
  return ticket;
}

export async function assignSupportTicket(input: {
  ticketId: UUID;
  assignedToUserId: UUID | null;
  actorUserId: UUID;
  actorName?: string | null;
}): Promise<SupportTicket> {
  const current = await getSupportTicketWithThread(input.ticketId);
  if (!current) throw new Error('Support ticket not found.');
  const { data, error } = await insforge.database
    .from('support_tickets')
    .update({
      assigned_to_user_id: input.assignedToUserId,
      updated_at: new Date().toISOString()
    })
    .eq('id', input.ticketId)
    .select('*')
    .single();
  maybeThrow(error);
  if (!data) throw new Error('Failed to assign support ticket.');
  const ticket = normalizeTicket(data);
  await createTicketEvent({
    ticketId: ticket.id,
    companyId: ticket.company_id,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    eventType: 'assigned',
    fromValue: current.ticket.assigned_to_user_id,
    toValue: input.assignedToUserId
  });
  await logPlatformAdminAction(input.actorUserId, {
    action: 'support_ticket_assigned',
    target_company_id: ticket.company_id,
    details: { ticket_id: ticket.id, reference_number: ticket.reference_number, assigned_to_user_id: input.assignedToUserId }
  });
  return ticket;
}

export async function escalateSupportTicket(input: {
  ticketId: UUID;
  actorUserId: UUID;
  actorName?: string | null;
}): Promise<SupportTicket> {
  const ticket = await updateSupportTicketStatus({
    ticketId: input.ticketId,
    status: 'escalated',
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    notify: true
  });
  await logPlatformAdminAction(input.actorUserId, {
    action: 'support_ticket_escalated',
    target_company_id: ticket.company_id,
    details: { ticket_id: ticket.id, reference_number: ticket.reference_number }
  });
  return ticket;
}

export async function resolveSupportTicket(input: {
  ticketId: UUID;
  actorUserId: UUID;
  actorName?: string | null;
}): Promise<SupportTicket> {
  return updateSupportTicketStatus({
    ticketId: input.ticketId,
    status: 'resolved',
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    notify: true
  });
}

export async function processLicenseRenewalFromTicket(input: {
  ticketId: UUID;
  actorUserId: UUID;
  actorName?: string | null;
  license: CreateLicenseInput;
  note?: string;
}): Promise<SupportTicket> {
  const thread = await getSupportTicketWithThread(input.ticketId);
  if (!thread) throw new Error('Support ticket not found.');
  const license = await createLicense(input.license, input.actorUserId);
  await createTicketEvent({
    ticketId: thread.ticket.id,
    companyId: thread.ticket.company_id,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    eventType: 'license_processed',
    metadata: { license_id: license.id, note: input.note ?? null }
  });
  await logPlatformAdminAction(input.actorUserId, {
    action: 'support_license_processed',
    target_company_id: thread.ticket.company_id,
    details: { ticket_id: thread.ticket.id, reference_number: thread.ticket.reference_number, license_id: license.id }
  });
  return updateSupportTicketStatus({
    ticketId: input.ticketId,
    status: 'resolved',
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    notify: true
  });
}

export async function processModuleAccessFromTicket(input: {
  ticketId: UUID;
  companyId: UUID;
  actorUserId: UUID;
  actorName?: string | null;
  moduleKey?: ModuleKey | string | null;
  sellableFeatureKey?: string | null;
  enabled: boolean;
  approved: boolean;
  note?: string;
}): Promise<SupportTicket> {
  const { data: company, error: fetchError } = await insforge.database
    .from('companies')
    .select('id, metadata')
    .eq('id', input.companyId)
    .single();
  maybeThrow(fetchError);

  const currentMeta = ((company as any)?.metadata ?? {}) as Record<string, any>;
  const nextMeta = { ...currentMeta };
  if (input.moduleKey) {
    nextMeta.modules_enabled = {
      ...(currentMeta.modules_enabled ?? {}),
      [input.moduleKey]: input.enabled
    };
  }
  if (input.sellableFeatureKey) {
    const currentSellable = currentMeta.sellable_features ?? {};
    nextMeta.sellable_features = {
      ...currentSellable,
      [input.sellableFeatureKey]: {
        ...(currentSellable[input.sellableFeatureKey] ?? { enabled: true, locked: true }),
        enabled: input.enabled,
        locked: input.approved ? false : currentSellable[input.sellableFeatureKey]?.locked ?? true
      }
    };
  }

  const { error: updateError } = await insforge.database
    .from('companies')
    .update({ metadata: nextMeta })
    .eq('id', input.companyId);
  maybeThrow(updateError);

  const thread = await getSupportTicketWithThread(input.ticketId);
  if (!thread) throw new Error('Support ticket not found.');
  await createTicketEvent({
    ticketId: input.ticketId,
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    eventType: 'module_access_processed',
    metadata: {
      module_key: input.moduleKey ?? null,
      sellable_feature_key: input.sellableFeatureKey ?? null,
      enabled: input.enabled,
      approved: input.approved,
      note: input.note ?? null
    }
  });
  await logPlatformAdminAction(input.actorUserId, {
    action: 'support_module_processed',
    target_company_id: input.companyId,
    details: {
      ticket_id: input.ticketId,
      reference_number: thread.ticket.reference_number,
      module_key: input.moduleKey ?? null,
      sellable_feature_key: input.sellableFeatureKey ?? null,
      enabled: input.enabled,
      approved: input.approved
    }
  });
  return updateSupportTicketStatus({
    ticketId: input.ticketId,
    status: input.approved ? 'resolved' : 'closed',
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    notify: true
  });
}

export async function getSupportDashboardStats(filters: SupportTicketFilters = {}): Promise<SupportDashboardStats> {
  const tickets = filters.companyId
    ? await listOrganisationSupportTickets(filters.companyId, { ...filters, limit: filters.limit ?? 1000 })
    : await listAllSupportTicketsForSuperAdmin({ ...filters, limit: filters.limit ?? 1000 });

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  return {
    total: tickets.length,
    newTickets: tickets.filter((t) => t.status === 'new').length,
    openTickets: tickets.filter((t) => t.status === 'open' || t.status === 'in_progress' || t.status === 'waiting_for_user').length,
    escalatedTickets: tickets.filter((t) => t.status === 'escalated').length,
    resolvedThisMonth: tickets.filter((t) => t.resolved_at && new Date(t.resolved_at) >= monthStart).length,
    licenseRequests: tickets.filter((t) => t.category === 'license_subscription').length,
    moduleRequests: tickets.filter((t) => t.category === 'module_access').length
  };
}

export function canViewOrganisationSupportTickets(role: CompanyRole | null): boolean {
  return role === 'owner' || role === 'admin';
}

export function formatSupportCategory(category: SupportTicketCategory): string {
  return SUPPORT_TICKET_CATEGORIES.find((c) => c.value === category)?.label ?? 'General Query';
}

export function formatSupportStatus(status: SupportTicketStatus): string {
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatSupportPriority(priority: SupportTicketPriority): string {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}
