import { insforge } from '../insforge/client';
import type { TrainingCourse, TrainingRecord, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';

export async function listTrainingCourses(companyId: UUID): Promise<TrainingCourse[]> {
  const { data, error } = await insforge.database.from('training_courses').select('*').eq('company_id', companyId).order('created_at', {
    ascending: false
  });
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as TrainingCourse[];
}

export async function listTrainingRecords(companyId: UUID, input?: { userId?: UUID; limit?: number }): Promise<TrainingRecord[]> {
  const base = insforge.database.from('training_records').select('*').eq('company_id', companyId);
  const q = input?.userId ? base.eq('user_id', input.userId) : base;
  const { data, error } = await q.order('completed_at', { ascending: false }).limit(input?.limit ?? 500);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as TrainingRecord[];
}

export async function countExpiringTraining(companyId: UUID, withinDays = 30): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);
  const { count, error } = await insforge.database
    .from('training_records')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .lte('expires_at', cutoff.toISOString());
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
}

export async function countExpiringTrainingForUser(companyId: UUID, userId: UUID, withinDays = 30): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);
  const { count, error } = await insforge.database
    .from('training_records')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .lte('expires_at', cutoff.toISOString());
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
}

export async function createTrainingCourse(input: {
  companyId: UUID;
  name: string;
  description?: string;
  validMonths?: number;
  createdByUserId: UUID;
}): Promise<TrainingCourse> {
  const { data, error } = await insforge.database
    .from('training_courses')
    .insert({
      company_id: input.companyId,
      name: input.name,
      description: input.description ?? null,
      valid_months: input.validMonths ?? null
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
    entityId: (data as any).id as UUID
  });

  return data as TrainingCourse;
}

export async function createTrainingRecord(input: {
  companyId: UUID;
  userId: UUID;
  courseId: UUID;
  completedAt?: string;
  expiresAt?: string | null;
  certificateBucket?: string | null;
  certificateKey?: string | null;
  createdByUserId: UUID;
}): Promise<TrainingRecord> {
  const { data, error } = await insforge.database
    .from('training_records')
    .insert({
      company_id: input.companyId,
      user_id: input.userId,
      course_id: input.courseId,
      completed_at: input.completedAt ?? new Date().toISOString(),
      expires_at: input.expiresAt ?? null,
      certificate_bucket: input.certificateBucket ?? null,
      certificate_key: input.certificateKey ?? null,
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create training record.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'training_records.create',
    entityType: 'training_record',
    entityId: (data as any).id as UUID
  });

  return data as TrainingRecord;
}

