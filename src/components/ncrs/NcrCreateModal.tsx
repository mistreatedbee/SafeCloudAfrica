import React, { useMemo, useState } from 'react';
import { XIcon, FileIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { ModuleKey, UUID, Severity } from '../../api/models/core';
import { createQualityNcr } from '../../api/services/qualityNcrsService';

type NcrSource = 'audit' | 'incident' | 'near_miss' | 'complaint' | 'risk_assessment' | 'inspection';
type LinkedRequirementType = 'iso' | 'legal' | 'internal';
type RiskClassification = 'Low' | 'Medium' | 'High' | 'Critical';

export function NcrCreateModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  createdByUserId: UUID;
  defaultModule?: ModuleKey;
  linkedSource?: { type: NcrSource; id?: string };
  onCreated?: () => void;
}) {
  const [module, setModule] = useState<ModuleKey>(props.defaultModule ?? 'general');
  const [ncrNumber, setNcrNumber] = useState('');
  const [ncrDate, setNcrDate] = useState(new Date().toISOString().slice(0, 10));
  const [ncrTime, setNcrTime] = useState(new Date().toTimeString().slice(0, 5));
  const [location, setLocation] = useState('');
  const [department, setDepartment] = useState('');
  const [process, setProcess] = useState('');
  const [activity, setActivity] = useState('');
  const [responsibleRole, setResponsibleRole] = useState('');
  const [linkedRequirementType, setLinkedRequirementType] = useState<LinkedRequirementType>('iso');
  const [linkedRequirement, setLinkedRequirement] = useState('');
  const [riskClassification, setRiskClassification] = useState<RiskClassification>('Medium');
  const [rootCause, setRootCause] = useState('');
  const [correctiveActions, setCorrectiveActions] = useState('');
  const [responsiblePerson, setResponsiblePerson] = useState('');
  const [source, setSource] = useState<NcrSource>(props.linkedSource?.type || 'audit');
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<Severity>('medium');
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-generate NCR number if not provided
  const finalNcrNumber = useMemo(() => {
    if (ncrNumber.trim()) return ncrNumber.trim();
    return `NCR-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
  }, [ncrNumber]);

  const canSubmit = useMemo(() => {
    return title.trim().length > 2 &&
           location.trim().length > 0 &&
           department.trim().length > 0 &&
           activity.trim().length > 0 &&
           responsibleRole.trim().length > 0 &&
           linkedRequirement.trim().length > 0 &&
           rootCause.trim().length > 0 &&
           correctiveActions.trim().length > 0 &&
           responsiblePerson.trim().length > 0;
  }, [title, location, department, activity, responsibleRole, linkedRequirement, rootCause, correctiveActions, responsiblePerson]);

  const handleFileUpload = (files: FileList | null) => {
    if (!files) return;
    const fileArray = Array.from(files);
    setEvidenceFiles(prev => [...prev, ...fileArray]);
  };

  const removeFile = (index: number) => {
    setEvidenceFiles(prev => prev.filter((_, i) => i !== index));
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      setLoading(true);
      
      // Combine date and time
      const occurredAt = new Date(`${ncrDate}T${ncrTime}`).toISOString();
      
      // Build comprehensive description with all NCR fields
      const descriptionParts: string[] = [];
      descriptionParts.push(`NCR Number: ${finalNcrNumber}`);
      descriptionParts.push(`Date & Time: ${ncrDate} ${ncrTime}`);
      descriptionParts.push(`Location: ${location}`);
      descriptionParts.push(`Department / Process: ${department} / ${process}`);
      descriptionParts.push(`Activity Involved: ${activity}`);
      descriptionParts.push(`Responsible Role: ${responsibleRole}`);
      descriptionParts.push(`Linked Requirement Type: ${linkedRequirementType.toUpperCase()}`);
      descriptionParts.push(`Linked Requirement: ${linkedRequirement}`);
      descriptionParts.push(`Risk Classification: ${riskClassification}`);
      descriptionParts.push(`Root Cause: ${rootCause}`);
      descriptionParts.push(`Corrective Actions: ${correctiveActions}`);
      descriptionParts.push(`Responsible Person: ${responsiblePerson}`);
      descriptionParts.push(`Source: ${source}`);
      if (props.linkedSource?.id) {
        descriptionParts.push(`Linked Source ID: ${props.linkedSource.id}`);
      }
      
      if (evidenceFiles.length > 0) {
        descriptionParts.push(`\nEvidence Files: ${evidenceFiles.length} file(s) uploaded`);
        evidenceFiles.forEach((f, i) => {
          descriptionParts.push(`  - File ${i + 1}: ${f.name} (${(f.size / 1024).toFixed(2)} KB)`);
        });
      }

      const fullDescription = descriptionParts.join('\n\n');

      await createQualityNcr({
        companyId: props.companyId,
        title: title.trim(),
        description: fullDescription,
        severity,
        createdByUserId: props.createdByUserId,
        location: location.trim(),
        process_involved: department.trim(),
        activity_involved: activity.trim(),
        responsible_role: responsibleRole.trim(),
        linked_requirement: linkedRequirement.trim(),
        risk_classification: riskClassification.toLowerCase(),
        root_cause: rootCause.trim(),
        corrective_action: correctiveActions.trim(),
        corrective_action_due_date: new Date(ncrDate).toISOString().split('T')[0],
        source_entity_type: source,
        source_entity_id: props.linkedSource?.id ? props.linkedSource.id as UUID : undefined
      });
      
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
    setLinkedRequirementType('iso');
    setLinkedRequirement('');
    setRiskClassification('Medium');
    setRootCause('');
    setCorrectiveActions('');
    setResponsiblePerson('');
    setSource(props.linkedSource?.type || 'audit');
    setTitle('');
    setSeverity('medium');
    setEvidenceFiles([]);
    setModule(props.defaultModule ?? 'general');
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-4xl mx-4 my-8 bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[95vh] overflow-y-auto">
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

          {/* Basic Information */}
          <div className="border-b border-surface-200 pb-4">
            <h3 className="text-sm font-semibold text-charcoal mb-4">Basic Information</h3>
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

          {/* Location & Process Information */}
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

          {/* Responsibility & Requirements */}
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
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Linked Requirement Type</label>
                  <select
                    value={linkedRequirementType}
                    onChange={(e) => setLinkedRequirementType(e.target.value as LinkedRequirementType)}
                    className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  >
                    <option value="iso">ISO</option>
                    <option value="legal">Legal</option>
                    <option value="internal">Internal</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Linked Requirement *</label>
                  <input
                    value={linkedRequirement}
                    onChange={(e) => setLinkedRequirement(e.target.value)}
                    placeholder={linkedRequirementType === 'iso' ? 'e.g. ISO 45001:2018 Clause 8.2' : linkedRequirementType === 'legal' ? 'e.g. OHS Act Section 8' : 'e.g. Company Procedure PRO-001'}
                    className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                    required
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Risk & Root Cause */}
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

          {/* Corrective Actions */}
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

          {/* Source */}
          <div className="border-b border-surface-200 pb-4">
            <h3 className="text-sm font-semibold text-charcoal mb-4">Source</h3>
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

          {/* Evidence Uploads */}
          <div className="border-b border-surface-200 pb-4">
            <h3 className="text-sm font-semibold text-charcoal mb-4">Evidence Uploads</h3>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Upload Evidence (photos/docs)</label>
              <input
                type="file"
                multiple
                onChange={(e) => handleFileUpload(e.target.files)}
                className="w-full text-sm"
              />
              {evidenceFiles.length > 0 && (
                <div className="mt-2 space-y-1">
                  {evidenceFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-surface-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <FileIcon className="w-4 h-4 text-charcoal-400" />
                        <span className="text-sm text-charcoal-600">{file.name}</span>
                        <span className="text-xs text-charcoal-400">({(file.size / 1024).toFixed(2)} KB)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
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

          {/* Auto Close-Out Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-charcoal mb-2">Auto Close-Out Conditions</h4>
            <p className="text-xs text-charcoal-600">
              NCR will automatically close when: Corrective actions completed, Evidence attached, and Sign-off done by authority.
            </p>
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

