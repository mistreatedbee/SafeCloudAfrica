import React, { useEffect, useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { TrainingCourse, UUID } from '../../api/models/entities';
import { createTrainingCourse, createTrainingRecord } from '../../api/services/trainingService';
import { insforge } from '../../api/insforge/client';
import { HrEmployeeSelect } from '../ui/HrEmployeeSelect';
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
}) {
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [courseId, setCourseId] = useState<string>('');
  const [newCourseName, setNewCourseName] = useState('');
  const [newCourseValidMonths, setNewCourseValidMonths] = useState<string>('12');
  const [userId, setUserId] = useState(props.defaultUserId ?? '');
  const [completedAt, setCompletedAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [employeeNameSnapshot, setEmployeeNameSnapshot] = useState<string>('');

  type TrainingAddDraftPayload = {
    mode: 'existing' | 'new';
    courseId: string;
    newCourseName: string;
    newCourseValidMonths: string;
    userId: string;
    completedAt: string;
    expiresAt: string;
    employeeNameSnapshot: string;
  };

  const { restoreDraft, clearDraft } = useDraftManager();
  const draftKey = `training-add:${props.companyId}:${props.createdByUserId}`;

  const hasDirtyDraft = useMemo(() => {
    const targetDirty = !props.defaultUserId ? userId.trim().length > 0 : false;
    const courseDirty = mode === 'existing' ? courseId.trim().length > 0 : newCourseName.trim().length > 2;
    const datesDirty = !!completedAt.trim() || !!expiresAt.trim();
    return targetDirty || courseDirty || datesDirty;
  }, [completedAt, courseId, expiresAt, mode, newCourseName, props.defaultUserId, userId]);

  useDraftRegistration({
    key: draftKey,
    enabled: props.open,
    isDirty: () => hasDirtyDraft,
    serialize: () =>
      ({
        mode,
        courseId,
        newCourseName,
        newCourseValidMonths,
        userId,
        completedAt,
        expiresAt,
        employeeNameSnapshot
      }) satisfies TrainingAddDraftPayload
  });

  useEffect(() => {
    if (!props.open) return;
    const restored = restoreDraft<TrainingAddDraftPayload>(draftKey);
    if (!restored) {
      setMode('existing');
      setCourseId('');
      setNewCourseName('');
      setNewCourseValidMonths('12');
      setUserId(props.defaultUserId ?? '');
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
    setCompletedAt(restored.completedAt ?? '');
    setExpiresAt(restored.expiresAt ?? '');
    setEmployeeNameSnapshot(restored.employeeNameSnapshot ?? '');
    setFile(null);
    setError(null);
    // Note: we cannot restore the selected File certificate.
  }, [draftKey, props.defaultUserId, props.open, restoreDraft]);

  const closeWithDraftClear = () => {
    clearDraft(draftKey);
    props.onClose();
  };

  const canSubmit = useMemo(() => {
    if (!userId) return false;
    if (mode === 'existing') return !!courseId;
    return newCourseName.trim().length > 2;
  }, [courseId, mode, newCourseName, userId]);

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

      let certificateBucket: string | null = null;
      let certificateKey: string | null = null;
      if (file) {
        // Basic client-side file type validation for certificates
        const allowedExtensions = ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg'];
        const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
        if (!allowedExtensions.includes(ext)) {
          setError('Unsupported certificate file type. Please upload PDF, DOCX, or image formats.');
          return;
        }
        certificateBucket = TRAINING_CERT_BUCKET;
        const key = `${props.companyId}/${userId}/${Date.now()}-${file.name}`.replace(/\s+/g, '_');
        const { data, error: upErr } = await insforge.storage.from(certificateBucket).upload(key, file);
        if (upErr) throw upErr;
        certificateKey = data?.path ?? key;
      }

      const hasCompleted = !!(completedAt && certificateBucket && certificateKey);
      await createTrainingRecord({
        companyId: props.companyId,
        userId: userId as UUID,
        courseId: finalCourseId as UUID,
        status: hasCompleted ? 'COMPLETED' : 'REQUIRED',
        completedAt: completedAt ? new Date(completedAt).toISOString() : null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        certificateBucket,
        certificateKey,
        createdByUserId: props.createdByUserId
      });

      props.onAdded?.();
      clearDraft(draftKey);
      props.onClose();
      setCourseId('');
      setNewCourseName('');
      setCompletedAt('');
      setExpiresAt('');
      setFile(null);
      setError(null);
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={closeWithDraftClear} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90dvh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <div>
            <p className="text-sm font-semibold text-charcoal">Add training record</p>
            <p className="text-xs text-charcoal-500 mt-0.5">Creates a real training record in your company workspace.</p>
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
              <p className="text-sm font-semibold text-critical">Could not add training</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          {!props.defaultUserId && (
            <div>
              <HrEmployeeSelect
                companyId={props.companyId}
                value={userId as UUID | ''}
                onChange={(selectedUserId, meta) => {
                  setUserId(selectedUserId || '');
                  setEmployeeNameSnapshot(meta.nameSnapshot);
                }}
                label="Employee"
                placeholder="Select employee"
              />
              {employeeNameSnapshot && (
                <p className="text-xs text-charcoal-500 mt-1">Recording training for: {employeeNameSnapshot}</p>
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

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Certificate file (optional)</label>
            <input
              type="file"
              accept=".pdf,.doc,.docx,image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm"
            />
            {file && <p className="text-xs text-charcoal-500 mt-1">Selected: {file.name}</p>}
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
              Add record
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
