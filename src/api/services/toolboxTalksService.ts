import { insforge } from '../insforge/client';
import { withInsforgeSession } from '../insforge/ensureSession';
import { getErrorMessage } from '../insforge/errors';
import type { UUID } from '../models/entities';
import { createActivityLog } from './activityLogService';

export type ToolboxTalk = {
  id: UUID;
  company_id: UUID;
  title: string;
  topic: string | null;
  conducted_by_user_id: UUID | null;
  conducted_at: string;
  site_id: UUID | null;
  attendees: string[];
  notes: string | null;
  status: 'DRAFT' | 'COMPLETE';
  created_at: string;
  updated_at: string;
};

export async function listToolboxTalks(companyId: UUID): Promise<ToolboxTalk[]> {
  return withInsforgeSession('toolbox_talks:list', async () => {
    const { data, error } = await insforge.database
      .from('toolbox_talks')
      .select('*')
      .eq('company_id', companyId)
      .order('conducted_at', { ascending: false });
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? []) as ToolboxTalk[];
  });
}

export async function createToolboxTalk(input: {
  companyId: UUID;
  title: string;
  topic?: string | null;
  conductedByUserId?: UUID | null;
  conductedAt: string;
  siteId?: UUID | null;
  attendees?: string[];
  notes?: string | null;
  actorUserId: UUID;
}): Promise<ToolboxTalk> {
  return withInsforgeSession('toolbox_talks:create', async () => {
    // Default conductedByUserId to actorUserId when not explicitly provided
    const conductedByUserId = input.conductedByUserId ?? input.actorUserId;
    const { data, error } = await insforge.database
      .from('toolbox_talks')
      .insert({
        company_id: input.companyId,
        title: input.title,
        topic: input.topic ?? null,
        conducted_by_user_id: conductedByUserId,
        conducted_at: input.conductedAt,
        site_id: input.siteId ?? null,
        attendees: input.attendees ?? [],
        notes: input.notes ?? null,
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
      entityId: (data as any).id as UUID
    });

    return data as ToolboxTalk;
  });
}

export async function updateToolboxTalk(input: {
  companyId: UUID;
  talkId: UUID;
  patch: Partial<Pick<ToolboxTalk, 'title' | 'topic' | 'conducted_by_user_id' | 'conducted_at' | 'site_id' | 'attendees' | 'notes' | 'status'>>;
  actorUserId: UUID;
}): Promise<ToolboxTalk> {
  return withInsforgeSession('toolbox_talks:update', async () => {
    const { data, error } = await insforge.database
      .from('toolbox_talks')
      .update({ ...input.patch, updated_at: new Date().toISOString() })
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
      metadata: input.patch as any
    });

    return data as ToolboxTalk;
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
