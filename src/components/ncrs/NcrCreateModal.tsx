import React, { useMemo, useState } from 'react';
import { XIcon, FileIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { UUID, Severity } from '../../api/models/core';
import { createQualityNcr, syncNcrEvidenceFromAttachments } from '../../api/services/qualityNcrsService';
import { createEvidence } from '../../api/services/evidenceService';
import { insforge } from '../../api/insforge/client';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';
import { useToast } from '../ui/ToastProvider';

type NcrSource = 'audit' | 'audit_finding' | 'incident' | 'complaint' | 'risk' | 'inspection' | 'pjo';
type LinkedRequirementType = 'STANDARD' | 'POLICY' | 'PROCEDURE';
type RiskClassification = 'Low' | 'Medium' | 'High' | 'Critical';

const EVIDENCE_BUCKET = 'sca-evidence';

export function NcrCreateModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  createdByUserId: UUID;
  defaultModule?: string;
  linkedSource?: { type: NcrSource; id?: string };
  onCreated?: () => void;
}) {
  const { restoreDraft, clearDraft } = useDraftManager();
  const { showSuccess, showError } = useToast();
  const draftKey = `ncr-create:${props.companyId}:${props.createdByUserId}:${props.linkedSource?.id ?? 'new'}`;
  const [ncrNumber, setNcrNumber] = useState('');
  const [ncrDate, setNcrDate] = useState(new Date().toISOString().slice(0, 10));
  const [ncrTime, setNcrTime] = useState(new Date().toTimeString().slice(0, 5));
  const [location, setLocation] = useState('');
  const [department, setDepartment] = useState('');
  const [process, setProcess] = useState('');
  const [activity, setActivity] = useState('');
  const [responsibleRole, setResponsibleRole] = useState('');
  const [linkedRequirementType, setLinkedRequirementType] = useState<LinkedRequirementType>('STANDARD');
  const [linkedRequirement, setLinkedRequirement] = useState('');
  const [riskClassification, setRiskClassification] = useState<RiskClassification>('Medium');
  const [rootCause, setRootCause] = useState('');
  const [rootCauseSelections, setRootCauseSelections] = useState<Record<string, string>>({});
  const [correctiveActions, setCorrectiveActions] = useState('');
  const [responsiblePerson, setResponsiblePerson] = useState('');
  const [source, setSource] = useState<NcrSource>(props.linkedSource?.type || 'audit');
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<Severity>('medium');
  const [evidenceBeforeFiles, setEvidenceBeforeFiles] = useState<File[]>([]);
  const [evidenceAfterFiles, setEvidenceAfterFiles] = useState<File[]>([]);
  const [evidenceBeforeDraftNames, setEvidenceBeforeDraftNames] = useState<string[]>([]);
  const [evidenceAfterDraftNames, setEvidenceAfterDraftNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finalNcrNumber = useMemo(() => {
    if (ncrNumber.trim()) return ncrNumber.trim();
    return `NCR-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
  }, [ncrNumber]);

  const missingFields = useMemo(() => {
    const missing: string[] = [];
    if (title.trim().length <= 2) missing.push('Title (at least 3 characters)');
    if (location.trim().length === 0) missing.push('Location');
    if (department.trim().length === 0) missing.push('Department / Process');
    if (activity.trim().length === 0) missing.push('Activity Involved');
    if (responsibleRole.trim().length === 0) missing.push('Responsible Role');
    if (linkedRequirement.trim().length === 0) missing.push('Linked Requirement');
    if (rootCause.trim().length === 0) missing.push('Root Cause Analysis');
    if (correctiveActions.trim().length === 0) missing.push('Corrective Actions');
    if (responsiblePerson.trim().length === 0) missing.push('Responsible Person');
    if (evidenceBeforeFiles.length === 0) missing.push('Evidence of Non-Conformance (at least one file)');
    return missing;
  }, [
    title,
    location,
    department,
    activity,
    responsibleRole,
    linkedRequirement,
    rootCause,
    correctiveActions,
    responsiblePerson,
    evidenceBeforeFiles.length
  ]);

  const canSubmit = missingFields.length === 0;

  const ROOT_CAUSE_OPTIONS = [
    'Lack of training',
    'Poor supervision',
    'No procedure',
    'Procedure not followed',
    'Equipment failure',
    'Communication failure',
    'Risk not assessed',
    'Resource constraints',
    'Management system failure'
  ];

  const appendFiles = (
    files: FileList | null,
    setter: React.Dispatch<React.SetStateAction<File[]>>
  ) => {
    if (!files) return;
    if (setter === setEvidenceBeforeFiles) setEvidenceBeforeDraftNames([]);
    if (setter === setEvidenceAfterFiles) setEvidenceAfterDraftNames([]);
    setter((prev) => [...prev, ...Array.from(files)]);
  };

  const removeFileAtIndex = (
    index: number,
    setter: React.Dispatch<React.SetStateAction<File[]>>
  ) => {
    setter((prev) => prev.filter((_, i) => i !== index));
    if (setter === setEvidenceBeforeFiles) setEvidenceBeforeDraftNames((prev) => prev.filter((_, i) => i !== index));
    if (setter === setEvidenceAfterFiles) setEvidenceAfterDraftNames((prev) => prev.filter((_, i) => i !== index));
  };

  const hasDirtyDraft = useMemo(
    () =>
      props.open &&
      (ncrNumber.trim().length > 0 ||
        title.trim().length > 0 ||
        location.trim().length > 0 ||
        department.trim().length > 0 ||
        process.trim().length > 0 ||
        activity.trim().length > 0 ||
        responsibleRole.trim().length > 0 ||
        linkedRequirement.trim().length > 0 ||
        rootCause.trim().length > 0 ||
        correctiveActions.trim().length > 0 ||
        responsiblePerson.trim().length > 0 ||
        evidenceBeforeFiles.length > 0 ||
        evidenceAfterFiles.length > 0 ||
        evidenceBeforeDraftNames.length > 0 ||
        evidenceAfterDraftNames.length > 0),
    [
      activity,
      correctiveActions,
      department,
      evidenceAfterDraftNames.length,
      evidenceAfterFiles.length,
      evidenceBeforeDraftNames.length,
      evidenceBeforeFiles.length,
      linkedRequirement,
      location,
      ncrNumber,
      process,
      props.open,
      responsiblePerson,
      responsibleRole,
      rootCause,
      title
    ]
  );

  useDraftRegistration({
    key: draftKey,
    label: 'NCR Form',
    enabled: props.open,
    metadata: {
      organizationId: props.companyId,
      moduleName: 'quality',
      formType: 'ncr-create',
      linkedRecordId: props.linkedSource?.id ?? null
    },
    isDirty: () => hasDirtyDraft,
    serialize: () => ({
      ncrNumber,
      ncrDate,
      ncrTime,
      location,
      department,
      process,
      activity,
      responsibleRole,
      linkedRequirementType,
      linkedRequirement,
      riskClassification,
      rootCause,
      rootCauseSelections,
      correctiveActions,
      responsiblePerson,
      source,
      title,
      severity,
      evidenceBeforeDraftNames: evidenceBeforeFiles.map((file) => file.name),
      evidenceAfterDraftNames: evidenceAfterFiles.map((file) => file.name)
    }),
    hasPendingUploads: () =>
      evidenceBeforeFiles.length > 0 ||
      evidenceAfterFiles.length > 0 ||
      evidenceBeforeDraftNames.length > 0 ||
      evidenceAfterDraftNames.length > 0,
    pendingUploadsMessage: () => 'Re-select evidence files if you restore this draft on another session.'
  });

  React.useEffect(() => {
    if (!props.open) return;
    const restored = restoreDraft<{
      ncrNumber?: string;
      ncrDate?: string;
      ncrTime?: string;
      location?: string;
      department?: string;
      process?: string;
      activity?: string;
      responsibleRole?: string;
      linkedRequirementType?: LinkedRequirementType;
      linkedRequirement?: string;
      riskClassification?: RiskClassification;
      rootCause?: string;
      rootCauseSelections?: Record<string, string>;
      correctiveActions?: string;
      responsiblePerson?: string;
      source?: NcrSource;
      title?: string;
      severity?: Severity;
      evidenceBeforeDraftNames?: string[];
      evidenceAfterDraftNames?: string[];
    }>(draftKey);

    if (!restored) return;
    if (typeof restored.ncrNumber === 'string') setNcrNumber(restored.ncrNumber);
    if (typeof restored.ncrDate === 'string') setNcrDate(restored.ncrDate);
    if (typeof restored.ncrTime === 'string') setNcrTime(restored.ncrTime);
    if (typeof restored.location === 'string') setLocation(restored.location);
    if (typeof restored.department === 'string') setDepartment(restored.department);
    if (typeof restored.process === 'string') setProcess(restored.process);
    if (typeof restored.activity === 'string') setActivity(restored.activity);
    if (typeof restored.responsibleRole === 'string') setResponsibleRole(restored.responsibleRole);
    if (restored.linkedRequirementType) setLinkedRequirementType(restored.linkedRequirementType);
    if (typeof restored.linkedRequirement === 'string') setLinkedRequirement(restored.linkedRequirement);
    if (restored.riskClassification) setRiskClassification(restored.riskClassification);
    if (typeof restored.rootCause === 'string') setRootCause(restored.rootCause);
    if (restored.rootCauseSelections) setRootCauseSelections(restored.rootCauseSelections);
    if (typeof restored.correctiveActions === 'string') setCorrectiveActions(restored.correctiveActions);
    if (typeof restored.responsiblePerson === 'string') setResponsiblePerson(restored.responsiblePerson);
    if (restored.source) setSource(restored.source);
    if (typeof restored.title === 'string') setTitle(restored.title);
    if (restored.severity) setSeverity(restored.severity);
    setEvidenceBeforeFiles([]);
    setEvidenceAfterFiles([]);
    setEvidenceBeforeDraftNames(restored.evidenceBeforeDraftNames ?? []);
    setEvidenceAfterDraftNames(restored.evidenceAfterDraftNames ?? []);
  }, [draftKey, props.open, restoreDraft]);

  async function uploadEvidenceFiles(ncrId: UUID, files: File[], kind: 'BEFORE' | 'AFTER') {
    for (const file of files) {
      const key = `${props.companyId}/ncr/${ncrId}/${kind.toLowerCase()}/${Date.now()}-${file.name}`.replace(/\s+/g, '_');
      const { data: uploaded, error: uploadError } = await insforge.storage.from(EVIDENCE_BUCKET).upload(key, file);
      if (uploadError) throw uploadError;
      await createEvidence({
        companyId: props.companyId,
        entityType: 'ncr',
        entityId: ncrId,
        storageBucket: EVIDENCE_BUCKET,
        storageKey: uploaded?.path ?? key,
        createdByUserId: props.createdByUserId,
        originalFilename: file.name,
        displayTitle: file.name,
        fileKind: kind
      });
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    if (evidenceBeforeFiles.length < 1) {
      setError('Evidence of Non-Conformance is required before creating an NCR.');
      return;
    }

    setError(null);
    try {
      setLoading(true);

      const descriptionParts: string[] = [];
      descriptionParts.push(`NCR Number: ${finalNcrNumber}`);
      descriptionParts.push(`Date & Time: ${ncrDate} ${ncrTime}`);
      descriptionParts.push(`Location: ${location}`);
      descriptionParts.push(`Department / Process: ${department} / ${process}`);
      descriptionParts.push(`Activity Involved: ${activity}`);
      descriptionParts.push(`Responsible Role: ${responsibleRole}`);
      descriptionParts.push(`Linked Requirement Type: ${linkedRequirementType}`);
      descriptionParts.push(`Linked Requirement: ${linkedRequirement}`);
      descriptionParts.push(`Risk Classification: ${riskClassification}`);
      descriptionParts.push(`Root Cause: ${rootCause}`);
      if (Object.keys(rootCauseSelections).length > 0) {
        descriptionParts.push(
          `Root Cause Categories: ${Object.entries(rootCauseSelections)
            .map(([category, explanation]) => `${category}${explanation ? ` (${explanation})` : ''}`)
            .join('; ')}`
        );
      }
      descriptionParts.push(`Corrective Actions: ${correctiveActions}`);
      descriptionParts.push(`Responsible Person: ${responsiblePerson}`);
      descriptionParts.push(`Source: ${source}`);
      descriptionParts.push(`Evidence of Non-Conformance files: ${evidenceBeforeFiles.length}`);
      descriptionParts.push(`Evidence of Closure files: ${evidenceAfterFiles.length}`);
      if (props.linkedSource?.id) {
        descriptionParts.push(`Linked Source ID: ${props.linkedSource.id}`);
      }

      const created = await createQualityNcr({
        companyId: props.companyId,
        title: title.trim(),
        description: descriptionParts.join('\n\n'),
        severity,
        createdByUserId: props.createdByUserId,
        location: location.trim(),
        process_involved: department.trim(),
        activity_involved: activity.trim(),
        responsible_role: responsibleRole.trim(),
        linked_requirement_type: linkedRequirementType,
        linked_requirement: linkedRequirement.trim(),
        risk_classification: riskClassification.toLowerCase(),
        root_cause: rootCause.trim(),
        root_cause_categories: Object.entries(rootCauseSelections).map(([category, explanation]) => ({
          category,
          explanation: explanation || null
        })),
        corrective_action: correctiveActions.trim(),
        corrective_action_due_date: new Date(ncrDate).toISOString().split('T')[0],
        source_entity_type: source,
        source_entity_id: props.linkedSource?.id ? (props.linkedSource.id as UUID) : undefined
      });

      await uploadEvidenceFiles(created.id, evidenceBeforeFiles, 'BEFORE');
      if (evidenceAfterFiles.length > 0) {
        await uploadEvidenceFiles(created.id, evidenceAfterFiles, 'AFTER');
      }
      await syncNcrEvidenceFromAttachments(props.companyId, created.id);

      showSuccess(`NCR ${finalNcrNumber} created successfully.`);
      props.onCreated?.();
      clearDraft(draftKey);
      props.onClose();
      resetForm();
    } catch (err: any) {
      const message = formatAuthError(err);
      setError(message);
      showError(message);
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setNcrNumber('');
    setNcrDate(new Date().toISOString().slice(0, 10));
    setNcrTime(new Date().toTimeString().slice(0, 5));
    setLocation('');
    setDepartment('');
    setProcess('');
    setActivity('');
    setResponsibleRole('');
    setLinkedRequirementType('STANDARD');
    setLinkedRequirement('');
    setRiskClassification('Medium');
    setRootCause('');
    setRootCauseSelections({});
    setCorrectiveActions('');
    setResponsiblePerson('');
    setSource(props.linkedSource?.type || 'audit');
    setTitle('');
    setSeverity('medium');
    setEvidenceBeforeFiles([]);
    setEvidenceAfterFiles([]);
    setEvidenceBeforeDraftNames([]);
    setEvidenceAfterDraftNames([]);
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-surface-200 px-5 py-4 flex items-center justify-between z-10">
          <div>
            <p className="text-sm font-semibold text-charcoal">Create Non-Conformance Report (NCR)</p>
            <p className="text-xs text-charcoal-500 mt-0.5">NCR applies to all modules. All fields marked with * are mandatory.</p>
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

        <form onSubmit={onSubmit} className="p-5 space-y-6">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-critical">Could not create NCR</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          <div className="border-b border-surface-200 pb-4">
            <h3 className="text-sm font-semibold text-charcoal mb-4">Basic Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Unique NC Number</label>
                <input
                  value={ncrNumber}
                  onChange={(e) => setNcrNumber(e.target.value)}
                  placeholder={`Auto: ${finalNcrNumber}`}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
                <p className="text-xs text-charcoal-500 mt-1">Leave empty to auto-generate: {finalNcrNumber}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Title *</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Brief description of non-conformance"
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Date *</label>
                <input
                  type="date"
                  value={ncrDate}
                  onChange={(e) => setNcrDate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Time *</label>
                <input
                  type="time"
                  value={ncrTime}
                  onChange={(e) => setNcrTime(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Severity</label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as Severity)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>
          </div>

          <div className="border-b border-surface-200 pb-4">
            <h3 className="text-sm font-semibold text-charcoal mb-4">Location & Process (All Mandatory)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Location *</label>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Warehouse A, Site 3"
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Department / Process *</label>
                <input
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="Department or process name"
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Process (if different)</label>
                <input
                  value={process}
                  onChange={(e) => setProcess(e.target.value)}
                  placeholder="Specific process if different from department"
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Activity Involved *</label>
                <input
                  value={activity}
                  onChange={(e) => setActivity(e.target.value)}
                  placeholder="Activity where non-conformance occurred"
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  required
                />
              </div>
            </div>
          </div>

          <div className="border-b border-surface-200 pb-4">
            <h3 className="text-sm font-semibold text-charcoal mb-4">Responsibility & Linked Requirements (All Mandatory)</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Responsible Role * (not blame-based)</label>
                <input
                  value={responsibleRole}
                  onChange={(e) => setResponsibleRole(e.target.value)}
                  placeholder="e.g. Operations Manager, Quality Supervisor"
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  required
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Linked to requirement type *</label>
                  <select
                    value={linkedRequirementType}
                    onChange={(e) => setLinkedRequirementType(e.target.value as LinkedRequirementType)}
                    className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                    required
                  >
                    <option value="STANDARD">Standard</option>
                    <option value="POLICY">Policy</option>
                    <option value="PROCEDURE">Procedure</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Linked Requirement *</label>
                  <input
                    value={linkedRequirement}
                    onChange={(e) => setLinkedRequirement(e.target.value)}
                    placeholder="Reference for the linked requirement"
                    className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                    required
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="border-b border-surface-200 pb-4">
            <h3 className="text-sm font-semibold text-charcoal mb-4">Risk Classification & Root Cause (All Mandatory)</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Risk Classification *</label>
                <select
                  value={riskClassification}
                  onChange={(e) => setRiskClassification(e.target.value as RiskClassification)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  required
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Root Cause Analysis *</label>
                <textarea
                  value={rootCause}
                  onChange={(e) => setRootCause(e.target.value)}
                  rows={4}
                  placeholder="Detailed root cause analysis..."
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Root Cause Categories (multi-select)</label>
                <div className="space-y-2">
                  {ROOT_CAUSE_OPTIONS.map((option) => {
                    const checked = option in rootCauseSelections;
                    return (
                      <div key={option} className="border border-surface-200 rounded-lg p-2">
                        <label className="inline-flex items-center gap-2 text-sm text-charcoal">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (!e.target.checked) {
                                setRootCauseSelections((prev) => {
                                  const next = { ...prev };
                                  delete next[option];
                                  return next;
                                });
                              } else {
                                setRootCauseSelections((prev) => ({ ...prev, [option]: prev[option] ?? '' }));
                              }
                            }}
                          />
                          {option}
                        </label>
                        {checked && (
                          <input
                            value={rootCauseSelections[option] ?? ''}
                            onChange={(e) =>
                              setRootCauseSelections((prev) => ({ ...prev, [option]: e.target.value }))
                            }
                            placeholder="Optional explanation"
                            className="mt-2 w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="border-b border-surface-200 pb-4">
            <h3 className="text-sm font-semibold text-charcoal mb-4">Corrective Actions (All Mandatory)</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Corrective Actions *</label>
                <textarea
                  value={correctiveActions}
                  onChange={(e) => setCorrectiveActions(e.target.value)}
                  rows={4}
                  placeholder="Actions to address the non-conformance..."
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Responsible Person *</label>
                <input
                  value={responsiblePerson}
                  onChange={(e) => setResponsiblePerson(e.target.value)}
                  placeholder="Name of person responsible for corrective actions"
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  required
                />
              </div>
            </div>
          </div>

          <div className="border-b border-surface-200 pb-4">
            <h3 className="text-sm font-semibold text-charcoal mb-4">1. Written Source</h3>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Source *</label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as NcrSource)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                required
              >
                <option value="audit">Audit</option>
                <option value="audit_finding">Audit finding</option>
                <option value="incident">Incident</option>
                <option value="complaint">Complaint</option>
                <option value="risk">Risk Assessment</option>
                <option value="inspection">Inspection</option>
                <option value="pjo">PJO</option>
              </select>
              {props.linkedSource?.id && (
                <p className="text-xs text-charcoal-500 mt-1">Linked to: {props.linkedSource.type} (ID: {props.linkedSource.id})</p>
              )}
            </div>
          </div>

          <div className="border-b border-surface-200 pb-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-charcoal">Evidence of Non-Conformance *</h3>
              <p className="text-xs text-charcoal-500 mt-1">Upload proof showing the non-conformance before corrective action.</p>
              <input
                type="file"
                multiple
                onChange={(e) => appendFiles(e.target.files, setEvidenceBeforeFiles)}
                className="w-full text-sm mt-2"
                required
              />
              {evidenceBeforeFiles.length > 0 && (
                <div className="mt-2 space-y-1">
                  {evidenceBeforeFiles.map((file, index) => (
                    <div key={`before-${index}`} className="flex items-center justify-between p-2 bg-surface-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <FileIcon className="w-4 h-4 text-charcoal-400" />
                        <span className="text-sm text-charcoal-600">{file.name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFileAtIndex(index, setEvidenceBeforeFiles)}
                        className="text-xs text-critical hover:text-critical-600"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {evidenceBeforeFiles.length === 0 && evidenceBeforeDraftNames.length > 0 && (
                <div className="mt-2 rounded-lg border border-warning/30 bg-warning/5 p-2 text-xs text-warning">
                  Re-select these draft files before submitting: {evidenceBeforeDraftNames.join(', ')}.
                </div>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-charcoal">Evidence of Closure</h3>
              <p className="text-xs text-charcoal-500 mt-1">Upload proof showing the issue has been corrected (after corrective action).</p>
              <input
                type="file"
                multiple
                onChange={(e) => appendFiles(e.target.files, setEvidenceAfterFiles)}
                className="w-full text-sm mt-2"
              />
              {evidenceAfterFiles.length > 0 && (
                <div className="mt-2 space-y-1">
                  {evidenceAfterFiles.map((file, index) => (
                    <div key={`after-${index}`} className="flex items-center justify-between p-2 bg-surface-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <FileIcon className="w-4 h-4 text-charcoal-400" />
                        <span className="text-sm text-charcoal-600">{file.name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFileAtIndex(index, setEvidenceAfterFiles)}
                        className="text-xs text-critical hover:text-critical-600"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {evidenceAfterFiles.length === 0 && evidenceAfterDraftNames.length > 0 && (
                <div className="mt-2 rounded-lg border border-warning/30 bg-warning/5 p-2 text-xs text-warning">
                  Re-select these draft files before submitting: {evidenceAfterDraftNames.join(', ')}.
                </div>
              )}
            </div>
          </div>

          <div className="sticky bottom-0 -mx-5 -mb-5 mt-2 rounded-b-2xl bg-white border-t border-surface-200 px-5 py-4 space-y-2 z-10">
            {missingFields.length > 0 && (
              <p className="text-xs text-warning">
                Complete these required fields to create the NCR: {missingFields.join(', ')}.
              </p>
            )}
            <div className="flex items-center justify-end gap-3">
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
                title={missingFields.length > 0 ? `Missing: ${missingFields.join(', ')}` : undefined}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-critical text-white text-sm font-semibold hover:bg-critical-600 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading && <LoadingSpinner size={16} />}
                {loading ? 'Creating...' : 'Create NCR'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
