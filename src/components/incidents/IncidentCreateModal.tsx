import React, { useMemo, useState } from 'react';
import { XIcon, UploadIcon, FileIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { UUID } from '../../api/models/core';
import type { ModuleKey, Severity, IncidentCategory, RiskLevel, IncidentType, RiskCategory, LossType } from '../../api/models/core';
import { INCIDENT_CATEGORIES, INCIDENT_CATEGORY_SUBCATEGORIES, INCIDENT_TYPES, LOSS_TYPES, RISK_CATEGORIES, calculateRiskLevel } from '../../api/models/core';
import { createIncident } from '../../api/services/incidentsService';
import { UserMultiSelect } from '../ui/UserMultiSelect';
import { AffectedPersonSelector } from './AffectedPersonSelector';
import { IncidentTimelineBuilder } from './IncidentTimelineBuilder';
import { CauseMultiSelectGroups } from './CauseMultiSelectGroups';
import { createEvidence } from '../../api/services/evidenceService';
import { insforge } from '../../api/insforge/client';
import { useUser } from '@insforge/react';
import {
  IMMEDIATE_CAUSES_UNSAFE_ACTS_GROUPS,
  IMMEDIATE_CAUSES_UNSAFE_CONDITIONS_GROUPS,
  ROOT_CAUSE_HUMAN_FACTORS_CATEGORIES,
  ROOT_CAUSE_WORKPLACE_FACTORS_CATEGORIES,
  SYSTEM_FAILURE_OPTIONS
} from '../../api/models/core';

const EVIDENCE_BUCKET = 'evidence';

export function IncidentCreateModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  createdByUserId: UUID;
  defaultModule?: ModuleKey;
  onCreated?: () => void;
}) {
  const { user } = useUser();
  const [module, setModule] = useState<ModuleKey>(props.defaultModule ?? 'safety');
  const [category, setCategory] = useState<IncidentCategory>(INCIDENT_CATEGORIES[0]);
  const [subcategory, setSubcategory] = useState('');
  const [subcategoryManual, setSubcategoryManual] = useState('');
  const [useManualSubcategory, setUseManualSubcategory] = useState(false);
  
  // MANDATORY FIELDS
  const [projectClient, setProjectClient] = useState('');
  const [incidentType, setIncidentType] = useState<IncidentType>(INCIDENT_TYPES[0]);
  const [incidentDate, setIncidentDate] = useState(new Date().toISOString().slice(0, 10));
  const [incidentTime, setIncidentTime] = useState(new Date().toTimeString().slice(0, 5));
  const [natureOfIncident, setNatureOfIncident] = useState('');
  const [causeOfIncident, setCauseOfIncident] = useState('');
  const [affectedPersonId, setAffectedPersonId] = useState<UUID | null>(null);
  const [affectedPersonName, setAffectedPersonName] = useState<string | null>(null);
  const [lossTypes, setLossTypes] = useState<string[]>([]);
  const [lossProductionValue, setLossProductionValue] = useState<number | undefined>();
  const [lossFinancialValue, setLossFinancialValue] = useState<number | undefined>();
  const [correctiveActionsSummary, setCorrectiveActionsSummary] = useState('');
  const [location, setLocation] = useState('');
  const [severity, setSeverity] = useState<Severity>('medium');
  const [riskCategory, setRiskCategory] = useState<RiskCategory>('Medium');
  
  // Auto-calculate risk level from severity and likelihood
  const [likelihood, setLikelihood] = useState<1 | 2 | 3 | 4 | 5>(3);
  const calculatedRiskLevel = useMemo(() => {
    return calculateRiskLevel(severity, likelihood);
  }, [severity, likelihood]);
  
  const [reportedByUserId, setReportedByUserId] = useState<UUID | null>(user?.id as UUID | null);
  const [reportedToUserIds, setReportedToUserIds] = useState<UUID[]>([]);
  const [copyToUserIds, setCopyToUserIds] = useState<UUID[]>([]);
  const [copyToEmails, setCopyToEmails] = useState<string[]>([]);
  const [investigationRequired, setInvestigationRequired] = useState(false);
  
  // Investigation fields (dynamic expansion)
  const [instructionBreakdown, setInstructionBreakdown] = useState('');
  const [taskSequence, setTaskSequence] = useState('');
  const [risk, setRisk] = useState('');
  const [riskProfile, setRiskProfile] = useState('');
  const [consequence, setConsequence] = useState('');
  const [incidentEventTimelines, setIncidentEventTimelines] = useState<Array<{ timestamp: string; notes: string }>>([]);
  const [immediateCausesUnsafeActs, setImmediateCausesUnsafeActs] = useState<Record<string, Array<string | { other: string }>>>({});
  const [immediateCausesUnsafeConditions, setImmediateCausesUnsafeConditions] = useState<Record<string, Array<string | { other: string }>>>({});
  const [rootCauseHumanFactors, setRootCauseHumanFactors] = useState<Record<string, Array<string | { other: string }>>>({});
  const [rootCauseWorkplaceFactors, setRootCauseWorkplaceFactors] = useState<Record<string, Array<string | { other: string }>>>({});
  const [systemFailure, setSystemFailure] = useState<Array<string | { other: string }>>([]);
  const [contributingFactors, setContributingFactors] = useState('');
  const [contributingFactorTags, setContributingFactorTags] = useState<string[]>([]);
  const [lessonsLearnt, setLessonsLearnt] = useState('');
  const [investigationTeamUserIds, setInvestigationTeamUserIds] = useState<UUID[]>([]);
  const [investigationTeamEmails, setInvestigationTeamEmails] = useState<string[]>([]);
  const [conclusion, setConclusion] = useState('');
  const [preparedByUserId, setPreparedByUserId] = useState<UUID | null>(user?.id as UUID | null);
  const [distributionsToUserIds, setDistributionsToUserIds] = useState<UUID[]>([]);
  const [distributionsToEmails, setDistributionsToEmails] = useState<string[]>([]);
  
  // Legacy fields for backward compatibility (will be removed later)
  const [incidentTimeline, setIncidentTimeline] = useState('');
  const [unsafeActs, setUnsafeActs] = useState('');
  const [unsafeConditions, setUnsafeConditions] = useState('');
  const [rootCauseHuman, setRootCauseHuman] = useState('');
  const [rootCauseWorkplace, setRootCauseWorkplace] = useState('');
  const [investigationTeam, setInvestigationTeam] = useState('');
  
  // Evidence uploads
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [investigationFiles, setInvestigationFiles] = useState<File[]>([]);
  const [uploadInvestigationFirst, setUploadInvestigationFirst] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableSubcategories = useMemo(() => {
    return INCIDENT_CATEGORY_SUBCATEGORIES[category] || [];
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
      incidentType.length > 0 &&
      natureOfIncident.trim().length > 0 &&
      causeOfIncident.trim().length > 0 &&
      lossTypes.length > 0 &&
      correctiveActionsSummary.trim().length > 0 &&
      reportedByUserId !== null &&
      reportedToUserIds.length > 0 &&
      riskCategory.length > 0;
    
    // Affected person is optional but recommended
    // Evidence is optional unless investigation = YES (then recommended)
    const evidenceRecommended = investigationRequired && evidenceFiles.length === 0 && investigationFiles.length === 0;
    
    // If investigation required, check investigation fields
    if (investigationRequired && !uploadInvestigationFirst) {
      return mandatoryFields && 
             risk.trim().length > 0 &&
             riskProfile.trim().length > 0 &&
             (incidentEventTimelines.length > 0 || incidentTimeline.trim().length > 0) &&
             (investigationTeamUserIds.length > 0 || investigationTeam.trim().length > 0) &&
             conclusion.trim().length > 0 &&
             !evidenceRecommended; // Evidence recommended but not required
    }
    
    return mandatoryFields;
  }, [
    projectClient, finalSubcategory, incidentType, natureOfIncident, causeOfIncident, 
    lossTypes, correctiveActionsSummary, reportedByUserId, reportedToUserIds, riskCategory,
    investigationRequired, uploadInvestigationFirst, risk, riskProfile,
    incidentTimeline, investigationTeam, conclusion, evidenceFiles, investigationFiles
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
      
      // Build comprehensive description with all fields (for backward compatibility)
      const descriptionParts: string[] = [];
      descriptionParts.push(`Project/Client: ${projectClient}`);
      descriptionParts.push(`Type of Incident: ${incidentType}`);
      descriptionParts.push(`Nature of Incident: ${natureOfIncident}`);
      descriptionParts.push(`Cause of Incident: ${causeOfIncident}`);
      if (affectedPersonName) descriptionParts.push(`Affected Person: ${affectedPersonName}`);
      descriptionParts.push(`Loss Types: ${lossTypes.join(', ')}`);
      descriptionParts.push(`Severity: ${severity}`);
      descriptionParts.push(`Risk Category: ${riskCategory}`);
      descriptionParts.push(`Corrective Actions Summary: ${correctiveActionsSummary}`);
      if (location) descriptionParts.push(`Location: ${location}`);
      
      const fullDescription = descriptionParts.join('\n\n');

      // Create incident with all new fields
      const incident = await createIncident({
        companyId: props.companyId,
        module,
        category,
        subcategory: finalSubcategory,
        title: projectClient.trim(),
        description: fullDescription,
        severity,
        occurredAt,
        location: location.trim() || undefined,
        createdByUserId: props.createdByUserId,
        // New base fields
        incidentType: incidentType,
        typeOfIncident: incidentType,
        categoryName: category,
        subcategoryName: finalSubcategory,
        subcategoryCustomText: useManualSubcategory ? subcategoryManual : null,
        causeOfIncident: causeOfIncident,
        affectedPersonId: affectedPersonId || undefined,
        affectedPersonName: affectedPersonName || undefined,
        lossTypes: lossTypes,
        lossProductionValue: lossProductionValue,
        lossFinancialValue: lossFinancialValue,
        riskCategory: riskCategory,
        reportedByUserId: reportedByUserId || undefined,
        reportedToUserIds: reportedToUserIds,
        copyToUserIds: copyToUserIds,
        copyToEmails: copyToEmails,
        investigationRequired: investigationRequired,
        projectClient: projectClient,
        // Investigation fields (if investigation required)
        ...(investigationRequired ? {
          instructionBreakdown: instructionBreakdown || undefined,
          taskSequence: taskSequence || undefined,
          consequence: consequence || undefined,
          incidentEventTimelines: incidentEventTimelines.length > 0 ? incidentEventTimelines : undefined,
          immediateCausesUnsafeActs: immediateCausesUnsafeActs || undefined,
          immediateCausesUnsafeConditions: immediateCausesUnsafeConditions || undefined,
          rootCauseHumanFactors: rootCauseHumanFactors || undefined,
          rootCauseWorkplaceFactors: rootCauseWorkplaceFactors || undefined,
          systemFailure: systemFailure.length > 0 ? systemFailure : undefined,
          contributingFactors: contributingFactors || undefined,
          contributingFactorTags: contributingFactorTags || undefined,
          lessonsLearnt: lessonsLearnt || undefined,
          investigationTeamUserIds: investigationTeamUserIds,
          conclusion: conclusion || undefined,
          preparedByUserId: preparedByUserId || undefined,
          distributionsToUserIds: distributionsToUserIds,
          distributionsToEmails: distributionsToEmails
        } : {})
      });

      // Upload evidence files
      if (evidenceFiles.length > 0) {
        for (const file of evidenceFiles) {
          const key = `${props.companyId}/incident/${incident.id}/${Date.now()}-${file.name}`.replace(/\s+/g, '_');
          const { error: uploadError } = await insforge.storage.from(EVIDENCE_BUCKET).upload(key, file);
          if (uploadError) throw uploadError;
          
          await createEvidence({
            companyId: props.companyId,
            entityType: 'incident',
            entityId: incident.id,
            title: file.name,
            storageBucket: EVIDENCE_BUCKET,
            storageKey: key,
            createdByUserId: props.createdByUserId
          });
        }
      }

      // Upload investigation files
      if (investigationRequired && investigationFiles.length > 0) {
        for (const file of investigationFiles) {
          const key = `${props.companyId}/incident/${incident.id}/investigation/${Date.now()}-${file.name}`.replace(/\s+/g, '_');
          const { error: uploadError } = await insforge.storage.from(EVIDENCE_BUCKET).upload(key, file);
          if (uploadError) throw uploadError;
          
          await createEvidence({
            companyId: props.companyId,
            entityType: 'incident',
            entityId: incident.id,
            title: `Investigation: ${file.name}`,
            storageBucket: EVIDENCE_BUCKET,
            storageKey: key,
            createdByUserId: props.createdByUserId
          });
        }
      }
      
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
    setCategory(INCIDENT_CATEGORIES[0]);
    setSubcategory('');
    setSubcategoryManual('');
    setUseManualSubcategory(false);
    setProjectClient('');
    setIncidentType(INCIDENT_TYPES[0]);
    setIncidentDate(new Date().toISOString().slice(0, 10));
    setIncidentTime(new Date().toTimeString().slice(0, 5));
    setNatureOfIncident('');
    setCauseOfIncident('');
    setAffectedPersonId(null);
    setAffectedPersonName(null);
    setLossTypes([]);
    setLossProductionValue(undefined);
    setLossFinancialValue(undefined);
    setCorrectiveActionsSummary('');
    setSeverity('medium');
    setRiskCategory('Medium');
    setLikelihood(3);
    setReportedByUserId(user?.id as UUID | null);
    setReportedToUserIds([]);
    setCopyToUserIds([]);
    setCopyToEmails([]);
    setInvestigationRequired(false);
    setInstructionBreakdown('');
    setTaskSequence('');
    setRisk('');
    setRiskProfile('');
    setConsequence('');
    setIncidentEventTimelines([]);
    setImmediateCausesUnsafeActs({});
    setImmediateCausesUnsafeConditions({});
    setRootCauseHumanFactors({});
    setRootCauseWorkplaceFactors({});
    setSystemFailure([]);
    setContributingFactors('');
    setContributingFactorTags([]);
    setLessonsLearnt('');
    setInvestigationTeamUserIds([]);
    setInvestigationTeamEmails([]);
    setConclusion('');
    setPreparedByUserId(user?.id as UUID | null);
    setDistributionsToUserIds([]);
    setDistributionsToEmails([]);
    setEvidenceFiles([]);
    setInvestigationFiles([]);
    setUploadInvestigationFirst(false);
    setLocation('');
    setModule(props.defaultModule ?? 'safety');
    // Legacy fields
    setIncidentTimeline('');
    setUnsafeActs('');
    setUnsafeConditions('');
    setRootCauseHuman('');
    setRootCauseWorkplace('');
    setInvestigationTeam('');
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-5xl mx-4 my-8 bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[95vh] overflow-y-auto">
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
                <label className="block text-sm font-medium text-charcoal mb-1.5">Type of Incident *</label>
                <select
                  value={incidentType}
                  onChange={(e) => setIncidentType(e.target.value as IncidentType)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  required
                >
                  {INCIDENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
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
                <label className="block text-sm font-medium text-charcoal mb-1.5">Affected Person</label>
                <AffectedPersonSelector
                  companyId={props.companyId}
                  selectedPersonId={affectedPersonId}
                  selectedPersonName={affectedPersonName}
                  onChange={(id, name) => {
                    setAffectedPersonId(id);
                    setAffectedPersonName(name);
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Loss Types *</label>
                <div className="space-y-2">
                  {LOSS_TYPES.map((lossType) => (
                    <label key={lossType} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={lossTypes.includes(lossType)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setLossTypes([...lossTypes, lossType]);
                          } else {
                            setLossTypes(lossTypes.filter(lt => lt !== lossType));
                          }
                        }}
                        className="w-4 h-4 text-teal border-surface-300 rounded focus:ring-teal"
                      />
                      <span className="text-sm text-charcoal">{lossType}</span>
                    </label>
                  ))}
                </div>
                {lossTypes.includes('production loss') && (
                  <div className="mt-2">
                    <input
                      type="number"
                      value={lossProductionValue || ''}
                      onChange={(e) => setLossProductionValue(e.target.value ? parseFloat(e.target.value) : undefined)}
                      placeholder="Production loss value"
                      className="w-full px-4 py-2 bg-white border border-surface-300 rounded-lg text-sm"
                    />
                  </div>
                )}
                {lossTypes.includes('financial loss') && (
                  <div className="mt-2">
                    <input
                      type="number"
                      value={lossFinancialValue || ''}
                      onChange={(e) => setLossFinancialValue(e.target.value ? parseFloat(e.target.value) : undefined)}
                      placeholder="Financial loss value"
                      className="w-full px-4 py-2 bg-white border border-surface-300 rounded-lg text-sm"
                    />
                  </div>
                )}
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
                <label className="block text-sm font-medium text-charcoal mb-1.5">Corrective Actions Summary *</label>
                <textarea
                  value={correctiveActionsSummary}
                  onChange={(e) => setCorrectiveActionsSummary(e.target.value)}
                  rows={3}
                  placeholder="Summary of actions taken or planned..."
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Risk Category *</label>
                <select
                  value={riskCategory}
                  onChange={(e) => setRiskCategory(e.target.value as RiskCategory)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  required
                >
                  {RISK_CATEGORIES.map((rc) => (
                    <option key={rc} value={rc}>
                      {rc}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Reporting & Escalation */}
          <div className="border-b border-surface-200 pb-4">
            <h3 className="text-sm font-semibold text-charcoal mb-4">Reporting & Escalation</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Reported By *</label>
                <UserMultiSelect
                  companyId={props.companyId}
                  selectedUserIds={reportedByUserId ? [reportedByUserId] : []}
                  onChange={(userIds) => setReportedByUserId(userIds[0] || null)}
                  placeholder="Select reporter (defaults to you)"
                  allowExternalEmails={false}
                />
                <p className="text-xs text-charcoal-500 mt-1">Defaults to your account. Admin can override.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Reported To *</label>
                <UserMultiSelect
                  companyId={props.companyId}
                  selectedUserIds={reportedToUserIds}
                  onChange={(userIds) => setReportedToUserIds(userIds)}
                  placeholder="Select recipients"
                  allowExternalEmails={false}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Copy To (Escalation)</label>
                <UserMultiSelect
                  companyId={props.companyId}
                  selectedUserIds={copyToUserIds}
                  selectedEmails={copyToEmails}
                  onChange={(userIds, emails) => {
                    setCopyToUserIds(userIds);
                    setCopyToEmails(emails);
                  }}
                  placeholder="Select additional recipients or add external emails"
                  allowExternalEmails={true}
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
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Instruction Breakdown / Flow</label>
                      <textarea
                        value={instructionBreakdown}
                        onChange={(e) => setInstructionBreakdown(e.target.value)}
                        rows={3}
                        placeholder="Breakdown of instructions/flow..."
                        className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Task Sequence</label>
                      <textarea
                        value={taskSequence}
                        onChange={(e) => setTaskSequence(e.target.value)}
                        rows={3}
                        placeholder="Task sequence or ordered list..."
                        className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Risk *</label>
                      <select
                        value={risk}
                        onChange={(e) => setRisk(e.target.value)}
                        className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                        required={investigationRequired && !uploadInvestigationFirst}
                      >
                        <option value="">Select risk level</option>
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Risk Profile / Hazards *</label>
                      <textarea
                        value={riskProfile}
                        onChange={(e) => setRiskProfile(e.target.value)}
                        rows={3}
                        placeholder="Updated risk assessment and hazards..."
                        className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                        required={investigationRequired && !uploadInvestigationFirst}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Consequence / Potential Consequence</label>
                      <textarea
                        value={consequence}
                        onChange={(e) => setConsequence(e.target.value)}
                        rows={3}
                        placeholder="Describe consequences..."
                        className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                      />
                    </div>
                    <div>
                      <IncidentTimelineBuilder
                        events={incidentEventTimelines}
                        onChange={(events) => {
                          setIncidentEventTimelines(events);
                          // Also update legacy field for backward compatibility
                          setIncidentTimeline(events.map(e => `${e.timestamp}: ${e.notes}`).join('\n'));
                        }}
                      />
                    </div>
                    {/* Multi-select cause groups are added above */}
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
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Contributing Factors</label>
                      <textarea
                        value={contributingFactors}
                        onChange={(e) => setContributingFactors(e.target.value)}
                        rows={3}
                        placeholder="Contributing factors..."
                        className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Investigation Team *</label>
                      <UserMultiSelect
                        companyId={props.companyId}
                        selectedUserIds={investigationTeamUserIds}
                        selectedEmails={investigationTeamEmails}
                        onChange={(userIds, emails) => {
                          setInvestigationTeamUserIds(userIds);
                          setInvestigationTeamEmails(emails);
                        }}
                        placeholder="Select investigation team members or add external emails"
                        allowExternalEmails={true}
                      />
                      <p className="text-xs text-charcoal-500 mt-1">Select team members or enter names manually via external emails</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Prepared By</label>
                      <UserMultiSelect
                        companyId={props.companyId}
                        selectedUserIds={preparedByUserId ? [preparedByUserId] : []}
                        onChange={(userIds) => setPreparedByUserId(userIds[0] || null)}
                        placeholder="Select preparer (defaults to you)"
                        allowExternalEmails={false}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Distributions (Copy) To</label>
                      <UserMultiSelect
                        companyId={props.companyId}
                        selectedUserIds={distributionsToUserIds}
                        selectedEmails={distributionsToEmails}
                        onChange={(userIds, emails) => {
                          setDistributionsToUserIds(userIds);
                          setDistributionsToEmails(emails);
                        }}
                        placeholder="Select distribution recipients"
                        allowExternalEmails={true}
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
                      <CauseMultiSelectGroups
                        groups={IMMEDIATE_CAUSES_UNSAFE_ACTS_GROUPS}
                        selected={immediateCausesUnsafeActs}
                        onChange={(selected) => {
                          setImmediateCausesUnsafeActs(selected);
                          // Also update legacy field for backward compatibility
                          const text = Object.entries(selected)
                            .map(([group, items]) => `${group}: ${items.map(i => typeof i === 'string' ? i : i.other).join(', ')}`)
                            .join('\n');
                          setUnsafeActs(text);
                        }}
                        label="Immediate Causes: Unsafe Acts"
                      />
                    </div>
                    <div>
                      <CauseMultiSelectGroups
                        groups={IMMEDIATE_CAUSES_UNSAFE_CONDITIONS_GROUPS}
                        selected={immediateCausesUnsafeConditions}
                        onChange={(selected) => {
                          setImmediateCausesUnsafeConditions(selected);
                          // Also update legacy field for backward compatibility
                          const text = Object.entries(selected)
                            .map(([group, items]) => `${group}: ${items.map(i => typeof i === 'string' ? i : i.other).join(', ')}`)
                            .join('\n');
                          setUnsafeConditions(text);
                        }}
                        label="Immediate Causes: Unsafe Conditions"
                      />
                    </div>
                    <div>
                      <CauseMultiSelectGroups
                        groups={ROOT_CAUSE_HUMAN_FACTORS_CATEGORIES}
                        selected={rootCauseHumanFactors}
                        onChange={(selected) => {
                          setRootCauseHumanFactors(selected);
                          // Also update legacy field for backward compatibility
                          const text = Object.entries(selected)
                            .map(([group, items]) => `${group}: ${items.map(i => typeof i === 'string' ? i : i.other).join(', ')}`)
                            .join('\n');
                          setRootCauseHuman(text);
                        }}
                        label="Root Cause (Human Factors)"
                      />
                    </div>
                    <div>
                      <CauseMultiSelectGroups
                        groups={ROOT_CAUSE_WORKPLACE_FACTORS_CATEGORIES}
                        selected={rootCauseWorkplaceFactors}
                        onChange={(selected) => {
                          setRootCauseWorkplaceFactors(selected);
                          // Also update legacy field for backward compatibility
                          const text = Object.entries(selected)
                            .map(([group, items]) => `${group}: ${items.map(i => typeof i === 'string' ? i : i.other).join(', ')}`)
                            .join('\n');
                          setRootCauseWorkplace(text);
                        }}
                        label="Root Cause (Workplace Factors)"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-2">System Failure</label>
                      <div className="space-y-2 border border-surface-300 rounded-lg p-3 max-h-64 overflow-y-auto">
                        {SYSTEM_FAILURE_OPTIONS.map((option) => {
                          const isSelected = systemFailure.some(
                            s => (typeof s === 'string' && s === option) || (typeof s === 'object' && s.other !== undefined && option === 'Other')
                          );
                          return (
                            <div key={option} className="space-y-1">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      if (option === 'Other') {
                                        setSystemFailure([...systemFailure, { other: '' }]);
                                      } else {
                                        setSystemFailure([...systemFailure, option]);
                                      }
                                    } else {
                                      setSystemFailure(systemFailure.filter(
                                        s => !(typeof s === 'string' && s === option) && !(typeof s === 'object' && s.other !== undefined && option === 'Other')
                                      ));
                                    }
                                  }}
                                  className="w-4 h-4 text-teal border-surface-300 rounded focus:ring-teal"
                                />
                                <span className="text-sm text-charcoal">{option}</span>
                              </label>
                              {option === 'Other' && isSelected && (
                                <input
                                  type="text"
                                  value={systemFailure.find(s => typeof s === 'object' && s.other !== undefined) && typeof systemFailure.find(s => typeof s === 'object' && s.other !== undefined) === 'object' ? (systemFailure.find(s => typeof s === 'object' && s.other !== undefined) as { other: string }).other : ''}
                                  onChange={(e) => {
                                    const updated = systemFailure.map(s => {
                                      if (typeof s === 'object' && s.other !== undefined) {
                                        return { other: e.target.value };
                                      }
                                      return s;
                                    });
                                    setSystemFailure(updated);
                                  }}
                                  placeholder="Specify other..."
                                  className="ml-6 w-full px-3 py-1.5 text-sm border border-surface-300 rounded focus:outline-none focus:ring-2 focus:ring-teal"
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
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
