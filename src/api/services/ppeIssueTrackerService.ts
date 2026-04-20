import { insforge } from '../insforge/client';
import type {
  PpeIssueTracker,
  PpeIssueTrackerRiskLevel,
  PpeIssueTrackerStatus,
  UUID
} from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';
import { createEvidence, listEvidence } from './evidenceService';
import { createNotification } from './notificationsService';
import { createTaskFromPpeIssue } from './tasksService';

export type PpeIssueTrackerFilters = {
  companyId: UUID;
  status?: PpeIssueTrackerStatus | 'all';
  riskLevel?: PpeIssueTrackerRiskLevel;
  departmentId?: UUID | null;
  siteId?: UUID | null;
  ppeType?: PpeIssueTracker['ppe_type'];
  issueCategory?: PpeIssueTracker['issue_category'];
  fromDate?: string; // ISO date (YYYY-MM-DD)
  toDate?: string; // ISO date (YYYY-MM-DD)
  responsibleUserId?: UUID | null;
  search?: string | null; // issueId, employee name/number, description
  limit?: number;
};

export async function listPpeIssueTracker(input: PpeIssueTrackerFilters): Promise<PpeIssueTracker[]> {
  const {
    companyId,
    status,
    riskLevel,
    departmentId,
    siteId,
    ppeType,
    issueCategory,
    fromDate,
    toDate,
    responsibleUserId,
    search,
    limit
  } = input;

  let query = insforge.database
    .from('ppe_issue_tracker')
    .select('*')
    .eq('company_id', companyId);

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }
  if (riskLevel) {
    query = query.eq('risk_level', riskLevel);
  }
  if (departmentId !== undefined) {
    query = query.eq('department_id', departmentId);
  }
  if (siteId !== undefined) {
    query = query.eq('site_id', siteId);
  }
  if (ppeType) {
    query = query.eq('ppe_type', ppeType);
  }
  if (issueCategory) {
    query = query.eq('issue_category', issueCategory);
  }
  if (fromDate) {
    query = query.gte('date_reported', fromDate);
  }
  if (toDate) {
    query = query.lte('date_reported', toDate);
  }
  if (responsibleUserId) {
    query = query.eq('responsible_user_id', responsibleUserId);
  }
  if (search && search.trim().length > 0) {
    const term = search.trim();
    // Search over employee name/number and description
    query = query.or(
      [
        `contractor_or_employee_name.ilike.%${term}%`,
        `employee_number.ilike.%${term}%`,
        `description_of_issue.ilike.%${term}%`
      ].join(',')
    );
  }

  const { data, error } = await query
    .order('date_reported', { ascending: false })
    .limit(limit ?? 200);

  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as PpeIssueTracker[];
}

export async function getPpeIssueTrackerById(
  companyId: UUID,
  issueId: UUID
): Promise<PpeIssueTracker | null> {
  const { data, error } = await insforge.database
    .from('ppe_issue_tracker')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', issueId)
    .maybeSingle();
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? null) as PpeIssueTracker | null;
}

export async function deletePpeIssueTracker(input: {
  companyId: UUID;
  issueId: UUID;
  actorUserId: UUID;
}): Promise<void> {
  const { error } = await insforge.database
    .from('ppe_issue_tracker')
    .delete()
    .eq('company_id', input.companyId)
    .eq('id', input.issueId);
  if (error) throw new Error(getErrorMessage(error));

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'ppe_issue_tracker.delete',
    entityType: 'ppe_issue_tracker',
    entityId: input.issueId
  });
}

export type CreatePpeIssueTrackerInput = {
  companyId: UUID;
  createdByUserId: UUID;

  // General info
  dateReported?: string | null;
  reportedByUserId: UUID;
  reportedByName?: string | null;
  departmentId?: UUID | null;
  departmentNameText?: string | null;
  siteId?: UUID | null;
  siteNameText?: string | null;
  contractorOrEmployeeName?: string | null;
  employeeNumber?: string | null;
  jobRoleOrTask?: string | null;
  supervisorUserId?: UUID | null;
  supervisorNameText?: string | null;

  // Issue details
  ppeType: PpeIssueTracker['ppe_type'];
  ppeTypeOther?: string | null;
  issueCategory: PpeIssueTracker['issue_category'];
  descriptionOfIssue: string;
  riskLevel: PpeIssueTrackerRiskLevel;

  // Immediate action
  immediateWorkStopped?: boolean;
  immediatePpeIssued?: boolean;
  immediateEmployeeRemoved?: boolean;
  immediateToolboxTalk?: boolean;
  immediateSupervisorNotified?: boolean;
  immediateActionNotes?: string | null;

  // Evidence & links
  inspectionReferenceText?: string | null;
  auditId?: UUID | null;
  pjoId?: UUID | null;
  checklistInstanceId?: UUID | null;
  checklistItemId?: UUID | null;
  witnessInterviewNotes?: string | null;

  // Corrective actions
  correctiveActionRequired?: boolean;
  responsibleUserId?: UUID | null;
  responsibleUserName?: string | null;
  correctiveDepartmentId?: UUID | null;
  correctiveDepartmentName?: string | null;
  targetCompletionDate?: string | null;
  replacementPpeIssued?: boolean;
  trainingRequired?: boolean;
  disciplinaryAction?: string | null;

  // Optional links to inventory
  ppeItemId?: UUID | null;
  stockId?: UUID | null;
};

export async function createPpeIssueTracker(
  input: CreatePpeIssueTrackerInput
): Promise<PpeIssueTracker> {
  const nowIso = new Date().toISOString();
  const dateReported =
    input.dateReported && String(input.dateReported).length > 0
      ? input.dateReported
      : nowIso;

  const { data, error } = await insforge.database
    .from('ppe_issue_tracker')
    .insert({
      company_id: input.companyId,
      date_reported: dateReported,
      reported_by_user_id: input.reportedByUserId,
      reported_by_name: input.reportedByName ?? null,
      department_id: input.departmentId ?? null,
      department_name_text: input.departmentNameText ?? null,
      site_id: input.siteId ?? null,
      site_name_text: input.siteNameText ?? null,
      contractor_or_employee_name: input.contractorOrEmployeeName ?? null,
      employee_number: input.employeeNumber ?? null,
      job_role_or_task: input.jobRoleOrTask ?? null,
      supervisor_user_id: input.supervisorUserId ?? null,
      supervisor_name_text: input.supervisorNameText ?? null,
      ppe_type: input.ppeType,
      ppe_type_other: input.ppeTypeOther ?? null,
      issue_category: input.issueCategory,
      description_of_issue: input.descriptionOfIssue,
      risk_level: input.riskLevel,
      immediate_work_stopped: !!input.immediateWorkStopped,
      immediate_ppe_issued: !!input.immediatePpeIssued,
      immediate_employee_removed: !!input.immediateEmployeeRemoved,
      immediate_toolbox_talk: !!input.immediateToolboxTalk,
      immediate_supervisor_notified: !!input.immediateSupervisorNotified,
      immediate_action_notes: input.immediateActionNotes ?? null,
      inspection_reference_text: input.inspectionReferenceText ?? null,
      audit_id: input.auditId ?? null,
      pjo_id: input.pjoId ?? null,
      checklist_instance_id: input.checklistInstanceId ?? null,
      checklist_item_id: input.checklistItemId ?? null,
      witness_interview_notes: input.witnessInterviewNotes ?? null,
      corrective_action_required: !!input.correctiveActionRequired,
      responsible_user_id: input.responsibleUserId ?? null,
      responsible_user_name: input.responsibleUserName ?? null,
      corrective_department_id: input.correctiveDepartmentId ?? null,
      corrective_department_name: input.correctiveDepartmentName ?? null,
      target_completion_date: input.targetCompletionDate ?? null,
      replacement_ppe_issued: !!input.replacementPpeIssued,
      training_required: !!input.trainingRequired,
      disciplinary_action: input.disciplinaryAction ?? null,
      status: 'open',
      progress_updates: [],
      follow_up_inspection_date: null,
      department_manager_user_id: null,
      department_manager_signed_at: null,
      department_manager_signature_method: null,
      department_manager_comment: null,
      safety_officer_user_id: null,
      safety_officer_verified_at: null,
      safety_officer_comment: null,
      auditor_user_id: null,
      auditor_confirmed_at: null,
      auditor_comment: null,
      closure_date: null,
      effectiveness_verified: null,
      repeat_issue_indicator: null,
      source_requires_auditor_confirmation: input.auditId ? true : null,
      ppe_item_id: input.ppeItemId ?? null,
      stock_id: input.stockId ?? null,
      created_by_user_id: input.createdByUserId,
      updated_at: nowIso
    })
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create PPE issue.');

  const created = data as PpeIssueTracker;

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'ppe_issue_tracker.create',
    entityType: 'ppe_issue_tracker',
    entityId: created.id
  });

  if (created.corrective_action_required) {
    await createTaskFromPpeIssue({
      id: created.id,
      company_id: created.company_id,
      description_of_issue: created.description_of_issue,
      risk_level: created.risk_level,
      responsible_user_id: created.responsible_user_id ?? null,
      target_completion_date: created.target_completion_date ?? null,
      created_by_user_id: created.created_by_user_id
    }).catch(() => undefined);
  }

  // Auto-escalation for high/critical risk
  if (created.risk_level === 'high' || created.risk_level === 'critical') {
    try {
      const { buildEscalationChain } = await import(
        '../../../scripts/insforge-functions/escalationUtils'
      );
      const primaryUser =
        created.responsible_user_id ||
        created.supervisor_user_id ||
        created.department_manager_user_id ||
        created.reported_by_user_id;

      if (primaryUser) {
        const chain = await buildEscalationChain(insforge, input.companyId, primaryUser);
        const recipients = [
          ...(chain.primary || []),
          ...(chain.managers || []),
          ...(chain.admins || [])
        ];

        await Promise.all(
          recipients.map((userId: UUID) =>
            createNotification(
              input.companyId,
              userId,
              'high',
              'High risk PPE issue reported',
              `A PPE issue has been reported with ${created.risk_level.toUpperCase()} risk and requires immediate attention.`
            )
          )
        );
      }
    } catch {
      // Best-effort escalation; do not block creation
    }
  }

  return created;
}

export type UpdatePpeIssueTrackerInput = {
  companyId: UUID;
  issueId: UUID;
  actorUserId: UUID;
  patch: Partial<
    Pick<
      PpeIssueTracker,
      | 'department_id'
      | 'department_name_text'
      | 'site_id'
      | 'site_name_text'
      | 'contractor_or_employee_name'
      | 'employee_number'
      | 'job_role_or_task'
      | 'supervisor_user_id'
      | 'supervisor_name_text'
      | 'description_of_issue'
      | 'risk_level'
      | 'corrective_action_required'
      | 'responsible_user_id'
      | 'responsible_user_name'
      | 'corrective_department_id'
      | 'corrective_department_name'
      | 'target_completion_date'
      | 'replacement_ppe_issued'
      | 'training_required'
      | 'disciplinary_action'
      | 'follow_up_inspection_date'
      | 'witness_interview_notes'
    >
  >;
};

export async function updatePpeIssueTracker(
  input: UpdatePpeIssueTrackerInput
): Promise<PpeIssueTracker> {
  const nowIso = new Date().toISOString();

  const { data, error } = await insforge.database
    .from('ppe_issue_tracker')
    .update({
      ...input.patch,
      updated_at: nowIso
    })
    .eq('company_id', input.companyId)
    .eq('id', input.issueId)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update PPE issue.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'ppe_issue_tracker.update',
    entityType: 'ppe_issue_tracker',
    entityId: input.issueId,
    metadata: input.patch as any
  });

  return data as PpeIssueTracker;
}

export async function addPpeIssueProgressUpdate(input: {
  companyId: UUID;
  issueId: UUID;
  actorUserId: UUID;
  note: string;
}): Promise<PpeIssueTracker> {
  const issue = await getPpeIssueTrackerById(input.companyId, input.issueId);
  if (!issue) throw new Error('PPE issue not found.');

  const nowIso = new Date().toISOString();
  const updates = Array.isArray(issue.progress_updates) ? [...issue.progress_updates] : [];
  updates.unshift({
    timestamp: nowIso,
    user_id: input.actorUserId,
    note: input.note
  });

  const { data, error } = await insforge.database
    .from('ppe_issue_tracker')
    .update({
      progress_updates: updates as any,
      updated_at: nowIso
    })
    .eq('company_id', input.companyId)
    .eq('id', input.issueId)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to add progress update to PPE issue.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'ppe_issue_tracker.add_progress_update',
    entityType: 'ppe_issue_tracker',
    entityId: input.issueId
  });

  return data as PpeIssueTracker;
}

export async function transitionPpeIssueStatus(input: {
  companyId: UUID;
  issueId: UUID;
  actorUserId: UUID;
  nextStatus: PpeIssueTrackerStatus;
}): Promise<PpeIssueTracker> {
  const current = await getPpeIssueTrackerById(input.companyId, input.issueId);
  if (!current) throw new Error('PPE issue not found.');

  // Evidence validation before Under Review
  if (input.nextStatus === 'under_review' && current.corrective_action_required) {
    const evidence = await listEvidence(input.companyId, {
      entityType: 'ppe_issue_tracker',
      entityId: input.issueId,
      limit: 1
    });
    if (!evidence || evidence.length === 0) {
      throw new Error(
        'At least one evidence attachment is required before moving this PPE issue to Under Review.'
      );
    }
  }

  // Closure rules
  if (input.nextStatus === 'closed') {
    if (!current.department_manager_user_id || !current.department_manager_signed_at) {
      throw new Error('Department manager sign-off is required before closing this PPE issue.');
    }
    if (current.source_requires_auditor_confirmation && !current.auditor_confirmed_at) {
      throw new Error('Auditor confirmation is required before closing this PPE issue.');
    }
  }

  const nowIso = new Date().toISOString();
  const patch: Partial<PpeIssueTracker> = {
    status: input.nextStatus,
    updated_at: nowIso
  } as any;

  if (input.nextStatus === 'closed') {
    (patch as any).closure_date = nowIso;
  }

  const { data, error } = await insforge.database
    .from('ppe_issue_tracker')
    .update(patch as any)
    .eq('company_id', input.companyId)
    .eq('id', input.issueId)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update PPE issue status.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'ppe_issue_tracker.set_status',
    entityType: 'ppe_issue_tracker',
    entityId: input.issueId,
    metadata: { status: input.nextStatus }
  });

  return data as PpeIssueTracker;
}

export async function setPpeIssueManagerSignoff(input: {
  companyId: UUID;
  issueId: UUID;
  actorUserId: UUID;
  signatureMethod?: string;
  comment?: string | null;
}): Promise<PpeIssueTracker> {
  const nowIso = new Date().toISOString();
  const { data, error } = await insforge.database
    .from('ppe_issue_tracker')
    .update({
      department_manager_user_id: input.actorUserId,
      department_manager_signed_at: nowIso,
      department_manager_signature_method: input.signatureMethod ?? 'password-reprompt',
      department_manager_comment: input.comment ?? null,
      updated_at: nowIso
    })
    .eq('company_id', input.companyId)
    .eq('id', input.issueId)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to record department manager sign-off.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'ppe_issue_tracker.manager_signoff',
    entityType: 'ppe_issue_tracker',
    entityId: input.issueId
  });

  return data as PpeIssueTracker;
}

export async function setPpeIssueSafetyOfficerVerification(input: {
  companyId: UUID;
  issueId: UUID;
  actorUserId: UUID;
  comment?: string | null;
}): Promise<PpeIssueTracker> {
  const nowIso = new Date().toISOString();
  const { data, error } = await insforge.database
    .from('ppe_issue_tracker')
    .update({
      safety_officer_user_id: input.actorUserId,
      safety_officer_verified_at: nowIso,
      safety_officer_comment: input.comment ?? null,
      updated_at: nowIso
    })
    .eq('company_id', input.companyId)
    .eq('id', input.issueId)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to record safety officer verification.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'ppe_issue_tracker.safety_officer_verify',
    entityType: 'ppe_issue_tracker',
    entityId: input.issueId
  });

  return data as PpeIssueTracker;
}

export async function setPpeIssueAuditorConfirmation(input: {
  companyId: UUID;
  issueId: UUID;
  actorUserId: UUID;
  comment?: string | null;
}): Promise<PpeIssueTracker> {
  const nowIso = new Date().toISOString();
  const { data, error } = await insforge.database
    .from('ppe_issue_tracker')
    .update({
      auditor_user_id: input.actorUserId,
      auditor_confirmed_at: nowIso,
      auditor_comment: input.comment ?? null,
      updated_at: nowIso
    })
    .eq('company_id', input.companyId)
    .eq('id', input.issueId)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to record auditor confirmation.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'ppe_issue_tracker.auditor_confirm',
    entityType: 'ppe_issue_tracker',
    entityId: input.issueId
  });

  return data as PpeIssueTracker;
}

export async function computeAndSetRepeatIssueIndicator(input: {
  companyId: UUID;
  issueId: UUID;
  lookbackDays?: number;
}): Promise<PpeIssueTracker> {
  const current = await getPpeIssueTrackerById(input.companyId, input.issueId);
  if (!current) throw new Error('PPE issue not found.');

  const days = input.lookbackDays ?? 90;
  const fromDate = new Date(current.date_reported);
  fromDate.setDate(fromDate.getDate() - days);
  const fromIso = fromDate.toISOString();

  const { data, error } = await insforge.database
    .from('ppe_issue_tracker')
    .select('id')
    .eq('company_id', input.companyId)
    .eq('ppe_type', current.ppe_type)
    .eq('issue_category', current.issue_category)
    .eq('department_id', current.department_id)
    .eq('site_id', current.site_id)
    .gte('date_reported', fromIso)
    .neq('id', current.id);

  if (error) throw new Error(getErrorMessage(error));

  const hasRepeat = !!data && data.length > 0;

  const { data: updated, error: updateError } = await insforge.database
    .from('ppe_issue_tracker')
    .update({
      repeat_issue_indicator: hasRepeat,
      updated_at: new Date().toISOString()
    })
    .eq('company_id', input.companyId)
    .eq('id', input.issueId)
    .select('*')
    .single();

  if (updateError) throw new Error(getErrorMessage(updateError));
  if (!updated) throw new Error('Failed to update repeat issue indicator.');

  return updated as PpeIssueTracker;
}

export async function addPpeIssueEvidenceFromUpload(input: {
  companyId: UUID;
  issueId: UUID;
  actorUserId: UUID;
  title?: string;
  storageBucket: string;
  storageKey: string;
}): Promise<void> {
  await createEvidence({
    companyId: input.companyId,
    entityType: 'ppe_issue_tracker',
    entityId: input.issueId,
    title: input.title,
    storageBucket: input.storageBucket,
    storageKey: input.storageKey,
    createdByUserId: input.actorUserId
  });
}
