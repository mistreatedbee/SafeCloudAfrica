import React, { useEffect, useMemo, useState } from 'react';
import { BriefcaseIcon, BookOpenIcon, Building2Icon, Grid3X3Icon, PlusIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { useAsync } from '../../api/hooks/useAsync';
import type { JobDescription, TrainingCourse, TrainingProvider, JobTrainingRequirement, UUID } from '../../api/models/entities';
import {
  listJobDescriptions,
  listTrainingCourses,
  listTrainingProviders,
  listJobTrainingRequirements,
  createTrainingCourse,
  deleteTrainingCourse,
  deleteTrainingProvider
} from '../../api/services/trainingService';
import { JobDescriptionModal } from './JobDescriptionModal';
import { TrainingProviderModal } from './TrainingProviderModal';
import { CourseEditModal } from './CourseEditModal';
import { MatrixBuilderSection } from './MatrixBuilderSection';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';

export function TrainingMatrixSetupTab(props: {
  companyId: UUID;
  createdByUserId: UUID;
}) {
  const [jobModalOpen, setJobModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<JobDescription | null>(null);
  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<TrainingProvider | null>(null);
  const [courseEditId, setCourseEditId] = useState<string | null>(null);
  const [newCourseName, setNewCourseName] = useState('');
  const [newCourseLoading, setNewCourseLoading] = useState(false);
  const [newCourseError, setNewCourseError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  type NewCourseDraftPayload = {
    newCourseName: string;
  };

  const { restoreDraft, clearDraft } = useDraftManager();
  const newCourseDraftKey = `training-matrix-new-course:${props.companyId}:${props.createdByUserId}`;

  const newCoursePayload = useMemo<NewCourseDraftPayload>(
    () => ({
      newCourseName
    }),
    [newCourseName]
  );

  const newCoursePayloadJson = useMemo(() => JSON.stringify(newCoursePayload), [newCoursePayload]);
  const [newCourseDraftBaselineJson, setNewCourseDraftBaselineJson] = useState<string | null>(null);

  const hasDirtyNewCourseDraft = useMemo(() => {
    if (newCourseDraftBaselineJson == null) return false;
    return newCoursePayloadJson !== newCourseDraftBaselineJson;
  }, [newCourseDraftBaselineJson, newCoursePayloadJson]);

  useDraftRegistration({
    key: newCourseDraftKey,
    enabled: Boolean(props.companyId && props.createdByUserId),
    isDirty: () => hasDirtyNewCourseDraft,
    serialize: () => newCoursePayload
  });

  useEffect(() => {
    const baseJson = JSON.stringify({ newCourseName });
    setNewCourseDraftBaselineJson(baseJson);
    const restored = restoreDraft<NewCourseDraftPayload>(newCourseDraftKey);
    if (!restored) return;
    setNewCourseName(restored.newCourseName ?? '');
    setNewCourseDraftBaselineJson(JSON.stringify(restored));
  }, [newCourseDraftKey, restoreDraft]);

  const refreshAll = () => setRefresh((r) => r + 1);

  const { data: jobs, loading: jobsLoading } = useAsync(
    () => (props.companyId ? listJobDescriptions(props.companyId) : []),
    [props.companyId, refresh]
  );
  const { data: courses, loading: coursesLoading } = useAsync(
    () => (props.companyId ? listTrainingCourses(props.companyId) : []),
    [props.companyId, refresh]
  );
  const { data: providers, loading: providersLoading } = useAsync(
    () => (props.companyId ? listTrainingProviders(props.companyId) : []),
    [props.companyId, refresh]
  );
  const { data: requirements } = useAsync(
    () => (props.companyId ? listJobTrainingRequirements(props.companyId) : []),
    [props.companyId, refresh]
  );

  async function addCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!newCourseName.trim()) return;
    setNewCourseError(null);
    try {
      setNewCourseLoading(true);
      await createTrainingCourse({
        companyId: props.companyId,
        name: newCourseName.trim(),
        createdByUserId: props.createdByUserId
      });
      setNewCourseName('');
      clearDraft(newCourseDraftKey);
      setNewCourseDraftBaselineJson(JSON.stringify({ newCourseName: '' }));
      refreshAll();
    } catch (err: unknown) {
      setNewCourseError(formatAuthError(err));
    } finally {
      setNewCourseLoading(false);
    }
  }

  async function handleDeleteCourse(courseId: UUID) {
    const confirmed = window.confirm('Delete this training course? This cannot be undone.');
    if (!confirmed) return;
    try {
      await deleteTrainingCourse({
        companyId: props.companyId,
        courseId,
        actorUserId: props.createdByUserId
      });
      refreshAll();
    } catch (err: unknown) {
      window.alert(formatAuthError(err));
    }
  }

  async function handleDeleteProvider(providerId: UUID) {
    const confirmed = window.confirm('Delete this training provider? This cannot be undone.');
    if (!confirmed) return;
    try {
      await deleteTrainingProvider({
        companyId: props.companyId,
        providerId,
        actorUserId: props.createdByUserId
      });
      refreshAll();
    } catch (err: unknown) {
      window.alert(formatAuthError(err));
    }
  }

  const editingCourse = courseEditId ? courses?.find((c) => String(c.id) === courseEditId) : null;

  return (
    <div className="space-y-8">
      <JobDescriptionModal
        open={jobModalOpen || !!editingJob}
        onClose={() => {
          setJobModalOpen(false);
          setEditingJob(null);
        }}
        companyId={props.companyId}
        initial={editingJob ?? undefined}
        onSaved={() => {
          refreshAll();
          setJobModalOpen(false);
          setEditingJob(null);
        }}
      />
      <TrainingProviderModal
        open={providerModalOpen || !!editingProvider}
        onClose={() => {
          setProviderModalOpen(false);
          setEditingProvider(null);
        }}
        companyId={props.companyId}
        initial={editingProvider ?? undefined}
        onSaved={() => {
          refreshAll();
          setProviderModalOpen(false);
          setEditingProvider(null);
        }}
      />
      {editingCourse && (
        <CourseEditModal
          open={!!editingCourse}
          onClose={() => setCourseEditId(null)}
          companyId={props.companyId}
          course={editingCourse}
          onSaved={() => {
            refreshAll();
            setCourseEditId(null);
          }}
        />
      )}

      {/* Job Descriptions */}
      <section className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
          <h3 className="font-semibold text-charcoal flex items-center gap-2">
            <BriefcaseIcon className="w-5 h-5 text-teal" />
            Job descriptions
          </h3>
          <button
            type="button"
            onClick={() => setJobModalOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-teal text-white text-sm font-medium hover:bg-teal-600"
          >
            <PlusIcon className="w-4 h-4" />
            Add job
          </button>
        </div>
        <div className="p-4">
          {jobsLoading ? (
            <div className="flex items-center gap-2 text-charcoal-500 py-4">
              <LoadingSpinner size={20} />
              Loading…
            </div>
          ) : (jobs ?? []).length === 0 ? (
            <p className="text-sm text-charcoal-500 py-4">No job descriptions yet. Add one to link training requirements.</p>
          ) : (
            <ul className="space-y-2">
              {(jobs ?? []).map((j) => (
                <li key={j.id} className="flex items-center justify-between py-2 border-b border-surface-100 last:border-0">
                  <span className="font-medium text-charcoal">{j.title}</span>
                  <button
                    type="button"
                    onClick={() => setEditingJob(j)}
                    className="p-1.5 rounded-lg hover:bg-surface-100 text-charcoal-500"
                    aria-label="Edit"
                  >
                    <PencilIcon className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Course catalog */}
      <section className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-semibold text-charcoal flex items-center gap-2">
            <BookOpenIcon className="w-5 h-5 text-teal" />
            Course catalog
          </h3>
          <form onSubmit={addCourse} className="flex items-center gap-2 flex-wrap">
            <input
              value={newCourseName}
              onChange={(e) => setNewCourseName(e.target.value)}
              placeholder="New course name"
              className="px-3 py-2 border border-surface-300 rounded-lg text-sm w-48 focus:outline-none focus:ring-2 focus:ring-teal"
            />
            <button
              type="submit"
              disabled={!newCourseName.trim() || newCourseLoading}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-teal text-white text-sm font-medium hover:bg-teal-600 disabled:opacity-60"
            >
              {newCourseLoading && <LoadingSpinner size={14} />}
              <PlusIcon className="w-4 h-4" />
              Add
            </button>
          </form>
        </div>
        {newCourseError && (
          <div className="mx-4 mt-2 bg-critical/5 border border-critical/20 rounded-lg p-2 text-sm text-critical">
            {newCourseError}
          </div>
        )}
        <div className="p-4">
          {coursesLoading ? (
            <div className="flex items-center gap-2 text-charcoal-500 py-4">
              <LoadingSpinner size={20} />
              Loading…
            </div>
          ) : (courses ?? []).length === 0 ? (
            <p className="text-sm text-charcoal-500 py-4">No courses yet. Add courses to assign to jobs.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-charcoal-500">Name</th>
                    <th className="px-4 py-2 text-left font-medium text-charcoal-500">Unit standard</th>
                    <th className="px-4 py-2 text-left font-medium text-charcoal-500">Credits</th>
                    <th className="px-4 py-2 text-left font-medium text-charcoal-500">Freq. (mo)</th>
                    <th className="px-4 py-2 text-left font-medium text-charcoal-500 w-24"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {(courses ?? []).map((c) => (
                    <tr key={c.id} className="hover:bg-surface-50">
                      <td className="px-4 py-2 font-medium text-charcoal">{c.name}</td>
                      <td className="px-4 py-2 text-charcoal-600">{c.unit_standard_required ?? '—'}</td>
                      <td className="px-4 py-2 text-charcoal-600">{c.credits ?? '—'}</td>
                      <td className="px-4 py-2 text-charcoal-600">{c.default_frequency_months ?? '—'}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setCourseEditId(String(c.id))}
                            className="p-1.5 rounded-lg hover:bg-surface-100 text-charcoal-500"
                            aria-label="Edit course"
                          >
                            <PencilIcon className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteCourse(c.id)}
                            className="p-1.5 rounded-lg hover:bg-critical/5 text-charcoal-500 hover:text-critical"
                            aria-label="Delete course"
                          >
                            <Trash2Icon className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Providers */}
      <section className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
          <h3 className="font-semibold text-charcoal flex items-center gap-2">
            <Building2Icon className="w-5 h-5 text-teal" />
            Training providers
          </h3>
          <button
            type="button"
            onClick={() => setProviderModalOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-teal text-white text-sm font-medium hover:bg-teal-600"
          >
            <PlusIcon className="w-4 h-4" />
            Add provider
          </button>
        </div>
        <div className="p-4">
          {providersLoading ? (
            <div className="flex items-center gap-2 text-charcoal-500 py-4">
              <LoadingSpinner size={20} />
              Loading…
            </div>
          ) : (providers ?? []).length === 0 ? (
            <p className="text-sm text-charcoal-500 py-4">No providers yet. Add Internal or External providers.</p>
          ) : (
            <ul className="space-y-2">
              {(providers ?? []).map((p) => (
                <li key={p.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-3 border-b border-surface-100 last:border-0">
                  {/* Display order: Provider Name -> Contact -> Email -> Website */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                    <span className="font-medium text-charcoal">{p.name}</span>
                    <span className="text-xs text-charcoal-500 bg-surface-100 px-2 py-0.5 rounded shrink-0">{p.provider_type}</span>
                    {p.contact && (
                      <>
                        <span className="text-charcoal-300 hidden sm:inline">|</span>
                        <span className="text-sm text-charcoal-600">{p.contact}</span>
                      </>
                    )}
                    {p.email && (
                      <>
                        <span className="text-charcoal-300 hidden sm:inline">|</span>
                        <a href={`mailto:${p.email}`} className="text-sm text-teal hover:underline">
                          {p.email}
                        </a>
                      </>
                    )}
                    {p.website && (
                      <>
                        <span className="text-charcoal-300 hidden sm:inline">|</span>
                        <a
                          href={p.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-teal hover:underline"
                        >
                          {p.website.replace(/^https?:\/\//i, '')}
                        </a>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditingProvider(p)}
                      className="p-1.5 rounded-lg hover:bg-surface-100 text-charcoal-500"
                      aria-label="Edit"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteProvider(p.id)}
                      className="p-1.5 rounded-lg hover:bg-critical/5 text-charcoal-500 hover:text-critical"
                      aria-label="Delete provider"
                    >
                      <Trash2Icon className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Matrix builder */}
      <section className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-200">
          <h3 className="font-semibold text-charcoal flex items-center gap-2">
            <Grid3X3Icon className="w-5 h-5 text-teal" />
            Matrix builder – link courses to jobs
          </h3>
          <p className="text-xs text-charcoal-500 mt-1">Select a job and choose which courses are required. Set frequency and mandatory flag.</p>
        </div>
        <div className="p-4">
          <MatrixBuilderSection
            companyId={props.companyId}
            jobs={jobs ?? []}
            courses={courses ?? []}
            requirements={requirements ?? []}
              draftKey={`training-matrix-setup:${props.companyId}:${props.createdByUserId}`}
            onSaved={refreshAll}
          />
        </div>
      </section>
    </div>
  );
}
