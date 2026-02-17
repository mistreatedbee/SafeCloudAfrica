import React, { useMemo, useState } from 'react';
import { XIcon, UploadIcon, FileIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { UUID } from '../../api/models/core';
import type { ModuleKey, Severity, IncidentCategory, IncidentType, LossType } from '../../api/models/core';
import { INCIDENT_CATEGORIES, INCIDENT_CATEGORY_SUBCATEGORIES, INCIDENT_TYPES, LOSS_TYPES } from '../../api/models/core';
import { createIncident } from '../../api/services/incidentsService';
import { UserMultiSelect } from '../ui/UserMultiSelect';
import { AffectedPersonSelector } from './AffectedPersonSelector';
import { IncidentTimelineBuilder } from './IncidentTimelineBuilder';
import { CauseMultiSelectGroups } from './CauseMultiSelectGroups';
import { createEvidence } from '../../api/services/evidenceService';

type EvidenceFileItem = { file: File; displayTitle: string };

type AffectedPersonRow = { userId: UUID | null; displayName: string; taskOperation: string; machineryEquipmentTools: string };

function getFileKind(file: File): 'image' | 'document' {
  const t = (file.type || '').toLowerCase();
  if (t.startsWith('image/')) return 'image';
  return 'document';
}
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
  const [incidentType, setIncidentType] = useState<string>(INCIDENT_TYPES[0]);
  const [incidentDate, setIncidentDate] = useState(new Date().toISOString().slice(0, 10));
  const [incidentTime, setIncidentTime] = useState(new Date().toTimeString().slice(0, 5));
  const [natureOfIncident, setNatureOfIncident] = useState('');
  const [causeOfIncident, setCauseOfIncident] = useState('');
  const [affectedPersons, setAffectedPersons] = useState<AffectedPersonRow[]>([{ userId: null, displayName: '', taskOperation: '', machineryEquipmentTools: '' }]);
  const [lossTypes, setLossTypes] = useState<string[]>([]);
  const [lossOtherText, setLossOtherText] = useState('');
  const [lossProductionValue, setLossProductionValue] = useState<number | undefined>();
  const [lossFinancialValue, setLossFinancialValue] = useState<number | undefined>();
  const [correctiveActionsSummary, setCorrectiveActionsSummary] = useState('');
  const [requiredBehaviour, setRequiredBehaviour] = useState('');
  const [incidentTypeOther, setIncidentTypeOther] = useState('');
  const [location, setLocation] = useState('');
  const [severity, setSeverity] = useState<Severity>('medium');
  
  // Risk Rating: Severity (1-5) × Likelihood (1-5) → product, classification (Low/Medium/High)
  const [riskSeverity1To5, setRiskSeverity1To5] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [likelihood, setLikelihood] = useState<1 | 2 | 3 | 4 | 5>(3);
  const riskRatingProduct = useMemo(() => riskSeverity1To5 * likelihood, [riskSeverity1To5, likelihood]);
  const riskClassification = useMemo(() => {
    if (riskRatingProduct <= 5) return 'Low' as const;
    if (riskRatingProduct <= 12) return 'Medium' as const;
    return 'High' as const;
  }, [riskRatingProduct]);
  
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
  
  // Evidence uploads (file + editable display name per item)
  const [evidenceFiles, setEvidenceFiles] = useState<EvidenceFileItem[]>([]);
  const [investigationFiles, setInvestigationFiles] = useState<EvidenceFileItem[]>([]);
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

  const finalIncidentType = useMemo(() => {
    return incidentType === 'Other' ? incidentTypeOther.trim() : incidentType;
  }, [incidentType, incidentTypeOther]);

  const finalLossTypes = useMemo(() => {
    const other = lossOtherText.trim();
    if (!other) return lossTypes;
    return lossTypes.includes(other) ? lossTypes : [...lossTypes, other];
  }, [lossTypes, lossOtherText]);

  // Minimal required to submit: project/client, category, reporter. All other fields optional (soft validation).
  const canSubmit = useMemo(() => {
    return (
      projectClient.trim().length > 0 &&
      finalSubcategory.length > 0 &&
      reportedByUserId !== null
    );
  }, [projectClient, finalSubcategory, reportedByUserId]);

  const recommendedMissing = useMemo(() => {
    const missing: string[] = [];
    if (!finalIncidentType.length) missing.push('Type of Incident');
    if (!natureOfIncident.trim().length) missing.push('Nature of Incident');
    if (!causeOfIncident.trim().length) missing.push('Cause of Incident');
    if (!finalLossTypes.length) missing.push('Loss / Potential Loss');
    if (!correctiveActionsSummary.trim().length) missing.push('Corrective Actions Summary');
    if (!reportedToUserIds.length) missing.push('Reported To');
    return missing;
  }, [finalIncidentType, natureOfIncident, causeOfIncident, finalLossTypes, correctiveActionsSummary, reportedToUserIds]);

  const handleEvidenceFileUpload = (files: FileList | null) => {
    if (!files) return;
    const items: EvidenceFileItem[] = Array.from(files).map(file => ({ file, displayTitle: file.name }));
    setEvidenceFiles(prev => [...prev, ...items]);
  };

  const handleInvestigationFileUpload = (files: FileList | null) => {
    if (!files) return;
    const items: EvidenceFileItem[] = Array.from(files).map(file => ({ file, displayTitle: `Investigation: ${file.name}` }));
    setInvestigationFiles(prev => [...prev, ...items]);
  };

  const setEvidenceDisplayTitle = (index: number, displayTitle: string) => {
    setEvidenceFiles(prev => prev.map((item, i) => i === index ? { ...item, displayTitle } : item));
  };

  const setInvestigationDisplayTitle = (index: number, displayTitle: string) => {
    setInvestigationFiles(prev => prev.map((item, i) => i === index ? { ...item, displayTitle } : item));
  };

  const removeEvidenceFile = (index: number) => {
    setEvidenceFiles(prev => prev.filter((_, i) => i !== index));
  };

  const removeInvestigationFile = (index: number) => {
    setInvestigationFiles(prev => prev.filter((_, i) => i !== index));
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
      descriptionParts.push(`Type of Incident: ${finalIncidentType}`);
      descriptionParts.push(`Nature of Incident: ${natureOfIncident}`);
      descriptionParts.push(`Cause of Incident: ${causeOfIncident}`);
      const apNames = affectedPersons.filter(p => p.displayName.trim()).map(p => p.displayName.trim());
      if (apNames.length) descriptionParts.push(`Affected Person(s): ${apNames.join('; ')}`);
      descriptionParts.push(`Loss / Potential Loss: ${finalLossTypes.join(', ')}`);
      descriptionParts.push(`Severity: ${severity}`);
      descriptionParts.push(`Risk Rating: ${riskClassification} (${riskRatingProduct})`);
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
        incidentType: finalIncidentType,
        typeOfIncident: finalIncidentType,
        categoryName: category,
        subcategoryName: finalSubcategory,
        subcategoryCustomText: useManualSubcategory ? subcategoryManual : null,
        causeOfIncident: causeOfIncident,
        affectedPersonId: affectedPersons[0]?.userId ?? undefined,
        affectedPersonName: affectedPersons[0]?.displayName?.trim() || undefined,
        affectedPersons: affectedPersons
          .filter(p => p.displayName.trim() || p.userId)
          .map(p => ({ userId: p.userId, displayName: p.displayName.trim() || null, taskOperation: p.taskOperation.trim() || null, machineryEquipmentTools: p.machineryEquipmentTools.trim() || null })),
        lossTypes: finalLossTypes,
        lossProductionValue: lossProductionValue,
        lossFinancialValue: lossFinancialValue,
        riskCategory: riskClassification,
        riskSeverity1To5,
        riskLikelihood1To5,
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
        } : {}),
      requiredBehaviour: requiredBehaviour.trim() || undefined
      });

      // Upload evidence files (with original filename, display title, file kind)
      if (evidenceFiles.length > 0) {
        for (const item of evidenceFiles) {
          const key = `${props.companyId}/incident/${incident.id}/${Date.now()}-${item.file.name}`.replace(/\s+/g, '_');
          const { error: uploadError } = await insforge.storage.from(EVIDENCE_BUCKET).upload(key, item.file);
          if (uploadError) throw uploadError;
          await createEvidence({
            companyId: props.companyId,
            entityType: 'incident',
            entityId: incident.id,
            title: item.displayTitle || item.file.name,
            storageBucket: EVIDENCE_BUCKET,
            storageKey: key,
            createdByUserId: props.createdByUserId,
            originalFilename: item.file.name,
            displayTitle: item.displayTitle || item.file.name,
            fileKind: getFileKind(item.file)
          });
        }
      }

      // Upload investigation files
      if (investigationRequired && investigationFiles.length > 0) {
        for (const item of investigationFiles) {
          const key = `${props.companyId}/incident/${incident.id}/investigation/${Date.now()}-${item.file.name}`.replace(/\s+/g, '_');
          const { error: uploadError } = await insforge.storage.from(EVIDENCE_BUCKET).upload(key, item.file);
          if (uploadError) throw uploadError;
          await createEvidence({
            companyId: props.companyId,
            entityType: 'incident',
            entityId: incident.id,
            title: item.displayTitle || item.file.name,
            storageBucket: EVIDENCE_BUCKET,
            storageKey: key,
            createdByUserId: props.createdByUserId,
            originalFilename: item.file.name,
            displayTitle: item.displayTitle || item.file.name,
            fileKind: getFileKind(item.file)
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
    setIncidentTypeOther('');
    setIncidentDate(new Date().toISOString().slice(0, 10));
    setIncidentTime(new Date().toTimeString().slice(0, 5));
    setNatureOfIncident('');
    setCauseOfIncident('');
    setAffectedPersons([{ userId: null, displayName: '', taskOperation: '', machineryEquipmentTools: '' }]);
    setLossTypes([]);
    setLossOtherText('');
    setRequiredBehaviour('');
    setIncidentTypeOther('');
    setLossProductionValue(undefined);
    setLossFinancialValue(undefined);
    setCorrectiveActionsSummary('');
    setSeverity('medium');
    setRiskSeverity1To5(3);
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
            <p className="text-xs text-charcoal-500 mt-0.5">Only Project/Client, Category and Reporter are required. You can save and complete other fields later.</p>
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
          {recommendedMissing.length > 0 && (
            <div className="bg-warning/5 border border-warning/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-charcoal">Recommended fields missing</p>
              <p className="text-sm text-charcoal-600 mt-1">You can save now and complete later: {recommendedMissing.join(', ')}</p>
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
                <label className="block text-sm font-medium text-charcoal mb-1.5">Type of Incident</label>
                <select
                  value={incidentType}
                  onChange={(e) => setIncidentType(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                >
                  {INCIDENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                  <option value="Other">Other (type below)</option>
                </select>
                {incidentType === 'Other' && (
                  <input
                    type="text"
                    value={incidentTypeOther}
                    onChange={(e) => setIncidentTypeOther(e.target.value)}
                    placeholder="Type incident type manually"
                    className="mt-2 w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                  />
                )}
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
                <label className="block text-sm font-medium text-charcoal mb-1.5">Nature of Incident</label>
                <textarea
                  value={natureOfIncident}
                  onChange={(e) => setNatureOfIncident(e.target.value)}
                  rows={3}
                  placeholder="Describe what happened..."
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Cause of Incident</label>
                <textarea
                  value={causeOfIncident}
                  onChange={(e) => setCauseOfIncident(e.target.value)}
                  rows={3}
                  placeholder="What caused this incident?"
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Affected Person(s)</label>
                <p className="text-xs text-charcoal-500 mb-2">Add each affected person with their task/operation and machinery involved (for analytics).</p>
                <div className="space-y-3">
                  {affectedPersons.map((row, index) => (
                    <div key={index} className="p-3 border border-surface-200 rounded-lg space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex-1 min-w-[160px]">
                          <AffectedPersonSelector
                            companyId={props.companyId}
                            selectedPersonId={row.userId}
                            selectedPersonName={row.displayName || null}
                            onChange={(id, name) => {
                              setAffectedPersons(prev => prev.map((r, i) => i === index ? { ...r, userId: id, displayName: name || '' } : r));
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setAffectedPersons(prev => prev.filter((_, i) => i !== index))}
                          disabled={affectedPersons.length <= 1}
                          className="text-xs text-critical hover:text-critical-600 disabled:opacity-40"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={row.taskOperation}
                          onChange={(e) => setAffectedPersons(prev => prev.map((r, i) => i === index ? { ...r, taskOperation: e.target.value } : r))}
                          placeholder="Task / Operation"
                          className="px-3 py-2 text-sm border border-surface-300 rounded-lg"
                        />
                        <input
                          type="text"
                          value={row.machineryEquipmentTools}
                          onChange={(e) => setAffectedPersons(prev => prev.map((r, i) => i === index ? { ...r, machineryEquipmentTools: e.target.value } : r))}
                          placeholder="Machinery / Equipment / Tools"
                          className="px-3 py-2 text-sm border border-surface-300 rounded-lg"
                        />
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAffectedPersons(prev => [...prev, { userId: null, displayName: '', taskOperation: '', machineryEquipmentTools: '' }])}
                    className="text-sm text-teal hover:text-teal-600 font-medium"
                  >
                    + Add another affected person
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Loss / Potential Loss</label>
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-charcoal">Other:</span>
                    <input
                      type="text"
                      value={lossOtherText}
                      onChange={(e) => setLossOtherText(e.target.value)}
                      placeholder="Type manually"
                      className="flex-1 min-w-[140px] px-3 py-1.5 text-sm border border-surface-300 rounded-lg"
                    />
                  </div>
                </div>
                {finalLossTypes.includes('production loss') && (
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
                {finalLossTypes.includes('financial loss') && (
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
                <label className="block text-sm font-medium text-charcoal mb-1.5">Corrective Actions Summary</label>
                <textarea
                  value={correctiveActionsSummary}
                  onChange={(e) => setCorrectiveActionsSummary(e.target.value)}
                  rows={3}
                  placeholder="Summary of actions taken or planned..."
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Required Behaviour (optional)</label>
                <textarea
                  value={requiredBehaviour}
                  onChange={(e) => setRequiredBehaviour(e.target.value)}
                  rows={2}
                  placeholder="e.g. Follow procedure, Use PPE, Report hazard — or type manually"
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Risk Rating: Severity (1-5) × Likelihood (1-5), auto-calculated, read-only result */}
          <div className="border-b border-surface-200 pb-4">
            <h3 className="text-sm font-semibold text-charcoal mb-4">Risk Rating</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Severity (1–5)</label>
                <select
                  value={riskSeverity1To5}
                  onChange={(e) => setRiskSeverity1To5(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                  <option value={5}>5</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Likelihood (1–5)</label>
                <select
                  value={likelihood}
                  onChange={(e) => setLikelihood(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                >
                  <option value={1}>1 - Rare</option>
                  <option value={2}>2 - Unlikely</option>
                  <option value={3}>3 - Possible</option>
                  <option value={4}>4 - Likely</option>
                  <option value={5}>5 - Almost Certain</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Risk Rating (read-only)</label>
                <div className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold bg-surface-100 border border-surface-200">
                  {riskSeverity1To5} × {likelihood} = {riskRatingProduct}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Risk Classification (read-only)</label>
                <div
                  className={`w-full px-4 py-2.5 rounded-lg text-sm font-semibold ${
                    riskClassification === 'High' ? 'bg-critical text-white' :
                    riskClassification === 'Medium' ? 'bg-warning text-white' :
                    'bg-success text-white'
                  }`}
                >
                  {riskClassification}
                </div>
                <p className="text-xs text-charcoal-500 mt-1">1–5 Low, 6–12 Medium, 13–25 High</p>
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
              <label className="block text-sm font-medium text-charcoal mb-1.5">Upload Evidence Files (photos and documents)</label>
              <input
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                onChange={(e) => handleEvidenceFileUpload(e.target.files)}
                className="w-full text-sm"
              />
              {evidenceFiles.length > 0 && (
                <div className="mt-2 space-y-2">
                  {evidenceFiles.map((item, index) => (
                    <div key={index} className="flex flex-wrap items-center gap-2 p-2 bg-surface-50 rounded-lg">
                      <FileIcon className="w-4 h-4 text-charcoal-400 shrink-0" />
                      <span className="text-sm text-charcoal-500 shrink-0">{item.file.name}</span>
                      <span className="text-xs text-charcoal-400">({(item.file.size / 1024).toFixed(2)} KB)</span>
                      <label className="sr-only">Display name</label>
                      <input
                        type="text"
                        value={item.displayTitle}
                        onChange={(e) => setEvidenceDisplayTitle(index, e.target.value)}
                        placeholder="Display name in report"
                        className="flex-1 min-w-[120px] px-2 py-1 text-sm border border-surface-300 rounded"
                      />
                      <button
                        type="button"
                        onClick={() => removeEvidenceFile(index)}
                        className="text-xs text-critical hover:text-critical-600 shrink-0"
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
                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                        onChange={(e) => handleInvestigationFileUpload(e.target.files)}
                        className="w-full text-sm"
                      />
                      {investigationFiles.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {investigationFiles.map((item, index) => (
                            <div key={index} className="flex flex-wrap items-center gap-2 p-2 bg-white rounded-lg">
                              <FileIcon className="w-4 h-4 text-charcoal-400 shrink-0" />
                              <span className="text-sm text-charcoal-500 shrink-0">{item.file.name}</span>
                              <input
                                type="text"
                                value={item.displayTitle}
                                onChange={(e) => setInvestigationDisplayTitle(index, e.target.value)}
                                placeholder="Display name"
                                className="flex-1 min-w-[120px] px-2 py-1 text-sm border border-surface-300 rounded"
                              />
                              <button
                                type="button"
                                onClick={() => removeInvestigationFile(index)}
                                className="text-xs text-critical hover:text-critical-600 shrink-0"
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
                    <h3 className="text-sm font-semibold text-charcoal mt-4 mb-2">Incident Flow</h3>
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
                    <h3 className="text-sm font-semibold text-charcoal mt-4 mb-2">Unsafe Acts</h3>
                    <div>
                      <CauseMultiSelectGroups
                        groups={IMMEDIATE_CAUSES_UNSAFE_ACTS_GROUPS}
                        selected={immediateCausesUnsafeActs}
                        onChange={(selected) => {
                          setImmediateCausesUnsafeActs(selected);
                          const text = Object.entries(selected)
                            .map(([group, items]) => `${group}: ${items.map(i => typeof i === 'string' ? i : i.other).join(', ')}`)
                            .join('\n');
                          setUnsafeActs(text);
                        }}
                        label="Immediate Causes: Unsafe Acts"
                      />
                    </div>
                    <h3 className="text-sm font-semibold text-charcoal mt-4 mb-2">Unsafe Conditions</h3>
                    <div>
                      <CauseMultiSelectGroups
                        groups={IMMEDIATE_CAUSES_UNSAFE_CONDITIONS_GROUPS}
                        selected={immediateCausesUnsafeConditions}
                        onChange={(selected) => {
                          setImmediateCausesUnsafeConditions(selected);
                          const text = Object.entries(selected)
                            .map(([group, items]) => `${group}: ${items.map(i => typeof i === 'string' ? i : i.other).join(', ')}`)
                            .join('\n');
                          setUnsafeConditions(text);
                        }}
                        label="Immediate Causes: Unsafe Conditions"
                      />
                    </div>
                    <h3 className="text-sm font-semibold text-charcoal mt-4 mb-2">Root Causes</h3>
                    <div>
                      <CauseMultiSelectGroups
                        groups={ROOT_CAUSE_HUMAN_FACTORS_CATEGORIES}
                        selected={rootCauseHumanFactors}
                        onChange={(selected) => {
                          setRootCauseHumanFactors(selected);
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
                          const text = Object.entries(selected)
                            .map(([group, items]) => `${group}: ${items.map(i => typeof i === 'string' ? i : i.other).join(', ')}`)
                            .join('\n');
                          setRootCauseWorkplace(text);
                        }}
                        label="Root Cause (Workplace Factors)"
                      />
                    </div>
                    <h3 className="text-sm font-semibold text-charcoal mt-4 mb-2">System Failures</h3>
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
                    <h3 className="text-sm font-semibold text-charcoal mt-4 mb-2">Corrective Actions / Lessons Learnt</h3>
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
                    <h3 className="text-sm font-semibold text-charcoal mt-4 mb-2">Conclusion</h3>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Conclusion *</label>
                      <textarea
                        value={conclusion}
                        onChange={(e) => setConclusion(e.target.value)}
                        rows={3}
                        placeholder="Investigation conclusion..."
                        className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                      />
                    </div>
                    <h3 className="text-sm font-semibold text-charcoal mt-4 mb-2">Distribution (Copy To)</h3>
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
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Investigation Evidence Files</label>
                      <input
                        type="file"
                        multiple
                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                        onChange={(e) => handleInvestigationFileUpload(e.target.files)}
                        className="w-full text-sm"
                      />
                      {investigationFiles.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {investigationFiles.map((item, index) => (
                            <div key={index} className="flex flex-wrap items-center gap-2 p-2 bg-surface-50 rounded-lg">
                              <FileIcon className="w-4 h-4 text-charcoal-400 shrink-0" />
                              <span className="text-sm text-charcoal-500 shrink-0">{item.file.name}</span>
                              <input
                                type="text"
                                value={item.displayTitle}
                                onChange={(e) => setInvestigationDisplayTitle(index, e.target.value)}
                                placeholder="Display name"
                                className="flex-1 min-w-[120px] px-2 py-1 text-sm border border-surface-300 rounded"
                              />
                              <button
                                type="button"
                                onClick={() => removeInvestigationFile(index)}
                                className="text-xs text-critical hover:text-critical-600 shrink-0"
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
