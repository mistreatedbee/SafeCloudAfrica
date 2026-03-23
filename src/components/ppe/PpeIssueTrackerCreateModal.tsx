import React, { useEffect, useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { Department, PpeIssueTrackerRiskLevel, Site, UUID } from '../../api/models/entities';
import { createPpeIssueTracker } from '../../api/services/ppeIssueTrackerService';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';

const PPE_TYPES = [
  { value: 'helmet', label: 'Helmet' },
  { value: 'gloves', label: 'Gloves' },
  { value: 'safety_boots', label: 'Safety Boots' },
  { value: 'eye_protection', label: 'Eye Protection' },
  { value: 'hearing_protection', label: 'Hearing Protection' },
  { value: 'respirator_mask', label: 'Respirator / Mask' },
  { value: 'reflective_vest', label: 'Reflective Vest' },
  { value: 'chainsaw_ppe', label: 'Chainsaw PPE' },
  { value: 'chemical_ppe', label: 'Chemical PPE' },
  { value: 'other', label: 'Other (specify)' }
] as const;

const ISSUE_CATEGORIES = [
  { value: 'missing_ppe', label: 'Missing PPE' },
  { value: 'damaged_ppe', label: 'Damaged PPE' },
  { value: 'expired_ppe', label: 'Expired PPE' },
  { value: 'incorrect_ppe', label: 'Incorrect PPE' },
  { value: 'ppe_not_worn', label: 'PPE Not Worn' },
  { value: 'poor_condition', label: 'Poor Condition' },
  { value: 'insufficient_supply', label: 'Insufficient Supply' },
  { value: 'non_approved_ppe', label: 'Non-Approved PPE' }
] as const;

const RISK_LEVELS: { value: PpeIssueTrackerRiskLevel; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' }
];

export function PpeIssueTrackerCreateModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  actorUserId: UUID;
  sites: Site[];
  departments: Department[];
  onCreated?: () => void;
}) {
  const [ppeType, setPpeType] = useState<string>('');
  const [ppeTypeOther, setPpeTypeOther] = useState('');
  const [issueCategory, setIssueCategory] = useState<string>('');
  const [riskLevel, setRiskLevel] = useState<PpeIssueTrackerRiskLevel>('medium');
  const [siteId, setSiteId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [jobRole, setJobRole] = useState('');
  const [description, setDescription] = useState('');
  const [immediateWorkStopped, setImmediateWorkStopped] = useState(false);
  const [immediatePpeIssued, setImmediatePpeIssued] = useState(false);
  const [immediateEmployeeRemoved, setImmediateEmployeeRemoved] = useState(false);
  const [immediateToolboxTalk, setImmediateToolboxTalk] = useState(false);
  const [immediateSupervisorNotified, setImmediateSupervisorNotified] = useState(false);
  const [immediateNotes, setImmediateNotes] = useState('');
  const [targetCompletionDate, setTargetCompletionDate] = useState('');
  const [correctiveRequired, setCorrectiveRequired] = useState(true);
  const [responsibleName, setResponsibleName] = useState('');
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  type PpeIssueTrackerCreateDraftPayload = {
    ppeType: string;
    ppeTypeOther: string;
    issueCategory: string;
    riskLevel: PpeIssueTrackerRiskLevel;
    siteId: string;
    departmentId: string;
    employeeName: string;
    employeeNumber: string;
    jobRole: string;
    description: string;
    immediateWorkStopped: boolean;
    immediatePpeIssued: boolean;
    immediateEmployeeRemoved: boolean;
    immediateToolboxTalk: boolean;
    immediateSupervisorNotified: boolean;
    immediateNotes: string;
    targetCompletionDate: string;
    correctiveRequired: boolean;
    responsibleName: string;
    notes: string;
  };

  const { restoreDraft, clearDraft } = useDraftManager();
  const draftKey = `ppe-issue-tracker-create:${props.companyId}:${props.actorUserId}`;

  const hasDirtyDraft = useMemo(() => {
    return (
      ppeType.trim().length > 0 ||
      ppeTypeOther.trim().length > 0 ||
      issueCategory.trim().length > 0 ||
      riskLevel !== 'medium' ||
      siteId.trim().length > 0 ||
      departmentId.trim().length > 0 ||
      employeeName.trim().length > 0 ||
      employeeNumber.trim().length > 0 ||
      jobRole.trim().length > 0 ||
      description.trim().length > 0 ||
      immediateWorkStopped ||
      immediatePpeIssued ||
      immediateEmployeeRemoved ||
      immediateToolboxTalk ||
      immediateSupervisorNotified ||
      immediateNotes.trim().length > 0 ||
      targetCompletionDate.trim().length > 0 ||
      correctiveRequired !== true ||
      responsibleName.trim().length > 0 ||
      notes.trim().length > 0
    );
  }, [
    correctiveRequired,
    departmentId,
    description,
    employeeName,
    employeeNumber,
    immediateEmployeeRemoved,
    immediateNotes,
    immediatePpeIssued,
    immediateSupervisorNotified,
    immediateToolboxTalk,
    immediateWorkStopped,
    issueCategory,
    jobRole,
    notes,
    ppeType,
    ppeTypeOther,
    responsibleName,
    riskLevel,
    siteId,
    targetCompletionDate
  ]);

  useDraftRegistration({
    key: draftKey,
    enabled: props.open,
    isDirty: () => hasDirtyDraft,
    serialize: () =>
      ({
        ppeType,
        ppeTypeOther,
        issueCategory,
        riskLevel,
        siteId,
        departmentId,
        employeeName,
        employeeNumber,
        jobRole,
        description,
        immediateWorkStopped,
        immediatePpeIssued,
        immediateEmployeeRemoved,
        immediateToolboxTalk,
        immediateSupervisorNotified,
        immediateNotes,
        targetCompletionDate,
        correctiveRequired,
        responsibleName,
        notes
      }) satisfies PpeIssueTrackerCreateDraftPayload
  });

  useEffect(() => {
    if (!props.open) return;
    const restored = restoreDraft<PpeIssueTrackerCreateDraftPayload>(draftKey);
    if (!restored) return;

    setPpeType(restored.ppeType ?? '');
    setPpeTypeOther(restored.ppeTypeOther ?? '');
    setIssueCategory(restored.issueCategory ?? '');
    setRiskLevel(restored.riskLevel ?? 'medium');
    setSiteId(restored.siteId ?? '');
    setDepartmentId(restored.departmentId ?? '');
    setEmployeeName(restored.employeeName ?? '');
    setEmployeeNumber(restored.employeeNumber ?? '');
    setJobRole(restored.jobRole ?? '');
    setDescription(restored.description ?? '');
    setImmediateWorkStopped(restored.immediateWorkStopped ?? false);
    setImmediatePpeIssued(restored.immediatePpeIssued ?? false);
    setImmediateEmployeeRemoved(restored.immediateEmployeeRemoved ?? false);
    setImmediateToolboxTalk(restored.immediateToolboxTalk ?? false);
    setImmediateSupervisorNotified(restored.immediateSupervisorNotified ?? false);
    setImmediateNotes(restored.immediateNotes ?? '');
    setTargetCompletionDate(restored.targetCompletionDate ?? '');
    setCorrectiveRequired(restored.correctiveRequired ?? true);
    setResponsibleName(restored.responsibleName ?? '');
    setNotes(restored.notes ?? '');
  }, [draftKey, props.open, restoreDraft]);

  const closeWithDraftClear = () => {
    clearDraft(draftKey);
    props.onClose();
  };

  const canSubmit = useMemo(
    () => !!ppeType && !!issueCategory && description.trim().length > 5,
    [ppeType, issueCategory, description]
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      setLoading(true);
      await createPpeIssueTracker({
        companyId: props.companyId,
        createdByUserId: props.actorUserId,
        reportedByUserId: props.actorUserId,
        reportedByName: null,
        siteId: siteId ? (siteId as any) : null,
        departmentId: departmentId ? (departmentId as any) : null,
        contractorOrEmployeeName: employeeName || null,
        employeeNumber: employeeNumber || null,
        jobRoleOrTask: jobRole || null,
        ppeType: ppeType as any,
        ppeTypeOther: ppeType === 'other' ? ppeTypeOther || null : null,
        issueCategory: issueCategory as any,
        descriptionOfIssue: description.trim(),
        riskLevel,
        immediateWorkStopped,
        immediatePpeIssued,
        immediateEmployeeRemoved,
        immediateToolboxTalk,
        immediateSupervisorNotified,
        immediateActionNotes: immediateNotes || null,
        correctiveActionRequired: correctiveRequired,
        responsibleUserName: responsibleName || null,
        targetCompletionDate: targetCompletionDate || null,
        replacementPpeIssued: immediatePpeIssued,
        trainingRequired: false,
        disciplinaryAction: notes || null
      });
      props.onCreated?.();
      clearDraft(draftKey);
      props.onClose();
      setPpeType('');
      setPpeTypeOther('');
      setIssueCategory('');
      setRiskLevel('medium');
      setSiteId('');
      setDepartmentId('');
      setEmployeeName('');
      setEmployeeNumber('');
      setJobRole('');
      setDescription('');
      setImmediateWorkStopped(false);
      setImmediatePpeIssued(false);
      setImmediateEmployeeRemoved(false);
      setImmediateToolboxTalk(false);
      setImmediateSupervisorNotified(false);
      setImmediateNotes('');
      setTargetCompletionDate('');
      setCorrectiveRequired(true);
      setResponsibleName('');
      setNotes('');
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={closeWithDraftClear} />
      <div className="relative w-full max-w-3xl mx-4 bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <div>
            <p className="text-sm font-semibold text-charcoal">Report PPE Issue / Non-compliance</p>
            <p className="text-xs text-charcoal-500 mt-0.5">
              Capture missing, damaged, expired or incorrectly used PPE and immediate actions taken.
            </p>
          </div>
          <button
            type="button"
            onClick={closeWithDraftClear}
            className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-500"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-critical">Could not create PPE issue</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">PPE Type *</label>
              <select
                value={ppeType}
                onChange={(e) => setPpeType(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="">Select PPE type</option>
                {PPE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              {ppeType === 'other' && (
                <input
                  value={ppeTypeOther}
                  onChange={(e) => setPpeTypeOther(e.target.value)}
                  placeholder="Specify PPE type"
                  className="mt-2 w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Issue Category *</label>
              <select
                value={issueCategory}
                onChange={(e) => setIssueCategory(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="">Select category</option>
                {ISSUE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Risk Level *</label>
              <select
                value={riskLevel}
                onChange={(e) => setRiskLevel(e.target.value as PpeIssueTrackerRiskLevel)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                {RISK_LEVELS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Site</label>
              <select
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="">All sites / not specified</option>
                {props.sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Department</label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              >
                <option value="">All departments / not specified</option>
                {props.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">
                Employee / Contractor Name
              </label>
              <input
                value={employeeName}
                onChange={(e) => setEmployeeName(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Employee No.</label>
              <input
                value={employeeNumber}
                onChange={(e) => setEmployeeNumber(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Job role / task</label>
            <input
              value={jobRole}
              onChange={(e) => setJobRole(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">
              Description of issue *
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Describe what was observed, where and when, in factual and objective terms."
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>

          <div className="border-t border-surface-200 pt-4 mt-2">
            <p className="text-sm font-semibold text-charcoal mb-2">Immediate actions taken</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={immediateWorkStopped}
                  onChange={(e) => setImmediateWorkStopped(e.target.checked)}
                />
                <span>Work stopped</span>
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={immediatePpeIssued}
                  onChange={(e) => setImmediatePpeIssued(e.target.checked)}
                />
                <span>PPE issued / replaced</span>
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={immediateEmployeeRemoved}
                  onChange={(e) => setImmediateEmployeeRemoved(e.target.checked)}
                />
                <span>Employee removed from task</span>
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={immediateToolboxTalk}
                  onChange={(e) => setImmediateToolboxTalk(e.target.checked)}
                />
                <span>Toolbox talk conducted</span>
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={immediateSupervisorNotified}
                  onChange={(e) => setImmediateSupervisorNotified(e.target.checked)}
                />
                <span>Supervisor notified</span>
              </label>
            </div>
            <textarea
              value={immediateNotes}
              onChange={(e) => setImmediateNotes(e.target.value)}
              rows={2}
              placeholder="Notes on immediate actions (optional)"
              className="mt-3 w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>

          <div className="border-t border-surface-200 pt-4 mt-2 space-y-3">
            <p className="text-sm font-semibold text-charcoal">Corrective action & follow-up</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={correctiveRequired}
                  onChange={(e) => setCorrectiveRequired(e.target.checked)}
                />
                <span>Corrective action required</span>
              </label>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">
                  Target completion date
                </label>
                <input
                  type="date"
                  value={targetCompletionDate}
                  onChange={(e) => setTargetCompletionDate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">
                  Responsible person (name)
                </label>
                <input
                  value={responsibleName}
                  onChange={(e) => setResponsibleName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">
                Notes / disciplinary or training requirements (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
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
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-navy text-white text-sm font-semibold hover:bg-navy-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading && <LoadingSpinner size={16} />}
              Save issue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

