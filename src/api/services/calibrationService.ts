import { insforge } from '../insforge/client';
import { withInsforgeSession } from '../insforge/ensureSession';
import { getErrorMessage } from '../insforge/errors';
import type { CompanyRole, UUID } from '../models/core';
import type {
  CalibrationCriticality,
  CalibrationEquipmentStatus,
  CalibrationModuleTag,
  CalibrationRecord,
  CalibrationResult
} from '../models/entities';
import { createActivityLog } from './activityLogService';
import { createNotification } from './notificationsService';
import { createQualityNcr } from './qualityNcrsService';
import { createEvidence } from './evidenceService';
import { getMyProfile } from './profilesService';

const ALLOWED_MODULE_TAGS: CalibrationModuleTag[] = ['Quality', 'Health', 'Safety', 'Environment', 'General'];
const WRITE_ROLES: CompanyRole[] = ['admin', 'manager', 'supervisor'];
const READ_ONLY_ROLES: CompanyRole[] = ['owner', 'consultant', 'auditor'];

export const CALIBRATION_CRITICALITY_LABELS: Record<CalibrationCriticality, string> = {
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low'
};

export const CALIBRATION_EQUIPMENT_STATUS_LABELS: Record<CalibrationEquipmentStatus, string> = {
  IN_SERVICE: 'In Service',
  OUT_OF_SERVICE: 'Out of Service',
  REQUIRES_ADJUSTMENT_REPAIR: 'Requires Adjustment / Repair'
};

export const CALIBRATION_RESULT_LABELS: Record<CalibrationResult, string> = {
  PASS: 'Pass',
  FAIL: 'Fail'
};

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysDateOnly(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function normalizeDateOnly(value: string): string {
  return value.trim().slice(0, 10);
}

function canWrite(role: CompanyRole | null): boolean {
  return !!role && WRITE_ROLES.includes(role);
}

export function canManageModuleTags(role: CompanyRole | null): boolean {
  return role === 'admin';
}

export function canCreateCalibrationNcr(role: CompanyRole | null): boolean {
  return role === 'admin';
}

export function canDeleteCalibration(role: CompanyRole | null): boolean {
  return role === 'admin';
}

export function canExportCalibration(role: CompanyRole | null): boolean {
  return role === 'admin' || role === 'owner' || role === 'manager' || role === 'supervisor' || role === 'consultant' || role === 'auditor';
}

function normalizeModuleTags(tags?: CalibrationModuleTag[] | null): CalibrationModuleTag[] {
  const source = (tags ?? []).filter((tag): tag is CalibrationModuleTag => ALLOWED_MODULE_TAGS.includes(tag));
  const unique = Array.from(new Set(source));
  return unique.length > 0 ? unique : ['Quality'];
}

function ensureRequired(input: {
  equipmentName: string;
  equipmentId: string;
  location: string;
  calibrationDate: string;
  result: CalibrationResult;
  nextCalibrationDate: string;
  responsibleNameSnapshot: string;
}): void {
  if (!input.equipmentName.trim()) throw new Error('Equipment Name is required.');
  if (!input.equipmentId.trim()) throw new Error('Equipment I.D is required.');
  if (!input.location.trim()) throw new Error('Location is required.');
  if (!input.calibrationDate.trim()) throw new Error('Calibration Date is required.');
  if (!input.nextCalibrationDate.trim()) throw new Error('Next Calibration Date is required.');
  if (!input.responsibleNameSnapshot.trim()) throw new Error('Responsible person is required.');
  if (!['PASS', 'FAIL'].includes(input.result)) throw new Error('Pass/Fail is required.');
}

type MembershipScope = {
  role: CompanyRole | null;
  site_id: UUID | null;
  department_id: UUID | null;
};

async function getMembershipScope(companyId: UUID, userId?: UUID | null): Promise<MembershipScope> {
  if (!userId) return { role: null, site_id: null, department_id: null };
  const { data, error } = await insforge.database
    .from('company_memberships')
    .select('role, site_id, department_id, created_at')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .eq('status', 'ACTIVE')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) return { role: null, site_id: null, department_id: null };
  return {
    role: (data as any).role as CompanyRole,
    site_id: ((data as any).site_id as UUID | null) ?? null,
    department_id: ((data as any).department_id as UUID | null) ?? null
  };
}

function isScopedMatch(record: Pick<CalibrationRecord, 'site_id' | 'department_id'>, membership: MembershipScope): boolean {
  if ((membership.role === 'manager' || membership.role === 'supervisor') && (membership.site_id || membership.department_id)) {
    const siteMatches = !!membership.site_id && membership.site_id === record.site_id;
    const deptMatches = !!membership.department_id && membership.department_id === record.department_id;
    return siteMatches || deptMatches;
  }
  return true;
}

function canViewRecord(
  record: Pick<CalibrationRecord, 'site_id' | 'department_id' | 'responsible_user_id' | 'created_by_user_id'>,
  actorRole: CompanyRole | null,
  actorUserId: UUID,
  membership: MembershipScope
): boolean {
  if (actorRole === 'admin' || actorRole === 'owner') return true;
  if (actorRole === 'manager' || actorRole === 'supervisor') {
    return isScopedMatch(record, membership) || record.responsible_user_id === actorUserId;
  }
  if (actorRole === 'employee') {
    return record.responsible_user_id === actorUserId || record.created_by_user_id === actorUserId;
  }
  if (READ_ONLY_ROLES.includes(actorRole as CompanyRole)) return true;
  return false;
}

async function getOrCreateNextSrNo(companyId: UUID): Promise<number> {
  const nowIso = new Date().toISOString();
  await insforge.database
    .from('calibration_record_counter')
    .upsert({ company_id: companyId, last_number: 0, updated_at: nowIso }, { onConflict: 'company_id' });

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data: current, error: readError } = await insforge.database
      .from('calibration_record_counter')
      .select('last_number')
      .eq('company_id', companyId)
      .single();
    if (readError) throw new Error(getErrorMessage(readError));

    const last = Number((current as any)?.last_number ?? 0);
    const next = last + 1;

    const { data: updated, error: writeError } = await insforge.database
      .from('calibration_record_counter')
      .update({ last_number: next, updated_at: nowIso })
      .eq('company_id', companyId)
      .eq('last_number', last)
      .select('last_number')
      .maybeSingle();

    if (writeError) throw new Error(getErrorMessage(writeError));
    if (updated) return next;
  }

  throw new Error('Unable to allocate calibration serial number. Please retry.');
}

type CalibrationListInput = {
  companyId: UUID;
  actorRole: CompanyRole | null;
  actorUserId: UUID;
  moduleTag?: CalibrationModuleTag;
  calibrationDateFrom?: string;
  calibrationDateTo?: string;
  nextCalibrationDateFrom?: string;
  nextCalibrationDateTo?: string;
  criticality?: CalibrationCriticality;
  equipmentStatus?: CalibrationEquipmentStatus;
  result?: CalibrationResult;
  responsibleUserId?: UUID;
  search?: string;
  limit?: number;
};

export async function listCalibrationRecords(input: CalibrationListInput): Promise<CalibrationRecord[]> {
  return withInsforgeSession('calibration:list-records', async () => {
  let q = insforge.database
    .from('calibration_records')
    .select('*')
    .eq('company_id', input.companyId)
    .order('calibration_date', { ascending: false })
    .order('sr_no', { ascending: false })
    .limit(input.limit ?? 1000);

  if (input.moduleTag) q = q.contains('module_tags', [input.moduleTag]);
  if (input.calibrationDateFrom) q = q.gte('calibration_date', input.calibrationDateFrom);
  if (input.calibrationDateTo) q = q.lte('calibration_date', input.calibrationDateTo);
  if (input.nextCalibrationDateFrom) q = q.gte('next_calibration_date', input.nextCalibrationDateFrom);
  if (input.nextCalibrationDateTo) q = q.lte('next_calibration_date', input.nextCalibrationDateTo);
  if (input.criticality) q = q.eq('criticality', input.criticality);
  if (input.equipmentStatus) q = q.eq('equipment_status', input.equipmentStatus);
  if (input.result) q = q.eq('result', input.result);
  if (input.responsibleUserId) q = q.eq('responsible_user_id', input.responsibleUserId);
  if (input.search?.trim()) {
    const term = input.search.trim();
    q = q.or(`equipment_name.ilike.%${term}%,equipment_id.ilike.%${term}%,location.ilike.%${term}%`);
  }

  const { data, error } = await q;
  if (error) throw new Error(getErrorMessage(error));
  const rows = (data ?? []) as CalibrationRecord[];

  const membership = await getMembershipScope(input.companyId, input.actorUserId);
  return rows.filter((row) => canViewRecord(row, input.actorRole, input.actorUserId, membership));
  });
}

export async function getCalibrationRecord(input: {
  companyId: UUID;
  recordId: UUID;
  actorRole: CompanyRole | null;
  actorUserId: UUID;
}): Promise<CalibrationRecord | null> {
  const { data, error } = await insforge.database
    .from('calibration_records')
    .select('*')
    .eq('company_id', input.companyId)
    .eq('id', input.recordId)
    .maybeSingle();
  if (error) throw new Error(getErrorMessage(error));
  const row = (data as CalibrationRecord | null) ?? null;
  if (!row) return null;

  const membership = await getMembershipScope(input.companyId, input.actorUserId);
  if (!canViewRecord(row, input.actorRole, input.actorUserId, membership)) {
    throw new Error('You do not have access to this calibration record.');
  }

  return row;
}

export async function createCalibrationRecord(input: {
  companyId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole | null;
  equipmentName: string;
  equipmentId: string;
  location: string;
  criticality: CalibrationCriticality;
  equipmentStatus: CalibrationEquipmentStatus;
  measuringRange?: string | null;
  calibrationType?: string | null;
  calibrationFrequency?: string | null;
  calibrationDate: string;
  result: CalibrationResult;
  nextCalibrationDate: string;
  responsibleUserId?: UUID | null;
  responsibleNameSnapshot: string;
  itemPictureFileId?: UUID | null;
  certificateFileIds?: UUID[];
  moduleTags?: CalibrationModuleTag[];
  notes?: string | null;
  failureNotes?: string | null;
  actionRequired?: boolean;
  createNcrOnFailure?: boolean;
}): Promise<CalibrationRecord> {
  if (!canWrite(input.actorRole)) throw new Error('You do not have permission to create calibration records.');

  ensureRequired(input);
  const profile = await getMyProfile(input.companyId, input.actorUserId);
  const srNo = await getOrCreateNextSrNo(input.companyId);
  const moduleTags = canManageModuleTags(input.actorRole) ? normalizeModuleTags(input.moduleTags) : ['Quality'];

  const shouldAutoNcr =
    canCreateCalibrationNcr(input.actorRole) &&
    !!input.createNcrOnFailure &&
    (input.result === 'FAIL' || input.equipmentStatus === 'REQUIRES_ADJUSTMENT_REPAIR');

  let linkedNcrId: UUID | null = null;
  if (shouldAutoNcr) {
    const ncr = await createQualityNcr({
      companyId: input.companyId,
      createdByUserId: input.actorUserId,
      title: `Calibration Failure: ${input.equipmentName.trim()} (${input.equipmentId.trim()})`,
      description: (input.failureNotes ?? input.notes ?? `Calibration result: ${input.result}`).trim(),
      location: input.location.trim(),
      severity: input.criticality === 'HIGH' ? 'high' : input.criticality === 'MEDIUM' ? 'medium' : 'low',
      source_entity_type: 'calibration_record'
    });
    linkedNcrId = ncr.id;
  }

  const { data, error } = await insforge.database
    .from('calibration_records')
    .insert({
      company_id: input.companyId,
      site_id: (profile as any)?.site_id ?? null,
      department_id: (profile as any)?.department_id ?? null,
      sr_no: srNo,
      equipment_name: input.equipmentName.trim(),
      equipment_id: input.equipmentId.trim(),
      location: input.location.trim(),
      criticality: input.criticality,
      equipment_status: input.equipmentStatus,
      measuring_range: input.measuringRange?.trim() || null,
      calibration_type: input.calibrationType?.trim() || null,
      calibration_frequency: input.calibrationFrequency?.trim() || null,
      calibration_date: normalizeDateOnly(input.calibrationDate),
      result: input.result,
      next_calibration_date: normalizeDateOnly(input.nextCalibrationDate),
      responsible_user_id: input.responsibleUserId ?? null,
      responsible_name_snapshot: input.responsibleNameSnapshot.trim(),
      item_picture_file_id: input.itemPictureFileId ?? null,
      certificate_file_ids: input.certificateFileIds ?? [],
      module_tags: moduleTags,
      notes: input.notes?.trim() || null,
      failure_notes: input.failureNotes?.trim() || null,
      action_required: input.actionRequired ?? false,
      linked_ncr_id: linkedNcrId,
      created_by_user_id: input.actorUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create calibration record.');

  const created = data as CalibrationRecord;

  if (linkedNcrId) {
    await insforge.database
      .from('quality_ncrs')
      .update({ source_entity_id: created.id, updated_at: new Date().toISOString() })
      .eq('company_id', input.companyId)
      .eq('id', linkedNcrId);
  }

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'calibration_records.create',
    entityType: 'calibration_record',
    entityId: created.id,
    metadata: {
      srNo: created.sr_no,
      result: created.result,
      equipmentStatus: created.equipment_status,
      nextCalibrationDate: created.next_calibration_date,
      linkedNcrId
    }
  });

  return created;
}

function changedFields(existing: CalibrationRecord, patch: Partial<CalibrationRecord>): string[] {
  const keys = Object.keys(patch) as Array<keyof CalibrationRecord>;
  return keys.filter((k) => JSON.stringify(existing[k]) !== JSON.stringify(patch[k])).map((k) => String(k));
}

export async function updateCalibrationRecord(input: {
  companyId: UUID;
  recordId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole | null;
  patch: Partial<CalibrationRecord>;
  createNcrOnFailure?: boolean;
}): Promise<CalibrationRecord> {
  if (!canWrite(input.actorRole)) throw new Error('You do not have permission to update calibration records.');

  const existing = await getCalibrationRecord({
    companyId: input.companyId,
    recordId: input.recordId,
    actorRole: input.actorRole,
    actorUserId: input.actorUserId
  });
  if (!existing) throw new Error('Calibration record not found.');

  const patch: Partial<CalibrationRecord> = { ...input.patch };
  if (!canManageModuleTags(input.actorRole)) {
    delete patch.module_tags;
  }

  const nextResult = (patch.result ?? existing.result) as CalibrationResult;
  const nextStatus = (patch.equipment_status ?? existing.equipment_status) as CalibrationEquipmentStatus;
  const shouldAutoNcr =
    canCreateCalibrationNcr(input.actorRole) &&
    !!input.createNcrOnFailure &&
    !existing.linked_ncr_id &&
    (nextResult === 'FAIL' || nextStatus === 'REQUIRES_ADJUSTMENT_REPAIR');

  let linkedNcrId = existing.linked_ncr_id;
  if (shouldAutoNcr) {
    const ncr = await createQualityNcr({
      companyId: input.companyId,
      createdByUserId: input.actorUserId,
      title: `Calibration Failure: ${existing.equipment_name} (${existing.equipment_id})`,
      description: String((patch.failure_notes ?? existing.failure_notes ?? patch.notes ?? existing.notes ?? 'Calibration failure detected')).trim(),
      location: String(patch.location ?? existing.location),
      severity:
        (patch.criticality ?? existing.criticality) === 'HIGH'
          ? 'high'
          : (patch.criticality ?? existing.criticality) === 'MEDIUM'
            ? 'medium'
            : 'low',
      source_entity_type: 'calibration_record',
      source_entity_id: existing.id
    });
    linkedNcrId = ncr.id;
    patch.linked_ncr_id = ncr.id;
  }

  const dbPatch: Record<string, unknown> = {
    ...patch,
    updated_at: new Date().toISOString()
  };
  if (typeof dbPatch.calibration_date === 'string') dbPatch.calibration_date = normalizeDateOnly(String(dbPatch.calibration_date));
  if (typeof dbPatch.next_calibration_date === 'string') dbPatch.next_calibration_date = normalizeDateOnly(String(dbPatch.next_calibration_date));
  if (Array.isArray(dbPatch.module_tags)) dbPatch.module_tags = normalizeModuleTags(dbPatch.module_tags as CalibrationModuleTag[]);

  const { data, error } = await insforge.database
    .from('calibration_records')
    .update(dbPatch)
    .eq('company_id', input.companyId)
    .eq('id', input.recordId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update calibration record.');

  const updated = data as CalibrationRecord;

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'calibration_records.update',
    entityType: 'calibration_record',
    entityId: updated.id,
    metadata: {
      changedFields: changedFields(existing, patch),
      resultFrom: existing.result,
      resultTo: updated.result,
      equipmentStatusFrom: existing.equipment_status,
      equipmentStatusTo: updated.equipment_status,
      nextCalibrationDateFrom: existing.next_calibration_date,
      nextCalibrationDateTo: updated.next_calibration_date,
      certificateCountFrom: existing.certificate_file_ids?.length ?? 0,
      certificateCountTo: updated.certificate_file_ids?.length ?? 0,
      linkedNcrId
    }
  });

  return updated;
}

export async function deleteCalibrationRecord(input: {
  companyId: UUID;
  recordId: UUID;
  actorUserId: UUID;
  actorRole: CompanyRole | null;
}): Promise<void> {
  if (!canDeleteCalibration(input.actorRole)) throw new Error('Only admin can delete calibration records.');

  const existing = await getCalibrationRecord({
    companyId: input.companyId,
    recordId: input.recordId,
    actorRole: input.actorRole,
    actorUserId: input.actorUserId
  });
  if (!existing) throw new Error('Calibration record not found.');

  const { error } = await insforge.database
    .from('calibration_records')
    .delete()
    .eq('company_id', input.companyId)
    .eq('id', input.recordId);
  if (error) throw new Error(getErrorMessage(error));

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'calibration_records.delete',
    entityType: 'calibration_record',
    entityId: input.recordId,
    metadata: { srNo: existing.sr_no, equipmentName: existing.equipment_name }
  });
}

export async function getCalibrationSummary(input: {
  companyId: UUID;
  actorRole: CompanyRole | null;
  actorUserId: UUID;
  moduleTag?: CalibrationModuleTag;
}): Promise<{
  dueIn30Days: number;
  overdue: number;
  failedLast90Days: number;
  outOfServiceItems: number;
  highCriticalityOverdue: number;
}> {
  const rows = await listCalibrationRecords({
    companyId: input.companyId,
    actorRole: input.actorRole,
    actorUserId: input.actorUserId,
    moduleTag: input.moduleTag,
    limit: 5000
  });

  const today = todayDateOnly();
  const in30 = addDaysDateOnly(30);
  const last90 = addDaysDateOnly(-90);

  return {
    dueIn30Days: rows.filter((row) => row.next_calibration_date >= today && row.next_calibration_date <= in30).length,
    overdue: rows.filter((row) => row.next_calibration_date < today).length,
    failedLast90Days: rows.filter((row) => row.result === 'FAIL' && row.calibration_date >= last90).length,
    outOfServiceItems: rows.filter((row) => row.equipment_status === 'OUT_OF_SERVICE').length,
    highCriticalityOverdue: rows.filter((row) => row.criticality === 'HIGH' && row.next_calibration_date < today).length
  };
}

export async function listCalibrationResponsiblePeople(companyId: UUID): Promise<Array<{ userId: UUID; role: CompanyRole; displayName: string }>> {
  return withInsforgeSession('calibration:list-responsible-people', async () => {
  const { data: memberships, error: membersErr } = await insforge.database
    .from('company_memberships')
    .select('user_id, role')
    .eq('company_id', companyId)
    .eq('status', 'ACTIVE');
  if (membersErr) throw new Error(getErrorMessage(membersErr));

  const userIds = [...new Set((memberships ?? []).map((m: any) => m.user_id as UUID).filter(Boolean))];
  if (userIds.length === 0) return [];

  const { data: profiles, error: profileErr } = await insforge.database
    .from('user_profiles')
    .select('user_id, full_name, email')
    .eq('company_id', companyId)
    .in('user_id', userIds);
  if (profileErr) throw new Error(getErrorMessage(profileErr));

  const profileMap = new Map<string, { full_name: string | null; email: string | null }>();
  for (const profile of profiles ?? []) {
    profileMap.set((profile as any).user_id as string, {
      full_name: ((profile as any).full_name as string | null) ?? null,
      email: ((profile as any).email as string | null) ?? null
    });
  }

  return (memberships ?? []).map((member: any) => {
    const userId = member.user_id as UUID;
    const profile = profileMap.get(userId);
    const displayName =
      profile?.full_name?.trim() ||
      profile?.email?.trim() ||
      String(userId).slice(0, 8);
    return {
      userId,
      role: member.role as CompanyRole,
      displayName
    };
  });
  });
}

async function markReminderAsSent(input: {
  companyId: UUID;
  recordId: UUID;
  reminderType: string;
  reminderKey: string;
}): Promise<boolean> {
  const { error } = await insforge.database.from('calibration_reminder_sent').insert({
    company_id: input.companyId,
    calibration_record_id: input.recordId,
    reminder_type: input.reminderType,
    reminder_key: input.reminderKey
  });

  if (!error) return true;
  if ((error as any).code === '23505') return false;
  throw new Error(getErrorMessage(error));
}

async function listRoleUserIds(companyId: UUID, roles: CompanyRole[]): Promise<UUID[]> {
  const { data, error } = await insforge.database
    .from('company_memberships')
    .select('user_id')
    .eq('company_id', companyId)
    .eq('status', 'ACTIVE')
    .in('role', roles);
  if (error) throw new Error(getErrorMessage(error));
  return [...new Set((data ?? []).map((row: any) => row.user_id as UUID).filter(Boolean))];
}

async function notifyUsers(input: {
  companyId: UUID;
  userIds: UUID[];
  type: 'info' | 'warning' | 'error';
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const unique = [...new Set(input.userIds)];
  await Promise.all(
    unique.map((userId) =>
      createNotification(input.companyId, userId, input.type, input.title, input.message, input.metadata).catch(() => undefined)
    )
  );
}

function daysUntil(dateText: string): number {
  const today = new Date(todayDateOnly());
  const target = new Date(dateText);
  return Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export async function runCalibrationReminderSweep(companyId: UUID): Promise<{
  remindersSent: number;
  escalationsSent: number;
  highCriticalEscalations: number;
}> {
  const today = todayDateOnly();
  const in30 = addDaysDateOnly(30);

  const { data, error } = await insforge.database
    .from('calibration_records')
    .select('*')
    .eq('company_id', companyId)
    .lte('next_calibration_date', in30)
    .limit(5000);
  if (error) throw new Error(getErrorMessage(error));

  const rows = (data ?? []) as CalibrationRecord[];
  const adminIds = await listRoleUserIds(companyId, ['admin']);
  const escalationIds = await listRoleUserIds(companyId, ['manager', 'supervisor']);

  let remindersSent = 0;
  let escalationsSent = 0;
  let highCriticalEscalations = 0;

  for (const row of rows) {
    const dueInDays = daysUntil(row.next_calibration_date);
    const dueRecipientIds = [...adminIds, ...(row.responsible_user_id ? [row.responsible_user_id] : [])];

    if ((OVERDUE_REMINDER_DAYS as readonly number[]).includes(dueInDays)) {
      const reminderKey = `DUE_${dueInDays}_${row.next_calibration_date}`;
      const shouldSend = await markReminderAsSent({
        companyId,
        recordId: row.id,
        reminderType: 'due',
        reminderKey
      });

      if (shouldSend) {
        await notifyUsers({
          companyId,
          userIds: dueRecipientIds,
          type: dueInDays === 30 ? 'info' : dueInDays === 7 ? 'warning' : 'error',
          title: dueInDays === 0 ? 'Calibration Due Today' : `Calibration Due in ${dueInDays} Day(s)`,
          message: `${row.equipment_name} (${row.equipment_id}) calibration is due on ${row.next_calibration_date}.`,
          metadata: { calibrationRecordId: row.id, daysRemaining: dueInDays }
        });
        remindersSent += 1;
      }
    }

    if (row.next_calibration_date < today && dueInDays <= -7) {
      const reminderKey = `OVERDUE7_${row.next_calibration_date}`;
      const shouldEscalate = await markReminderAsSent({
        companyId,
        recordId: row.id,
        reminderType: 'overdue_escalation',
        reminderKey
      });
      if (shouldEscalate) {
        await notifyUsers({
          companyId,
          userIds: [...escalationIds, ...adminIds],
          type: 'warning',
          title: 'Calibration Overdue Escalation',
          message: `${row.equipment_name} (${row.equipment_id}) has been overdue for ${Math.abs(dueInDays)} days.`,
          metadata: { calibrationRecordId: row.id, overdueDays: Math.abs(dueInDays) }
        });
        escalationsSent += 1;
      }
    }

    if (row.criticality === 'HIGH' && row.next_calibration_date < today) {
      const reminderKey = `HIGH_OVERDUE_${row.next_calibration_date}`;
      const shouldEscalateHigh = await markReminderAsSent({
        companyId,
        recordId: row.id,
        reminderType: 'high_criticality_overdue',
        reminderKey
      });

      if (shouldEscalateHigh) {
        await notifyUsers({
          companyId,
          userIds: [...escalationIds, ...adminIds, ...(row.responsible_user_id ? [row.responsible_user_id] : [])],
          type: 'error',
          title: 'High-Criticality Calibration Overdue',
          message: `${row.equipment_name} (${row.equipment_id}) is HIGH criticality and overdue calibration. Immediate action required.`,
          metadata: {
            calibrationRecordId: row.id,
            dashboardHighlight: true,
            criticality: row.criticality
          }
        });
        highCriticalEscalations += 1;
      }
    }
  }

  return {
    remindersSent,
    escalationsSent,
    highCriticalEscalations
  };
}

const EVIDENCE_BUCKET: string =
  typeof import.meta !== 'undefined' && (import.meta as Record<string, unknown>).env
    ? ((import.meta as { env: Record<string, string> }).env.VITE_EVIDENCE_BUCKET ?? 'sca-evidence')
    : 'sca-evidence';

/** @deprecated use EVIDENCE_BUCKET */
const CALIBRATION_EVIDENCE_BUCKET = EVIDENCE_BUCKET;

const OVERDUE_REMINDER_DAYS = [30, 7, 0] as const;

export async function uploadCalibrationAttachments(input: {
  companyId: UUID;
  recordId: UUID;
  actorUserId: UUID;
  itemPictureFile?: File | null;
  certificateFiles?: File[];
}): Promise<CalibrationRecord> {
  const existing = await getCalibrationRecord({
    companyId: input.companyId,
    recordId: input.recordId,
    actorRole: 'admin',
    actorUserId: input.actorUserId
  });
  if (!existing) throw new Error('Calibration record not found.');

  let itemPictureFileId = existing.item_picture_file_id;
  const certificateFileIds = [...(existing.certificate_file_ids ?? [])];

  if (input.itemPictureFile) {
    const key = `${input.companyId}/calibration_record/${input.recordId}/item-picture-${Date.now()}-${input.itemPictureFile.name}`.replace(/\s+/g, '_');
    const { data, error } = await insforge.storage.from(CALIBRATION_EVIDENCE_BUCKET).upload(key, input.itemPictureFile);
    if (error) throw new Error(getErrorMessage(error));

    const evidence = await createEvidence({
      companyId: input.companyId,
      entityType: 'calibration_record',
      entityId: input.recordId,
      storageBucket: CALIBRATION_EVIDENCE_BUCKET,
      storageKey: (data as any)?.path ?? key,
      createdByUserId: input.actorUserId,
      originalFilename: input.itemPictureFile.name,
      displayTitle: 'Item Picture',
      fileKind: 'item_picture'
    });
    itemPictureFileId = evidence.id;
  }

  for (const file of input.certificateFiles ?? []) {
    const key = `${input.companyId}/calibration_record/${input.recordId}/certificate-${Date.now()}-${file.name}`.replace(/\s+/g, '_');
    const { data, error } = await insforge.storage.from(CALIBRATION_EVIDENCE_BUCKET).upload(key, file);
    if (error) throw new Error(getErrorMessage(error));

    const evidence = await createEvidence({
      companyId: input.companyId,
      entityType: 'calibration_record',
      entityId: input.recordId,
      storageBucket: CALIBRATION_EVIDENCE_BUCKET,
      storageKey: (data as any)?.path ?? key,
      createdByUserId: input.actorUserId,
      originalFilename: file.name,
      displayTitle: `Calibration Certificate: ${file.name}`,
      fileKind: 'certificate'
    });

    certificateFileIds.push(evidence.id);
  }

  const { data: updated, error: updateError } = await insforge.database
    .from('calibration_records')
    .update({
      item_picture_file_id: itemPictureFileId,
      certificate_file_ids: [...new Set(certificateFileIds)],
      updated_at: new Date().toISOString()
    })
    .eq('company_id', input.companyId)
    .eq('id', input.recordId)
    .select('*')
    .single();
  if (updateError) throw new Error(getErrorMessage(updateError));
  if (!updated) throw new Error('Failed to update attachments.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'calibration_records.attachments.update',
    entityType: 'calibration_record',
    entityId: input.recordId,
    metadata: {
      itemPictureFileId,
      certificateFileCount: certificateFileIds.length
    }
  });

  return updated as CalibrationRecord;
}
