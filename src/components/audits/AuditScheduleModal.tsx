import React, { useMemo, useState } from 'react';
import { XIcon, FileIcon, UploadIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { ModuleKey, UUID } from '../../api/models/core';
import { createInspection } from '../../api/services/inspectionsService';

type AuditType = 'internal' | 'external' | 'client' | 'supplier' | 'certification';
type AuditObjective = 'compliance_verification' | 'performance_evaluation' | 'risk_control_verification' | 'legal_compliance' | 'certification_readiness';
type AuditCriteriaType = 'iso_standards' | 'legal_requirements' | 'client_standards' | 'internal_procedures' | 'contractual_requirements';

const AUDIT_OBJECTIVES: { value: AuditObjective; label: string }[] = [
  { value: 'compliance_verification', label: 'Compliance verification' },
  { value: 'performance_evaluation', label: 'Performance evaluation' },
  { value: 'risk_control_verification', label: 'Risk control verification' },
  { value: 'legal_compliance', label: 'Legal compliance' },
  { value: 'certification_readiness', label: 'Certification readiness' }
];

const AUDIT_CRITERIA_OPTIONS: { value: AuditCriteriaType; label: string; examples: string }[] = [
  { value: 'iso_standards', label: 'ISO Standards', examples: 'ISO 9001, ISO 14001, ISO 45001' },
  { value: 'legal_requirements', label: 'Legal Requirements', examples: 'OHS Act, Environmental Acts, Labour Law' },
  { value: 'client_standards', label: 'Client Standards', examples: 'Sappi, Eskom, Sasol, etc.' },
  { value: 'internal_procedures', label: 'Internal Procedures & Policies', examples: 'Company procedures, policies' },
  { value: 'contractual_requirements', label: 'Contractual Requirements', examples: 'Contract terms and conditions' }
];

const PLANNING_INPUT_OPTIONS = [
  'Organogram',
  'Process Maps',
  'Procedures & Policies',
  'Risk Assessments',
  'Legal Registers',
  'Previous Audit Reports',
  'Incident Reports',
  'Training Records',
  'Permits & Registers',
  'Client Requirements'
];

export function AuditScheduleModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  createdByUserId: UUID;
  onCreated?: () => void;
}) {
  const [auditType, setAuditType] = useState<AuditType>('internal');
  const [module, setModule] = useState<ModuleKey>('safety');
  const [title, setTitle] = useState('');
  const [auditor, setAuditor] = useState('');
  const [selectedObjectives, setSelectedObjectives] = useState<Set<AuditObjective>>(new Set());
  const [auditCriteriaType, setAuditCriteriaType] = useState<AuditCriteriaType>('iso_standards');
  const [auditCriteriaDetails, setAuditCriteriaDetails] = useState('');
  const [selectedPlanningInputs, setSelectedPlanningInputs] = useState<Set<string>>(new Set());
  const [planningInputFiles, setPlanningInputFiles] = useState<File[]>([]);
  const [proposedDate1, setProposedDate1] = useState('');
  const [proposedDate2, setProposedDate2] = useState('');
  const [proposedDate3, setProposedDate3] = useState('');
  const [approvedDate, setApprovedDate] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return title.trim().length > 2 && 
           auditor.trim().length > 0 &&
           selectedObjectives.size > 0 &&
           (proposedDate1 || proposedDate2 || proposedDate3);
  }, [title, auditor, selectedObjectives, proposedDate1, proposedDate2, proposedDate3]);

  const toggleObjective = (objective: AuditObjective) => {
    setSelectedObjectives(prev => {
      const next = new Set(prev);
      if (next.has(objective)) {
        next.delete(objective);
      } else {
        next.add(objective);
      }
      return next;
    });
  };

  const togglePlanningInput = (input: string) => {
    setSelectedPlanningInputs(prev => {
      const next = new Set(prev);
      if (next.has(input)) {
        next.delete(input);
      } else {
        next.add(input);
      }
      return next;
    });
  };

  const handleFileUpload = (files: FileList | null) => {
    if (!files) return;
    const fileArray = Array.from(files);
    setPlanningInputFiles(prev => [...prev, ...fileArray]);
  };

  const removeFile = (index: number) => {
    setPlanningInputFiles(prev => prev.filter((_, i) => i !== index));
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      setLoading(true);
      
      // Use approved date if set, otherwise use first proposed date
      const finalDate = approvedDate || proposedDate1 || proposedDate2 || proposedDate3;
      
      // Build comprehensive description with all audit details
      const descriptionParts: string[] = [];
      descriptionParts.push(`Audit Type: ${auditType.toUpperCase()}`);
      descriptionParts.push(`Auditor: ${auditor}`);
      descriptionParts.push(`Objectives: ${Array.from(selectedObjectives).map(o => AUDIT_OBJECTIVES.find(obj => obj.value === o)?.label).join(', ')}`);
      
      const criteriaOption = AUDIT_CRITERIA_OPTIONS.find(opt => opt.value === auditCriteriaType);
      descriptionParts.push(`Audit Criteria Type: ${criteriaOption?.label}`);
      if (auditCriteriaDetails) {
        descriptionParts.push(`Audit Criteria Details: ${auditCriteriaDetails}`);
      }
      if (criteriaOption?.examples) {
        descriptionParts.push(`Examples: ${criteriaOption.examples}`);
      }
      
      if (selectedPlanningInputs.size > 0) {
        descriptionParts.push(`Planning Inputs: ${Array.from(selectedPlanningInputs).join(', ')}`);
      }
      
      if (planningInputFiles.length > 0) {
        descriptionParts.push(`Planning Input Files: ${planningInputFiles.length} file(s)`);
        planningInputFiles.forEach((f, i) => {
          descriptionParts.push(`  - File ${i + 1}: ${f.name} (${(f.size / 1024).toFixed(2)} KB)`);
        });
      }
      
      if (proposedDate1) descriptionParts.push(`Proposed Date 1: ${proposedDate1}`);
      if (proposedDate2) descriptionParts.push(`Proposed Date 2: ${proposedDate2}`);
      if (proposedDate3) descriptionParts.push(`Proposed Date 3: ${proposedDate3}`);
      if (approvedDate) descriptionParts.push(`Approved Date: ${approvedDate}`);
      
      const fullDescription = descriptionParts.join('\n\n');
      
      const fullTitle = `[${auditType.toUpperCase()}] ${title.trim()}${auditor ? ` - ${auditor}` : ''}`;
      
      await createInspection({
        companyId: props.companyId,
        module,
        title: fullTitle,
        scheduledAt: finalDate ? new Date(finalDate).toISOString() : undefined,
        location: location.trim() || undefined,
        createdByUserId: props.createdByUserId
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
    setTitle('');
    setAuditor('');
    setSelectedObjectives(new Set());
    setAuditCriteriaType('iso_standards');
    setAuditCriteriaDetails('');
    setSelectedPlanningInputs(new Set());
    setPlanningInputFiles([]);
    setProposedDate1('');
    setProposedDate2('');
    setProposedDate3('');
    setApprovedDate('');
    setScheduledAt('');
    setLocation('');
    setAuditType('internal');
    setModule('safety');
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-4xl mx-4 my-8 bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[95vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-surface-200 px-5 py-4 flex items-center justify-between z-10">
          <div>
            <p className="text-sm font-semibold text-charcoal">Schedule Audit</p>
            <p className="text-xs text-charcoal-500 mt-0.5">Complete all required fields. Auditor proposes 3 dates, auditee approves one.</p>
          </div>
          <button type="button" onClick={props.onClose} className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-500">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-6">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-critical">Could not schedule audit</p>
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
                <label className="block text-sm font-medium text-charcoal mb-1.5">Audit Type *</label>
                <select
                  value={auditType}
                  onChange={(e) => setAuditType(e.target.value as AuditType)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                >
                  <option value="internal">Internal</option>
                  <option value="external">External</option>
                  <option value="client">Client</option>
                  <option value="supplier">Supplier</option>
                  <option value="certification">Certification (ISO 9001, ISO 14001, ISO 45001)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Title *</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. ISO 45001 Internal Audit - Q1 2024"
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Auditor *</label>
                <input
                  value={auditor}
                  onChange={(e) => setAuditor(e.target.value)}
                  placeholder="Name of auditor or audit team"
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Location</label>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Site A, Head Office"
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Audit Objectives */}
          <div className="border-b border-surface-200 pb-4">
            <h3 className="text-sm font-semibold text-charcoal mb-4">Audit Objectives * (Multi-select)</h3>
            <div className="space-y-2">
              {AUDIT_OBJECTIVES.map((obj) => (
                <label key={obj.value} className="flex items-center gap-3 p-3 border border-surface-200 rounded-lg hover:bg-surface-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedObjectives.has(obj.value)}
                    onChange={() => toggleObjective(obj.value)}
                    className="w-4 h-4 text-teal border-surface-300 rounded focus:ring-teal"
                  />
                  <span className="text-sm text-charcoal">{obj.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Audit Criteria */}
          <div className="border-b border-surface-200 pb-4">
            <h3 className="text-sm font-semibold text-charcoal mb-4">Audit Criteria</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Criteria Type</label>
                <select
                  value={auditCriteriaType}
                  onChange={(e) => setAuditCriteriaType(e.target.value as AuditCriteriaType)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                >
                  {AUDIT_CRITERIA_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {AUDIT_CRITERIA_OPTIONS.find(opt => opt.value === auditCriteriaType)?.examples && (
                  <p className="text-xs text-charcoal-500 mt-1">
                    Examples: {AUDIT_CRITERIA_OPTIONS.find(opt => opt.value === auditCriteriaType)?.examples}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Criteria Details</label>
                <textarea
                  value={auditCriteriaDetails}
                  onChange={(e) => setAuditCriteriaDetails(e.target.value)}
                  rows={3}
                  placeholder="Specify the exact standards, clauses, or requirements..."
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Planning Inputs */}
          <div className="border-b border-surface-200 pb-4">
            <h3 className="text-sm font-semibold text-charcoal mb-4">Audit Planning Inputs</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-2">Select Planning Inputs (Attach / Reference)</label>
                <div className="grid grid-cols-2 gap-2">
                  {PLANNING_INPUT_OPTIONS.map((input) => (
                    <label key={input} className="flex items-center gap-2 p-2 border border-surface-200 rounded-lg hover:bg-surface-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedPlanningInputs.has(input)}
                        onChange={() => togglePlanningInput(input)}
                        className="w-4 h-4 text-teal border-surface-300 rounded focus:ring-teal"
                      />
                      <span className="text-sm text-charcoal">{input}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Upload Planning Input Files</label>
                <input
                  type="file"
                  multiple
                  onChange={(e) => handleFileUpload(e.target.files)}
                  className="w-full text-sm"
                />
                {planningInputFiles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {planningInputFiles.map((file, index) => (
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
          </div>

          {/* Date Selection Workflow */}
          <div className="border-b border-surface-200 pb-4">
            <h3 className="text-sm font-semibold text-charcoal mb-4">Date Selection Workflow</h3>
            <p className="text-xs text-charcoal-500 mb-4">Auditor proposes minimum 3 dates. Auditee will receive email and can approve one.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Proposed Date 1 *</label>
                <input
                  type="date"
                  value={proposedDate1}
                  onChange={(e) => setProposedDate1(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Proposed Date 2</label>
                <input
                  type="date"
                  value={proposedDate2}
                  onChange={(e) => setProposedDate2(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Proposed Date 3</label>
                <input
                  type="date"
                  value={proposedDate3}
                  onChange={(e) => setProposedDate3(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <label className="block text-sm font-medium text-charcoal mb-1.5">Approved Date (if already approved)</label>
                <input
                  type="date"
                  value={approvedDate}
                  onChange={(e) => setApprovedDate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
                <p className="text-xs text-charcoal-500 mt-1">Leave empty if awaiting auditee approval</p>
              </div>
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
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading && <LoadingSpinner size={16} />}
              Schedule Audit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
