import React, { useEffect, useMemo, useState } from 'react';
import { XIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { ModuleKey, UUID } from '../../api/models/core';
import { createAudit } from '../../api/services/auditsService';
import { listAuditChecklistTemplates } from '../../api/services/auditChecklistTemplatesService';
import { useAsync } from '../../api/hooks/useAsync';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';

export function AuditScheduleModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  createdByUserId: UUID;
  onCreated?: () => void;
}) {
  const [title, setTitle] = useState('');
  const [module, setModule] = useState<ModuleKey>('safety');
  const [auditType, setAuditType] = useState<'internal' | 'external' | 'client' | 'supplier' | 'certification'>('internal');
  const [objectives, setObjectives] = useState('');
  const [auditCriteria, setAuditCriteria] = useState('');
  const [scopeOfAudit, setScopeOfAudit] = useState('');
  const [proposedDates, setProposedDates] = useState<string[]>(['', '', '']);
  const [location, setLocation] = useState('');
  const [auditorIdsInput, setAuditorIdsInput] = useState('');
  const [auditeeIdsInput, setAuditeeIdsInput] = useState('');
  const [companyRepIdsInput, setCompanyRepIdsInput] = useState('');
  const [leadAuditorId, setLeadAuditorId] = useState('');
  const [documentDeadline, setDocumentDeadline] = useState('');
  const [requiredDocs, setRequiredDocs] = useState<string[]>(['']);
  const [checklistTemplateId, setChecklistTemplateId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { restoreDraft, clearDraft } = useDraftManager();
  const draftKey = `audit-schedule:${props.companyId}:${props.createdByUserId}`;

  const hasDirtyDraft = useMemo(
    () =>
      props.open &&
      (title.trim().length > 0 ||
        objectives.trim().length > 0 ||
        auditCriteria.trim().length > 0 ||
        scopeOfAudit.trim().length > 0 ||
        location.trim().length > 0 ||
        proposedDates.some((d) => d.trim().length > 0) ||
        auditorIdsInput.trim().length > 0 ||
        auditeeIdsInput.trim().length > 0 ||
        companyRepIdsInput.trim().length > 0 ||
        leadAuditorId.trim().length > 0 ||
        documentDeadline.trim().length > 0 ||
        requiredDocs.some((d) => d.trim().length > 0) ||
        checklistTemplateId.trim().length > 0 ||
        module !== 'safety' ||
        auditType !== 'internal'),
    [
      auditCriteria,
      auditType,
      auditorIdsInput,
      auditeeIdsInput,
      checklistTemplateId,
      companyRepIdsInput,
      documentDeadline,
      location,
      leadAuditorId,
      module,
      objectives,
      proposedDates,
      props.companyId,
      props.createdByUserId,
      props.open,
      requiredDocs,
      scopeOfAudit,
      title
    ]
  );

  useDraftRegistration({
    key: draftKey,
    enabled: props.open,
    isDirty: () => hasDirtyDraft,
    serialize: () => ({
      title,
      module,
      auditType,
      objectives,
      auditCriteria,
      scopeOfAudit,
      proposedDates,
      location,
      auditorIdsInput,
      auditeeIdsInput,
      companyRepIdsInput,
      leadAuditorId,
      documentDeadline,
      requiredDocs,
      checklistTemplateId
    })
  });

  const { data: templates } = useAsync(
    () => (props.companyId ? listAuditChecklistTemplates(props.companyId) : Promise.resolve([])),
    [props.companyId, props.open]
  );

  useEffect(() => {
    if (!props.open) return;
    const restored = restoreDraft<{
      title?: string;
      module?: ModuleKey;
      auditType?: 'internal' | 'external' | 'client' | 'supplier' | 'certification';
      objectives?: string;
      auditCriteria?: string;
      scopeOfAudit?: string;
      proposedDates?: string[];
      location?: string;
      auditorIdsInput?: string;
      auditeeIdsInput?: string;
      companyRepIdsInput?: string;
      leadAuditorId?: string;
      documentDeadline?: string;
      requiredDocs?: string[];
      checklistTemplateId?: string;
    }>(draftKey);

    if (!restored) return;

    setTitle(restored.title ?? '');
    setModule(restored.module ?? 'safety');
    setAuditType(restored.auditType ?? 'internal');
    setObjectives(restored.objectives ?? '');
    setAuditCriteria(restored.auditCriteria ?? '');
    setScopeOfAudit(restored.scopeOfAudit ?? '');
    setProposedDates(Array.isArray(restored.proposedDates) ? restored.proposedDates : ['', '', '']);
    setLocation(restored.location ?? '');
    setAuditorIdsInput(restored.auditorIdsInput ?? '');
    setAuditeeIdsInput(restored.auditeeIdsInput ?? '');
    setCompanyRepIdsInput(restored.companyRepIdsInput ?? '');
    setLeadAuditorId(restored.leadAuditorId ?? '');
    setDocumentDeadline(restored.documentDeadline ?? '');
    setRequiredDocs(Array.isArray(restored.requiredDocs) ? restored.requiredDocs : ['']);
    setChecklistTemplateId(restored.checklistTemplateId ?? '');
  }, [draftKey, props.open, restoreDraft]);

  const proposedDatesParsed = useMemo(() => {
    return proposedDates
      .filter((d) => d.trim().length > 0)
      .map((d) => new Date(d).toISOString());
  }, [proposedDates]);

  function setProposedDate(i: number, value: string) {
    setProposedDates((prev) => {
      const next = [...prev];
      next[i] = value;
      return next;
    });
  }
  function addProposedDate() {
    setProposedDates((prev) => [...prev, '']);
  }
  function removeProposedDate(i: number) {
    setProposedDates((prev) => (prev.length > 3 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  const canSubmit = useMemo(
    () =>
      objectives.trim().length > 2 &&
      auditCriteria.trim().length > 2 &&
      scopeOfAudit.trim().length > 2 &&
      proposedDatesParsed.length >= 3,
    [objectives, auditCriteria, scopeOfAudit, proposedDatesParsed.length]
  );

  function addRequiredDoc() {
    setRequiredDocs((prev) => [...prev, '']);
  }
  function removeRequiredDoc(i: number) {
    setRequiredDocs((prev) => prev.filter((_, idx) => idx !== i));
  }
  function setRequiredDoc(i: number, value: string) {
    setRequiredDocs((prev) => {
      const next = [...prev];
      next[i] = value;
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      setLoading(true);
      const auditorUserIds = auditorIdsInput
        ? (auditorIdsInput.split(',').map((s) => s.trim()).filter(Boolean) as UUID[])
        : [props.createdByUserId];
      const departmentsAuditeeIds = auditeeIdsInput
        ? (auditeeIdsInput.split(',').map((s) => s.trim()).filter(Boolean) as UUID[])
        : undefined;
      const companyRepresentativeUserIds = companyRepIdsInput
        ? (companyRepIdsInput.split(',').map((s) => s.trim()).filter(Boolean) as UUID[])
        : undefined;
      const requiredDocumentList = requiredDocs
        .map((s) => s.trim())
        .filter(Boolean)
        .map((label, i) => ({ key: `doc-${i}`, label }));
      const documentSubmissionDeadline = documentDeadline
        ? (() => {
            const dd = new Date(documentDeadline);
            return !Number.isNaN(dd.getTime()) ? dd.toISOString() : undefined;
          })()
        : undefined;

      await createAudit({
        companyId: props.companyId,
        module,
        auditType,
        title: title.trim() || objectives.trim().slice(0, 255),
        objectives: objectives.trim(),
        auditCriteria: auditCriteria.trim(),
        scopeOfAudit: scopeOfAudit.trim(),
        location: location.trim(),
        auditorUserIds,
        proposedDates: proposedDatesParsed,
        createdByUserId: props.createdByUserId,
        requiredDocumentList: requiredDocumentList.length ? requiredDocumentList : undefined,
        documentSubmissionDeadline,
        departmentsAuditeeIds,
        companyRepresentativeUserIds,
        leadAuditorUserId: leadAuditorId ? (leadAuditorId as UUID) : undefined,
        checklistTemplateId: checklistTemplateId ? (checklistTemplateId as UUID) : undefined
      });

      clearDraft(draftKey);
      props.onCreated?.();
      props.onClose();
      setTitle('');
      setObjectives('');
      setAuditCriteria('');
      setScopeOfAudit('');
      setProposedDates(['', '', '']);
      setLocation('');
      setAuditorIdsInput('');
      setAuditeeIdsInput('');
      setCompanyRepIdsInput('');
      setLeadAuditorId('');
      setDocumentDeadline('');
      setRequiredDocs(['']);
      setChecklistTemplateId('');
      setModule('safety');
      setAuditType('internal');
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-2xl mx-4 bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <div>
            <p className="text-sm font-semibold text-charcoal">Plan new audit</p>
            <p className="text-xs text-charcoal-500 mt-0.5">
              Creates a full audit record with objectives, criteria, scope, and proposed date.
            </p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-500"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-critical">Could not schedule</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Module</label>
              <select
                value={module}
                onChange={(e) => setModule(e.target.value as ModuleKey)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="safety">Safety</option>
                <option value="quality">Quality</option>
                <option value="environment">Environment</option>
                <option value="health">Health</option>
                <option value="legal">Legal</option>
                <option value="hr">HR</option>
                <option value="general">General</option>
                <option value="security">Security</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Audit type</label>
              <select
                value={auditType}
                onChange={(e) =>
                  setAuditType(
                    e.target.value as 'internal' | 'external' | 'client' | 'supplier' | 'certification'
                  )
                }
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="internal">Internal</option>
                <option value="external">External</option>
                <option value="client">Client</option>
                <option value="supplier">Supplier</option>
                <option value="certification">Certification</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Audit title (optional)</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q1 2026 Safety Management System Audit"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Objectives *</label>
            <input
              value={objectives}
              onChange={(e) => setObjectives(e.target.value)}
              placeholder="e.g. Verify ISO 45001 implementation and legal compliance"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Audit criteria *</label>
            <input
              value={auditCriteria}
              onChange={(e) => setAuditCriteria(e.target.value)}
              placeholder="e.g. ISO 45001:2018, OHS Act, internal procedures"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Scope of audit *</label>
            <input
              value={scopeOfAudit}
              onChange={(e) => setScopeOfAudit(e.target.value)}
              placeholder="e.g. Operations at Site A, maintenance workshop, warehouse"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">
              Proposed dates (at least 3) *
            </label>
            {proposedDates.map((dateVal, i) => (
              <div key={i} className="flex gap-2 mb-2 items-center">
                <span className="text-xs text-charcoal-500 w-16 shrink-0">Date {i + 1}</span>
                <input
                  type="date"
                  value={dateVal}
                  onChange={(e) => setProposedDate(i, e.target.value)}
                  className="flex-1 px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
                {proposedDates.length > 3 && (
                  <button
                    type="button"
                    onClick={() => removeProposedDate(i)}
                    className="p-2 rounded-lg border border-surface-300 text-charcoal-500 hover:bg-surface-50"
                    title="Remove date"
                  >
                    <Trash2Icon className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addProposedDate}
              className="inline-flex items-center gap-1 text-sm text-teal font-medium hover:underline"
            >
              <PlusIcon className="w-4 h-4" /> Add another date
            </button>
            <p className="mt-1 text-xs text-charcoal-400">
              {proposedDatesParsed.length < 3
                ? `Select at least 3 dates. Current: ${proposedDatesParsed.length}`
                : `${proposedDatesParsed.length} date(s) — auditee will choose one.`}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Location (optional)</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Site A"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Checklist template (optional)</label>
            <select
              value={checklistTemplateId}
              onChange={(e) => setChecklistTemplateId(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            >
              <option value="">None / add manually later</option>
              {(templates ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Required documents (optional)</label>
            {requiredDocs.map((doc, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input
                  value={doc}
                  onChange={(e) => setRequiredDoc(i, e.target.value)}
                  placeholder="e.g. Training records, Risk assessments"
                  className="flex-1 px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => removeRequiredDoc(i)}
                  disabled={requiredDocs.length <= 1}
                  className="p-2 rounded-lg border border-surface-300 text-charcoal-500 hover:bg-surface-50 disabled:opacity-50"
                >
                  <Trash2Icon className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addRequiredDoc}
              className="inline-flex items-center gap-1 text-sm text-teal font-medium hover:underline"
            >
              <PlusIcon className="w-4 h-4" /> Add required document
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Document submission deadline (optional)</label>
            <input
              type="datetime-local"
              value={documentDeadline}
              onChange={(e) => setDocumentDeadline(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Auditors (optional)</label>
            <input
              value={auditorIdsInput}
              onChange={(e) => setAuditorIdsInput(e.target.value)}
              placeholder="Comma-separated user IDs; leave empty to default to the creator"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Lead auditor (optional)</label>
            <input
              value={leadAuditorId}
              onChange={(e) => setLeadAuditorId(e.target.value)}
              placeholder="User ID of lead auditor"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Auditees / department reps (optional)</label>
            <input
              value={auditeeIdsInput}
              onChange={(e) => setAuditeeIdsInput(e.target.value)}
              placeholder="Comma-separated user IDs — they will approve the audit date"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Company representatives (optional)</label>
            <input
              value={companyRepIdsInput}
              onChange={(e) => setCompanyRepIdsInput(e.target.value)}
              placeholder="Comma-separated user IDs"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
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
              Create audit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

