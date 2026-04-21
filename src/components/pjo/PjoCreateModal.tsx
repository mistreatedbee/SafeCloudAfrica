import React, { useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { UUID } from '../../api/models/core';
import type { PjoChecklistTemplate } from '../../api/models/entities';
import { createPjo, listPjoTemplates } from '../../api/services/pjoService';
import { useAsync } from '../../api/hooks/useAsync';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';

const REASONS = [
  'Effectiveness of training',
  'New employee',
  'Incident happened',
  'Periodic',
  'Assess worker can safely conduct task',
  'Other'
] as const;

export function PjoCreateModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  actorUserId: UUID;
  onCreated?: () => void;
}) {
  const { restoreDraft, clearDraft } = useDraftManager();
  const draftKey = `pjo-create:${props.companyId}:${props.actorUserId}`;
  const [employeeName, setEmployeeName] = useState('');
  const [reasonPreset, setReasonPreset] = useState<(typeof REASONS)[number]>('Effectiveness of training');
  const [reasonOther, setReasonOther] = useState('');
  const [department, setDepartment] = useState('');
  const [site, setSite] = useState('');
  const [jobObserved, setJobObserved] = useState('');
  const [observedAt, setObservedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [nextPreset, setNextPreset] = useState<'3m' | '6m' | '12m'>('3m');
  const [templateId, setTemplateId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: templates, loading: templatesLoading } = useAsync<PjoChecklistTemplate[]>(
    async () => {
      if (!props.open) return [];
      return await listPjoTemplates(props.companyId);
    },
    [props.open, props.companyId]
  );

  const nextObservationAt = useMemo(() => {
    const d = new Date(observedAt);
    if (Number.isNaN(d.getTime())) return null;
    const months = nextPreset === '3m' ? 3 : nextPreset === '6m' ? 6 : 12;
    d.setMonth(d.getMonth() + months);
    return d.toISOString().slice(0, 10);
  }, [nextPreset, observedAt]);

  const reason = useMemo(() => {
    if (reasonPreset !== 'Other') return reasonPreset;
    return reasonOther.trim();
  }, [reasonOther, reasonPreset]);

  const canSubmit = useMemo(() => {
    return employeeName.trim().length > 2 && reason.trim().length > 2 && jobObserved.trim().length > 2;
  }, [employeeName, jobObserved, reason]);
  const hasDirtyDraft = useMemo(
    () =>
      props.open &&
      (
        employeeName.trim().length > 0 ||
        reasonPreset !== 'Effectiveness of training' ||
        reasonOther.trim().length > 0 ||
        department.trim().length > 0 ||
        site.trim().length > 0 ||
        jobObserved.trim().length > 0 ||
        templateId.length > 0 ||
        nextPreset !== '3m' ||
        observedAt !== new Date().toISOString().slice(0, 10)
      ),
    [department, employeeName, jobObserved, nextPreset, observedAt, props.open, reasonOther, reasonPreset, site, templateId]
  );

  function resetForm() {
    setEmployeeName('');
    setReasonPreset('Effectiveness of training');
    setReasonOther('');
    setDepartment('');
    setSite('');
    setJobObserved('');
    setObservedAt(new Date().toISOString().slice(0, 10));
    setNextPreset('3m');
    setTemplateId('');
  }

  useDraftRegistration({
    key: draftKey,
    label: 'PJO Form',
    enabled: props.open,
    metadata: {
      organizationId: props.companyId,
      moduleName: 'safety',
      formType: 'pjo-create'
    },
    isDirty: () => hasDirtyDraft,
    serialize: () => ({
      employeeName,
      reasonPreset,
      reasonOther,
      department,
      site,
      jobObserved,
      observedAt,
      nextPreset,
      templateId
    })
  });

  React.useEffect(() => {
    if (!props.open) return;
    const restored = restoreDraft<{
      employeeName?: string;
      reasonPreset?: (typeof REASONS)[number];
      reasonOther?: string;
      department?: string;
      site?: string;
      jobObserved?: string;
      observedAt?: string;
      nextPreset?: '3m' | '6m' | '12m';
      templateId?: string;
    }>(draftKey);

    if (!restored) return;
    setEmployeeName(restored.employeeName ?? '');
    setReasonPreset(restored.reasonPreset ?? 'Effectiveness of training');
    setReasonOther(restored.reasonOther ?? '');
    setDepartment(restored.department ?? '');
    setSite(restored.site ?? '');
    setJobObserved(restored.jobObserved ?? '');
    setObservedAt(restored.observedAt ?? new Date().toISOString().slice(0, 10));
    setNextPreset(restored.nextPreset ?? '3m');
    setTemplateId(restored.templateId ?? '');
  }, [draftKey, props.open, restoreDraft]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      setLoading(true);
      await createPjo({
        companyId: props.companyId,
        employeeName: employeeName.trim(),
        conductedByUserId: props.actorUserId,
        reason,
        department: department.trim() || null,
        site: site.trim() || null,
        jobObserved: jobObserved.trim(),
        observedAt,
        nextObservationAt,
        createdByUserId: props.actorUserId,
        templateId: templateId ? (templateId as UUID) : null
      });
      clearDraft(draftKey);
      props.onCreated?.();
      props.onClose();
      resetForm();
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90dvh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <div>
            <p className="text-sm font-semibold text-charcoal">New Plan Job Observation (PJO)</p>
            <p className="text-xs text-charcoal-500 mt-0.5">Create the observation, then complete the checklist.</p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-surface-100 text-charcoal-500 shrink-0"
            aria-label="Close"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-critical">Could not create PJO</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Employee name *</label>
              <input
                value={employeeName}
                onChange={(e) => setEmployeeName(e.target.value)}
                placeholder="e.g. Sipho Dlamini"
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Job observed *</label>
              <input
                value={jobObserved}
                onChange={(e) => setJobObserved(e.target.value)}
                placeholder="e.g. Forklift operation"
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Reason for PJO *</label>
              <select
                value={reasonPreset}
                onChange={(e) => setReasonPreset(e.target.value as any)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                {REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              {reasonPreset === 'Other' && (
                <input
                  value={reasonOther}
                  onChange={(e) => setReasonOther(e.target.value)}
                  placeholder="Type reason…"
                  className="mt-2 w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Department / Site (optional)</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="Department"
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
                <input
                  value={site}
                  onChange={(e) => setSite(e.target.value)}
                  placeholder="Site"
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">
                Checklist template (optional)
              </label>
              {templatesLoading && (
                <p className="text-xs text-charcoal-500">Loading templates…</p>
              )}
              {!templatesLoading && (templates?.length ?? 0) > 0 && (
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                >
                  <option value="">Use standard 30+ question checklist</option>
                  {templates!.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
              {!templatesLoading && (templates?.length ?? 0) === 0 && (
                <p className="text-xs text-charcoal-500">
                  No custom templates configured yet. The standard checklist will be used.
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Date observed</label>
              <input
                type="date"
                value={observedAt}
                onChange={(e) => setObservedAt(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Next observation</label>
              <select
                value={nextPreset}
                onChange={(e) => setNextPreset(e.target.value as any)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="3m">3 months</option>
                <option value="6m">6 months</option>
                <option value="12m">12 months</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Next date</label>
              <input
                type="date"
                value={nextObservationAt ?? ''}
                readOnly
                className="w-full px-4 py-2.5 bg-surface-50 border border-surface-300 rounded-lg text-sm text-charcoal-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={props.onClose}
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
              Create PJO
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
