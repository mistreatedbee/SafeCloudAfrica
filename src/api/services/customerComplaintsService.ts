import { insforge } from '../insforge/client';
import { withInsforgeSession } from '../insforge/ensureSession';
import { getErrorMessage } from '../insforge/errors';
import type { CompanyRole, UUID } from '../models/core';
import type { CustomerComplaintStatus, QualityCustomerComplaint } from '../models/entities';
import { createActivityLog } from './activityLogService';
import { createQualityNcr } from './qualityNcrsService';
import { createTask } from './tasksService';
import { getMyProfile } from './profilesService';
import { sendTemplatedNotificationEmail } from './emailService';
import { resolveComplaintClosureFields } from './customerComplaintsService.helpers';
import { MANAGEMENT_ROLES } from '../../constants/roles';

export const CUSTOMER_COMPLAINT_STATUS_LABELS: Record<CustomerComplaintStatus, string> = {
  CLOSED: 'Closed',
  MONITORING_REQUIRED: 'Monitoring Required',
  ESCALATED_TO_MANAGEMENT: 'Escalated to Management'
};

const ACTIVE_STATUSES: CustomerComplaintStatus[] = ['MONITORING_REQUIRED', 'ESCALATED_TO_MANAGEMENT'];
const WRITE_ROLES: CompanyRole[] = ['owner', 'admin', 'manager', 'supervisor'];
const ESCALATE_CLOSE_ROLES: CompanyRole[] = ['owner', 'admin', 'manager'];

type ComplaintBase = {
  customerName: string;
  personHandlingUserId?: UUID | null;
  personHandlingNameSnapshot: string;
  dateReceived: string;
  description: string;
  actionTaken?: string | null;
  closedAt?: string | null;
  status?: CustomerComplaintStatus;
  customerFeedback?: string | null;
  evidenceFileIds?: UUID[] | null;
  complaintRefNo?: string | null;
};

export type ComplaintLinkingInput = {
  createLinkedTask?: boolean;
  linkedTaskAssigneeUserId?: UUID | null;
};

function canWrite(role: CompanyRole | null): boolean {
  return !!role && WRITE_ROLES.includes(role);
}

function canEscalateOrClose(role: CompanyRole | null): boolean {
  return !!role && ESCALATE_CLOSE_ROLES.includes(role);
}

function canViewAll(role: CompanyRole | null): boolean {
  return !!role && (MANAGEMENT_ROLES.includes(role) || role === 'consultant' || role === 'auditor');
}

function normalizeDateOnly(value: string): string {
  return value.trim().slice(0, 10);
}

function validateComplaintInput(input: ComplaintBase, actorRole: CompanyRole | null): void {
  if (!input.customerName.trim()) throw new Error('Customer name is required.');
  if (!input.personHandlingNameSnapshot.trim()) throw new Error('Person handling complaint is required.');
  if (!input.description.trim()) throw new Error('Description is required.');
  if (!input.dateReceived.trim()) throw new Error('Date received is required.');
  if (input.status === 'CLOSED') {
    if (!input.actionTaken || !input.actionTaken.trim()) {
      throw new Error('Action taken is required before closing a complaint.');
    }
    if (!canEscalateOrClose(actorRole)) {
      throw new Error('Only owner/admin/manager can close complaints.');
    }
  }
  if (input.status === 'ESCALATED_TO_MANAGEMENT' && !canEscalateOrClose(actorRole)) {
    throw new Error('Only owner/admin/manager can escalate complaints.');
  }
}

async function getOrCreateNextComplaintRef(companyId: UUID): Promise<string> {
  const year = new Date().getFullYear();
  const nowIso = new Date().toISOString();

  await insforge.database
    .from('quality_customer_complaint_counter')
    .upsert({ company_id: companyId, year, last_number: 0, updated_at: nowIso }, { onConflict: 'company_id,year' });

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data: counter, error: readError } = await insforge.database
      .from('quality_customer_complaint_counter')
      .select('company_id, year, last_number')
      .eq('company_id', companyId)
      .eq('year', year)
      .single();
    if (readError) throw new Error(getErrorMessage(readError));
    const last = Number((counter as Record<string, unknown>)?.last_number ?? 0);
    const next = last + 1;

    const { data: updated, error: updateError } = await insforge.database
      .from('quality_customer_complaint_counter')
      .update({ last_number: next, updated_at: nowIso })
      .eq('company_id', companyId)
      .eq('year', year)
      .eq('last_number', last)
      .select('last_number')
      .maybeSingle();
    if (updateError) throw new Error(getErrorMessage(updateError));
    if (updated) return `CCL-${year}-${String(next).padStart(4, '0')}`;
  }

  const randomSuffix = String(Math.floor(1000 + Math.random() * 9000));
  return `CCL-${year}-${randomSuffix}`;
}

async function getEscalationRecipients(companyId: UUID): Promise<Array<{ userId: UUID; email: string | null }>> {
  const { data: memberships, error: membersError } = await insforge.database
    .from('company_memberships')
    .select('user_id, role')
    .eq('company_id', companyId)
    .in('role', ['owner', 'admin']);
  if (membersError) throw new Error(getErrorMessage(membersError));

  const userIds = [...new Set((memberships ?? []).map((x: Record<string, unknown>) => x.user_id as UUID))];
  if (userIds.length === 0) return [];

  const { data: profiles } = await insforge.database
    .from('user_profiles')
    .select('user_id, email')
    .eq('company_id', companyId)
    .in('user_id', userIds);
  type ProfileRow = { user_id: string; email: string | null };
  const emailMap = new Map<string, string | null>((profiles ?? []).map((p: ProfileRow) => [p.user_id, p.email ?? null]));

  return userIds.map((userId) => ({ userId, email: emailMap.get(userId) ?? null }));
}

async function notifyEscalation(input: {
  companyId: UUID;
  complaintRefNo: string;
  complaintId: UUID;
  actorUserId: UUID;
}): Promise<void> {
  try {
    const recipients = await getEscalationRecipients(input.companyId);
    await Promise.all(
      recipients.map(async (recipient) => {
        await insforge.database.from('notifications').insert({
          company_id: input.companyId,
          user_id: recipient.userId,
          title: 'Customer Complaint Escalated',
          message: `Complaint ${input.complaintRefNo} was escalated to management.`,
          severity: 'high'
        });
      })
    );

    const emails = recipients.map((r) => r.email).filter((v): v is string => !!v);
    if (emails.length > 0) {
      await sendTemplatedNotificationEmail({
        to: emails,
        templateKey: 'quality_customer_complaints',
        variables: {
          reference: input.complaintRefNo,
          status: 'Escalated to Management'
        },
        actionUrl: '/dashboard/quality/complaints',
        meta: {
          companyId: input.companyId,
          complaintId: input.complaintId,
          actorUserId: input.actorUserId
        }
      });
    }
  } catch {
    // Non-blocking notification path.
  }
}

function changedFields(existing: QualityCustomerComplaint, patch: Partial<QualityCustomerComplaint>): string[] {
  const keys = Object.keys(patch) as Array<keyof QualityCustomerComplaint>;
  return keys.filter((k) => JSON.stringify(existing[k]) !== JSON.stringify(patch[k])).map((k) => String(k));
}

export type ListCustomerComplaintsInput = {
  companyId: UUID;
  actorUserId?: UUID | null;
  actorRole?: CompanyRole | null;
  status?: CustomerComplaintStatus;
  dateFrom?: string;
  dateTo?: string;
  personHandlingUserId?: UUID;
  personHandlingSearch?: string;
  customerSearch?: string;
  complaintRefSearch?: string;
  limit?: number;
};

export async function listCustomerComplaints(input: ListCustomerComplaintsInput): Promise<QualityCustomerComplaint[]> {
  return withInsforgeSession('customer-complaints:list', async () => {
  let q = insforge.database
    .from('quality_customer_complaints')
    .select('*')
    .eq('company_id', input.companyId)
    .order('date_received', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 500);

  if (input.status) q = q.eq('status', input.status);
  if (input.dateFrom) q = q.gte('date_received', input.dateFrom);
  if (input.dateTo) q = q.lte('date_received', input.dateTo);
  if (input.personHandlingUserId) q = q.eq('person_handling_user_id', input.personHandlingUserId);
  if (input.personHandlingSearch?.trim()) q = q.ilike('person_handling_name_snapshot', `%${input.personHandlingSearch.trim()}%`);
  if (input.customerSearch?.trim()) q = q.ilike('customer_name', `%${input.customerSearch.trim()}%`);
  if (input.complaintRefSearch?.trim()) q = q.ilike('complaint_ref_no', `%${input.complaintRefSearch.trim()}%`);

  const { data, error } = await q;
  if (error) throw new Error(getErrorMessage(error));
  const rows = (data ?? []) as QualityCustomerComplaint[];

  if (!canViewAll(input.actorRole ?? null) && input.actorUserId) {
    return rows.filter((row) => row.created_by_user_id === input.actorUserId);
  }
  return rows;
  }); // end withInsforgeSession
}

export async function getCustomerComplaint(companyId: UUID, complaintId: UUID): Promise<QualityCustomerComplaint | null> {
  const { data, error } = await insforge.database
    .from('quality_customer_complaints')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', complaintId)
    .maybeSingle();
  if (error) throw new Error(getErrorMessage(error));
  return (data as QualityCustomerComplaint | null) ?? null;
}

export async function createCustomerComplaint(input: {
  companyId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole | null;
} & ComplaintBase &
  ComplaintLinkingInput): Promise<QualityCustomerComplaint> {
  if (!canWrite(input.actorRole) && input.actorRole !== 'employee') {
    throw new Error('You do not have permission to create complaints.');
  }
  validateComplaintInput(input, input.actorRole);
  return withInsforgeSession('customer-complaints:create', async () => {

  const profile = await getMyProfile(input.companyId, input.actorUserId);
  const complaintRefNo = input.complaintRefNo?.trim() || (await getOrCreateNextComplaintRef(input.companyId));
  const status = input.status ?? 'MONITORING_REQUIRED';
  const nowIso = new Date().toISOString();
  const linkedNcr = await createQualityNcr({
    companyId: input.companyId,
    createdByUserId: input.actorUserId,
    title: `Customer Complaint: ${input.customerName.trim()}`,
    description: input.description.trim(),
    severity: 'medium',
    source_entity_type: 'customer_complaint'
  });

  const profileRow = profile as Record<string, unknown> | null;
  const insertPayload: Record<string, unknown> = {
    company_id: input.companyId,
    site_id: (profileRow?.site_id as string | null) ?? null,
    department_id: (profileRow?.department_id as string | null) ?? null,
    complaint_ref_no: complaintRefNo,
    customer_name: input.customerName.trim(),
    person_handling_user_id: input.personHandlingUserId ?? null,
    person_handling_name_snapshot: input.personHandlingNameSnapshot.trim(),
    date_received: normalizeDateOnly(input.dateReceived),
    description: input.description.trim(),
    action_taken: input.actionTaken?.trim() || null,
    status,
    customer_feedback: input.customerFeedback?.trim() || null,
    evidence_file_ids: input.evidenceFileIds ?? null,
    linked_ncr_id: linkedNcr.id,
    created_by_user_id: input.actorUserId,
    updated_at: nowIso
  };

  if (status === 'CLOSED') {
    const closure = resolveComplaintClosureFields({
      nextStatus: status,
      actorUserId: input.actorUserId,
      actionTaken: input.actionTaken,
      closedAt: input.closedAt,
      nowIso
    });
    insertPayload.action_taken = closure.actionTaken;
    insertPayload.closed_at = closure.closedAt;
    insertPayload.closed_by_user_id = closure.closedByUserId;
  }

  const { data, error } = await insforge.database
    .from('quality_customer_complaints')
    .insert(insertPayload)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create complaint.');
  let created = data as QualityCustomerComplaint;

  await insforge.database
    .from('quality_ncrs')
    .update({ source_entity_id: created.id, updated_at: new Date().toISOString() })
    .eq('company_id', input.companyId)
    .eq('id', linkedNcr.id);

  if (input.createLinkedTask) {
    const task = await createTask({
      companyId: input.companyId,
      module: 'quality',
      title: `Complaint follow-up: ${created.complaint_ref_no}`,
      description: created.action_taken ?? created.description,
      category: 'quality_action',
      priority: 'medium',
      assigneeUserId: input.linkedTaskAssigneeUserId ?? created.person_handling_user_id ?? undefined,
      sourceEntityType: 'customer_complaint',
      sourceEntityId: created.id,
      createdByUserId: input.actorUserId
    });
    const { data: linked } = await insforge.database
      .from('quality_customer_complaints')
      .update({ linked_task_id: task.id, updated_at: new Date().toISOString() })
      .eq('company_id', input.companyId)
      .eq('id', created.id)
      .select('*')
      .single();
    if (linked) created = linked as QualityCustomerComplaint;
  }

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'quality_customer_complaints.create',
    entityType: 'quality_customer_complaint',
    entityId: created.id,
    metadata: { complaintRefNo: created.complaint_ref_no, status: created.status }
  });

  if (created.status === 'ESCALATED_TO_MANAGEMENT') {
    await notifyEscalation({
      companyId: input.companyId,
      complaintRefNo: created.complaint_ref_no,
      complaintId: created.id,
      actorUserId: input.actorUserId
    });
  }

  return created;
  });
}

export async function updateCustomerComplaint(input: {
  companyId: UUID;
  complaintId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole | null;
  patch: Partial<QualityCustomerComplaint>;
}): Promise<QualityCustomerComplaint> {
  if (!canWrite(input.actorRole) && input.actorRole !== 'employee') {
    throw new Error('You do not have permission to update complaints.');
  }
  const existing = await getCustomerComplaint(input.companyId, input.complaintId);
  if (!existing) throw new Error('Complaint not found.');
  if (input.actorRole === 'employee' && existing.created_by_user_id !== input.actorUserId) {
    throw new Error('Employees can only edit their own complaints.');
  }

  const nextStatus = (input.patch.status ?? existing.status) as CustomerComplaintStatus;
  if (nextStatus !== existing.status && (nextStatus === 'CLOSED' || nextStatus === 'ESCALATED_TO_MANAGEMENT') && !canEscalateOrClose(input.actorRole)) {
    throw new Error('Only owner/admin/manager can close or escalate complaints.');
  }

  const patch: Partial<QualityCustomerComplaint> = { ...input.patch };
  const closure = resolveComplaintClosureFields({
    nextStatus,
    actorUserId: input.actorUserId,
    actionTaken: patch.action_taken,
    existingActionTaken: existing.action_taken,
    closedAt: patch.closed_at,
    existingClosedAt: existing.closed_at,
    closedByUserId: patch.closed_by_user_id,
    existingClosedByUserId: existing.closed_by_user_id
  });
  patch.action_taken = closure.actionTaken;
  patch.closed_at = closure.closedAt;
  patch.closed_by_user_id = closure.closedByUserId;

  const dbPatch: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
  if (typeof dbPatch.date_received === 'string') dbPatch.date_received = normalizeDateOnly(String(dbPatch.date_received));

  const { data, error } = await insforge.database
    .from('quality_customer_complaints')
    .update(dbPatch)
    .eq('company_id', input.companyId)
    .eq('id', input.complaintId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update complaint.');
  const updated = data as QualityCustomerComplaint;

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'quality_customer_complaints.update',
    entityType: 'quality_customer_complaint',
    entityId: updated.id,
    metadata: {
      statusFrom: existing.status,
      statusTo: updated.status,
      changedFields: changedFields(existing, patch)
    }
  });

  if (existing.status !== 'ESCALATED_TO_MANAGEMENT' && updated.status === 'ESCALATED_TO_MANAGEMENT') {
    await notifyEscalation({
      companyId: input.companyId,
      complaintRefNo: updated.complaint_ref_no,
      complaintId: updated.id,
      actorUserId: input.actorUserId
    });
  }

  return updated;
}

export async function deleteCustomerComplaint(input: {
  companyId: UUID;
  complaintId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole | null;
}): Promise<void> {
  const existing = await getCustomerComplaint(input.companyId, input.complaintId);
  if (!existing) throw new Error('Complaint not found.');

  const canDeleteOwnDraft =
    input.actorRole === 'employee' &&
    existing.created_by_user_id === input.actorUserId &&
    existing.status !== 'CLOSED';
  if (!canWrite(input.actorRole) && !canDeleteOwnDraft) {
    throw new Error('You do not have permission to delete complaints.');
  }

  const { error } = await insforge.database
    .from('quality_customer_complaints')
    .delete()
    .eq('company_id', input.companyId)
    .eq('id', input.complaintId);
  if (error) throw new Error(getErrorMessage(error));

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'quality_customer_complaints.delete',
    entityType: 'quality_customer_complaint',
    entityId: input.complaintId,
    metadata: { complaintRefNo: existing.complaint_ref_no }
  });
}

export async function getCustomerComplaintSummary(input: {
  companyId: UUID;
  actorRole: CompanyRole | null;
  actorUserId: UUID;
  dateFrom: string;
  dateTo: string;
}): Promise<{ total: number; openActive: number; closed: number; escalated: number }> {
  const rows = await listCustomerComplaints({
    companyId: input.companyId,
    actorRole: input.actorRole,
    actorUserId: input.actorUserId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    limit: 5000
  });

  return {
    total: rows.length,
    openActive: rows.filter((r) => ACTIVE_STATUSES.includes(r.status)).length,
    closed: rows.filter((r) => r.status === 'CLOSED').length,
    escalated: rows.filter((r) => r.status === 'ESCALATED_TO_MANAGEMENT').length
  };
}

export async function listComplaintHandlers(companyId: UUID): Promise<Array<{ userId: UUID; role: string; displayName: string }>> {
  const { data: members, error } = await insforge.database
    .from('company_memberships')
    .select('user_id, role')
    .eq('company_id', companyId)
    .in('role', ['owner', 'admin', 'manager', 'supervisor', 'consultant']);
  if (error) throw new Error(getErrorMessage(error));

  type MemberRow = { user_id: UUID; role: string };
  const memberRows = (members ?? []) as MemberRow[];
  const userIds = [...new Set(memberRows.map((m) => m.user_id))];
  if (userIds.length === 0) return [];

  const { data: profiles } = await insforge.database
    .from('user_profiles')
    .select('user_id, full_name, email')
    .eq('company_id', companyId)
    .in('user_id', userIds);
  type ComplaintProfileRow = { user_id: string; full_name: string | null; email: string | null };
  const profileMap = new Map<string, ComplaintProfileRow>((profiles ?? []).map((p: ComplaintProfileRow) => [p.user_id, p]));

  return memberRows.map((member) => {
    const profile = profileMap.get(member.user_id);
    const displayName =
      profile?.full_name?.trim() ||
      profile?.email?.trim() ||
      String(member.user_id).slice(0, 8);
    return {
      userId: member.user_id,
      role: String(member.role),
      displayName
    };
  });
}
