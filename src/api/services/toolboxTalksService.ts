import { insforge } from '../insforge/client';
import { withInsforgeSession } from '../insforge/ensureSession';
import { getErrorMessage } from '../insforge/errors';
import type { UUID } from '../models/entities';
import { createActivityLog } from './activityLogService';

export type ToolboxTalkAttendees = {
  employeeIds: UUID[];
  externalNames: string[];
};

export type ToolboxTalkAttachment = {
  fileUrl: string;
  fileKey: string;
  fileName: string;
  mimeType: string | null;
};

export type ToolboxTalk = {
  id: UUID;
  company_id: UUID;
  title: string;
  topic: string | null;
  conducted_by_user_id: UUID | null;
  conducted_at: string;
  site_id: UUID | null;
  /** @deprecated Legacy free-text attendee names — use attendee_employee_ids + external_attendee_names */
  attendees: string[];
  attendee_employee_ids: UUID[];
  external_attendee_names: string[];
  notes: string | null;
  status: 'DRAFT' | 'COMPLETE';
  attachment_file_url: string | null;
  attachment_file_key: string | null;
  attachment_file_name: string | null;
  attachment_mime_type: string | null;
  created_at: string;
  updated_at: string;
};

export type ToolboxTalkSignoff = {
  id: UUID;
  company_id: UUID;
  toolbox_talk_id: UUID;
  employee_id: UUID | null;
  employee_name: string;
  employee_user_id: UUID | null;
  signature: string | null;
  signed_at: string;
  created_at: string;
  updated_at: string;
};

function asUuidArray(value: unknown): UUID[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is UUID => typeof entry === 'string' && entry.length > 0);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

export function normalizeToolboxTalkAttendees(talk: Pick<ToolboxTalk, 'attendees' | 'attendee_employee_ids' | 'external_attendee_names'>): ToolboxTalkAttendees {
  const employeeIds = asUuidArray(talk.attendee_employee_ids);
  const externalNames = asStringArray(talk.external_attendee_names);
  const legacyNames = asStringArray(talk.attendees);
  return {
    employeeIds,
    externalNames: externalNames.length > 0 ? externalNames : legacyNames
  };
}

export function countToolboxTalkAttendees(talk: Pick<ToolboxTalk, 'attendees' | 'attendee_employee_ids' | 'external_attendee_names'>): number {
  const normalized = normalizeToolboxTalkAttendees(talk);
  return normalized.employeeIds.length + normalized.externalNames.length;
}

function normalizeTalkRow(row: ToolboxTalk): ToolboxTalk {
  return {
    ...row,
    attendees: asStringArray(row.attendees),
    attendee_employee_ids: asUuidArray(row.attendee_employee_ids),
    external_attendee_names: asStringArray(row.external_attendee_names)
  };
}

function attendeesPayload(attendees: ToolboxTalkAttendees) {
  const legacyNames = attendees.externalNames;
  return {
    attendee_employee_ids: attendees.employeeIds,
    external_attendee_names: attendees.externalNames,
    attendees: legacyNames
  };
}

export async function listToolboxTalks(companyId: UUID): Promise<ToolboxTalk[]> {
  return withInsforgeSession('toolbox_talks:list', async () => {
    const { data, error } = await insforge.database
      .from('toolbox_talks')
      .select('*')
      .eq('company_id', companyId)
      .order('conducted_at', { ascending: false });
    if (error) throw new Error(getErrorMessage(error));
    return ((data ?? []) as ToolboxTalk[]).map(normalizeTalkRow);
  });
}

export async function getToolboxTalk(companyId: UUID, talkId: UUID): Promise<ToolboxTalk | null> {
  return withInsforgeSession('toolbox_talks:get', async () => {
    const { data, error } = await insforge.database
      .from('toolbox_talks')
      .select('*')
      .eq('company_id', companyId)
      .eq('id', talkId)
      .maybeSingle();
    if (error) throw new Error(getErrorMessage(error));
    return data ? normalizeTalkRow(data as ToolboxTalk) : null;
  });
}

export async function createToolboxTalk(input: {
  companyId: UUID;
  title: string;
  topic?: string | null;
  conductedByUserId?: UUID | null;
  conductedAt: string;
  siteId?: UUID | null;
  attendees?: ToolboxTalkAttendees;
  notes?: string | null;
  attachment?: ToolboxTalkAttachment | null;
  actorUserId: UUID;
}): Promise<ToolboxTalk> {
  return withInsforgeSession('toolbox_talks:create', async () => {
    const conductedByUserId = input.conductedByUserId ?? input.actorUserId;
    const attendees = input.attendees ?? { employeeIds: [], externalNames: [] };
    const { data, error } = await insforge.database
      .from('toolbox_talks')
      .insert({
        company_id: input.companyId,
        title: input.title,
        topic: input.topic ?? null,
        conducted_by_user_id: conductedByUserId,
        conducted_at: input.conductedAt,
        site_id: input.siteId ?? null,
        ...attendeesPayload(attendees),
        notes: input.notes ?? null,
        attachment_file_url: input.attachment?.fileUrl ?? null,
        attachment_file_key: input.attachment?.fileKey ?? null,
        attachment_file_name: input.attachment?.fileName ?? null,
        attachment_mime_type: input.attachment?.mimeType ?? null,
        status: 'DRAFT'
      })
      .select('*')
      .single();
    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to create toolbox talk.');

    await createActivityLog({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'toolbox_talks.create',
      entityType: 'toolbox_talk',
      entityId: (data as ToolboxTalk).id
    });

    return normalizeTalkRow(data as ToolboxTalk);
  });
}

export async function updateToolboxTalk(input: {
  companyId: UUID;
  talkId: UUID;
  patch: Partial<
    Pick<
      ToolboxTalk,
      | 'title'
      | 'topic'
      | 'conducted_by_user_id'
      | 'conducted_at'
      | 'site_id'
      | 'notes'
      | 'status'
      | 'attachment_file_url'
      | 'attachment_file_key'
      | 'attachment_file_name'
      | 'attachment_mime_type'
    >
  > & {
    attendees?: ToolboxTalkAttendees;
  };
  actorUserId: UUID;
}): Promise<ToolboxTalk> {
  return withInsforgeSession('toolbox_talks:update', async () => {
    const dbPatch: Record<string, unknown> = {
      ...input.patch,
      updated_at: new Date().toISOString()
    };
    if (input.patch.attendees) {
      Object.assign(dbPatch, attendeesPayload(input.patch.attendees));
      delete dbPatch.attendees;
    }

    const { data, error } = await insforge.database
      .from('toolbox_talks')
      .update(dbPatch)
      .eq('company_id', input.companyId)
      .eq('id', input.talkId)
      .select('*')
      .single();
    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to update toolbox talk.');

    await createActivityLog({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'toolbox_talks.update',
      entityType: 'toolbox_talk',
      entityId: input.talkId,
      metadata: input.patch as Record<string, unknown>
    });

    return normalizeTalkRow(data as ToolboxTalk);
  });
}

export async function deleteToolboxTalk(input: { companyId: UUID; talkId: UUID; actorUserId: UUID }): Promise<void> {
  return withInsforgeSession('toolbox_talks:delete', async () => {
    const { error } = await insforge.database
      .from('toolbox_talks')
      .delete()
      .eq('company_id', input.companyId)
      .eq('id', input.talkId);
    if (error) throw new Error(getErrorMessage(error));

    await createActivityLog({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'toolbox_talks.delete',
      entityType: 'toolbox_talk',
      entityId: input.talkId
    });
  });
}

export async function listToolboxTalkSignoffs(input: {
  companyId: UUID;
  talkId: UUID;
}): Promise<ToolboxTalkSignoff[]> {
  return withInsforgeSession('toolbox_talk_signoffs:list', async () => {
    const { data, error } = await insforge.database
      .from('toolbox_talk_signoffs')
      .select('*')
      .eq('company_id', input.companyId)
      .eq('toolbox_talk_id', input.talkId)
      .order('signed_at', { ascending: true });
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? []) as ToolboxTalkSignoff[];
  });
}

export async function addToolboxTalkSignoff(input: {
  companyId: UUID;
  talkId: UUID;
  actorUserId: UUID;
  employeeId?: UUID | null;
  employeeName: string;
  signature?: string | null;
}): Promise<ToolboxTalkSignoff> {
  return withInsforgeSession('toolbox_talk_signoffs:create', async () => {
    const { data, error } = await insforge.database
      .from('toolbox_talk_signoffs')
      .insert({
        company_id: input.companyId,
        toolbox_talk_id: input.talkId,
        employee_id: input.employeeId ?? null,
        employee_name: input.employeeName.trim(),
        employee_user_id: input.actorUserId,
        signature: input.signature?.trim() || null,
        signed_at: new Date().toISOString()
      })
      .select('*')
      .single();
    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to record signature.');

    await createActivityLog({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'toolbox_talk_signoffs.create',
      entityType: 'toolbox_talk',
      entityId: input.talkId,
      metadata: { employee_name: input.employeeName }
    });

    return data as ToolboxTalkSignoff;
  });
}
