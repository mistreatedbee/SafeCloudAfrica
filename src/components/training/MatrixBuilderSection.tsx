import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { JobDescription, TrainingCourse, JobTrainingRequirement, UUID } from '../../api/models/entities';
import { listJobTrainingRequirements, setJobTrainingRequirements } from '../../api/services/trainingService';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';

export function MatrixBuilderSection(props: {
  companyId: UUID;
  jobs: JobDescription[];
  courses: TrainingCourse[];
  requirements: JobTrainingRequirement[];
  onSaved?: () => void;
  draftKey?: string;
}) {
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<string>>(new Set());
  const [frequencyMonths, setFrequencyMonths] = useState<Record<string, string>>({});
  const [mandatoryByCourse, setMandatoryByCourse] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  type TrainingMatrixDraftPayload = {
    selectedJobId: string;
    selectedCourseIds: string[];
    frequencyMonths: Record<string, string>;
    mandatoryByCourse: Record<string, boolean>;
  };

  const { restoreDraft, clearDraft } = useDraftManager();
  const restoringFromDraftRef = useRef(false);
  const draftRestoreAppliedRef = useRef(false);

  const draftPayload = useMemo<TrainingMatrixDraftPayload>(
    () => ({
      selectedJobId,
      selectedCourseIds: Array.from(selectedCourseIds).sort(),
      frequencyMonths,
      mandatoryByCourse
    }),
    [selectedCourseIds, selectedJobId, frequencyMonths, mandatoryByCourse]
  );

  const draftPayloadJson = useMemo(() => JSON.stringify(draftPayload), [draftPayload]);
  const [draftBaselineJson, setDraftBaselineJson] = useState<string | null>(null);

  const hasDirtyDraft = useMemo(() => {
    if (!props.draftKey) return false;
    if (draftBaselineJson == null) return false;
    return draftPayloadJson !== draftBaselineJson;
  }, [draftBaselineJson, draftPayloadJson, props.draftKey]);

  useDraftRegistration({
    key: props.draftKey ?? 'training-matrix-noop',
    enabled: Boolean(props.draftKey),
    isDirty: () => hasDirtyDraft,
    serialize: () => draftPayload
  });

  useEffect(() => {
    if (!props.draftKey) return;

    // Keep baseline in sync with restored/default state so we don't overwrite on restore.
    setDraftBaselineJson(draftPayloadJson);

    const restored = restoreDraft<TrainingMatrixDraftPayload>(props.draftKey);
    if (!restored) {
      setDraftBaselineJson(draftPayloadJson);
      draftRestoreAppliedRef.current = false;
      return;
    }

    restoringFromDraftRef.current = true;
    setSelectedJobId(restored.selectedJobId ?? '');
    setSelectedCourseIds(new Set(restored.selectedCourseIds ?? []));
    setFrequencyMonths(restored.frequencyMonths ?? {});
    setMandatoryByCourse(restored.mandatoryByCourse ?? {});
    setDraftBaselineJson(JSON.stringify(restored));
    draftRestoreAppliedRef.current = true;
  }, [props.draftKey, restoreDraft]);

  const requirementsByJob = useMemo(() => {
    const m = new Map<string, JobTrainingRequirement[]>();
    for (const r of props.requirements) {
      const k = String(r.job_description_id);
      const arr = m.get(k) ?? [];
      arr.push(r);
      m.set(k, arr);
    }
    return m;
  }, [props.requirements]);

  const selectedJob = useMemo(() => props.jobs.find((j) => String(j.id) === selectedJobId), [props.jobs, selectedJobId]);

  useEffect(() => {
    if (draftRestoreAppliedRef.current) return;
    if (!selectedJobId) {
      setSelectedCourseIds(new Set());
      setFrequencyMonths({});
      setMandatoryByCourse({});
      return;
    }
    const reqs = requirementsByJob.get(selectedJobId) ?? [];
    setSelectedCourseIds(new Set(reqs.map((r) => String(r.course_id))));
    const freq: Record<string, string> = {};
    const mand: Record<string, boolean> = {};
    for (const r of reqs) {
      freq[String(r.course_id)] = r.frequency_months != null ? String(r.frequency_months) : '';
      mand[String(r.course_id)] = r.is_mandatory;
    }
    setFrequencyMonths(freq);
    setMandatoryByCourse(mand);
  }, [selectedJobId, requirementsByJob]);

  const toggleCourse = (courseId: string) => {
    setSelectedCourseIds((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) next.delete(courseId);
      else next.add(courseId);
      return next;
    });
  };

  const setFreq = (courseId: string, value: string) => {
    setFrequencyMonths((prev) => ({ ...prev, [courseId]: value }));
  };
  const setMandatory = (courseId: string, value: boolean) => {
    setMandatoryByCourse((prev) => ({ ...prev, [courseId]: value }));
  };

  async function onSave() {
    if (!selectedJobId) return;
    setError(null);
    try {
      setLoading(true);
      await setJobTrainingRequirements({
        companyId: props.companyId,
        jobDescriptionId: selectedJobId as UUID,
        requirements: Array.from(selectedCourseIds).map((courseId) => ({
          courseId: courseId as UUID,
          frequencyMonths: frequencyMonths[courseId] ? parseInt(frequencyMonths[courseId], 10) || null : null,
          isMandatory: mandatoryByCourse[courseId] !== false
        }))
      });
      if (props.draftKey) {
        clearDraft(props.draftKey);
        setDraftBaselineJson(draftPayloadJson);
        draftRestoreAppliedRef.current = false;
      }
      props.onSaved?.();
    } catch (err: unknown) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  const matrixRows = useMemo(() => {
    return props.jobs.map((job) => {
      const reqs = requirementsByJob.get(String(job.id)) ?? [];
      const courseNames = reqs
        .map((r) => props.courses.find((c) => c.id === r.course_id)?.name ?? '')
        .filter(Boolean);
      return { job, reqs, courseNames };
    });
  }, [props.jobs, props.courses, requirementsByJob]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <label className="block text-xs font-medium text-charcoal-500 mb-1">Job description</label>
          <select
            value={selectedJobId}
            onChange={(e) => {
              draftRestoreAppliedRef.current = false;
              setSelectedJobId(e.target.value);
            }}
            className="px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal min-w-[200px]"
          >
            <option value="">Select a job</option>
            {props.jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>
        </div>
        {selectedJobId && (
          <button
            type="button"
            onClick={onSave}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60 mt-6"
          >
            {loading && <LoadingSpinner size={16} />}
            Save matrix for this job
          </button>
        )}
      </div>
      {error && (
        <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
          <p className="text-sm text-critical">{error}</p>
        </div>
      )}
      {selectedJob && (
        <div className="border border-surface-200 rounded-xl overflow-hidden">
          <div className="bg-surface-50 px-4 py-2 text-sm font-medium text-charcoal">
            Required courses for: {selectedJob.title}
          </div>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-100 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-charcoal-500 w-8">Include</th>
                  <th className="px-4 py-2 text-left font-medium text-charcoal-500">Course</th>
                  <th className="px-4 py-2 text-left font-medium text-charcoal-500 w-28">Frequency (months)</th>
                  <th className="px-4 py-2 text-left font-medium text-charcoal-500 w-24">Mandatory</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {props.courses.map((c) => {
                  const cid = String(c.id);
                  const included = selectedCourseIds.has(cid);
                  return (
                    <tr key={c.id} className="hover:bg-surface-50">
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={included}
                          onChange={() => toggleCourse(cid)}
                          className="rounded border-surface-300 text-teal focus:ring-teal"
                        />
                      </td>
                      <td className="px-4 py-2 font-medium text-charcoal">{c.name}</td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          min={0}
                          value={frequencyMonths[cid] ?? ''}
                          onChange={(e) => setFreq(cid, e.target.value)}
                          disabled={!included}
                          placeholder="e.g. 12"
                          className="w-20 px-2 py-1.5 border border-surface-300 rounded text-sm disabled:bg-surface-100 disabled:opacity-60"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={mandatoryByCourse[cid] !== false}
                          onChange={(e) => setMandatory(cid, e.target.checked)}
                          disabled={!included}
                          className="rounded border-surface-300 text-teal focus:ring-teal disabled:opacity-60"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="rounded-xl border border-surface-200 overflow-hidden">
        <div className="bg-surface-50 px-4 py-2 text-sm font-medium text-charcoal">Job → required courses (read-only)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-100">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-charcoal-500">Job</th>
                <th className="px-4 py-2 text-left font-medium text-charcoal-500">Required courses</th>
                <th className="px-4 py-2 text-left font-medium text-charcoal-500 w-20">Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {matrixRows.map(({ job, courseNames }) => (
                <tr key={job.id} className="hover:bg-surface-50">
                  <td className="px-4 py-2 font-medium text-charcoal">{job.title}</td>
                  <td className="px-4 py-2 text-charcoal-600">{courseNames.join(', ') || '—'}</td>
                  <td className="px-4 py-2 text-charcoal-500">{courseNames.length}</td>
                </tr>
              ))}
              {matrixRows.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-4 text-charcoal-500">
                    No jobs or no requirements yet. Select a job above and add courses.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
