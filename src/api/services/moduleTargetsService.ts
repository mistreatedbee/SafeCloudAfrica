import { insforge } from '../insforge/client';
import { withInsforgeSession } from '../insforge/ensureSession';
import type {
  ModuleTarget,
  ModuleTargetCategory,
  ModuleTargetNote,
  ModuleTargetReviewActionStatus,
  ModuleTargetStatus,
  UUID
} from '../models/entities';
import type { ModuleKey } from '../models/core';
import { getErrorMessage } from '../insforge/errors';
import { requireModuleEnabled } from './orgModulesService';
import { createActivityLog } from './activityLogService';

function statusPatch(status: ModuleTargetStatus | undefined) {
  if (!status) return {};
  const now = new Date().toISOString();
  if (status === 'completed') {
    return { status, achieved: true, completed_at: now, closed_at: now };
  }
  if (status === 'achieved') {
    return { status, achieved: true, completed_at: now, closed_at: null };
  }
  if (status === 'closed') {
    return { status, achieved: true, completed_at: now, closed_at: now };
  }
  if (status === 'not_achieved') {
    return { status, achieved: false, completed_at: null, closed_at: null };
  }
  if (status === 'on_hold') {
    return { status, achieved: false, completed_at: null, closed_at: null };
  }
  return { status, achieved: false, completed_at: null, closed_at: null };
}

export async function listModuleTargets(input: { companyId: UUID; module?: ModuleKey; limit?: number }): Promise<ModuleTarget[]> {
  return withInsforgeSession('module-targets:list', async () => {
  if (input.module) await requireModuleEnabled(input.companyId, input.module);
  const base = insforge.database.from('module_targets').select('*').eq('company_id', input.companyId);
  const q = input.module ? base.eq('module', input.module) : base;
  const { data, error } = await q.order('updated_at', { ascending: false }).limit(input.limit ?? 50);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as ModuleTarget[];
  });
}

export async function createModuleTarget(input: {
  companyId: UUID;
  module: ModuleKey;
  name: string;
  description?: string | null;
  targetText?: string | null;
  category?: ModuleTargetCategory | null;
  startDate?: string | null;
  targetDate?: string | null;
  status?: ModuleTargetStatus;
  responsibleEmployeeId?: UUID | null;
  responsibleUserId?: UUID | null;
  responsibleName?: string | null;
  currentValue?: number;
  targetValue?: number;
  unit?: string | null;
  achieved?: boolean;
  reviewReason?: string | null;
  reviewCorrectiveAction?: string | null;
  reviewResponsibleEmployeeId?: UUID | null;
  reviewResponsibleUserId?: UUID | null;
  reviewResponsibleName?: string | null;
  reviewResourcesRequired?: string | null;
  reviewStartDate?: string | null;
  reviewActionStatus?: ModuleTargetReviewActionStatus | null;
  reviewCloseDate?: string | null;
  createdByUserId: UUID;
}): Promise<ModuleTarget> {
  return withInsforgeSession('module-targets:create', async () => {
    await requireModuleEnabled(input.companyId, input.module);
    const status = input.status ?? (input.achieved ? 'completed' : 'not_started');
    const { data, error } = await insforge.database
      .from('module_targets')
      .insert({
        company_id: input.companyId,
        module: input.module,
        name: input.name,
        description: input.description ?? null,
        target_text: input.targetText ?? null,
        category: input.category ?? null,
        start_date: input.startDate ?? null,
        target_date: input.targetDate ?? null,
        responsible_employee_id: input.responsibleEmployeeId ?? null,
        responsible_user_id: input.responsibleUserId ?? null,
        responsible_name: input.responsibleName ?? null,
        current_value: input.currentValue ?? 0,
        target_value: input.targetValue ?? 0,
        unit: input.unit ?? null,
        review_reason: input.reviewReason ?? null,
        review_corrective_action: input.reviewCorrectiveAction ?? null,
        review_responsible_employee_id: input.reviewResponsibleEmployeeId ?? null,
        review_responsible_user_id: input.reviewResponsibleUserId ?? null,
        review_responsible_name: input.reviewResponsibleName ?? null,
        review_resources_required: input.reviewResourcesRequired ?? null,
        review_start_date: input.reviewStartDate ?? null,
        review_action_status: input.reviewActionStatus ?? null,
        review_close_date: input.reviewCloseDate ?? null,
        achieved: status === 'completed',
        ...statusPatch(status),
        created_by_user_id: input.createdByUserId
      })
      .select('*')
      .single();
    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to create module target.');

    await createActivityLog({
      companyId: input.companyId,
      actorUserId: input.createdByUserId,
      action: 'module_targets.create',
      entityType: 'module_target',
      entityId: (data as any).id as UUID,
      metadata: { module: input.module, status }
    });

    return data as ModuleTarget;
  });
}

export async function updateModuleTarget(input: {
  companyId: UUID;
  id: UUID;
  name?: string;
  description?: string | null;
  targetText?: string | null;
  category?: ModuleTargetCategory | null;
  startDate?: string | null;
  targetDate?: string | null;
  status?: ModuleTargetStatus;
  responsibleEmployeeId?: UUID | null;
  responsibleUserId?: UUID | null;
  responsibleName?: string | null;
  currentValue?: number;
  targetValue?: number;
  unit?: string | null;
  achieved?: boolean;
  reviewReason?: string | null;
  reviewCorrectiveAction?: string | null;
  reviewResponsibleEmployeeId?: UUID | null;
  reviewResponsibleUserId?: UUID | null;
  reviewResponsibleName?: string | null;
  reviewResourcesRequired?: string | null;
  reviewStartDate?: string | null;
  reviewActionStatus?: ModuleTargetReviewActionStatus | null;
  reviewCloseDate?: string | null;
  actorUserId?: UUID;
}): Promise<ModuleTarget> {
  return withInsforgeSession('module-targets:update', async () => {
    const patch: any = {};
    if (typeof input.name !== 'undefined') patch.name = input.name;
    if (typeof input.description !== 'undefined') patch.description = input.description;
    if (typeof input.targetText !== 'undefined') patch.target_text = input.targetText;
    if (typeof input.category !== 'undefined') patch.category = input.category;
    if (typeof input.startDate !== 'undefined') patch.start_date = input.startDate;
    if (typeof input.targetDate !== 'undefined') patch.target_date = input.targetDate;
    if (typeof input.responsibleEmployeeId !== 'undefined') patch.responsible_employee_id = input.responsibleEmployeeId;
    if (typeof input.responsibleUserId !== 'undefined') patch.responsible_user_id = input.responsibleUserId;
    if (typeof input.responsibleName !== 'undefined') patch.responsible_name = input.responsibleName;
    if (typeof input.currentValue !== 'undefined') patch.current_value = input.currentValue;
    if (typeof input.targetValue !== 'undefined') patch.target_value = input.targetValue;
    if (typeof input.unit !== 'undefined') patch.unit = input.unit;
    if (typeof input.achieved !== 'undefined') patch.achieved = input.achieved;
    Object.assign(patch, statusPatch(input.status));
    if (typeof input.reviewReason !== 'undefined') patch.review_reason = input.reviewReason;
    if (typeof input.reviewCorrectiveAction !== 'undefined') patch.review_corrective_action = input.reviewCorrectiveAction;
    if (typeof input.reviewResponsibleEmployeeId !== 'undefined') {
      patch.review_responsible_employee_id = input.reviewResponsibleEmployeeId;
    }
    if (typeof input.reviewResponsibleUserId !== 'undefined') patch.review_responsible_user_id = input.reviewResponsibleUserId;
    if (typeof input.reviewResponsibleName !== 'undefined') patch.review_responsible_name = input.reviewResponsibleName;
    if (typeof input.reviewResourcesRequired !== 'undefined') patch.review_resources_required = input.reviewResourcesRequired;
    if (typeof input.reviewStartDate !== 'undefined') patch.review_start_date = input.reviewStartDate;
    if (typeof input.reviewActionStatus !== 'undefined') patch.review_action_status = input.reviewActionStatus;
    if (typeof input.reviewCloseDate !== 'undefined') patch.review_close_date = input.reviewCloseDate;
    patch.updated_at = new Date().toISOString();

    const { data, error } = await insforge.database
      .from('module_targets')
      .update(patch)
      .eq('company_id', input.companyId)
      .eq('id', input.id)
      .select('*')
      .single();
    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to update module target.');

    if (input.actorUserId) {
      await createActivityLog({
        companyId: input.companyId,
        actorUserId: input.actorUserId,
        action: 'module_targets.update',
        entityType: 'module_target',
        entityId: input.id,
        metadata: { status: input.status ?? null }
      });
    }

    return data as ModuleTarget;
  });
}

export async function createModuleTargetNote(input: {
  companyId: UUID;
  moduleTargetId: UUID;
  note: string;
  createdByUserId: UUID;
  createdByName?: string | null;
}): Promise<ModuleTargetNote> {
  return withInsforgeSession('module-target-notes:create', async () => {
    const { data, error } = await insforge.database
      .from('module_target_notes')
      .insert({
        company_id: input.companyId,
        module_target_id: input.moduleTargetId,
        note: input.note.trim(),
        created_by_user_id: input.createdByUserId,
        created_by_name: input.createdByName ?? null
      })
      .select('*')
      .single();
    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to create note.');
    return data as ModuleTargetNote;
  });
}

export async function listModuleTargetNotes(input: {
  companyId: UUID;
  moduleTargetId: UUID;
}): Promise<ModuleTargetNote[]> {
  return withInsforgeSession('module-target-notes:list', async () => {
    const { data, error } = await insforge.database
      .from('module_target_notes')
      .select('*')
      .eq('company_id', input.companyId)
      .eq('module_target_id', input.moduleTargetId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? []) as ModuleTargetNote[];
  });
}
