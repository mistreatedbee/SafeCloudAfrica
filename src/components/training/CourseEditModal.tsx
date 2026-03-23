import React, { useEffect, useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { TrainingCourse, UUID } from '../../api/models/entities';
import { updateTrainingCourse } from '../../api/services/trainingService';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';

export function CourseEditModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  course: TrainingCourse;
  onSaved?: () => void;
}) {
  const [name, setName] = useState(props.course.name);
  const [description, setDescription] = useState(props.course.description ?? '');
  const [validMonths, setValidMonths] = useState<string>(props.course.valid_months != null ? String(props.course.valid_months) : '');
  const [unitStandardRequired, setUnitStandardRequired] = useState(props.course.unit_standard_required ?? '');
  const [credits, setCredits] = useState<string>(props.course.credits != null ? String(props.course.credits) : '');
  const [defaultFrequencyMonths, setDefaultFrequencyMonths] = useState<string>(
    props.course.default_frequency_months != null ? String(props.course.default_frequency_months) : ''
  );
  const [defaultValidityMonths, setDefaultValidityMonths] = useState<string>(
    props.course.default_validity_months != null ? String(props.course.default_validity_months) : ''
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  type CourseEditDraftPayload = {
    name: string;
    description: string;
    validMonths: string;
    unitStandardRequired: string;
    credits: string;
    defaultFrequencyMonths: string;
    defaultValidityMonths: string;
  };

  const { restoreDraft, clearDraft } = useDraftManager();
  const draftKey = `training-course-edit:${props.companyId}:${props.course.id}`;

  const payload = useMemo<CourseEditDraftPayload>(
    () => ({
      name,
      description,
      validMonths,
      unitStandardRequired,
      credits,
      defaultFrequencyMonths,
      defaultValidityMonths
    }),
    [
      name,
      description,
      validMonths,
      unitStandardRequired,
      credits,
      defaultFrequencyMonths,
      defaultValidityMonths
    ]
  );

  const payloadJson = useMemo(() => JSON.stringify(payload), [payload]);
  const [draftBaselineJson, setDraftBaselineJson] = useState<string | null>(null);

  const hasDirtyDraft = useMemo(() => {
    if (draftBaselineJson == null) return false;
    return payloadJson !== draftBaselineJson;
  }, [draftBaselineJson, payloadJson]);

  useDraftRegistration({
    key: draftKey,
    enabled: props.open,
    isDirty: () => hasDirtyDraft,
    serialize: () => payload
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    try {
      setLoading(true);
      await updateTrainingCourse({
        companyId: props.companyId,
        courseId: props.course.id,
        name: name.trim(),
        description: description.trim() || null,
        validMonths: validMonths ? (parseInt(validMonths, 10) || null) : null,
        unitStandardRequired: unitStandardRequired.trim() || null,
        credits: credits ? (parseInt(credits, 10) || null) : null,
        defaultFrequencyMonths: defaultFrequencyMonths ? (parseInt(defaultFrequencyMonths, 10) || null) : null,
        defaultValidityMonths: defaultValidityMonths ? (parseInt(defaultValidityMonths, 10) || null) : null
      });
      props.onSaved?.();
      clearDraft(draftKey);
      props.onClose();
    } catch (err: unknown) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!props.open) return;

    const basePayload: CourseEditDraftPayload = {
      name: props.course.name,
      description: props.course.description ?? '',
      validMonths: props.course.valid_months != null ? String(props.course.valid_months) : '',
      unitStandardRequired: props.course.unit_standard_required ?? '',
      credits: props.course.credits != null ? String(props.course.credits) : '',
      defaultFrequencyMonths:
        props.course.default_frequency_months != null ? String(props.course.default_frequency_months) : '',
      defaultValidityMonths:
        props.course.default_validity_months != null ? String(props.course.default_validity_months) : ''
    };

    // Baseline should match the restored/default state to prevent immediate dirty autosaves.
    setDraftBaselineJson(JSON.stringify(basePayload));

    const restored = restoreDraft<CourseEditDraftPayload>(draftKey);
    if (!restored) {
      setName(basePayload.name);
      setDescription(basePayload.description);
      setValidMonths(basePayload.validMonths);
      setUnitStandardRequired(basePayload.unitStandardRequired);
      setCredits(basePayload.credits);
      setDefaultFrequencyMonths(basePayload.defaultFrequencyMonths);
      setDefaultValidityMonths(basePayload.defaultValidityMonths);
      return;
    }

    setName(restored.name ?? basePayload.name);
    setDescription(restored.description ?? basePayload.description);
    setValidMonths(restored.validMonths ?? basePayload.validMonths);
    setUnitStandardRequired(restored.unitStandardRequired ?? basePayload.unitStandardRequired);
    setCredits(restored.credits ?? basePayload.credits);
    setDefaultFrequencyMonths(restored.defaultFrequencyMonths ?? basePayload.defaultFrequencyMonths);
    setDefaultValidityMonths(restored.defaultValidityMonths ?? basePayload.defaultValidityMonths);

    setDraftBaselineJson(JSON.stringify(restored));
  }, [
    props.open,
    props.course,
    draftKey,
    restoreDraft
  ]);

  const closeWithDraftClear = () => {
    clearDraft(draftKey);
    props.onClose();
  };

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={closeWithDraftClear} />
      <div className="relative w-full max-w-xl mx-4 bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <p className="text-sm font-semibold text-charcoal">Edit course</p>
          <button type="button" onClick={closeWithDraftClear} className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-500">
            <XIcon className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm text-critical">{error}</p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Course name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Unit standard required</label>
              <input
                value={unitStandardRequired}
                onChange={(e) => setUnitStandardRequired(e.target.value)}
                placeholder="e.g. 12345"
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Credits</label>
              <input
                type="number"
                min={0}
                value={credits}
                onChange={(e) => setCredits(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Default frequency (months)</label>
              <input
                type="number"
                min={0}
                value={defaultFrequencyMonths}
                onChange={(e) => setDefaultFrequencyMonths(e.target.value)}
                placeholder="6, 12, 24"
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Default validity (months)</label>
              <input
                type="number"
                min={0}
                value={defaultValidityMonths}
                onChange={(e) => setDefaultValidityMonths(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Valid months (legacy)</label>
            <input
              type="number"
              min={0}
              value={validMonths}
              onChange={(e) => setValidMonths(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={closeWithDraftClear}
              className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60"
            >
              {loading && <LoadingSpinner size={16} />}
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
