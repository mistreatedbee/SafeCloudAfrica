import { insforge } from '../insforge/client';
import { withInsforgeSession } from '../insforge/ensureSession';
import { getErrorMessage } from '../insforge/errors';
import type {
  OperationalArea,
  OperationalPriority,
  OperationalRecordStatus
} from '../constants/operationalInputs';
import type { UUID } from '../models/core';
import { createActivityLog } from './activityLogService';

export type OperationalInputRecord = {
  id: UUID;
  company_id: UUID;
  site_id: UUID | null;
  record_date: string;
  area: OperationalArea;
  operational_output: string;
  planned: string | null;
  done: string | null;
  findings_challenges: string | null;
  action_required: string | null;
  resources_needed: string | null;
  priority: OperationalPriority;
  start_date: string | null;
  end_date: string | null;
  status: OperationalRecordStatus;
  responsible_person_user_id: UUID | null;
  responsible_person_name: string | null;
  completion_date: string | null;
  objective_achieved: boolean | null;
  objective_achieved_comments: string | null;
  created_by_user_id: UUID | null;
  created_at: string;
  updated_at: string;
};

export type UpsertOperationalInputRecordInput = {
  companyId: UUID;
  siteId?: UUID | null;
  recordDate: string;
  area: OperationalArea;
  operationalOutput: string;
  planned?: string | null;
  done?: string | null;
  findingsChallenges?: string | null;
  actionRequired?: string | null;
  resourcesNeeded?: string | null;
  priority: OperationalPriority;
  startDate?: string | null;
  endDate?: string | null;
  status: OperationalRecordStatus;
  responsiblePersonUserId?: UUID | null;
  responsiblePersonName?: string | null;
  completionDate?: string | null;
  objectiveAchieved?: boolean | null;
  objectiveAchievedComments?: string | null;
  actorUserId: UUID;
  recordId?: UUID | null;
};

function validateRecordInput(input: UpsertOperationalInputRecordInput): void {
  if (!input.recordDate?.trim()) throw new Error('Date is required.');
  if (!input.area) throw new Error('Area is required.');
  if (!input.operationalOutput?.trim()) throw new Error('Operational output / task is required.');
  if (!input.priority) throw new Error('Priority is required.');
  if (!input.status) throw new Error('Status is required.');
  if (input.startDate && input.endDate && input.startDate > input.endDate) {
    throw new Error('End date must be on or after start date.');
  }
  if (input.status === 'completed' && !input.completionDate) {
    throw new Error('Completion date is required when status is Completed.');
  }
  if (input.objectiveAchieved != null && input.objectiveAchievedComments == null) {
    // comments optional even when yes/no selected
  }
}

function toPayload(input: UpsertOperationalInputRecordInput, now: string) {
  return {
    company_id: input.companyId,
    site_id: input.siteId ?? null,
    record_date: input.recordDate,
    area: input.area,
    operational_output: input.operationalOutput.trim(),
    planned: input.planned?.trim() || null,
    done: input.done?.trim() || null,
    findings_challenges: input.findingsChallenges?.trim() || null,
    action_required: input.actionRequired?.trim() || null,
    resources_needed: input.resourcesNeeded?.trim() || null,
    priority: input.priority,
    start_date: input.startDate || null,
    end_date: input.endDate || null,
    status: input.status,
    responsible_person_user_id: input.responsiblePersonUserId ?? null,
    responsible_person_name: input.responsiblePersonName?.trim() || null,
    completion_date: input.completionDate || null,
    objective_achieved: input.objectiveAchieved ?? null,
    objective_achieved_comments: input.objectiveAchievedComments?.trim() || null,
    updated_at: now
  };
}

export async function listOperationalInputRecords(input: {
  companyId: UUID;
  area?: OperationalArea;
  limit?: number;
}): Promise<OperationalInputRecord[]> {
  return withInsforgeSession('operational_input_records:list', async () => {
    let q = insforge.database
      .from('operational_input_records')
      .select('*')
      .eq('company_id', input.companyId);
    if (input.area) q = q.eq('area', input.area);
    const { data, error } = await q
      .order('record_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(input.limit ?? 500);
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? []) as OperationalInputRecord[];
  });
}

export async function createOperationalInputRecord(
  input: UpsertOperationalInputRecordInput
): Promise<OperationalInputRecord> {
  validateRecordInput(input);
  const now = new Date().toISOString();
  const payload = toPayload(input, now);

  return withInsforgeSession('operational_input_records:create', async () => {
    const { data, error } = await insforge.database
      .from('operational_input_records')
      .insert({ ...payload, created_by_user_id: input.actorUserId, created_at: now })
      .select('*')
      .single();
    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to create operational input record.');

    await createActivityLog({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'operational_input_records.create',
      entityType: 'operational_input_record',
      entityId: (data as OperationalInputRecord).id
    });

    return data as OperationalInputRecord;
  });
}

export async function updateOperationalInputRecord(
  input: UpsertOperationalInputRecordInput & { recordId: UUID }
): Promise<OperationalInputRecord> {
  validateRecordInput(input);
  const now = new Date().toISOString();
  const payload = toPayload(input, now);

  return withInsforgeSession('operational_input_records:update', async () => {
    const { data, error } = await insforge.database
      .from('operational_input_records')
      .update(payload)
      .eq('company_id', input.companyId)
      .eq('id', input.recordId)
      .select('*')
      .single();
    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to update operational input record.');

    await createActivityLog({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'operational_input_records.update',
      entityType: 'operational_input_record',
      entityId: input.recordId
    });

    return data as OperationalInputRecord;
  });
}

export async function deleteOperationalInputRecord(input: {
  companyId: UUID;
  recordId: UUID;
  actorUserId: UUID;
}): Promise<void> {
  return withInsforgeSession('operational_input_records:delete', async () => {
    const { error } = await insforge.database
      .from('operational_input_records')
      .delete()
      .eq('company_id', input.companyId)
      .eq('id', input.recordId);
    if (error) throw new Error(getErrorMessage(error));

    await createActivityLog({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'operational_input_records.delete',
      entityType: 'operational_input_record',
      entityId: input.recordId
    });
  });
}
