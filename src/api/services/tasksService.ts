import { insforge } from '../insforge/client';
import type { Task, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';
import type { ModuleKey, Severity } from '../models/core';
import { getMyProfile } from './profilesService';

export type ListTasksInput = {
  companyId: UUID;
  assigneeUserId?: UUID;
  limit?: number;
};

export async function listTasks(input: ListTasksInput): Promise<Task[]> {
  const base = insforge.database.from('tasks').select('*').eq('company_id', input.companyId);
  const q = input.assigneeUserId ? base.eq('assignee_user_id', input.assigneeUserId) : base;

  const { data, error } = await q.order('due_at', { ascending: true }).limit(input.limit ?? 50);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as Task[];
}

export async function countMyPendingTasks(companyId: UUID, userId: UUID): Promise<number> {
  const { count, error } = await insforge.database
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('assignee_user_id', userId)
    .neq('status', 'completed');
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
}

export async function countCompanyPendingTasks(companyId: UUID): Promise<number> {
  const { count, error } = await insforge.database
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .neq('status', 'completed');
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
}

export async function countPendingTasksByModule(companyId: UUID, module: ModuleKey): Promise<number> {
  const { count, error } = await insforge.database
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('module', module)
    .neq('status', 'completed');
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
}

export async function countTasksByStatus(companyId: UUID, input: { module?: ModuleKey; status?: Task['status'] }): Promise<number> {
  const base = insforge.database.from('tasks').select('*', { count: 'exact', head: true }).eq('company_id', companyId);
  const q1 = input.module ? base.eq('module', input.module) : base;
  const q2 = input.status ? q1.eq('status', input.status) : q1;
  const { count, error } = await q2;
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
}

export type CreateTaskInput = {
  companyId: UUID;
  module: ModuleKey;
  title: string;
  description?: string;
  priority: Severity;
  dueAt?: string;
  assigneeUserId?: UUID;
  createdByUserId: UUID;
};

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const profile = await getMyProfile(input.companyId, input.createdByUserId);
  const { data, error } = await insforge.database
    .from('tasks')
    .insert({
      company_id: input.companyId,
      module: input.module,
      site_id: (profile as any)?.site_id ?? null,
      department_id: (profile as any)?.department_id ?? null,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority,
      status: 'pending',
      due_at: input.dueAt ?? null,
      assignee_user_id: input.assigneeUserId ?? null,
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create task.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'tasks.create',
    entityType: 'task',
    entityId: (data as any).id as UUID
  });

  const created = data as Task;

  if (created.assignee_user_id) {
    const { notifyTaskAssigned } = await import('./notificationsService');
    await notifyTaskAssigned(
      input.companyId,
      created.assignee_user_id as UUID,
      created.title,
      created.priority as Severity
    );
  }

  return created;
}

