import React, { useMemo, useState } from 'react';
import { XIcon, FileIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { UUID, Severity } from '../../api/models/core';
import { createQualityNcr, syncNcrEvidenceFromAttachments } from '../../api/services/qualityNcrsService';
import { createEvidence } from '../../api/services/evidenceService';
import { insforge } from '../../api/insforge/client';

type NcrSource = 'audit' | 'incident' | 'near_miss' | 'complaint' | 'risk_assessment' | 'inspection';
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
  const [correctiveActions, setCorrectiveActions] = useState('');
  const [responsiblePerson, setResponsiblePerson] = useState('');
  const [source, setSource] = useState<NcrSource>(props.linkedSource?.type || 'audit');
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<Severity>('medium');
  const [evidenceBeforeFiles, setEvidenceBeforeFiles] = useState<File[]>([]);
  const [evidenceAfterFiles, setEvidenceAfterFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finalNcrNumber = useMemo(() => {
    if (ncrNumber.trim()) return ncrNumber.trim();
    return `NCR-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
  }, [ncrNumber]);

  const canSubmit = useMemo(() => {
    return (
      title.trim().length > 2 &&
      location.trim().length > 0 &&
      department.trim().length > 0 &&
      activity.trim().length > 0 &&
      responsibleRole.trim().length > 0 &&
      linkedRequirement.trim().length > 0 &&
      rootCause.trim().length > 0 &&
      correctiveActions.trim().length > 0 &&
      responsiblePerson.trim().length > 0 &&
      evidenceBeforeFiles.length > 0
    );
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

  const appendFiles = (
    files: FileList | null,
    setter: React.Dispatch<React.SetStateAction<File[]>>
  ) => {
    if (!files) return;
    setter((prev) => [...prev, ...Array.from(files)]);
  };

  const removeFileAtIndex = (
    index: number,
    setter: React.Dispatch<React.SetStateAction<File[]>>
  ) => {
    setter((prev) => prev.filter((_, i) => i !== index));
  };

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

      props.onCreated?.();
      props.onClose();
      resetForm();
    } catch (err: any) {
      setError(formatAuthError(err));
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
    setCorrectiveActions('');
    setResponsiblePerson('');
    setSource(props.linkedSource?.type || 'audit');
    setTitle('');
    setSeverity('medium');
    setEvidenceBeforeFiles([]);
    setEvidenceAfterFiles([]);
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-surface-200 px-5 py-4 flex items-center justify-between z-10">
          <div>
            <p className="text-sm font-semibold text-charcoal">Create Non-Conformance Report (NCR)</p>
            <p className="text-xs text-charcoal-500 mt-0.5">NCR applies to all modules. All fields marked with * are mandatory.</p>
          </div>
          <button type="button" onClick={props.onClose} className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-500">
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
                <option value="incident">Incident</option>
                <option value="near_miss">Near Miss</option>
                <option value="complaint">Complaint</option>
                <option value="risk_assessment">Risk Assessment</option>
                <option value="inspection">Inspection</option>
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
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-200">
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
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-critical text-white text-sm font-semibold hover:bg-critical-600 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading && <LoadingSpinner size={16} />}
              Create NCR
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
