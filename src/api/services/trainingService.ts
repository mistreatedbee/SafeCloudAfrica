import { insforge } from '../insforge/client';
import { withInsforgeSession } from '../insforge/ensureSession';
import type {
  TrainingCourse,
  TrainingRecord,
  TrainingRecordStatus,
  JobDescription,
  JobTrainingRequirement,
  TrainingProvider,
  CourseProviderPrice,
  UUID
} from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';
import { sendTemplatedNotificationEmail } from './emailService';

// ---------------------------------------------------------------------------
// Training courses
// ---------------------------------------------------------------------------

export async function listTrainingCourses(companyId: UUID): Promise<TrainingCourse[]> {
  const { data, error } = await insforge.database
    .from('training_courses')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as TrainingCourse[];
}

export async function createTrainingCourse(input: {
  companyId: UUID;
  name: string;
  description?: string | null;
  validMonths?: number | null;
  unitStandardRequired?: string | null;
  credits?: number | null;
  defaultFrequencyMonths?: number | null;
  defaultValidityMonths?: number | null;
  createdByUserId: UUID;
}): Promise<TrainingCourse> {
  const { data, error } = await insforge.database
    .from('training_courses')
    .insert({
      company_id: input.companyId,
      name: input.name,
      description: input.description ?? null,
      valid_months: input.validMonths ?? null,
      unit_standard_required: input.unitStandardRequired ?? null,
      credits: input.credits ?? null,
      default_frequency_months: input.defaultFrequencyMonths ?? null,
      default_validity_months: input.defaultValidityMonths ?? null
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create training course.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'training_courses.create',
    entityType: 'training_course',
    entityId: (data as { id: UUID }).id
  });

  return data as TrainingCourse;
}

export async function updateTrainingCourse(input: {
  companyId: UUID;
  courseId: UUID;
  name?: string;
  description?: string | null;
  validMonths?: number | null;
  unitStandardRequired?: string | null;
  credits?: number | null;
  defaultFrequencyMonths?: number | null;
  defaultValidityMonths?: number | null;
}): Promise<TrainingCourse> {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  };
  if (input.name !== undefined) payload.name = input.name;
  if (input.description !== undefined) payload.description = input.description;
  if (input.validMonths !== undefined) payload.valid_months = input.validMonths;
  if (input.unitStandardRequired !== undefined) payload.unit_standard_required = input.unitStandardRequired;
  if (input.credits !== undefined) payload.credits = input.credits;
  if (input.defaultFrequencyMonths !== undefined) payload.default_frequency_months = input.defaultFrequencyMonths;
  if (input.defaultValidityMonths !== undefined) payload.default_validity_months = input.defaultValidityMonths;

  const { data, error } = await insforge.database
    .from('training_courses')
    .update(payload)
    .eq('id', input.courseId)
    .eq('company_id', input.companyId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update training course.');
  return data as TrainingCourse;
}

export async function deleteTrainingCourse(input: {
  companyId: UUID;
  courseId: UUID;
  actorUserId: UUID;
}): Promise<void> {
  const { count: linkedRecords, error: recordsError } = await insforge.database
    .from('training_records')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', input.companyId)
    .eq('course_id', input.courseId);
  if (recordsError) throw new Error(getErrorMessage(recordsError));
  if ((linkedRecords ?? 0) > 0) {
    throw new Error('This course cannot be deleted because training records already exist for it.');
  }

  const { count: linkedRequirements, error: reqError } = await insforge.database
    .from('job_training_requirements')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', input.companyId)
    .eq('course_id', input.courseId);
  if (reqError) throw new Error(getErrorMessage(reqError));
  if ((linkedRequirements ?? 0) > 0) {
    throw new Error('This course cannot be deleted because it is linked to job training requirements.');
  }

  const { count: linkedPrices, error: pricesError } = await insforge.database
    .from('course_provider_prices')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', input.companyId)
    .eq('course_id', input.courseId);
  if (pricesError) throw new Error(getErrorMessage(pricesError));
  if ((linkedPrices ?? 0) > 0) {
    throw new Error('This course cannot be deleted because provider pricing is linked to it.');
  }

  const { error } = await insforge.database
    .from('training_courses')
    .delete()
    .eq('company_id', input.companyId)
    .eq('id', input.courseId);
  if (error) throw new Error(getErrorMessage(error));

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'training_courses.delete',
    entityType: 'training_course',
    entityId: input.courseId
  });
}

// ---------------------------------------------------------------------------
// Training records (assignments)
// ---------------------------------------------------------------------------

export type ListTrainingRecordsInput = {
  userId?: UUID;
  employeeId?: UUID;
  status?: TrainingRecordStatus | TrainingRecordStatus[];
  courseId?: UUID;
  jobDescriptionId?: UUID;
  fromDate?: string;
  toDate?: string;
  limit?: number;
};

export async function listTrainingRecords(
  companyId: UUID,
  input?: ListTrainingRecordsInput
): Promise<TrainingRecord[]> {
  let q = insforge.database.from('training_records').select('*').eq('company_id', companyId);
  if (input?.userId) q = q.eq('user_id', input.userId);
  if (input?.employeeId) q = q.eq('employee_id', input.employeeId);
  if (input?.courseId) q = q.eq('course_id', input.courseId);
  if (input?.jobDescriptionId) q = q.eq('job_description_id', input.jobDescriptionId);
  if (input?.status) {
    const statuses = Array.isArray(input.status) ? input.status : [input.status];
    q = q.in('status', statuses);
  }
  if (input?.fromDate) q = q.gte('created_at', input.fromDate);
  if (input?.toDate) q = q.lte('created_at', input.toDate);
  const limit = input?.limit ?? 500;
  const { data, error } = await q.order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as TrainingRecord[];
}

export async function getTrainingRecord(companyId: UUID, recordId: UUID): Promise<TrainingRecord | null> {
  const { data, error } = await insforge.database
    .from('training_records')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', recordId)
    .maybeSingle();
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? null) as TrainingRecord | null;
}

function requireCertForCompleted(
  status: TrainingRecordStatus,
  completedAt: string | null | undefined,
  certificateBucket: string | null | undefined,
  certificateKey: string | null | undefined
): void {
  if (status === 'COMPLETED') {
    if (!completedAt) throw new Error('Completed date is required when marking training as completed.');
    if (!certificateBucket || !certificateKey) {
      throw new Error('Certificate upload is required to mark training as completed.');
    }
  }
}

export async function createTrainingRecord(input: {
  companyId: UUID;
  /** Platform user, when the employee has a linked login. At least one of userId/employeeId is required. */
  userId?: UUID | null;
  /** HR employee -- preferred; works regardless of whether the employee has a login. */
  employeeId?: UUID | null;
  courseId: UUID;
  jobDescriptionId?: UUID | null;
  providerId?: UUID | null;
  providerType?: string | null;
  status?: TrainingRecordStatus;
  arrangedAt?: string | null;
  completedAt?: string | null;
  expiresAt?: string | null;
  certificateBucket?: string | null;
  certificateKey?: string | null;
  cost?: number | null;
  createdByUserId: UUID;
}): Promise<TrainingRecord> {
  return withInsforgeSession('training-records:create', async () => {
  const status = input.status ?? 'REQUIRED';
  requireCertForCompleted(status, input.completedAt, input.certificateBucket, input.certificateKey);
  if (!input.userId && !input.employeeId) {
    throw new Error('An employee must be selected before saving a training record.');
  }

  const row = {
    company_id: input.companyId,
    user_id: input.userId ?? null,
    employee_id: input.employeeId ?? null,
    course_id: input.courseId,
    job_description_id: input.jobDescriptionId ?? null,
    provider_id: input.providerId ?? null,
    provider_type: input.providerType ?? null,
    status,
    arranged_at: input.arrangedAt ?? null,
    completed_at: input.completedAt ?? null,
    expires_at: input.expiresAt ?? null,
    certificate_bucket: input.certificateBucket ?? null,
    certificate_key: input.certificateKey ?? null,
    cost: input.cost ?? null,
    created_by_user_id: input.createdByUserId
  };

  const { data, error } = await insforge.database.from('training_records').insert(row).select('*').single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create training record.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'training_records.create',
    entityType: 'training_record',
    entityId: (data as { id: UUID }).id
  });

  if (input.userId && input.userId !== input.createdByUserId && (status === 'REQUIRED' || status === 'SCHEDULED')) {
    try {
      const { data: profile } = await insforge.database
        .from('user_profiles')
        .select('email')
        .eq('company_id', input.companyId)
        .eq('user_id', input.userId)
        .maybeSingle();
      const email = String((profile as any)?.email ?? '').trim();
      if (email) {
        const { data: course } = await insforge.database
          .from('training_courses')
          .select('name')
          .eq('company_id', input.companyId)
          .eq('id', input.courseId)
          .maybeSingle();
        await sendTemplatedNotificationEmail({
          to: email,
          templateKey: 'training_assigned',
          variables: {
            title: (course as any)?.name ?? 'Training',
            status,
            dueDate: input.arrangedAt ?? undefined,
            findings: input.expiresAt ?? undefined
          },
          actionUrl: '/dashboard/hr/training',
          meta: { companyId: input.companyId, trainingRecordId: (data as { id: UUID }).id }
        });
      }
    } catch (err) {
      console.warn('[training] assignment notification failed', err);
    }
  }

  return data as TrainingRecord;
  });
}

async function notifyTrainingStatusChange(input: {
  companyId: UUID;
  recordId: UUID;
  courseId: UUID;
  traineeUserId: UUID | null;
  actorUserId?: UUID | null;
  status: TrainingRecordStatus;
}): Promise<void> {
  if (!input.traineeUserId) return;
  if (input.actorUserId && input.traineeUserId === input.actorUserId) return;

  const statusLabel =
    input.status === 'COMPLETED'
      ? 'Completed'
      : input.status === 'CANCELLED'
        ? 'Cancelled'
        : input.status === 'EXPIRED'
          ? 'Expired'
          : input.status === 'OVERDUE'
            ? 'Overdue'
            : input.status;

  const { data: course } = await insforge.database
    .from('training_courses')
    .select('name')
    .eq('company_id', input.companyId)
    .eq('id', input.courseId)
    .maybeSingle();
  const courseName = (course as { name?: string } | null)?.name ?? 'Training';

  const { notifyRelevantUsers } = await import('./notificationEventsService');
  await notifyRelevantUsers({
    companyId: input.companyId,
    eventKey: `training-status:${input.recordId}:${input.status}`,
    eventType: 'training_status_changed',
    title: `Training ${statusLabel}`,
    message:
      input.status === 'CANCELLED'
        ? `Your training "${courseName}" has been cancelled.`
        : `Your training "${courseName}" is now ${statusLabel.toLowerCase()}.`,
    recipientUserIds: [input.traineeUserId],
    emailTemplateKey: 'training_assigned',
    emailVariables: { title: courseName, status: statusLabel },
    actionUrl: '/dashboard/hr/training',
    metadata: { itemType: 'training_record', itemId: input.recordId }
  }).catch((err) => console.warn('[training] status-change notification failed', err));
}

export async function updateTrainingRecord(input: {
  companyId: UUID;
  recordId: UUID;
  status?: TrainingRecordStatus;
  jobDescriptionId?: UUID | null;
  providerId?: UUID | null;
  providerType?: string | null;
  arrangedAt?: string | null;
  completedAt?: string | null;
  expiresAt?: string | null;
  certificateBucket?: string | null;
  certificateKey?: string | null;
  cost?: number | null;
  actorUserId?: UUID | null;
}): Promise<TrainingRecord> {
  const existing = await getTrainingRecord(input.companyId, input.recordId);
  if (!existing) throw new Error('Training record not found.');

  const status = input.status ?? existing.status;
  const completedAt = input.completedAt !== undefined ? input.completedAt : existing.completed_at;
  const certificateBucket = input.certificateBucket !== undefined ? input.certificateBucket : existing.certificate_bucket;
  const certificateKey = input.certificateKey !== undefined ? input.certificateKey : existing.certificate_key;

  requireCertForCompleted(status, completedAt, certificateBucket, certificateKey);

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    status
  };
  if (input.jobDescriptionId !== undefined) payload.job_description_id = input.jobDescriptionId;
  if (input.providerId !== undefined) payload.provider_id = input.providerId;
  if (input.providerType !== undefined) payload.provider_type = input.providerType;
  if (input.arrangedAt !== undefined) payload.arranged_at = input.arrangedAt;
  if (input.completedAt !== undefined) payload.completed_at = input.completedAt;
  if (input.expiresAt !== undefined) payload.expires_at = input.expiresAt;
  if (input.certificateBucket !== undefined) payload.certificate_bucket = input.certificateBucket;
  if (input.certificateKey !== undefined) payload.certificate_key = input.certificateKey;
  if (input.cost !== undefined) payload.cost = input.cost;

  const { data, error } = await insforge.database
    .from('training_records')
    .update(payload)
    .eq('id', input.recordId)
    .eq('company_id', input.companyId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update training record.');
  const row = data as TrainingRecord;

  if (status !== existing.status && (status === 'COMPLETED' || status === 'CANCELLED' || status === 'EXPIRED')) {
    await notifyTrainingStatusChange({
      companyId: input.companyId,
      recordId: row.id,
      courseId: row.course_id,
      traineeUserId: row.user_id,
      actorUserId: input.actorUserId,
      status
    });
  }

  return row;
}

export async function cancelTrainingRecord(input: {
  companyId: UUID;
  recordId: UUID;
  actorUserId?: UUID | null;
}): Promise<TrainingRecord> {
  // Soft-delete style: mark as CANCELLED while retaining history
  return updateTrainingRecord({
    companyId: input.companyId,
    recordId: input.recordId,
    status: 'CANCELLED',
    actorUserId: input.actorUserId
  });
}

export async function deleteTrainingRecord(input: {
  companyId: UUID;
  recordId: UUID;
  actorUserId: UUID;
}): Promise<void> {
  const { error } = await insforge.database
    .from('training_records')
    .delete()
    .eq('company_id', input.companyId)
    .eq('id', input.recordId);
  if (error) throw new Error(getErrorMessage(error));

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'training_records.delete',
    entityType: 'training_record',
    entityId: input.recordId
  });
}

export async function countExpiringTraining(companyId: UUID, withinDays = 30): Promise<number> {
  return withInsforgeSession('training:count-expiring', async () => {
  const nowIso = new Date().toISOString();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);
  const { count, error } = await insforge.database
    .from('training_records')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .not('expires_at', 'is', null)
    .gte('expires_at', nowIso)
    .lte('expires_at', cutoff.toISOString());
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
  });
}

export async function countExpiringTrainingForUser(companyId: UUID, userId: UUID, withinDays = 30): Promise<number> {
  return withInsforgeSession('training:count-expiring-for-user', async () => {
  const nowIso = new Date().toISOString();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);
  const { count, error } = await insforge.database
    .from('training_records')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .not('expires_at', 'is', null)
    .gte('expires_at', nowIso)
    .lte('expires_at', cutoff.toISOString());
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
  });
}

// ---------------------------------------------------------------------------
// Job descriptions
// ---------------------------------------------------------------------------

export async function listJobDescriptions(companyId: UUID): Promise<JobDescription[]> {
  const { data, error } = await insforge.database
    .from('job_descriptions')
    .select('*')
    .eq('company_id', companyId)
    .order('title', { ascending: true });
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as JobDescription[];
}

export async function createJobDescription(input: {
  companyId: UUID;
  title: string;
  departmentId?: UUID | null;
}): Promise<JobDescription> {
  const { data, error } = await insforge.database
    .from('job_descriptions')
    .insert({
      company_id: input.companyId,
      title: input.title,
      department_id: input.departmentId ?? null
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create job description.');
  return data as JobDescription;
}

export async function updateJobDescription(input: {
  companyId: UUID;
  jobDescriptionId: UUID;
  title?: string;
  departmentId?: UUID | null;
}): Promise<JobDescription> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) payload.title = input.title;
  if (input.departmentId !== undefined) payload.department_id = input.departmentId;

  const { data, error } = await insforge.database
    .from('job_descriptions')
    .update(payload)
    .eq('id', input.jobDescriptionId)
    .eq('company_id', input.companyId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update job description.');
  return data as JobDescription;
}

// ---------------------------------------------------------------------------
// Job training requirements (matrix)
// ---------------------------------------------------------------------------

export async function listJobTrainingRequirements(companyId: UUID, jobDescriptionId?: UUID): Promise<JobTrainingRequirement[]> {
  let q = insforge.database.from('job_training_requirements').select('*').eq('company_id', companyId);
  if (jobDescriptionId) q = q.eq('job_description_id', jobDescriptionId);
  const { data, error } = await q.order('job_description_id').order('course_id');
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as JobTrainingRequirement[];
}

export async function setJobTrainingRequirements(input: {
  companyId: UUID;
  jobDescriptionId: UUID;
  requirements: { courseId: UUID; frequencyMonths?: number | null; isMandatory?: boolean }[];
}): Promise<void> {
  const { data: existing } = await insforge.database
    .from('job_training_requirements')
    .select('id, course_id')
    .eq('company_id', input.companyId)
    .eq('job_description_id', input.jobDescriptionId);
  const existingCourseIds = new Set((existing ?? []).map((r: { course_id: UUID }) => r.course_id));
  const targetCourseIds = new Set(input.requirements.map((r) => r.courseId));

  for (const req of input.requirements) {
    if (existingCourseIds.has(req.courseId)) {
      await insforge.database
        .from('job_training_requirements')
        .update({
          frequency_months: req.frequencyMonths ?? null,
          is_mandatory: req.isMandatory ?? true,
          updated_at: new Date().toISOString()
        })
        .eq('company_id', input.companyId)
        .eq('job_description_id', input.jobDescriptionId)
        .eq('course_id', req.courseId);
    } else {
      await insforge.database.from('job_training_requirements').insert({
        company_id: input.companyId,
        job_description_id: input.jobDescriptionId,
        course_id: req.courseId,
        frequency_months: req.frequencyMonths ?? null,
        is_mandatory: req.isMandatory ?? true
      });
    }
  }
  for (const courseId of existingCourseIds) {
    if (!targetCourseIds.has(courseId)) {
      await insforge.database
        .from('job_training_requirements')
        .delete()
        .eq('company_id', input.companyId)
        .eq('job_description_id', input.jobDescriptionId)
        .eq('course_id', courseId);
    }
  }
}

// ---------------------------------------------------------------------------
// Training providers
// ---------------------------------------------------------------------------

export async function listTrainingProviders(companyId: UUID): Promise<TrainingProvider[]> {
  const { data, error } = await insforge.database
    .from('training_providers')
    .select('*')
    .eq('company_id', companyId)
    .order('name', { ascending: true });
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as TrainingProvider[];
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeProviderEmail(email: string | null | undefined): string | null {
  const trimmed = (email ?? '').trim();
  if (!trimmed) return null;
  if (!EMAIL_PATTERN.test(trimmed)) throw new Error('Enter a valid email address for the training provider.');
  return trimmed;
}

/** Accepts "example.co.za" or "www.example.co.za" and normalizes to "https://example.co.za". */
function normalizeProviderWebsite(website: string | null | undefined): string | null {
  const trimmed = (website ?? '').trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes('.')) throw new Error('invalid');
    return url.toString();
  } catch {
    throw new Error('Enter a valid website address for the training provider, e.g. example.co.za.');
  }
}

export async function createTrainingProvider(input: {
  companyId: UUID;
  name: string;
  providerType: 'INTERNAL' | 'EXTERNAL';
  contactInfo?: string | null;
  contact?: string | null;
  email?: string | null;
  website?: string | null;
}): Promise<TrainingProvider> {
  const { data, error } = await insforge.database
    .from('training_providers')
    .insert({
      company_id: input.companyId,
      name: input.name,
      provider_type: input.providerType,
      contact_info: input.contactInfo ?? null,
      contact: input.contact ?? null,
      email: normalizeProviderEmail(input.email),
      website: normalizeProviderWebsite(input.website)
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create training provider.');
  return data as TrainingProvider;
}

export async function updateTrainingProvider(input: {
  companyId: UUID;
  providerId: UUID;
  name?: string;
  providerType?: 'INTERNAL' | 'EXTERNAL';
  contactInfo?: string | null;
  contact?: string | null;
  email?: string | null;
  website?: string | null;
}): Promise<TrainingProvider> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) payload.name = input.name;
  if (input.providerType !== undefined) payload.provider_type = input.providerType;
  if (input.contactInfo !== undefined) payload.contact_info = input.contactInfo;
  if (input.contact !== undefined) payload.contact = input.contact;
  if (input.email !== undefined) payload.email = normalizeProviderEmail(input.email);
  if (input.website !== undefined) payload.website = normalizeProviderWebsite(input.website);

  const { data, error } = await insforge.database
    .from('training_providers')
    .update(payload)
    .eq('id', input.providerId)
    .eq('company_id', input.companyId)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update training provider.');
  return data as TrainingProvider;
}

export async function deleteTrainingProvider(input: {
  companyId: UUID;
  providerId: UUID;
  actorUserId: UUID;
}): Promise<void> {
  const { count: linkedRecords, error: recordsError } = await insforge.database
    .from('training_records')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', input.companyId)
    .eq('provider_id', input.providerId);
  if (recordsError) throw new Error(getErrorMessage(recordsError));
  if ((linkedRecords ?? 0) > 0) {
    throw new Error('This provider cannot be deleted because training records already reference it.');
  }

  const { count: linkedPrices, error: pricesError } = await insforge.database
    .from('course_provider_prices')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', input.companyId)
    .eq('provider_id', input.providerId);
  if (pricesError) throw new Error(getErrorMessage(pricesError));
  if ((linkedPrices ?? 0) > 0) {
    throw new Error('This provider cannot be deleted because course pricing is linked to it.');
  }

  const { error } = await insforge.database
    .from('training_providers')
    .delete()
    .eq('company_id', input.companyId)
    .eq('id', input.providerId);
  if (error) throw new Error(getErrorMessage(error));

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'training_providers.delete',
    entityType: 'training_provider',
    entityId: input.providerId
  });
}

// ---------------------------------------------------------------------------
// Course provider prices
// ---------------------------------------------------------------------------

export async function listCourseProviderPrices(
  companyId: UUID,
  filters?: { courseId?: UUID; providerId?: UUID }
): Promise<CourseProviderPrice[]> {
  let q = insforge.database.from('course_provider_prices').select('*').eq('company_id', companyId);
  if (filters?.courseId) q = q.eq('course_id', filters.courseId);
  if (filters?.providerId) q = q.eq('provider_id', filters.providerId);
  const { data, error } = await q.order('course_id').order('provider_id');
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as CourseProviderPrice[];
}

export async function upsertCourseProviderPrice(input: {
  companyId: UUID;
  courseId: UUID;
  providerId: UUID;
  price?: number | null;
  currency?: string;
  notes?: string | null;
}): Promise<CourseProviderPrice> {
  const row = {
    company_id: input.companyId,
    course_id: input.courseId,
    provider_id: input.providerId,
    price: input.price ?? null,
    currency: input.currency ?? 'ZAR',
    notes: input.notes ?? null,
    updated_at: new Date().toISOString()
  };
  const { data, error } = await insforge.database
    .from('course_provider_prices')
    .upsert(row, { onConflict: 'company_id,course_id,provider_id' })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to upsert course provider price.');
  return data as CourseProviderPrice;
}

// ---------------------------------------------------------------------------
// Sync training requirements when employee job is set/changed
// ---------------------------------------------------------------------------

export async function syncTrainingRequirementsForUser(userId: UUID, companyId: UUID): Promise<number> {
  const { data: profile } = await insforge.database
    .from('user_profiles')
    .select('job_description_id')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle();
  const jobDescriptionId = (profile as { job_description_id: UUID | null } | null)?.job_description_id ?? null;
  if (!jobDescriptionId) return 0;

  const { data: requirements } = await insforge.database
    .from('job_training_requirements')
    .select('course_id')
    .eq('company_id', companyId)
    .eq('job_description_id', jobDescriptionId);
  if (!requirements?.length) return 0;

  const { data: existing } = await insforge.database
    .from('training_records')
    .select('course_id')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .in('status', ['REQUIRED', 'SCHEDULED', 'COMPLETED']);
  const existingCourseIds = new Set((existing ?? []).map((r: { course_id: UUID }) => r.course_id));

  let created = 0;
  for (const r of requirements as { course_id: UUID }[]) {
    if (existingCourseIds.has(r.course_id)) continue;
    await insforge.database.from('training_records').insert({
      company_id: companyId,
      user_id: userId,
      course_id: r.course_id,
      job_description_id: jobDescriptionId,
      status: 'REQUIRED',
      created_by_user_id: userId
    });
    created++;
    existingCourseIds.add(r.course_id);
  }
  return created;
}

/**
 * Employee-level equivalent of syncTrainingRequirementsForUser(), for HR employees
 * without a platform login (user_profiles.job_description_id doesn't apply to them).
 * Reads hr_employees.job_description_id instead and creates training_records linked
 * via employee_id. Call this after saving an employee's job description assignment.
 */
export async function syncTrainingRequirementsForEmployee(input: {
  employeeId: UUID;
  companyId: UUID;
  createdByUserId: UUID;
}): Promise<number> {
  const { data: employee } = await insforge.database
    .from('hr_employees')
    .select('job_description_id')
    .eq('company_id', input.companyId)
    .eq('id', input.employeeId)
    .maybeSingle();
  const jobDescriptionId = (employee as { job_description_id: UUID | null } | null)?.job_description_id ?? null;
  if (!jobDescriptionId) return 0;

  const { data: requirements } = await insforge.database
    .from('job_training_requirements')
    .select('course_id')
    .eq('company_id', input.companyId)
    .eq('job_description_id', jobDescriptionId);
  if (!requirements?.length) return 0;

  const { data: existing } = await insforge.database
    .from('training_records')
    .select('course_id')
    .eq('company_id', input.companyId)
    .eq('employee_id', input.employeeId)
    .in('status', ['REQUIRED', 'SCHEDULED', 'COMPLETED']);
  const existingCourseIds = new Set((existing ?? []).map((r: { course_id: UUID }) => r.course_id));

  let created = 0;
  for (const r of requirements as { course_id: UUID }[]) {
    if (existingCourseIds.has(r.course_id)) continue;
    await insforge.database.from('training_records').insert({
      company_id: input.companyId,
      employee_id: input.employeeId,
      course_id: r.course_id,
      job_description_id: jobDescriptionId,
      status: 'REQUIRED',
      created_by_user_id: input.createdByUserId
    });
    created++;
    existingCourseIds.add(r.course_id);
  }
  return created;
}

// ---------------------------------------------------------------------------
// Report aggregates (cost, outstanding, expiring)
// ---------------------------------------------------------------------------

export type TrainingSpendSummary = {
  totalCost: number;
  byCourse: { courseId: UUID; courseName: string; totalCost: number; count: number }[];
  byProvider: { providerId: UUID; providerName: string; totalCost: number; count: number }[];
  byJob: { jobDescriptionId: UUID; jobTitle: string; totalCost: number; count: number }[];
  recordCount: number;
};

export async function getTrainingSpendSummary(
  companyId: UUID,
  options: { fromDate?: string; toDate?: string; departmentId?: UUID | null }
): Promise<TrainingSpendSummary> {
  // Filters on completed_at (when the training actually happened), not created_at (when
  // the DB row was inserted) -- a "spend in this period" report should reflect training
  // dates, not data-entry dates. SCHEDULED records have no completed_at yet so they never
  // match a date range here, which is correct: money isn't "spent" until training happens.
  let q = insforge.database
    .from('training_records')
    .select('id, course_id, provider_id, job_description_id, cost, status, completed_at')
    .eq('company_id', companyId)
    .in('status', ['COMPLETED', 'SCHEDULED'])
    .not('cost', 'is', null);
  if (options.fromDate) q = q.gte('completed_at', options.fromDate);
  if (options.toDate) q = q.lte('completed_at', options.toDate);
  const { data: records, error } = await q;
  if (error) throw new Error(getErrorMessage(error));
  const list = (records ?? []) as { id: UUID; course_id: UUID; provider_id: UUID | null; job_description_id: UUID | null; cost: number }[];

  const courses = await listTrainingCourses(companyId);
  const providers = await listTrainingProviders(companyId);
  const jobs = await listJobDescriptions(companyId);
  const courseById = new Map(courses.map((c) => [c.id, c.name]));
  const providerById = new Map(providers.map((p) => [p.id, p.name]));
  const jobById = new Map(jobs.map((j) => [j.id, j.title]));

  let totalCost = 0;
  const byCourse = new Map<UUID, { totalCost: number; count: number }>();
  const byProvider = new Map<UUID, { totalCost: number; count: number }>();
  const byJob = new Map<UUID, { totalCost: number; count: number }>();

  for (const r of list) {
    const cost = Number(r.cost) || 0;
    totalCost += cost;
    const c = byCourse.get(r.course_id) ?? { totalCost: 0, count: 0 };
    c.totalCost += cost;
    c.count += 1;
    byCourse.set(r.course_id, c);
    if (r.provider_id) {
      const p = byProvider.get(r.provider_id) ?? { totalCost: 0, count: 0 };
      p.totalCost += cost;
      p.count += 1;
      byProvider.set(r.provider_id, p);
    }
    if (r.job_description_id) {
      const j = byJob.get(r.job_description_id) ?? { totalCost: 0, count: 0 };
      j.totalCost += cost;
      j.count += 1;
      byJob.set(r.job_description_id, j);
    }
  }

  return {
    totalCost,
    recordCount: list.length,
    byCourse: Array.from(byCourse.entries()).map(([courseId, v]) => ({
      courseId,
      courseName: courseById.get(courseId) ?? '',
      totalCost: v.totalCost,
      count: v.count
    })),
    byProvider: Array.from(byProvider.entries()).map(([providerId, v]) => ({
      providerId,
      providerName: providerById.get(providerId) ?? '',
      totalCost: v.totalCost,
      count: v.count
    })),
    byJob: Array.from(byJob.entries()).map(([jobDescriptionId, v]) => ({
      jobDescriptionId,
      jobTitle: jobById.get(jobDescriptionId) ?? '',
      totalCost: v.totalCost,
      count: v.count
    }))
  };
}

export type OutstandingReason = 'not_started' | 'expired';
export type OutstandingTrainingRow = TrainingRecord & { outstandingReason: OutstandingReason };

/**
 * "Outstanding" = required training not yet completed (status REQUIRED/OVERDUE, created by
 * syncTrainingRequirementsForEmployee/-ForUser from the job's training matrix) OR training
 * that WAS completed but has since expired. The previous version only looked at
 * REQUIRED/OVERDUE, so a completed-then-expired course never showed up here even though
 * it's exactly the "outstanding" case the client described (expired = needs renewing).
 */
export async function listOutstandingTraining(
  companyId: UUID,
  filters?: { userId?: UUID; employeeId?: UUID }
): Promise<OutstandingTrainingRow[]> {
  const [notStarted, completed] = await Promise.all([
    listTrainingRecords(companyId, {
      userId: filters?.employeeId ? undefined : filters?.userId,
      employeeId: filters?.employeeId,
      status: ['REQUIRED', 'OVERDUE'],
      limit: 500
    }),
    listTrainingRecords(companyId, {
      userId: filters?.employeeId ? undefined : filters?.userId,
      employeeId: filters?.employeeId,
      status: 'COMPLETED',
      limit: 1000
    })
  ]);
  const now = new Date();
  const expired = completed.filter((r) => r.expires_at && new Date(r.expires_at) < now);
  return [
    ...notStarted.map((r) => ({ ...r, outstandingReason: 'not_started' as const })),
    ...expired.map((r) => ({ ...r, outstandingReason: 'expired' as const }))
  ];
}

/** Records with status COMPLETED whose expiry is within the next withinDays (and not yet expired). */
export async function listExpiringSoonTraining(
  companyId: UUID,
  withinDays: number,
  filters?: { userId?: UUID; employeeId?: UUID }
): Promise<TrainingRecord[]> {
  const now = new Date();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);
  const list = await listTrainingRecords(companyId, {
    userId: filters?.employeeId ? undefined : filters?.userId,
    employeeId: filters?.employeeId,
    status: 'COMPLETED',
    limit: 1000
  });
  return list.filter(
    (r) =>
      r.expires_at &&
      new Date(r.expires_at) >= now &&
      new Date(r.expires_at) <= cutoff
  );
}

/** Records that are already expired (expires_at < today), for reporting. */
export async function listExpiredTraining(
  companyId: UUID,
  filters?: { userId?: UUID; employeeId?: UUID }
): Promise<TrainingRecord[]> {
  const list = await listTrainingRecords(companyId, {
    userId: filters?.employeeId ? undefined : filters?.userId,
    employeeId: filters?.employeeId,
    limit: 1000
  });
  const now = new Date();
  return list.filter((r) => r.expires_at && new Date(r.expires_at) < now);
}

export type TrainingComplianceSummary = {
  required: number;
  met: number;
  percent: number;
};

/**
 * Compliance = matrix-driven training_records (REQUIRED/OVERDUE/COMPLETED -- the exact
 * set syncTrainingRequirementsForEmployee/-ForUser writes, one row per required course per
 * employee) vs how many of those are COMPLETED and not yet expired. Matches the client's
 * "compliance should include outstanding training to determine compliance based on expired
 * and outstanding" -- a completed-but-expired row still counts as required, not met.
 */
export async function getTrainingComplianceSummary(companyId: UUID): Promise<TrainingComplianceSummary> {
  const list = await listTrainingRecords(companyId, {
    status: ['REQUIRED', 'OVERDUE', 'COMPLETED'],
    limit: 5000
  });
  const now = new Date();
  const required = list.length;
  const met = list.filter((r) => r.status === 'COMPLETED' && (!r.expires_at || new Date(r.expires_at) >= now)).length;
  const percent = required === 0 ? 100 : Math.round((met / required) * 100);
  return { required, met, percent };
}
