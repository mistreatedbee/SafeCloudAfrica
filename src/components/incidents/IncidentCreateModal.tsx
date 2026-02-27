import React, { useMemo, useState } from 'react';
import { XIcon, UploadIcon, FileIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { UUID } from '../../api/models/core';
import type { ModuleKey, Severity, IncidentCategory, RiskLevel } from '../../api/models/core';
import { INCIDENT_CATEGORIES, INCIDENT_SUBCATEGORIES, calculateRiskLevel } from '../../api/models/core';
import { createIncident } from '../../api/services/incidentsService';

export function IncidentCreateModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  createdByUserId: UUID;
  defaultModule?: ModuleKey;
  onCreated?: () => void;
}) {
  const [module, setModule] = useState<ModuleKey>(props.defaultModule ?? 'safety');
  const [category, setCategory] = useState<IncidentCategory>('Near Miss');
  const [subcategory, setSubcategory] = useState('');
  const [subcategoryManual, setSubcategoryManual] = useState('');
  const [useManualSubcategory, setUseManualSubcategory] = useState(false);
  
  // MANDATORY FIELDS
  const [projectClient, setProjectClient] = useState('');
  const [incidentDate, setIncidentDate] = useState(new Date().toISOString().slice(0, 10));
  const [incidentTime, setIncidentTime] = useState(new Date().toTimeString().slice(0, 5));
  const [natureOfIncident, setNatureOfIncident] = useState('');
  const [causeOfIncident, setCauseOfIncident] = useState('');
  const [affectedPerson, setAffectedPerson] = useState('');
  const [lossType, setLossType] = useState<'Production' | 'Financial' | 'Reputational' | ''>('');
  const [likelihood, setLikelihood] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [correctiveActions, setCorrectiveActions] = useState('');
  const [location, setLocation] = useState('');
  const [severity, setSeverity] = useState<Severity>('medium');
  
  // Auto-calculate risk level from severity and likelihood
  const calculatedRiskLevel = useMemo(() => {
    return calculateRiskLevel(severity, likelihood);
  }, [severity, likelihood]);
  const [reportedBy, setReportedBy] = useState('');
  const [reportedTo, setReportedTo] = useState('');
  const [copyTo, setCopyTo] = useState('');
  const [investigationRequired, setInvestigationRequired] = useState(false);
  
  // Investigation fields (dynamic expansion)
  const [risk, setRisk] = useState('');
  const [riskProfile, setRiskProfile] = useState('');
  const [incidentTimeline, setIncidentTimeline] = useState('');
  const [unsafeActs, setUnsafeActs] = useState('');
  const [unsafeConditions, setUnsafeConditions] = useState('');
  const [rootCauseHuman, setRootCauseHuman] = useState('');
  const [rootCauseWorkplace, setRootCauseWorkplace] = useState('');
  const [systemFailure, setSystemFailure] = useState('');
  const [correctiveActionInvestigation, setCorrectiveActionInvestigation] = useState('');
  const [lessonsLearnt, setLessonsLearnt] = useState('');
  const [investigationTeam, setInvestigationTeam] = useState('');
  const [conclusion, setConclusion] = useState('');
  
  // Evidence uploads
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [investigationFiles, setInvestigationFiles] = useState<File[]>([]);
  const [uploadInvestigationFirst, setUploadInvestigationFirst] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableSubcategories = useMemo(() => {
    return INCIDENT_SUBCATEGORIES[category] || [];
  }, [category]);

  const finalSubcategory = useMemo(() => {
    if (useManualSubcategory) {
      return subcategoryManual.trim();
    }
    return subcategory.trim();
  }, [useManualSubcategory, subcategory, subcategoryManual]);

  const canSubmit = useMemo(() => {
    const mandatoryFields = 
      projectClient.trim().length > 0 &&
      finalSubcategory.length > 0 &&
      natureOfIncident.trim().length > 0 &&
      causeOfIncident.trim().length > 0 &&
      affectedPerson.trim().length > 0 &&
      lossType.length > 0 &&
      correctiveActions.trim().length > 0 &&
      reportedBy.trim().length > 0 &&
      reportedTo.trim().length > 0;
    
    // If investigation required, check investigation fields
    if (investigationRequired && !uploadInvestigationFirst) {
      return mandatoryFields && 
             risk.trim().length > 0 &&
             riskProfile.trim().length > 0 &&
             incidentTimeline.trim().length > 0 &&
             investigationTeam.trim().length > 0 &&
             conclusion.trim().length > 0;
    }
    
    return mandatoryFields;
  }, [
    projectClient, finalSubcategory, natureOfIncident, causeOfIncident, 
    affectedPerson, lossType, correctiveActions, reportedBy, reportedTo,
    investigationRequired, uploadInvestigationFirst, risk, riskProfile,
    incidentTimeline, investigationTeam, conclusion
  ]);

  const handleFileUpload = (files: FileList | null, setter: (files: File[]) => void) => {
    if (!files) return;
    const fileArray = Array.from(files);
    setter(prev => [...prev, ...fileArray]);
  };

  const removeFile = (index: number, setter: React.Dispatch<React.SetStateAction<File[]>>) => {
    setter(prev => prev.filter((_, i) => i !== index));
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      setLoading(true);
      
      // Combine date and time
      const occurredAt = new Date(`${incidentDate}T${incidentTime}`).toISOString();
      
      // Build comprehensive description with all fields
      const descriptionParts: string[] = [];
      
      // Core incident data
      descriptionParts.push(`Project/Client: ${projectClient}`);
      descriptionParts.push(`Nature of Incident: ${natureOfIncident}`);
      descriptionParts.push(`Cause of Incident: ${causeOfIncident}`);
      descriptionParts.push(`Affected Person: ${affectedPerson}`);
      descriptionParts.push(`Loss Type: ${lossType}`);
      descriptionParts.push(`Severity: ${severity}`);
      descriptionParts.push(`Likelihood: ${likelihood} (1=Rare, 5=Almost Certain)`);
      descriptionParts.push(`Calculated Risk Level: ${calculatedRiskLevel}`);
      descriptionParts.push(`Corrective Actions: ${correctiveActions}`);
      descriptionParts.push(`Reported By: ${reportedBy}`);
      descriptionParts.push(`Reported To: ${reportedTo}`);
      if (copyTo) descriptionParts.push(`Copy To (Escalation): ${copyTo}`);
      if (location) descriptionParts.push(`Location: ${location}`);
      
      // Investigation data
      if (investigationRequired) {
        descriptionParts.push('\n--- INVESTIGATION DETAILS ---');
        if (risk) descriptionParts.push(`Risk: ${risk}`);
        if (riskProfile) descriptionParts.push(`Risk Profile: ${riskProfile}`);
        if (incidentTimeline) descriptionParts.push(`Incident Event Timeline: ${incidentTimeline}`);
        if (unsafeActs) descriptionParts.push(`Unsafe Acts: ${unsafeActs}`);
        if (unsafeConditions) descriptionParts.push(`Unsafe Conditions: ${unsafeConditions}`);
        if (rootCauseHuman) descriptionParts.push(`Root Cause - Human Factors: ${rootCauseHuman}`);
        if (rootCauseWorkplace) descriptionParts.push(`Root Cause - Workplace Factors: ${rootCauseWorkplace}`);
        if (systemFailure) descriptionParts.push(`System Failure: ${systemFailure}`);
        if (correctiveActionInvestigation) descriptionParts.push(`Corrective Action: ${correctiveActionInvestigation}`);
        if (lessonsLearnt) descriptionParts.push(`Lessons Learnt: ${lessonsLearnt}`);
        if (investigationTeam) descriptionParts.push(`Investigation Team: ${investigationTeam}`);
        if (conclusion) descriptionParts.push(`Conclusion: ${conclusion}`);
        
        if (investigationFiles.length > 0) {
          descriptionParts.push(`\nInvestigation Evidence: ${investigationFiles.length} file(s) uploaded`);
          investigationFiles.forEach((f, i) => {
            descriptionParts.push(`  - File ${i + 1}: ${f.name} (${(f.size / 1024).toFixed(2)} KB)`);
          });
        }
      }
      
      if (evidenceFiles.length > 0) {
        descriptionParts.push(`\nEvidence Files: ${evidenceFiles.length} file(s) uploaded`);
        evidenceFiles.forEach((f, i) => {
          descriptionParts.push(`  - File ${i + 1}: ${f.name} (${(f.size / 1024).toFixed(2)} KB)`);
        });
      }

      const fullDescription = descriptionParts.join('\n\n');

      await createIncident({
        companyId: props.companyId,
        module,
        category,
        subcategory: finalSubcategory,
        title: projectClient.trim(), // Use Project/Client as title
        description: fullDescription,
        severity,
        occurredAt,
        location: location.trim() || undefined,
        createdByUserId: props.createdByUserId
      });
      
      props.onCreated?.();
      props.onClose();
      // Reset form
      resetForm();
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setCategory('Near Miss');
    setSubcategory('');
    setSubcategoryManual('');
    setUseManualSubcategory(false);
    setProjectClient('');
    setIncidentDate(new Date().toISOString().slice(0, 10));
    setIncidentTime(new Date().toTimeString().slice(0, 5));
    setNatureOfIncident('');
    setCauseOfIncident('');
    setAffectedPerson('');
    setLossType('');
    setSeverity('medium');
    setCorrectiveActions('');
    setReportedBy('');
    setReportedTo('');
    setCopyTo('');
    setInvestigationRequired(false);
    setRisk('');
    setRiskProfile('');
    setIncidentTimeline('');
    setUnsafeActs('');
    setUnsafeConditions('');
    setRootCauseHuman('');
    setRootCauseWorkplace('');
    setSystemFailure('');
    setCorrectiveActionInvestigation('');
    setLessonsLearnt('');
    setInvestigationTeam('');
    setConclusion('');
    setEvidenceFiles([]);
    setInvestigationFiles([]);
    setUploadInvestigationFirst(false);
    setLocation('');
    setModule(props.defaultModule ?? 'safety');
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-surface-200 px-5 py-4 flex items-center justify-between z-10">
          <div>
            <p className="text-sm font-semibold text-charcoal">Report Incident</p>
            <p className="text-xs text-charcoal-500 mt-0.5">All fields marked with * are mandatory. Investigation section expands when required.</p>
          </div>
          <button type="button" onClick={props.onClose} className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-500">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-6">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-critical">Could not create incident</p>
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
                <label className="block text-sm font-medium text-charcoal mb-1.5">Project / Client *</label>
                <input
                  value={projectClient}
                  onChange={(e) => setProjectClient(e.target.value)}
                  placeholder="Project or client name"
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Incident Category *</label>
                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value as IncidentCategory);
                    setSubcategory('');
                    setSubcategoryManual('');
                    setUseManualSubcategory(false);
                  }}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                >
                  {INCIDENT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Incident Subcategory *</label>
                <div className="space-y-2">
                  {availableSubcategories.length > 0 && (
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="useManual"
                        checked={useManualSubcategory}
                        onChange={(e) => setUseManualSubcategory(e.target.checked)}
                        className="w-4 h-4 text-teal border-surface-300 rounded focus:ring-teal"
                      />
                      <label htmlFor="useManual" className="text-xs text-charcoal-500">Type manually</label>
                    </div>
                  )}
                  {!useManualSubcategory && availableSubcategories.length > 0 ? (
                    <select
                      value={subcategory}
                      onChange={(e) => setSubcategory(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                      required
                    >
                      <option value="">Select subcategory</option>
                      {availableSubcategories.map((sc) => (
                        <option key={sc} value={sc}>
                          {sc}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={subcategoryManual}
                      onChange={(e) => setSubcategoryManual(e.target.value)}
                      placeholder="Enter subcategory manually"
                      className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                      required
                    />
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Date *</label>
                <input
                  type="date"
                  value={incidentDate}
                  onChange={(e) => setIncidentDate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Time *</label>
                <input
                  type="time"
                  value={incidentTime}
                  onChange={(e) => setIncidentTime(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Location</label>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Warehouse A, Site 3"
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
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

          {/* Mandatory Incident Details */}
          <div className="border-b border-surface-200 pb-4">
            <h3 className="text-sm font-semibold text-charcoal mb-4">Incident Details (All Mandatory)</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Nature of Incident *</label>
                <textarea
                  value={natureOfIncident}
                  onChange={(e) => setNatureOfIncident(e.target.value)}
                  rows={3}
                  placeholder="Describe what happened..."
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Cause of Incident *</label>
                <textarea
                  value={causeOfIncident}
                  onChange={(e) => setCauseOfIncident(e.target.value)}
                  rows={3}
                  placeholder="What caused this incident?"
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Affected Person *</label>
                <input
                  value={affectedPerson}
                  onChange={(e) => setAffectedPerson(e.target.value)}
                  placeholder="Name of affected person(s)"
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Loss Type *</label>
                <select
                  value={lossType}
                  onChange={(e) => setLossType(e.target.value as typeof lossType)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  required
                >
                  <option value="">Select loss type</option>
                  <option value="Production">Production</option>
                  <option value="Financial">Financial</option>
                  <option value="Reputational">Reputational</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Likelihood * (1=Rare, 5=Almost Certain)</label>
                <select
                  value={likelihood}
                  onChange={(e) => setLikelihood(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  required
                >
                  <option value={1}>1 - Rare</option>
                  <option value={2}>2 - Unlikely</option>
                  <option value={3}>3 - Possible</option>
                  <option value={4}>4 - Likely</option>
                  <option value={5}>5 - Almost Certain</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Calculated Risk Level</label>
                <div className={`w-full px-4 py-2.5 rounded-lg text-sm font-semibold ${
                  calculatedRiskLevel === 'Critical' ? 'bg-critical text-white' :
                  calculatedRiskLevel === 'High' ? 'bg-warning text-white' :
                  calculatedRiskLevel === 'Medium' ? 'bg-teal text-white' :
                  'bg-success text-white'
                }`}>
                  {calculatedRiskLevel}
                </div>
                <p className="text-xs text-charcoal-500 mt-1">Auto-calculated from Severity × Likelihood</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Corrective Actions *</label>
                <textarea
                  value={correctiveActions}
                  onChange={(e) => setCorrectiveActions(e.target.value)}
                  rows={3}
                  placeholder="Actions taken or planned..."
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  required
                />
              </div>
            </div>
          </div>

          {/* Reporting & Escalation */}
          <div className="border-b border-surface-200 pb-4">
            <h3 className="text-sm font-semibold text-charcoal mb-4">Reporting & Escalation (All Mandatory)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Reported By *</label>
                <input
                  value={reportedBy}
                  onChange={(e) => setReportedBy(e.target.value)}
                  placeholder="Name of person reporting"
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Reported To *</label>
                <input
                  value={reportedTo}
                  onChange={(e) => setReportedTo(e.target.value)}
                  placeholder="Name/role of person receiving report"
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-charcoal mb-1.5">Copy To (Escalation)</label>
                <input
                  value={copyTo}
                  onChange={(e) => setCopyTo(e.target.value)}
                  placeholder="Additional recipients (comma-separated)"
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Evidence Uploads */}
          <div className="border-b border-surface-200 pb-4">
            <h3 className="text-sm font-semibold text-charcoal mb-4">Evidence Uploads</h3>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Upload Evidence Files</label>
              <input
                type="file"
                multiple
                onChange={(e) => handleFileUpload(e.target.files, setEvidenceFiles)}
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
                        onClick={() => removeFile(index, setEvidenceFiles)}
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

          {/* Investigation Required */}
          <div className="border-b border-surface-200 pb-4">
            <div className="flex items-center gap-3 mb-4">
              <input
                type="checkbox"
                id="investigationRequired"
                checked={investigationRequired}
                onChange={(e) => setInvestigationRequired(e.target.checked)}
                className="w-4 h-4 text-teal border-surface-300 rounded focus:ring-teal"
              />
              <label htmlFor="investigationRequired" className="text-sm font-semibold text-charcoal cursor-pointer">
                Investigation Required? (Yes / No) *
              </label>
            </div>
            
            {investigationRequired && (
              <div className="space-y-4 pl-7 border-l-2 border-teal">
                {/* Alternative Path: Upload Investigation First */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="checkbox"
                      id="uploadFirst"
                      checked={uploadInvestigationFirst}
                      onChange={(e) => setUploadInvestigationFirst(e.target.checked)}
                      className="w-4 h-4 text-teal border-surface-300 rounded focus:ring-teal"
                    />
                    <label htmlFor="uploadFirst" className="text-sm font-medium text-charcoal cursor-pointer">
                      Upload investigation documents first, complete form later
                    </label>
                  </div>
                  {uploadInvestigationFirst && (
                    <div className="mt-2">
                      <input
                        type="file"
                        multiple
                        onChange={(e) => handleFileUpload(e.target.files, setInvestigationFiles)}
                        className="w-full text-sm"
                      />
                      {investigationFiles.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {investigationFiles.map((file, index) => (
                            <div key={index} className="flex items-center justify-between p-2 bg-white rounded-lg">
                              <div className="flex items-center gap-2">
                                <FileIcon className="w-4 h-4 text-charcoal-400" />
                                <span className="text-sm text-charcoal-600">{file.name}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeFile(index, setInvestigationFiles)}
                                className="text-xs text-critical hover:text-critical-600"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {!uploadInvestigationFirst && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Risk *</label>
                      <textarea
                        value={risk}
                        onChange={(e) => setRisk(e.target.value)}
                        rows={2}
                        placeholder="Describe the risk..."
                        className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                        required={investigationRequired && !uploadInvestigationFirst}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Risk Profile *</label>
                      <textarea
                        value={riskProfile}
                        onChange={(e) => setRiskProfile(e.target.value)}
                        rows={2}
                        placeholder="Updated risk assessment..."
                        className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                        required={investigationRequired && !uploadInvestigationFirst}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Incident Event Timeline *</label>
                      <textarea
                        value={incidentTimeline}
                        onChange={(e) => setIncidentTimeline(e.target.value)}
                        rows={4}
                        placeholder="Chronological sequence of events..."
                        className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                        required={investigationRequired && !uploadInvestigationFirst}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Unsafe Acts</label>
                      <textarea
                        value={unsafeActs}
                        onChange={(e) => setUnsafeActs(e.target.value)}
                        rows={3}
                        placeholder="Identify unsafe acts..."
                        className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Unsafe Conditions</label>
                      <textarea
                        value={unsafeConditions}
                        onChange={(e) => setUnsafeConditions(e.target.value)}
                        rows={3}
                        placeholder="Identify unsafe conditions..."
                        className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Root Cause – Human Factors</label>
                      <textarea
                        value={rootCauseHuman}
                        onChange={(e) => setRootCauseHuman(e.target.value)}
                        rows={3}
                        placeholder="Human factor contributions..."
                        className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Root Cause – Workplace Factors</label>
                      <textarea
                        value={rootCauseWorkplace}
                        onChange={(e) => setRootCauseWorkplace(e.target.value)}
                        rows={3}
                        placeholder="Workplace factor contributions..."
                        className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">System Failure</label>
                      <textarea
                        value={systemFailure}
                        onChange={(e) => setSystemFailure(e.target.value)}
                        rows={3}
                        placeholder="System failures identified..."
                        className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Corrective Action</label>
                      <textarea
                        value={correctiveActionInvestigation}
                        onChange={(e) => setCorrectiveActionInvestigation(e.target.value)}
                        rows={3}
                        placeholder="Corrective actions from investigation..."
                        className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Lessons Learnt</label>
                      <textarea
                        value={lessonsLearnt}
                        onChange={(e) => setLessonsLearnt(e.target.value)}
                        rows={3}
                        placeholder="Key learnings from this incident..."
                        className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Investigation Team *</label>
                      <input
                        value={investigationTeam}
                        onChange={(e) => setInvestigationTeam(e.target.value)}
                        placeholder="Names/roles of investigation team members"
                        className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                        required={investigationRequired && !uploadInvestigationFirst}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Conclusion *</label>
                      <textarea
                        value={conclusion}
                        onChange={(e) => setConclusion(e.target.value)}
                        rows={3}
                        placeholder="Investigation conclusion..."
                        className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                        required={investigationRequired && !uploadInvestigationFirst}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Investigation Evidence Files</label>
                      <input
                        type="file"
                        multiple
                        onChange={(e) => handleFileUpload(e.target.files, setInvestigationFiles)}
                        className="w-full text-sm"
                      />
                      {investigationFiles.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {investigationFiles.map((file, index) => (
                            <div key={index} className="flex items-center justify-between p-2 bg-surface-50 rounded-lg">
                              <div className="flex items-center gap-2">
                                <FileIcon className="w-4 h-4 text-charcoal-400" />
                                <span className="text-sm text-charcoal-600">{file.name}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeFile(index, setInvestigationFiles)}
                                className="text-xs text-critical hover:text-critical-600"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
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
              Submit Incident Report
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
