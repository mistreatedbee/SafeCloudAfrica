import { insforge } from '../insforge/client';
import type {
  ActivityLog,
  LegalComplianceStatus,
  LegalRequirement,
  LegalRequirementEvidenceLink,
  LegalRequirementLink,
  LegalRequirementLinkedModuleType,
  LegalRequirementReference,
  LegalUpdate,
  LegalUpdateCompletionStatus,
  UserProfile,
  UUID
} from '../models/entities';
import type { CompanyRole } from '../models/core';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog, listActivityLogsByEntity } from './activityLogService';
import { sendTemplatedEmail } from './emailService';

export const LEGAL_COMPLIANCE_OPTIONS: Array<{ value: LegalComplianceStatus; label: string }> = [
  { value: 'NON_COMPLIANT', label: 'Non compliant' },
  { value: 'PARTIALLY_COMPLIANT', label: 'Partially compliant' },
  { value: 'COMPLIANT', label: 'Compliant' }
];

export const LEGAL_UPDATE_COMPLETION_OPTIONS: Array<{ value: LegalUpdateCompletionStatus; label: string }> = [
  { value: 'OPEN', label: 'Open' },
  { value: 'CLOSED', label: 'Closed' }
];

const CAN_WRITE_ROLES: CompanyRole[] = ['owner', 'admin', 'manager', 'supervisor', 'consultant'];
const CAN_CLOSE_UPDATE_ROLES: CompanyRole[] = ['owner', 'admin'];

export type LegalRequirementFilters = {
  companyId: UUID;
  search?: string;
  complianceStatus?: LegalComplianceStatus;
  responsibleUserId?: UUID;
  applicability?: string;
  createdFrom?: string;
  createdTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  page?: number;
  pageSize?: number;
};

export type LegalUpdateFilters = {
  companyId: UUID;
  legalRequirementId?: UUID;
  completionStatus?: LegalUpdateCompletionStatus;
  responsibleUserId?: UUID;
  deadlineFrom?: string;
  deadlineTo?: string;
  overdueOnly?: boolean;
  requirementSearch?: string;
  page?: number;
  pageSize?: number;
};

export type LegalRequirementListResult = {
  rows: LegalRequirement[];
  total: number;
  page: number;
  pageSize: number;
};

export type LegalUpdateListResult = {
  rows: Array<LegalUpdate & { requirement_standard?: string }>;
  total: number;
  page: number;
  pageSize: number;
};

export type LegalRequirementLinkSpec = {
  linkedModuleType: LegalRequirementLinkedModuleType;
  linkedRecordId: UUID;
};

function canWrite(role: CompanyRole | null): boolean {
  return !!role && CAN_WRITE_ROLES.includes(role);
}

function canCloseUpdates(role: CompanyRole | null): boolean {
  return !!role && CAN_CLOSE_UPDATE_ROLES.includes(role);
}

function asReferences(refs?: LegalRequirementReference[] | null): LegalRequirementReference[] {
  return (refs ?? [])
    .map((r) => ({ referenceText: (r?.referenceText ?? '').trim() }))
    .filter((r) => r.referenceText.length > 0);
}

function asEvidenceLinks(links?: LegalRequirementEvidenceLink[] | null): LegalRequirementEvidenceLink[] {
  return (links ?? [])
    .map((l) => ({
      documentId: l.documentId,
      documentTitleSnapshot: (l.documentTitleSnapshot ?? '').trim()
    }))
    .filter((l) => !!l.documentId && l.documentTitleSnapshot.length > 0);
}

export async function listLegalRequirementLinks(companyId: UUID, legalRequirementId: UUID): Promise<LegalRequirementLink[]> {
  const { data, error } = await insforge.database
    .from('legal_requirement_links')
    .select('*')
    .eq('company_id', companyId)
    .eq('legal_requirement_id', legalRequirementId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as LegalRequirementLink[];
}

export async function upsertLegalRequirementLinks(input: {
  companyId: UUID;
  legalRequirementId: UUID;
  actorUserId: UUID;
  linkSpecs: LegalRequirementLinkSpec[];
}): Promise<LegalRequirementLink[]> {
  const specs = input.linkSpecs.filter((spec) => !!spec.linkedRecordId);
  if (specs.length === 0) {
    // Just clear any existing links
    const { error } = await insforge.database
      .from('legal_requirement_links')
      .delete()
      .eq('company_id', input.companyId)
      .eq('legal_requirement_id', input.legalRequirementId);
    if (error) throw new Error(getErrorMessage(error));
    return [];
  }

  if (specs.length > 2) {
    throw new Error('You can only link up to two records per legal requirement.');
  }

  const { error: deleteError } = await insforge.database
    .from('legal_requirement_links')
    .delete()
    .eq('company_id', input.companyId)
    .eq('legal_requirement_id', input.legalRequirementId);
  if (deleteError) throw new Error(getErrorMessage(deleteError));

  const payload = specs.map((spec) => ({
    company_id: input.companyId,
    legal_requirement_id: input.legalRequirementId,
    linked_module_type: spec.linkedModuleType,
    linked_record_id: spec.linkedRecordId,
    created_by_user_id: input.actorUserId
  }));

  const { data, error: insertError } = await insforge.database
    .from('legal_requirement_links')
    .insert(payload)
    .select('*');
  if (insertError) throw new Error(getErrorMessage(insertError));
  return (data ?? []) as LegalRequirementLink[];
}

export async function listLegalRequirementsForLinkedRecord(input: {
  companyId: UUID;
  moduleType: LegalRequirementLinkedModuleType;
  recordId: UUID;
}): Promise<Array<Pick<LegalRequirement, 'id' | 'requirement_standard' | 'compliance_status'>>> {
  const { data: linkRows, error: linksError } = await insforge.database
    .from('legal_requirement_links')
    .select('legal_requirement_id')
    .eq('company_id', input.companyId)
    .eq('linked_module_type', input.moduleType)
    .eq('linked_record_id', input.recordId);
  if (linksError) throw new Error(getErrorMessage(linksError));

  const ids = [...new Set((linkRows ?? []).map((row: any) => row.legal_requirement_id as UUID))];
  if (ids.length === 0) return [];

  const { data: requirements, error: reqError } = await insforge.database
    .from('legal_requirements')
    .select('id, requirement_standard, compliance_status')
    .eq('company_id', input.companyId)
    .in('id', ids)
    .is('deleted_at', null);
  if (reqError) throw new Error(getErrorMessage(reqError));

  return (requirements ?? []) as Array<Pick<LegalRequirement, 'id' | 'requirement_standard' | 'compliance_status'>>;
}

export async function listLegalRequirements(filters: LegalRequirementFilters): Promise<LegalRequirementListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = insforge.database
    .from('legal_requirements')
    .select('*', { count: 'exact' })
    .eq('company_id', filters.companyId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .range(from, to);

  if (filters.search?.trim()) {
    const s = filters.search.trim();
    query = query.or(`requirement_standard.ilike.%${s}%,reference.ilike.%${s}%,applicability.ilike.%${s}%`);
  }
  if (filters.complianceStatus) query = query.eq('compliance_status', filters.complianceStatus);
  if (filters.responsibleUserId) query = query.eq('responsible_user_id', filters.responsibleUserId);
  if (filters.applicability?.trim()) query = query.ilike('applicability', `%${filters.applicability.trim()}%`);
  if (filters.createdFrom) query = query.gte('created_at', filters.createdFrom);
  if (filters.createdTo) query = query.lte('created_at', filters.createdTo);
  if (filters.updatedFrom) query = query.gte('updated_at', filters.updatedFrom);
  if (filters.updatedTo) query = query.lte('updated_at', filters.updatedTo);

  const { data, error, count } = await query;
  if (error) throw new Error(getErrorMessage(error));

  return {
    rows: (data ?? []) as LegalRequirement[],
    total: count ?? 0,
    page,
    pageSize
  };
}

export async function getLegalRequirementById(input: {
  companyId: UUID;
  requirementId: UUID;
}): Promise<{ requirement: LegalRequirement; updates: LegalUpdate[]; auditTrail: ActivityLog[] }> {
  const { data, error } = await insforge.database
    .from('legal_requirements')
    .select('*')
    .eq('company_id', input.companyId)
    .eq('id', input.requirementId)
    .is('deleted_at', null)
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Legal requirement not found.');

  const links = await listLegalRequirementLinks(input.companyId, input.requirementId);

  const { data: updates, error: updatesErr } = await insforge.database
    .from('legal_updates')
    .select('*')
    .eq('company_id', input.companyId)
    .eq('legal_requirement_id', input.requirementId)
    .order('created_at', { ascending: false });
  if (updatesErr) throw new Error(getErrorMessage(updatesErr));

  const auditTrail = await listActivityLogsByEntity({
    companyId: input.companyId,
    entityType: 'legal_requirement',
    entityId: input.requirementId,
    limit: 200
  });

  return {
    requirement: { ...(data as LegalRequirement), links },
    updates: (updates ?? []) as LegalUpdate[],
    auditTrail
  };
}

export async function createLegalRequirement(input: {
  companyId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole | null;
  requirementStandard: string;
  applicability?: string | null;
  actionsNeeded?: string | null;
  finding?: string | null;
  targetDate?: string | null;
  complianceStatus: LegalComplianceStatus;
  responsibleUserId?: UUID | null;
  responsibleEmployeeId?: UUID | null;
  responsibleExternalName?: string | null;
  references?: LegalRequirementReference[] | null;
  evidenceLinks?: LegalRequirementEvidenceLink[] | null;
  links?: LegalRequirementLinkSpec[] | null;
}): Promise<LegalRequirement> {
  if (!canWrite(input.actorRole)) throw new Error('You do not have permission to create legal requirements.');
  const requirementStandard = input.requirementStandard.trim();
  if (!requirementStandard) throw new Error('Requirement/Standard is required.');

  if (input.targetDate) {
    const target = new Date(input.targetDate);
    if (Number.isNaN(target.getTime())) {
      throw new Error('Target date is invalid.');
    }
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const targetOnly = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    if (targetOnly.getTime() < today.getTime()) {
      throw new Error('Target date cannot be in the past.');
    }
  }

  let responsibleUserId: UUID | null = (input.responsibleUserId ?? null) as UUID | null;
  let responsibleEmployeeId: UUID | null = (input.responsibleEmployeeId ?? null) as UUID | null;

  if (responsibleEmployeeId && !responsibleUserId) {
    const { data, error } = await insforge.database
      .from('hr_employees')
      .select('id,user_id')
      .eq('company_id', input.companyId)
      .eq('id', responsibleEmployeeId)
      .maybeSingle();
    if (error) throw new Error(getErrorMessage(error));
    if (data) {
      responsibleEmployeeId = (data as any).id as UUID;
      responsibleUserId = ((data as any).user_id ?? null) as UUID | null;
    }
  } else if (!responsibleEmployeeId && responsibleUserId) {
    const { data, error } = await insforge.database
      .from('hr_employees')
      .select('id,user_id')
      .eq('company_id', input.companyId)
      .eq('user_id', responsibleUserId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(getErrorMessage(error));
    if (data) {
      responsibleEmployeeId = (data as any).id as UUID;
      responsibleUserId = ((data as any).user_id ?? null) as UUID | null;
    }
  }

  const payload = {
    company_id: input.companyId,
    module: 'legal',
    requirement_standard: requirementStandard,
    requirement: requirementStandard,
    applicability: input.applicability?.trim() || null,
    actions_needed: input.actionsNeeded?.trim() || null,
    finding: input.finding?.trim() || null,
    target_date: input.targetDate || null,
    compliance_status: input.complianceStatus,
    status:
      input.complianceStatus === 'COMPLIANT'
        ? 'compliant'
        : input.complianceStatus === 'NON_COMPLIANT'
          ? 'non-compliant'
          : 'in-progress',
    responsible_user_id: responsibleUserId,
    responsible_employee_id: responsibleEmployeeId,
    responsible_external_name: input.responsibleExternalName?.trim() || null,
    references: asReferences(input.references),
    reference: asReferences(input.references)
      .map((x) => x.referenceText)
      .join('; ') || null,
    evidence_links: asEvidenceLinks(input.evidenceLinks),
    created_by_user_id: input.actorUserId,
    updated_by_user_id: input.actorUserId,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await insforge.database.from('legal_requirements').insert(payload).select('*').single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create legal requirement.');

  const requirementId = (data as any).id as UUID;

  if (input.links && input.links.length > 0) {
    await upsertLegalRequirementLinks({
      companyId: input.companyId,
      legalRequirementId: requirementId,
      actorUserId: input.actorUserId,
      linkSpecs: input.links
    });
  }

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'legal_requirements.create',
    entityType: 'legal_requirement',
    entityId: requirementId,
    metadata: { complianceStatus: input.complianceStatus }
  });

  const requirementWithLinks: LegalRequirement = {
    ...(data as LegalRequirement),
    links: input.links ?? null
  };

  return requirementWithLinks;
}

export async function updateLegalRequirement(input: {
  companyId: UUID;
  requirementId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole | null;
  patch: {
    requirementStandard?: string;
    applicability?: string | null;
    actionsNeeded?: string | null;
    finding?: string | null;
    targetDate?: string | null;
    complianceStatus?: LegalComplianceStatus;
    responsibleUserId?: UUID | null;
    responsibleEmployeeId?: UUID | null;
    responsibleExternalName?: string | null;
    references?: LegalRequirementReference[] | null;
    evidenceLinks?: LegalRequirementEvidenceLink[] | null;
    links?: LegalRequirementLinkSpec[] | null;
  };
}): Promise<LegalRequirement> {
  if (!canWrite(input.actorRole)) throw new Error('You do not have permission to update legal requirements.');

  const updateData: Record<string, unknown> = {
    updated_by_user_id: input.actorUserId,
    updated_at: new Date().toISOString()
  };

  if (typeof input.patch.requirementStandard === 'string') {
    const req = input.patch.requirementStandard.trim();
    if (!req) throw new Error('Requirement/Standard cannot be empty.');
    updateData.requirement_standard = req;
    updateData.requirement = req;
  }
  if (typeof input.patch.applicability !== 'undefined') updateData.applicability = input.patch.applicability?.trim() || null;
  if (typeof input.patch.actionsNeeded !== 'undefined') updateData.actions_needed = input.patch.actionsNeeded?.trim() || null;
   if (typeof input.patch.finding !== 'undefined') updateData.finding = input.patch.finding?.trim() || null;
  if (typeof input.patch.targetDate !== 'undefined') {
    if (input.patch.targetDate) {
      const target = new Date(input.patch.targetDate);
      if (Number.isNaN(target.getTime())) {
        throw new Error('Target date is invalid.');
      }
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const targetOnly = new Date(target.getFullYear(), target.getMonth(), target.getDate());
      if (targetOnly.getTime() < today.getTime()) {
        throw new Error('Target date cannot be in the past.');
      }
    }
    updateData.target_date = input.patch.targetDate || null;
  }
  if (typeof input.patch.complianceStatus !== 'undefined') {
    updateData.compliance_status = input.patch.complianceStatus;
    updateData.status =
      input.patch.complianceStatus === 'COMPLIANT'
        ? 'compliant'
        : input.patch.complianceStatus === 'NON_COMPLIANT'
          ? 'non-compliant'
          : 'in-progress';
  }
  let patchResponsibleUserIdDefined = false;
  let patchResponsibleUserId: UUID | null = null;
  if (typeof input.patch.responsibleUserId !== 'undefined') {
    patchResponsibleUserIdDefined = true;
    patchResponsibleUserId = (input.patch.responsibleUserId ?? null) as UUID | null;
  }
  let patchResponsibleEmployeeIdDefined = false;
  let patchResponsibleEmployeeId: UUID | null = null;
  if (typeof input.patch.responsibleEmployeeId !== 'undefined') {
    patchResponsibleEmployeeIdDefined = true;
    patchResponsibleEmployeeId = (input.patch.responsibleEmployeeId ?? null) as UUID | null;
  }

  if (patchResponsibleEmployeeIdDefined || patchResponsibleUserIdDefined) {
    if (patchResponsibleEmployeeId === null && patchResponsibleUserId === null) {
      updateData.responsible_employee_id = null;
      updateData.responsible_user_id = null;
    } else {
      let responsibleUserId: UUID | null = patchResponsibleUserId;
      let responsibleEmployeeId: UUID | null = patchResponsibleEmployeeId;

      if (responsibleEmployeeId && !responsibleUserId) {
        const { data, error } = await insforge.database
          .from('hr_employees')
          .select('id,user_id')
          .eq('company_id', input.companyId)
          .eq('id', responsibleEmployeeId)
          .maybeSingle();
        if (error) throw new Error(getErrorMessage(error));
        if (data) {
          responsibleEmployeeId = (data as any).id as UUID;
          responsibleUserId = ((data as any).user_id ?? null) as UUID | null;
        }
      } else if (!responsibleEmployeeId && responsibleUserId) {
        const { data, error } = await insforge.database
          .from('hr_employees')
          .select('id,user_id')
          .eq('company_id', input.companyId)
          .eq('user_id', responsibleUserId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw new Error(getErrorMessage(error));
        if (data) {
          responsibleEmployeeId = (data as any).id as UUID;
          responsibleUserId = ((data as any).user_id ?? null) as UUID | null;
        }
      }

      updateData.responsible_employee_id = responsibleEmployeeId ?? null;
      updateData.responsible_user_id = responsibleUserId ?? null;
    }
  }
  if (typeof input.patch.responsibleExternalName !== 'undefined') {
    updateData.responsible_external_name = input.patch.responsibleExternalName?.trim() || null;
  }
  if (typeof input.patch.references !== 'undefined') {
    const refs = asReferences(input.patch.references);
    updateData.references = refs;
    updateData.reference = refs.map((x) => x.referenceText).join('; ') || null;
  }
  if (typeof input.patch.evidenceLinks !== 'undefined') {
    updateData.evidence_links = asEvidenceLinks(input.patch.evidenceLinks);
  }

  const { data, error } = await insforge.database
    .from('legal_requirements')
    .update(updateData)
    .eq('company_id', input.companyId)
    .eq('id', input.requirementId)
    .is('deleted_at', null)
    .select('*')
    .single();

  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update legal requirement.');

  if (typeof input.patch.links !== 'undefined') {
    await upsertLegalRequirementLinks({
      companyId: input.companyId,
      legalRequirementId: input.requirementId,
      actorUserId: input.actorUserId,
      linkSpecs: input.patch.links ?? []
    });
  }

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'legal_requirements.update',
    entityType: 'legal_requirement',
    entityId: input.requirementId,
    metadata: { fields: Object.keys(updateData) }
  });

  const links = typeof input.patch.links !== 'undefined' ? input.patch.links ?? [] : await listLegalRequirementLinks(input.companyId, input.requirementId);

  const requirementWithLinks: LegalRequirement = {
    ...(data as LegalRequirement),
    links
  };

  return requirementWithLinks;
}

export async function softDeleteLegalRequirement(input: {
  companyId: UUID;
  requirementId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole | null;
}): Promise<void> {
  if (!canWrite(input.actorRole)) throw new Error('You do not have permission to delete legal requirements.');

  const { error } = await insforge.database
    .from('legal_requirements')
    .update({ deleted_at: new Date().toISOString(), updated_by_user_id: input.actorUserId, updated_at: new Date().toISOString() })
    .eq('company_id', input.companyId)
    .eq('id', input.requirementId)
    .is('deleted_at', null);
  if (error) throw new Error(getErrorMessage(error));

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'legal_requirements.delete',
    entityType: 'legal_requirement',
    entityId: input.requirementId
  });
}

async function notifyAssignedUser(input: {
  companyId: UUID;
  userId: UUID;
  title: string;
  message: string;
  emailSubject: string;
  emailBody: string;
}): Promise<void> {
  await insforge.database.from('notifications').insert({
    company_id: input.companyId,
    user_id: input.userId,
    title: input.title,
    message: input.message,
    severity: 'medium'
  });

  const { data: profile } = await insforge.database
    .from('user_profiles')
    .select('email')
    .eq('company_id', input.companyId)
    .eq('user_id', input.userId)
    .maybeSingle();
  const email = (profile as any)?.email as string | undefined;
  if (email) {
    await sendTemplatedEmail(email, 'approval_request', {
      itemType: input.emailSubject,
      itemTitle: input.emailBody,
      requesterName: 'Safe Cloud Africa',
      link: '/legal-register'
    }).catch(() => undefined);
  }
}

export async function createLegalUpdate(input: {
  companyId: UUID;
  legalRequirementId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole | null;
  dateAmended?: string | null;
  lawUpdatedDate?: string | null;
  summaryOfChange?: string | null;
  impactOnBusiness?: string | null;
  actionRequired?: string | null;
  responsibleUserId?: UUID | null;
  responsibleExternalName?: string | null;
  deadline?: string | null;
  completionStatus?: LegalUpdateCompletionStatus;
  closureNote?: string | null;
}): Promise<LegalUpdate> {
  if (!canWrite(input.actorRole)) throw new Error('You do not have permission to create legal updates.');

  const payload: Record<string, unknown> = {
    company_id: input.companyId,
    legal_requirement_id: input.legalRequirementId,
    date_amended: input.dateAmended || null,
    law_updated_date: input.lawUpdatedDate || null,
    summary_of_change: input.summaryOfChange?.trim() || null,
    impact_on_business: input.impactOnBusiness?.trim() || null,
    action_required: input.actionRequired?.trim() || null,
    responsible_user_id: input.responsibleUserId || null,
    responsible_external_name: input.responsibleExternalName?.trim() || null,
    deadline: input.deadline || null,
    completion_status: input.completionStatus ?? 'OPEN',
    closure_note: input.closureNote?.trim() || null,
    created_by_user_id: input.actorUserId,
    updated_at: new Date().toISOString()
  };

  if (payload.completion_status === 'CLOSED') {
    payload.closed_at = new Date().toISOString();
    payload.closed_by_user_id = input.actorUserId;
  }

  const { data, error } = await insforge.database.from('legal_updates').insert(payload).select('*').single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create legal update.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'legal_updates.create',
    entityType: 'legal_update',
    entityId: (data as any).id as UUID,
    metadata: { legalRequirementId: input.legalRequirementId }
  });

  if (input.responsibleUserId) {
    await notifyAssignedUser({
      companyId: input.companyId,
      userId: input.responsibleUserId,
      title: 'Legal Update Assigned',
      message: 'A legal update has been assigned to you.',
      emailSubject: 'Legal Update Assigned',
      emailBody: 'A legal update has been assigned to you in Safe Cloud Africa.'
    }).catch(() => undefined);
  }

  return data as LegalUpdate;
}

export async function listLegalUpdates(filters: LegalUpdateFilters): Promise<LegalUpdateListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = insforge.database
    .from('legal_updates')
    .select('*', { count: 'exact' })
    .eq('company_id', filters.companyId)
    .order('deadline', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (filters.legalRequirementId) query = query.eq('legal_requirement_id', filters.legalRequirementId);
  if (filters.completionStatus) query = query.eq('completion_status', filters.completionStatus);
  if (filters.responsibleUserId) query = query.eq('responsible_user_id', filters.responsibleUserId);
  if (filters.deadlineFrom) query = query.gte('deadline', filters.deadlineFrom);
  if (filters.deadlineTo) query = query.lte('deadline', filters.deadlineTo);
  if (filters.overdueOnly) {
    query = query.eq('completion_status', 'OPEN').lt('deadline', new Date().toISOString().slice(0, 10));
  }
  if (filters.requirementSearch?.trim()) {
    const term = filters.requirementSearch.trim();
    const { data: reqMatches, error: reqErr } = await insforge.database
      .from('legal_requirements')
      .select('id')
      .eq('company_id', filters.companyId)
      .is('deleted_at', null)
      .ilike('requirement_standard', `%${term}%`)
      .limit(200);
    if (reqErr) throw new Error(getErrorMessage(reqErr));
    const ids = (reqMatches ?? []).map((row: any) => row.id as UUID);
    if (ids.length === 0) return { rows: [], total: 0, page, pageSize };
    query = query.in('legal_requirement_id', ids);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(getErrorMessage(error));

  const updates = (data ?? []) as LegalUpdate[];
  const requirementIds = [...new Set(updates.map((row) => row.legal_requirement_id).filter(Boolean))];

  const requirementLabelMap = new Map<string, string>();
  if (requirementIds.length > 0) {
    const { data: requirements, error: reqError } = await insforge.database
      .from('legal_requirements')
      .select('id, requirement_standard')
      .eq('company_id', filters.companyId)
      .in('id', requirementIds);
    if (reqError) throw new Error(getErrorMessage(reqError));
    for (const row of requirements ?? []) {
      requirementLabelMap.set((row as any).id as string, String((row as any).requirement_standard ?? ''));
    }
  }

  const rows = updates.map((row) => ({
    ...row,
    requirement_standard: requirementLabelMap.get(row.legal_requirement_id) ?? ''
  }));

  return {
    rows,
    total: count ?? 0,
    page,
    pageSize
  };
}

export async function updateLegalUpdate(input: {
  companyId: UUID;
  updateId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole | null;
  patch: {
    dateAmended?: string | null;
    lawUpdatedDate?: string | null;
    summaryOfChange?: string | null;
    impactOnBusiness?: string | null;
    actionRequired?: string | null;
    responsibleUserId?: UUID | null;
    responsibleExternalName?: string | null;
    deadline?: string | null;
    completionStatus?: LegalUpdateCompletionStatus;
    closureNote?: string | null;
  };
}): Promise<LegalUpdate> {
  if (!canWrite(input.actorRole)) throw new Error('You do not have permission to update legal updates.');

  const patchData: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  };
  if (typeof input.patch.dateAmended !== 'undefined') patchData.date_amended = input.patch.dateAmended;
  if (typeof input.patch.lawUpdatedDate !== 'undefined') patchData.law_updated_date = input.patch.lawUpdatedDate;
  if (typeof input.patch.summaryOfChange !== 'undefined') patchData.summary_of_change = input.patch.summaryOfChange?.trim() || null;
  if (typeof input.patch.impactOnBusiness !== 'undefined') patchData.impact_on_business = input.patch.impactOnBusiness?.trim() || null;
  if (typeof input.patch.actionRequired !== 'undefined') patchData.action_required = input.patch.actionRequired?.trim() || null;
  if (typeof input.patch.responsibleUserId !== 'undefined') patchData.responsible_user_id = input.patch.responsibleUserId;
  if (typeof input.patch.responsibleExternalName !== 'undefined') patchData.responsible_external_name = input.patch.responsibleExternalName?.trim() || null;
  if (typeof input.patch.deadline !== 'undefined') patchData.deadline = input.patch.deadline;
  if (typeof input.patch.completionStatus !== 'undefined') patchData.completion_status = input.patch.completionStatus;
  if (typeof input.patch.closureNote !== 'undefined') patchData.closure_note = input.patch.closureNote?.trim() || null;

  if (patchData.completion_status === 'CLOSED') {
    patchData.closed_at = new Date().toISOString();
    patchData.closed_by_user_id = input.actorUserId;
  }

  const { data, error } = await insforge.database
    .from('legal_updates')
    .update(patchData)
    .eq('company_id', input.companyId)
    .eq('id', input.updateId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update legal update.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'legal_updates.update',
    entityType: 'legal_update',
    entityId: input.updateId,
    metadata: { fields: Object.keys(patchData) }
  });

  return data as LegalUpdate;
}

export async function closeLegalUpdate(input: {
  companyId: UUID;
  updateId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole | null;
  closureNote: string;
}): Promise<LegalUpdate> {
  if (!canCloseUpdates(input.actorRole)) throw new Error('Only owner/admin can close legal updates.');
  const closureNote = input.closureNote.trim();
  if (!closureNote) throw new Error('Closure note is required when closing an update.');

  const { data, error } = await insforge.database
    .from('legal_updates')
    .update({
      completion_status: 'CLOSED',
      closure_note: closureNote,
      closed_at: new Date().toISOString(),
      closed_by_user_id: input.actorUserId,
      updated_at: new Date().toISOString()
    })
    .eq('company_id', input.companyId)
    .eq('id', input.updateId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to close legal update.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'legal_updates.close',
    entityType: 'legal_update',
    entityId: input.updateId
  });

  return data as LegalUpdate;
}

function isDueInDays(deadline: string | null, days: number): boolean {
  if (!deadline) return false;
  const target = new Date(deadline);
  if (Number.isNaN(target.getTime())) return false;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDate = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const diff = Math.floor((targetDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return diff === days;
}

function isOverdue(update: Pick<LegalUpdate, 'completion_status' | 'deadline'>): boolean {
  if (update.completion_status !== 'OPEN' || !update.deadline) return false;
  const now = new Date();
  const deadline = new Date(update.deadline);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate()).getTime();
  return target < today;
}

async function listEscalationRecipients(companyId: UUID, responsibleUserId: UUID | null): Promise<UUID[]> {
  const { data: memberships, error } = await insforge.database
    .from('company_memberships')
    .select('user_id, role')
    .eq('company_id', companyId)
    .in('role', ['supervisor', 'manager', 'admin', 'owner']);
  if (error) throw new Error(getErrorMessage(error));

  const list = memberships ?? [];
  const supervisors = list.filter((m: any) => m.role === 'supervisor').map((m: any) => m.user_id as UUID);
  const admins = list.filter((m: any) => m.role === 'admin' || m.role === 'manager').map((m: any) => m.user_id as UUID);
  const owners = list.filter((m: any) => m.role === 'owner').map((m: any) => m.user_id as UUID);

  const result = new Set<UUID>();
  if (responsibleUserId) result.add(responsibleUserId);
  supervisors.forEach((u) => result.add(u));
  admins.forEach((u) => result.add(u));
  owners.forEach((u) => result.add(u));
  return [...result];
}

export async function runLegalUpdateReminderSweep(companyId: UUID): Promise<void> {
  const openUpdatesResp = await insforge.database
    .from('legal_updates')
    .select('*')
    .eq('company_id', companyId)
    .eq('completion_status', 'OPEN')
    .not('deadline', 'is', null)
    .limit(3000);
  if (openUpdatesResp.error) throw new Error(getErrorMessage(openUpdatesResp.error));

  const updates = (openUpdatesResp.data ?? []) as LegalUpdate[];

  for (const update of updates) {
    const reminderDays = [7, 1, 0];
    for (const days of reminderDays) {
      if (isDueInDays(update.deadline, days) && update.responsible_user_id) {
        await notifyAssignedUser({
          companyId,
          userId: update.responsible_user_id,
          title: days === 0 ? 'Legal Update Deadline Today' : `Legal Update Due in ${days} day${days === 1 ? '' : 's'}`,
          message: days === 0 ? 'A legal update deadline is due today.' : `A legal update deadline is due in ${days} day${days === 1 ? '' : 's'}.`,
          emailSubject: 'Legal Update Reminder',
          emailBody: days === 0 ? 'A legal update deadline is due today.' : `A legal update deadline is due in ${days} day${days === 1 ? '' : 's'}.`
        }).catch(() => undefined);
      }
    }

    if (isOverdue(update)) {
      const recipients = await listEscalationRecipients(companyId, update.responsible_user_id);
      await Promise.all(
        recipients.map((userId) =>
          insforge.database.from('notifications').insert({
            company_id: companyId,
            user_id: userId,
            title: 'Legal Update Overdue',
            message: 'A legal update is overdue and requires escalation.',
            severity: 'high'
          })
        )
      );
    }
  }
}

export function toLegalRequirementsCsv(rows: LegalRequirement[], profiles: UserProfile[]): string {
  const profileMap = new Map(profiles.map((p) => [p.user_id, p.full_name || p.email || p.user_id]));
  const csvRows = rows.map((r) => ({
    requirement_standard: r.requirement_standard,
    references: (r.references ?? []).map((x) => x.referenceText).join(' | '),
    applicability: r.applicability ?? '',
    compliance_status: r.compliance_status,
    actions_needed: r.actions_needed ?? '',
    responsible_person: r.responsible_user_id ? profileMap.get(r.responsible_user_id) ?? r.responsible_user_id : r.responsible_external_name ?? '',
    evidence_titles: (r.evidence_links ?? []).map((x) => x.documentTitleSnapshot).join(' | '),
    created_at: r.created_at,
    updated_at: r.updated_at
  }));

  const headers = Object.keys(csvRows[0] ?? {
    requirement_standard: '',
    references: '',
    applicability: '',
    compliance_status: '',
    actions_needed: '',
    responsible_person: '',
    evidence_titles: '',
    created_at: '',
    updated_at: ''
  });
  const lines = [headers.join(',')];
  for (const row of csvRows) {
    lines.push(headers.map((h) => `"${String((row as any)[h] ?? '').replace(/"/g, '""')}"`).join(','));
  }
  return lines.join('\n');
}

export function toLegalUpdatesCsv(
  rows: Array<LegalUpdate & { requirement_standard?: string }>,
  profiles: UserProfile[]
): string {
  const profileMap = new Map(profiles.map((p) => [p.user_id, p.full_name || p.email || p.user_id]));

  const csvRows = rows.map((r) => ({
    requirement_standard: r.requirement_standard ?? '',
    date_amended: r.date_amended ?? '',
    law_updated_date: r.law_updated_date ?? '',
    summary_of_change: r.summary_of_change ?? '',
    impact_on_business: r.impact_on_business ?? '',
    action_required: r.action_required ?? '',
    responsible_person: r.responsible_user_id ? profileMap.get(r.responsible_user_id) ?? r.responsible_user_id : r.responsible_external_name ?? '',
    deadline: r.deadline ?? '',
    completion_status: r.completion_status,
    closed_at: r.closed_at ?? ''
  }));

  const headers = Object.keys(csvRows[0] ?? {
    requirement_standard: '',
    date_amended: '',
    law_updated_date: '',
    summary_of_change: '',
    impact_on_business: '',
    action_required: '',
    responsible_person: '',
    deadline: '',
    completion_status: '',
    closed_at: ''
  });
  const lines = [headers.join(',')];
  for (const row of csvRows) {
    lines.push(headers.map((h) => `"${String((row as any)[h] ?? '').replace(/"/g, '""')}"`).join(','));
  }
  return lines.join('\n');
}

export function renderLegalRegisterPdfHtml(rows: LegalRequirement[], profileMap: Map<string, string>): string {
  return `
    <html><body>
      <h2>Legal Requirements Register</h2>
      <table border="1" cellspacing="0" cellpadding="6">
        <thead>
          <tr>
            <th>Requirement/Standard</th>
            <th>Reference (Sections)</th>
            <th>Applicability</th>
            <th>Compliance Status</th>
            <th>Responsible Person</th>
            <th>Evidence Titles</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((r) => {
              const responsible = r.responsible_user_id
                ? profileMap.get(r.responsible_user_id) ?? r.responsible_user_id
                : r.responsible_external_name ?? '-';
              return `<tr>
                <td>${r.requirement_standard}</td>
                <td>${(r.references ?? []).map((x) => x.referenceText).join(', ') || '-'}</td>
                <td>${r.applicability ?? '-'}</td>
                <td>${r.compliance_status}</td>
                <td>${responsible}</td>
                <td>${(r.evidence_links ?? []).map((x) => x.documentTitleSnapshot).join(', ') || '-'}</td>
              </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </body></html>
  `;
}

export function renderLegalUpdatesPdfHtml(
  rows: Array<LegalUpdate & { requirement_standard?: string }>,
  profileMap: Map<string, string>
): string {
  return `
    <html><body>
      <h2>Legal Updates Report</h2>
      <table border="1" cellspacing="0" cellpadding="6">
        <thead>
          <tr>
            <th>Requirement/Standard</th>
            <th>Date amended</th>
            <th>Law updated date</th>
            <th>Summary of change</th>
            <th>Impact on business</th>
            <th>Action required</th>
            <th>Responsible person</th>
            <th>Deadline</th>
            <th>Completion status</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((r) => {
              const responsible = r.responsible_user_id
                ? profileMap.get(r.responsible_user_id) ?? r.responsible_user_id
                : r.responsible_external_name ?? '-';
              return `<tr>
                <td>${r.requirement_standard ?? '-'}</td>
                <td>${r.date_amended ?? '-'}</td>
                <td>${r.law_updated_date ?? '-'}</td>
                <td>${r.summary_of_change ?? '-'}</td>
                <td>${r.impact_on_business ?? '-'}</td>
                <td>${r.action_required ?? '-'}</td>
                <td>${responsible}</td>
                <td>${r.deadline ?? '-'}</td>
                <td>${r.completion_status}</td>
              </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </body></html>
  `;
}
