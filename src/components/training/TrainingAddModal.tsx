import React, { useEffect, useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import { toUserFacingError } from '../../utils/userFacingMessage';
import type { TrainingCourse, TrainingProvider, TrainingRecord, UUID } from '../../api/models/entities';
import { createTrainingCourse, createTrainingRecord, updateTrainingRecord, listTrainingProviders } from '../../api/services/trainingService';
import { uploadFile, type StorageBucket } from '../../api/services/storageService';
import { HrEmployeeSelect } from '../ui/HrEmployeeSelect';
import { useAsync } from '../../api/hooks/useAsync';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';

export const TRAINING_CERT_BUCKET = 'sca-training-certificates';

export function TrainingAddModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  createdByUserId: UUID;
  // If set, employee-style: only add for self
  defaultUserId?: UUID;
  courses: TrainingCourse[];
  onAdded?: () => void;
  /** When set, the modal edits this existing record instead of creating a new one. */
  editRecord?: TrainingRecord | null;
  /** Resolved display name for editRecord's employee/user (the Employee field is locked in edit mode). */
  editRecordEmployeeLabel?: string;
}) {
  const isEditing = !!props.editRecord;
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [courseId, setCourseId] = useState<string>('');
  const [newCourseName, setNewCourseName] = useState('');
  const [newCourseValidMonths, setNewCourseValidMonths] = useState<string>('12');
  const [userId, setUserId] = useState(props.defaultUserId ?? '');
  const [employeeId, setEmployeeId] = useState('');
  const [providerId, setProviderId] = useState('');
  const [jobDescriptionId, setJobDescriptionId] = useState<string>('');
  const [jobDescriptionLabel, setJobDescriptionLabel] = useState<string>('');
  const [completedAt, setCompletedAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [cost, setCost] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [employeeNameSnapshot, setEmployeeNameSnapshot] = useState<string>('');

  const { data: providers } = useAsync<TrainingProvider[]>(
    () => (props.companyId ? listTrainingProviders(props.companyId) : Promise.resolve([])),
    [props.companyId]
  );

  type TrainingAddDraftPayload = {
    mode: 'existing' | 'new';
    courseId: string;
    newCourseName: string;
    newCourseValidMonths: string;
    userId: string;
    employeeId: string;
    providerId: string;
    jobDescriptionId: string;
    jobDescriptionLabel: string;
    completedAt: string;
    expiresAt: string;
    cost: string;
    employeeNameSnapshot: string;
  };

  const { restoreDraft, clearDraft } = useDraftManager();
  const draftKey = `training-add:${props.companyId}:${props.createdByUserId}`;

  const hasDirtyDraft = useMemo(() => {
    const targetDirty = !props.defaultUserId ? userId.trim().length > 0 || employeeId.trim().length > 0 : false;
    const courseDirty = mode === 'existing' ? courseId.trim().length > 0 : newCourseName.trim().length > 2;
    const datesDirty = !!completedAt.trim() || !!expiresAt.trim() || !!cost.trim();
    return targetDirty || courseDirty || datesDirty;
  }, [completedAt, cost, courseId, employeeId, expiresAt, mode, newCourseName, props.defaultUserId, userId]);

  useDraftRegistration({
    key: draftKey,
    enabled: props.open && !isEditing,
    isDirty: () => hasDirtyDraft,
    serialize: () =>
      ({
        mode,
        courseId,
        newCourseName,
        newCourseValidMonths,
        userId,
        employeeId,
        providerId,
        jobDescriptionId,
        jobDescriptionLabel,
        completedAt,
        expiresAt,
        cost,
        employeeNameSnapshot
      }) satisfies TrainingAddDraftPayload
  });

  useEffect(() => {
    if (!props.open) return;
    if (props.editRecord) {
      const rec = props.editRecord;
      setMode('existing');
      setCourseId(rec.course_id ?? '');
      setNewCourseName('');
      setNewCourseValidMonths('12');
      setUserId(rec.user_id ?? '');
      setEmployeeId(rec.employee_id ?? '');
      setProviderId(rec.provider_id ?? '');
      setJobDescriptionId(rec.job_description_id ?? '');
      setJobDescriptionLabel('');
      setCompletedAt(rec.completed_at ? rec.completed_at.slice(0, 10) : '');
      setExpiresAt(rec.expires_at ? rec.expires_at.slice(0, 10) : '');
      setCost(rec.cost != null ? String(rec.cost) : '');
      setEmployeeNameSnapshot('');
      setFile(null);
      setError(null);
      return;
    }
    const restored = restoreDraft<TrainingAddDraftPayload>(draftKey);
    if (!restored) {
      setMode('existing');
      setCourseId('');
      setNewCourseName('');
      setNewCourseValidMonths('12');
      setUserId(props.defaultUserId ?? '');
      setEmployeeId('');
      setProviderId('');
      setJobDescriptionId('');
      setJobDescriptionLabel('');
      setCompletedAt('');
      setExpiresAt('');
      setEmployeeNameSnapshot('');
      setFile(null);
      setError(null);
      return;
    }

    setMode(restored.mode ?? 'existing');
    setCourseId(restored.courseId ?? '');
    setNewCourseName(restored.newCourseName ?? '');
    setNewCourseValidMonths(restored.newCourseValidMonths ?? '12');
    setUserId(restored.userId ?? '');
    setEmployeeId(restored.employeeId ?? '');
    setProviderId(restored.providerId ?? '');
    setJobDescriptionId(restored.jobDescriptionId ?? '');
    setJobDescriptionLabel(restored.jobDescriptionLabel ?? '');
    setCompletedAt(restored.completedAt ?? '');
    setExpiresAt(restored.expiresAt ?? '');
    setCost(restored.cost ?? '');
    setEmployeeNameSnapshot(restored.employeeNameSnapshot ?? '');
    setFile(null);
    setError(null);
    // Note: we cannot restore the selected File certificate.
  }, [draftKey, props.defaultUserId, props.editRecord, props.open, restoreDraft]);

  const closeWithDraftClear = () => {
    clearDraft(draftKey);
    props.onClose();
  };

  const canSubmit = useMemo(() => {
    if (!userId && !employeeId) return false;
    if (mode === 'existing') return !!courseId;
    return newCourseName.trim().length > 2;
  }, [courseId, employeeId, mode, newCourseName, userId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      setLoading(true);
      let finalCourseId = courseId;
      if (mode === 'new') {
        const months = newCourseValidMonths ? Number(newCourseValidMonths) : null;
        const course = await createTrainingCourse({
          companyId: props.companyId,
          name: newCourseName.trim(),
          validMonths: Number.isFinite(months as number) ? (months as number) : undefined,
          createdByUserId: props.createdByUserId
        });
        finalCourseId = course.id;
      }

      // Only set when a NEW file was chosen -- undefined (not null) tells
      // updateTrainingRecord to leave the existing certificate untouched.
      let certificateBucket: StorageBucket | null | undefined;
      let certificateKey: string | null | undefined;
      if (file) {
        // Basic client-side file type validation for certificates
        const allowedExtensions = ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg'];
        const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
        if (!allowedExtensions.includes(ext)) {
          setError('Unsupported certificate file type. Please upload PDF, DOCX, or image formats.');
          return;
        }
        certificateBucket = TRAINING_CERT_BUCKET;
        const key = `${props.companyId}/${userId || employeeId}/${Date.now()}-${file.name}`.replace(/\s+/g, '_');
        // Route through the shared uploadFile() helper (not a raw insforge.storage call) so this
        // upload gets the same proactive session refresh every other upload in the app already
        // gets — a direct SDK call here could silently 401 on a stale session (this is what was
        // causing "Request failed" on the training certificate upload).
        const uploadResult = await uploadFile(certificateBucket, file, { key });
        certificateKey = uploadResult.key;
      }

      if (isEditing && props.editRecord) {
        const hasCert = !!(certificateKey || props.editRecord.certificate_key);
        const hasCompleted = !!(completedAt && hasCert);
        await updateTrainingRecord({
          companyId: props.companyId,
          recordId: props.editRecord.id,
          courseId: finalCourseId as UUID,
          jobDescriptionId: jobDescriptionId ? (jobDescriptionId as UUID) : null,
          providerId: providerId ? (providerId as UUID) : null,
          status: hasCompleted ? 'COMPLETED' : undefined,
          completedAt: completedAt ? new Date(completedAt).toISOString() : null,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          certificateBucket,
          certificateKey,
          cost: cost.trim() ? Number(cost) : null,
          actorUserId: props.createdByUserId
        });
      } else {
        const hasCompleted = !!(completedAt && certificateBucket && certificateKey);
        await createTrainingRecord({
          companyId: props.companyId,
          userId: userId ? (userId as UUID) : null,
          employeeId: employeeId ? (employeeId as UUID) : null,
          courseId: finalCourseId as UUID,
          jobDescriptionId: jobDescriptionId ? (jobDescriptionId as UUID) : null,
          providerId: providerId ? (providerId as UUID) : null,
          status: hasCompleted ? 'COMPLETED' : 'REQUIRED',
          completedAt: completedAt ? new Date(completedAt).toISOString() : null,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          certificateBucket: certificateBucket ?? null,
          certificateKey: certificateKey ?? null,
          cost: cost.trim() ? Number(cost) : null,
          createdByUserId: props.createdByUserId
        });
      }

      props.onAdded?.();
      clearDraft(draftKey);
      props.onClose();
      setCourseId('');
      setNewCourseName('');
      // Deliberately not resetting userId/employeeId/employeeNameSnapshot/jobDescriptionId
      // here (same as before employee_id existed) -- lets the same employee stay selected
      // for adding multiple training records in a row. Provider does reset since it's more
      // often course-specific than employee-specific.
      setProviderId('');
      setCompletedAt('');
      setExpiresAt('');
      setCost('');
      setFile(null);
      setError(null);
    } catch (err: any) {
      console.error('Training record create error:', {
        message: err?.message,
        status: err?.statusCode ?? err?.status,
        cause: err?.cause,
        stack: err?.stack,
        payload: {
          companyId: props.companyId,
          userId: userId || null,
          employeeId: employeeId || null,
          courseId: courseId || null,
          providerId: providerId || null,
          jobDescriptionId: jobDescriptionId || null,
          completedAt: completedAt || null,
          expiresAt: expiresAt || null,
          cost: cost || null
        }
      });
      setError(toUserFacingError(err, formatAuthError(err)));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!props.open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeWithDraftClear();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  // closeWithDraftClear is stable (no deps), safe to omit from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open]);

  if (!props.open) return null;

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={closeWithDraftClear} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90dvh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <div>
            <p className="text-sm font-semibold text-charcoal">{isEditing ? 'Edit training record' : 'Add training record'}</p>
            <p className="text-xs text-charcoal-500 mt-0.5">
              {isEditing
                ? 'Update this training record, e.g. to renew an expiring certificate.'
                : 'Creates a real training record in your company workspace.'}
            </p>
          </div>
          <button
            type="button"
            onClick={closeWithDraftClear}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-surface-100 text-charcoal-500 shrink-0"
            aria-label="Close"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-critical">{isEditing ? 'Could not update training' : 'Could not add training'}</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          {isEditing && (
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Employee</label>
              <div className="bg-surface-50 border border-surface-200 rounded-xl px-4 py-2.5 text-sm text-charcoal-600">
                {props.editRecordEmployeeLabel || 'Employee'}
              </div>
              <p className="mt-1 text-xs text-charcoal-500">Employee cannot be changed on an existing record.</p>
            </div>
          )}

          {!props.defaultUserId && !isEditing && (
            <div>
              <HrEmployeeSelect
                companyId={props.companyId}
                value={employeeId as UUID | ''}
                valueField="id"
                includeUnlinked
                onChange={(selectedEmployeeId, meta) => {
                  setEmployeeId(selectedEmployeeId || '');
                  setUserId(meta.userId ?? '');
                  setEmployeeNameSnapshot(meta.nameSnapshot);
                }}
                onEmployeeChange={(employee) => {
                  // Job description auto-derives from the selected employee's linked
                  // Training Matrix job description, rather than a separate manual picker --
                  // this is what feeds the "By job description" cost breakdown on the
                  // Reports & Costs tab, so a record without an employee that has a linked
                  // job description will still show under "Unknown" there rather than
                  // silently disappearing.
                  setJobDescriptionId(employee?.job_description_id ?? '');
                  setJobDescriptionLabel(employee?.job_title ?? '');
                }}
                label="Employee"
                placeholder="Search HR employees..."
              />
              {employeeNameSnapshot && (
                <p className="text-xs text-charcoal-500 mt-1">
                  Recording training for: {employeeNameSnapshot}
                  {jobDescriptionLabel ? ` (${jobDescriptionLabel})` : ''}
                </p>
              )}
            </div>
          )}

          {props.defaultUserId && (
            <div className="bg-surface-50 border border-surface-200 rounded-xl p-3">
              <p className="text-sm text-charcoal-600">
                Recording training for your own profile.
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('existing')}
              className={`px-3 py-2 rounded-lg text-sm font-semibold border ${mode === 'existing' ? 'bg-teal-50 border-teal text-teal' : 'bg-white border-surface-300 text-charcoal-600'}`}
            >
              Existing course
            </button>
            <button
              type="button"
              onClick={() => setMode('new')}
              className={`px-3 py-2 rounded-lg text-sm font-semibold border ${mode === 'new' ? 'bg-teal-50 border-teal text-teal' : 'bg-white border-surface-300 text-charcoal-600'}`}
            >
              New course
            </button>
          </div>

          {mode === 'existing' ? (
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Course</label>
              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="">Select a course</option>
                {props.courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Course name</label>
                <input
                  value={newCourseName}
                  onChange={(e) => setNewCourseName(e.target.value)}
                  placeholder="e.g. First Aid Level 1"
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Validity (months)</label>
                <input
                  type="number"
                  min={0}
                  value={newCourseValidMonths}
                  onChange={(e) => setNewCourseValidMonths(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Provider (optional)</label>
            <select
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            >
              <option value="">No provider selected</option>
              {(providers ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-charcoal-500">Feeds the "By provider" cost breakdown on Reports &amp; Costs.</p>
          </div>

          <div className={isEditing ? 'rounded-xl border-2 border-teal/30 bg-teal/5 p-3 space-y-3' : 'space-y-3'}>
            {isEditing && (
              <p className="text-xs font-medium text-teal-700">
                Updating? Change the completed date, expiry date, and upload the new certificate.
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Completed date (optional)</label>
                <input
                  type="date"
                  value={completedAt}
                  onChange={(e) => setCompletedAt(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Expiry date (optional)</label>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Training Cost (ZAR)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
            <p className="mt-1 text-xs text-charcoal-500">Leave blank if no cost or cost unknown.</p>
          </div>

          <div className={isEditing ? 'rounded-xl border-2 border-teal/30 bg-teal/5 p-3' : undefined}>
            <label className="block text-sm font-medium text-charcoal mb-1.5">
              Certificate file {isEditing ? '(replace)' : '(optional)'}
            </label>
            {isEditing && props.editRecord?.certificate_key && !file && (
              <p className="text-xs text-charcoal-500 mb-1.5">
                Current: {props.editRecord.certificate_key.split('/').pop()}
              </p>
            )}
            <input
              type="file"
              accept=".pdf,.doc,.docx,image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm"
            />
            {file && <p className="text-xs text-charcoal-500 mt-1">Selected: {file.name}</p>}
            {isEditing && !file && (
              <p className="text-xs text-charcoal-500 mt-1">Leave blank to keep the current certificate.</p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={closeWithDraftClear}
              className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading && <LoadingSpinner size={16} />}
              {isEditing ? 'Save changes' : 'Add record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
