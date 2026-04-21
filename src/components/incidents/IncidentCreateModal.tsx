import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { XIcon, FileTextIcon, ImageIcon, Trash2Icon, ExternalLinkIcon, DownloadIcon, ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { UUID } from '../../api/models/core';
import type { IncidentCategory, ModuleKey, Severity } from '../../api/models/core';
import {
  INCIDENT_TYPES,
  INCIDENT_CATEGORIES,
  INCIDENT_SUBCATEGORIES,
  IMMEDIATE_CAUSES_UNSAFE_ACTS_GROUPS,
  IMMEDIATE_CAUSES_UNSAFE_CONDITIONS_GROUPS,
  ROOT_CAUSE_HUMAN_FACTORS_CATEGORIES,
  ROOT_CAUSE_WORKPLACE_FACTORS_CATEGORIES,
  SYSTEM_FAILURE_OPTIONS,
  getIncidentRiskCategory
} from '../../api/models/core';
import type { Incident } from '../../api/models/entities';
import { createIncident, updateIncident } from '../../api/services/incidentsService';
import { getIncidentInvestigation, upsertIncidentInvestigation } from '../../api/services/incidentInvestigationsService';
import { createIncidentCorrectiveAction } from '../../api/services/incidentCorrectiveActionsService';
import { createEvidence } from '../../api/services/evidenceService';
import { uploadFile } from '../../api/services/storageService';
import { AffectedPersonSelector } from './AffectedPersonSelector';
import type { TimelineEvent } from './IncidentTimelineBuilder';
import { UserMultiSelect } from '../ui/UserMultiSelect';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';

const EVIDENCE_BUCKET = 'sca-evidence';

type UnsafeCauseEntry = {
  group: string;
  item: string;
  note: string;
};

type CauseDetailEntry = {
  group: string;
  item: string;
  note: string;
};

type InvestigationCauseLinkType = 'unsafe_act' | 'unsafe_condition' | 'root_cause' | 'system_failure';
type CorrectiveActionDraft = {
  id: string;
  actionRequired: string;
  responsibleUserId: UUID | null;
  dueDate: string;
  links: Array<{ type: InvestigationCauseLinkType; text: string }>;
};

type AffectedPersonEntry = {
  id: string;
  personId: UUID | null;
  personName: string;
  role: string;
  department: string;
  injuryType: string;
  contactDetails: string;
};

type UploadDraft = {
  id: string;
  // File objects cannot be reliably persisted across sessions.
  // When restored from a draft, `file` will be null and the user must re-select.
  file: File | null;
  displayName: string;
  originalFileName: string;
  previewUrl: string | null;
  kind: 'image' | 'document';
};

type InvestigationSectionKey =
  | 'immediateCauses'
  | 'unsafeActs'
  | 'unsafeConditions'
  | 'systemFailures'
  | 'rootCauses'
  | 'humanFactorsCauses'
  | 'workFactors'
  | 'contributingFactors'
  | 'correctiveActions'
  | 'lessonsLearned';

const LOSS_TYPE_OPTIONS: string[] = [
  'Production loss',
  'Financial loss',
  'Reputational loss',
  'Damage',
  'Illness',
  'Injury',
  'Asset loss',
  'Civil liability',
  'Criminal liability',
  'Vicarious liability',
  'Sub-standard quality product/service'
];

const INVESTIGATION_SECTION_DEFINITIONS: Array<{
  key: InvestigationSectionKey;
  label: string;
  description: string;
}> = [
  { key: 'immediateCauses', label: 'Immediate Causes', description: 'Immediate cause overview and grouped selections' },
  { key: 'unsafeActs', label: 'Unsafe Acts', description: 'Select all unsafe acts and add explanations' },
  { key: 'unsafeConditions', label: 'Unsafe Conditions', description: 'Select all unsafe conditions and add explanations' },
  { key: 'systemFailures', label: 'System Failures', description: 'Management system and process breakdowns' },
  { key: 'rootCauses', label: 'Root Causes', description: 'Human and workplace root cause analysis' },
  { key: 'humanFactorsCauses', label: 'Human Factors Causes', description: 'Human factors subcategories' },
  { key: 'workFactors', label: 'Work Factors', description: 'Workplace factors subcategories' },
  { key: 'contributingFactors', label: 'Contributing Factors', description: 'Additional factors linked to this incident' },
  { key: 'correctiveActions', label: 'Corrective Actions', description: 'Actions, ownership, conclusion and distribution' },
  { key: 'lessonsLearned', label: 'Lessons Learned', description: 'Lessons and prevention improvements' }
];

function emptyInvestigationSectionSelection(): Record<InvestigationSectionKey, boolean> {
  return {
    immediateCauses: false,
    unsafeActs: false,
    unsafeConditions: false,
    systemFailures: false,
    rootCauses: false,
    humanFactorsCauses: false,
    workFactors: false,
    contributingFactors: false,
    correctiveActions: false,
    lessonsLearned: false
  };
}

function toLegacySeverity(score: number): Severity {
  if (score >= 5) return 'critical';
  if (score >= 4) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}

function buildUploadDraft(file: File): UploadDraft {
  const isImage = file.type.startsWith('image/');
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    file,
    displayName: file.name,
    originalFileName: file.name,
    previewUrl: isImage ? URL.createObjectURL(file) : null,
    kind: isImage ? 'image' : 'document'
  };
}

function makeCauseKey(group: string, item: string): string {
  return `${group}::${item}`;
}

export function IncidentCreateModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  createdByUserId: UUID;
  incident?: Incident | null;
  defaultModule?: ModuleKey;
  onCreated?: () => void;
  onUpdated?: (incident: Incident) => void;
}) {
  const editingIncident = props.incident ?? null;
  const isEditing = Boolean(editingIncident);
  const { restoreDraft, clearDraft } = useDraftManager();
  const draftKey = `incident-modal:${props.companyId}:${editingIncident?.id ?? 'new'}`;
  const [module, setModule] = useState<ModuleKey>(props.defaultModule ?? 'safety');
  const [incidentTypeSelections, setIncidentTypeSelections] = useState<Record<string, boolean>>(
    Object.fromEntries(INCIDENT_TYPES.map((t) => [t, false]))
  );
  const [incidentTypeOther, setIncidentTypeOther] = useState('');
  const [category, setCategory] = useState<IncidentCategory>(INCIDENT_CATEGORIES[0]);
  const [selectedCategories, setSelectedCategories] = useState<IncidentCategory[]>([INCIDENT_CATEGORIES[0]]);
  const [subcategory, setSubcategory] = useState('');
  const [selectedSubcategories, setSelectedSubcategories] = useState<string[]>([]);
  const [subcategoryManual, setSubcategoryManual] = useState('');
  const [useManualSubcategory, setUseManualSubcategory] = useState(false);

  const [title, setTitle] = useState('');
  const [projectClient, setProjectClient] = useState('');
  const [briefDescription, setBriefDescription] = useState('');
  const [occurredAtInput, setOccurredAtInput] = useState(new Date().toISOString().slice(0, 16));
  const [location, setLocation] = useState('');
  const [natureOfIncident, setNatureOfIncident] = useState('');
  const [causeOfIncident, setCauseOfIncident] = useState('');
  const [affectedPersonId, setAffectedPersonId] = useState<UUID | null>(null);
  const [affectedEmployeeId, setAffectedEmployeeId] = useState<UUID | null>(null);
  const [affectedPersonName, setAffectedPersonName] = useState('');
  const [affectedPersons, setAffectedPersons] = useState<AffectedPersonEntry[]>([
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      personId: null,
      personName: '',
      role: '',
      department: '',
      injuryType: '',
      contactDetails: ''
    }
  ]);

  const [reportedBy, setReportedBy] = useState('');
  const [reportedTo, setReportedTo] = useState('');
  const [copyTo, setCopyTo] = useState('');
  const [riskCategorySimple, setRiskCategorySimple] = useState<'Low' | 'Medium' | 'High'>('Medium');

  const [riskLikelihood, setRiskLikelihood] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [riskSeverity, setRiskSeverity] = useState<1 | 2 | 3 | 4 | 5>(3);

  const [investigationRequired, setInvestigationRequired] = useState(false);
  const [generateNcr, setGenerateNcr] = useState(false);
  const [actualOutcome, setActualOutcome] = useState('');

  const [lossTypes, setLossTypes] = useState<string[]>([]);
  const [lossOther, setLossOther] = useState('');
  const [lossNotes, setLossNotes] = useState('');

  const [unsafeActs, setUnsafeActs] = useState<Record<string, UnsafeCauseEntry>>({});
  const [unsafeConditions, setUnsafeConditions] = useState<Record<string, UnsafeCauseEntry>>({});
  const [rootCauseHuman, setRootCauseHuman] = useState<Record<string, CauseDetailEntry>>({});
  const [rootCauseWorkplace, setRootCauseWorkplace] = useState<Record<string, CauseDetailEntry>>({});
  const [systemFailures, setSystemFailures] = useState<Record<string, CauseDetailEntry>>({});
  const [incidentTimelineEvents, setIncidentTimelineEvents] = useState<TimelineEvent[]>([]);
  const [potentialConsequence, setPotentialConsequence] = useState('');
  const [contributingFactors, setContributingFactors] = useState('');
  const [lessonsLearned, setLessonsLearned] = useState('');
  const [investigationTeam, setInvestigationTeam] = useState('');
  const [conclusion, setConclusion] = useState('');
  const [preparedBy, setPreparedBy] = useState('');
  const [distributionList, setDistributionList] = useState('');
  const [investigationSections, setInvestigationSections] = useState<Record<InvestigationSectionKey, boolean>>(emptyInvestigationSectionSelection);
  const [correctiveActionDrafts, setCorrectiveActionDrafts] = useState<CorrectiveActionDraft[]>([]);

  const [evidenceUploads, setEvidenceUploads] = useState<UploadDraft[]>([]);
  const [investigationUploads, setInvestigationUploads] = useState<UploadDraft[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableSubcategories = useMemo(() => {
    const baseCategories = (selectedCategories.length > 0 ? selectedCategories : [category]) as IncidentCategory[];
    const all = new Set<string>();
    for (const c of baseCategories) {
      for (const s of INCIDENT_SUBCATEGORIES[c] ?? []) {
        all.add(s);
      }
    }
    return Array.from(all);
  }, [selectedCategories, category]);
  const finalSubcategory = useMemo(
    () => (useManualSubcategory ? subcategoryManual.trim() : subcategory.trim()),
    [useManualSubcategory, subcategory, subcategoryManual]
  );
  const allSelectedSubcategories = useMemo(() => {
    const values = new Set<string>();
    for (const s of selectedSubcategories) {
      const trimmed = s.trim();
      if (trimmed) values.add(trimmed);
    }
    const primary = finalSubcategory;
    if (primary) values.add(primary);
    return Array.from(values);
  }, [selectedSubcategories, finalSubcategory]);
  const finalIncidentType = useMemo(
    () => {
      const selected = Object.entries(incidentTypeSelections)
        .filter(([, checked]) => checked)
        .map(([type]) => type);
      if (incidentTypeOther.trim()) selected.push(incidentTypeOther.trim());
      return selected.join(', ');
    },
    [incidentTypeSelections, incidentTypeOther]
  );
  const calculatedRisk = riskLikelihood * riskSeverity;
  const calculatedRiskCategory = useMemo(() => getIncidentRiskCategory(calculatedRisk), [calculatedRisk]);
  const causeLinkOptions = useMemo(() => {
    const items: Array<{ type: InvestigationCauseLinkType; text: string }> = [];
    for (const entry of Object.values(unsafeActs)) items.push({ type: 'unsafe_act', text: `${entry.group}: ${entry.item}` });
    for (const entry of Object.values(unsafeConditions)) items.push({ type: 'unsafe_condition', text: `${entry.group}: ${entry.item}` });
    for (const entry of Object.values(rootCauseHuman)) items.push({ type: 'root_cause', text: `${entry.group}: ${entry.item}` });
    for (const entry of Object.values(rootCauseWorkplace)) items.push({ type: 'root_cause', text: `${entry.group}: ${entry.item}` });
    for (const entry of Object.values(systemFailures)) items.push({ type: 'system_failure', text: `${entry.group}: ${entry.item}` });
    return items;
  }, [unsafeActs, unsafeConditions, rootCauseHuman, rootCauseWorkplace, systemFailures]);

  const canSubmit = useMemo(() => {
    return (
      title.trim().length > 0 &&
      projectClient.trim().length > 0 &&
      briefDescription.trim().length > 0 &&
      finalIncidentType.length > 0 &&
      allSelectedSubcategories.length > 0 &&
      natureOfIncident.trim().length > 0 &&
      causeOfIncident.trim().length > 0 &&
      reportedBy.trim().length > 0 &&
      reportedTo.trim().length > 0
    );
  }, [title, projectClient, briefDescription, finalIncidentType, allSelectedSubcategories, natureOfIncident, causeOfIncident, reportedBy, reportedTo]);
  const hasDirtyDraft = useMemo(
    () =>
      props.open &&
      !loading &&
      (title.trim().length > 0 ||
        projectClient.trim().length > 0 ||
        briefDescription.trim().length > 0 ||
        location.trim().length > 0 ||
        natureOfIncident.trim().length > 0 ||
        causeOfIncident.trim().length > 0 ||
        incidentTypeOther.trim().length > 0 ||
        Object.values(incidentTypeSelections).some(Boolean) ||
        category !== INCIDENT_CATEGORIES[0] ||
        selectedCategories.length !== 1 ||
        selectedCategories.some((c) => c !== INCIDENT_CATEGORIES[0]) ||
        selectedSubcategories.length > 0 ||
        (useManualSubcategory ? subcategoryManual.trim().length > 0 : subcategory.trim().length > 0) ||
        reportedBy.trim().length > 0 ||
        reportedTo.trim().length > 0 ||
        copyTo.trim().length > 0 ||
        affectedPersonId !== null ||
        affectedEmployeeId !== null ||
        affectedPersonName.trim().length > 0 ||
        riskLikelihood !== 3 ||
        riskSeverity !== 3 ||
        investigationRequired ||
        generateNcr ||
        actualOutcome.trim().length > 0 ||
        lossTypes.length > 0 ||
        lossOther.trim().length > 0 ||
        lossNotes.trim().length > 0 ||
        Object.keys(unsafeActs).length > 0 ||
        Object.keys(unsafeConditions).length > 0 ||
        Object.keys(rootCauseHuman).length > 0 ||
        Object.keys(rootCauseWorkplace).length > 0 ||
        Object.keys(systemFailures).length > 0 ||
        incidentTimelineEvents.length > 0 ||
        potentialConsequence.trim().length > 0 ||
        contributingFactors.trim().length > 0 ||
        lessonsLearned.trim().length > 0 ||
        investigationTeam.trim().length > 0 ||
        conclusion.trim().length > 0 ||
        preparedBy.trim().length > 0 ||
        distributionList.trim().length > 0 ||
        Object.values(investigationSections).some(Boolean) ||
        correctiveActionDrafts.some((d) => Boolean(d.actionRequired.trim() || d.responsibleUserId || d.dueDate)) ||
        evidenceUploads.length > 0 ||
        investigationUploads.length > 0 ||
        affectedPersons.some((p) => Boolean(p.personId || p.personName.trim() || p.role.trim() || p.department.trim() || p.injuryType.trim() || p.contactDetails.trim()))),
    [
      affectedPersons,
      affectedEmployeeId,
      affectedPersonId,
      affectedPersonName,
      category,
      actualOutcome,
      briefDescription,
      causeOfIncident,
      conclusion,
      contributingFactors,
      correctiveActionDrafts,
      distributionList,
      evidenceUploads.length,
      investigationSections,
      investigationTeam,
      investigationRequired,
      investigationUploads.length,
      incidentTimelineEvents.length,
      incidentTypeOther,
      incidentTypeSelections,
      lessonsLearned,
      loading,
      lossNotes,
      lossOther,
      lossTypes,
      location,
      natureOfIncident,
      preparedBy,
      projectClient,
      potentialConsequence,
      props.open,
      reportedBy,
      reportedTo,
      riskLikelihood,
      riskSeverity,
      selectedSubcategories.length,
      subcategory,
      subcategoryManual,
      systemFailures,
      title,
      selectedCategories,
      unsafeActs,
      unsafeConditions,
      useManualSubcategory,
      rootCauseHuman,
      rootCauseWorkplace,
      copyTo,
      generateNcr
    ]
  );

  useDraftRegistration({
    key: draftKey,
    label: isEditing ? 'Incident Edit Form' : 'Incident Form',
    enabled: props.open && !isEditing,
    metadata: {
      organizationId: props.companyId,
      moduleName: 'incidents',
      formType: isEditing ? 'incident-edit' : 'incident-create',
      linkedRecordId: editingIncident?.id ?? null
    },
    isDirty: () => hasDirtyDraft,
    serialize: () => ({
      module,
      incidentTypeSelections,
      incidentTypeOther,
      category,
      selectedCategories,
      subcategory,
      selectedSubcategories,
      subcategoryManual,
      useManualSubcategory,
      title,
      projectClient,
      briefDescription,
      occurredAtInput,
      location,
      natureOfIncident,
      causeOfIncident,
      affectedPersonId,
      affectedEmployeeId,
      affectedPersonName,
      affectedPersons,
      reportedBy,
      reportedTo,
      copyTo,
      riskCategorySimple,
      riskLikelihood,
      riskSeverity,
      investigationRequired,
      generateNcr,
      actualOutcome,
      lossTypes,
      lossOther,
      lossNotes,
      unsafeActs,
      unsafeConditions,
      rootCauseHuman,
      rootCauseWorkplace,
      systemFailures,
      incidentTimelineEvents,
      potentialConsequence,
      contributingFactors,
      lessonsLearned,
      investigationTeam,
      conclusion,
      preparedBy,
      distributionList,
      investigationSections,
      correctiveActionDrafts,
      evidenceUploadsMeta: evidenceUploads.map((u) => ({
        id: u.id,
        displayName: u.displayName,
        originalFileName: u.originalFileName,
        kind: u.kind
      })),
      investigationUploadsMeta: investigationUploads.map((u) => ({
        id: u.id,
        displayName: u.displayName,
        originalFileName: u.originalFileName,
        kind: u.kind
      }))
    }),
    hasPendingUploads: () =>
      evidenceUploads.some((upload) => Boolean(upload.file)) ||
      investigationUploads.some((upload) => Boolean(upload.file)),
    pendingUploadsMessage: () => 'Re-select draft attachments if you restore this incident on another session.'
  });

  function releasePreviews(items: UploadDraft[]) {
    for (const item of items) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }
  }

  function resetForm() {
    releasePreviews(evidenceUploads);
    releasePreviews(investigationUploads);
    setModule(props.defaultModule ?? 'safety');
    setIncidentTypeSelections(Object.fromEntries(INCIDENT_TYPES.map((t) => [t, false])));
    setIncidentTypeOther('');
    setCategory(INCIDENT_CATEGORIES[0]);
    setSelectedCategories([INCIDENT_CATEGORIES[0]]);
    setSubcategory('');
    setSelectedSubcategories([]);
    setSubcategoryManual('');
    setUseManualSubcategory(false);
    setTitle('');
    setProjectClient('');
    setBriefDescription('');
    setOccurredAtInput(new Date().toISOString().slice(0, 16));
    setLocation('');
    setNatureOfIncident('');
    setCauseOfIncident('');
    setAffectedPersonId(null);
    setAffectedPersonName('');
    setAffectedPersons([
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        personId: null,
        personName: '',
        role: '',
        department: '',
        injuryType: '',
        contactDetails: ''
      }
    ]);
    setReportedBy('');
    setReportedTo('');
    setCopyTo('');
    setRiskCategorySimple('Medium');
    setRiskLikelihood(3);
    setRiskSeverity(3);
    setInvestigationRequired(false);
    setGenerateNcr(false);
    setActualOutcome('');
    setLossTypes([]);
    setLossOther('');
    setLossNotes('');
    setUnsafeActs({});
    setUnsafeConditions({});
    setRootCauseHuman({});
    setRootCauseWorkplace({});
    setSystemFailures({});
    setIncidentTimelineEvents([]);
    setPotentialConsequence('');
    setContributingFactors('');
    setLessonsLearned('');
    setInvestigationTeam('');
    setConclusion('');
    setPreparedBy('');
    setDistributionList('');
    setInvestigationSections(emptyInvestigationSectionSelection());
    setCorrectiveActionDrafts([]);
    setEvidenceUploads([]);
    setInvestigationUploads([]);
    setError(null);
  }

  useEffect(() => {
    if (!props.open) return;
    if (!editingIncident) {
      const restored = restoreDraft<{
        module?: ModuleKey;
        incidentTypeSelections?: Record<string, boolean>;
        incidentTypeOther?: string;
        category?: IncidentCategory;
        selectedCategories?: IncidentCategory[];
        subcategory?: string;
        selectedSubcategories?: string[];
        subcategoryManual?: string;
        useManualSubcategory?: boolean;
        title?: string;
        projectClient?: string;
        briefDescription?: string;
        occurredAtInput?: string;
        location?: string;
        natureOfIncident?: string;
        causeOfIncident?: string;
        affectedPersonId?: UUID | null;
        affectedEmployeeId?: UUID | null;
        affectedPersonName?: string;
        affectedPersons?: AffectedPersonEntry[];
        reportedBy?: string;
        reportedTo?: string;
        copyTo?: string;
        riskCategorySimple?: 'Low' | 'Medium' | 'High';
        riskLikelihood?: 1 | 2 | 3 | 4 | 5;
        riskSeverity?: 1 | 2 | 3 | 4 | 5;
        investigationRequired?: boolean;
        generateNcr?: boolean;
        actualOutcome?: string;
        lossTypes?: string[];
        lossOther?: string;
        lossNotes?: string;
        unsafeActs?: Record<string, UnsafeCauseEntry>;
        unsafeConditions?: Record<string, UnsafeCauseEntry>;
        rootCauseHuman?: Record<string, CauseDetailEntry>;
        rootCauseWorkplace?: Record<string, CauseDetailEntry>;
        systemFailures?: Record<string, CauseDetailEntry>;
        incidentTimelineEvents?: TimelineEvent[];
        potentialConsequence?: string;
        contributingFactors?: string;
        lessonsLearned?: string;
        investigationTeam?: string;
        conclusion?: string;
        preparedBy?: string;
        distributionList?: string;
        investigationSections?: Record<InvestigationSectionKey, boolean>;
        correctiveActionDrafts?: CorrectiveActionDraft[];
        evidenceUploadsMeta?: Array<{ id: string; displayName: string; originalFileName: string; kind: 'image' | 'document' }>;
        investigationUploadsMeta?: Array<{ id: string; displayName: string; originalFileName: string; kind: 'image' | 'document' }>;
      }>(draftKey);
      resetForm();
      if (restored) {
        setModule(restored.module ?? (props.defaultModule ?? 'safety'));

        const nextTypeSelections =
          restored.incidentTypeSelections && typeof restored.incidentTypeSelections === 'object'
            ? (restored.incidentTypeSelections as Record<string, boolean>)
            : Object.fromEntries(INCIDENT_TYPES.map((t) => [t, false]));
        setIncidentTypeSelections(nextTypeSelections);
        setIncidentTypeOther(restored.incidentTypeOther ?? '');

        const nextSelectedCategories = Array.isArray(restored.selectedCategories) && restored.selectedCategories.length
          ? restored.selectedCategories
          : restored.category
            ? [restored.category]
            : [INCIDENT_CATEGORIES[0]];
        setSelectedCategories(nextSelectedCategories);
        setCategory(nextSelectedCategories[0] ?? INCIDENT_CATEGORIES[0]);

        const nextSelectedSubcategories = Array.isArray(restored.selectedSubcategories)
          ? restored.selectedSubcategories
          : [];
        setSelectedSubcategories(nextSelectedSubcategories);

        setSubcategory(restored.subcategory ?? '');
        setSubcategoryManual(restored.subcategoryManual ?? '');
        setUseManualSubcategory(Boolean(restored.useManualSubcategory));

        setTitle(restored.title ?? '');
        setProjectClient(restored.projectClient ?? '');
        setBriefDescription(restored.briefDescription ?? '');
        if (restored.occurredAtInput) setOccurredAtInput(restored.occurredAtInput);
        setLocation(restored.location ?? '');
        setNatureOfIncident(restored.natureOfIncident ?? '');
        setCauseOfIncident(restored.causeOfIncident ?? '');

        setAffectedPersonId(restored.affectedPersonId ?? null);
        setAffectedEmployeeId(restored.affectedEmployeeId ?? null);
        setAffectedPersonName(restored.affectedPersonName ?? '');
        if (Array.isArray(restored.affectedPersons) && restored.affectedPersons.length > 0) {
          setAffectedPersons(restored.affectedPersons);
        }

        setReportedBy(restored.reportedBy ?? '');
        setReportedTo(restored.reportedTo ?? '');
        setCopyTo(restored.copyTo ?? '');

        setRiskCategorySimple(restored.riskCategorySimple ?? 'Medium');
        if (restored.riskLikelihood) setRiskLikelihood(restored.riskLikelihood);
        if (restored.riskSeverity) setRiskSeverity(restored.riskSeverity);

        setInvestigationRequired(Boolean(restored.investigationRequired));
        setGenerateNcr(Boolean(restored.generateNcr));
        setActualOutcome(restored.actualOutcome ?? '');

        setLossTypes(Array.isArray(restored.lossTypes) ? restored.lossTypes : []);
        setLossOther(restored.lossOther ?? '');
        setLossNotes(restored.lossNotes ?? '');

        setUnsafeActs(restored.unsafeActs ?? {});
        setUnsafeConditions(restored.unsafeConditions ?? {});
        setRootCauseHuman(restored.rootCauseHuman ?? {});
        setRootCauseWorkplace(restored.rootCauseWorkplace ?? {});
        setSystemFailures(restored.systemFailures ?? {});

        setIncidentTimelineEvents(Array.isArray(restored.incidentTimelineEvents) ? restored.incidentTimelineEvents : []);
        setPotentialConsequence(restored.potentialConsequence ?? '');
        setContributingFactors(restored.contributingFactors ?? '');
        setLessonsLearned(restored.lessonsLearned ?? '');
        setInvestigationTeam(restored.investigationTeam ?? '');
        setConclusion(restored.conclusion ?? '');
        setPreparedBy(restored.preparedBy ?? '');
        setDistributionList(restored.distributionList ?? '');

        setInvestigationSections({
          ...emptyInvestigationSectionSelection(),
          ...(restored.investigationSections ?? {})
        });

        if (Array.isArray(restored.correctiveActionDrafts)) {
          setCorrectiveActionDrafts(restored.correctiveActionDrafts);
        }

        const toUploadDraft = (meta: Array<{ id: string; displayName: string; originalFileName: string; kind: 'image' | 'document' }> | undefined): UploadDraft[] => {
          if (!Array.isArray(meta)) return [];
          return meta.map((m) => ({
            id: m.id,
            file: null,
            displayName: m.displayName ?? m.originalFileName ?? '',
            originalFileName: m.originalFileName ?? m.displayName ?? '',
            previewUrl: null,
            kind: m.kind ?? 'document'
          }));
        };

        setEvidenceUploads(toUploadDraft(restored.evidenceUploadsMeta));
        setInvestigationUploads(toUploadDraft(restored.investigationUploadsMeta));
      }
      return;
    }
    releasePreviews(evidenceUploads);
    releasePreviews(investigationUploads);
    const occurred = new Date(editingIncident.occurred_at);
    const isValidOccurred = !Number.isNaN(occurred.getTime());
    const occurredAtValue = isValidOccurred ? occurred.toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16);

    setModule((editingIncident.module as ModuleKey) ?? (props.defaultModule ?? 'safety'));
    const existingIncidentTypeRaw = String((editingIncident as any).incident_type ?? (editingIncident as any).type_of_incident ?? '').trim();
    const parsedTypes = existingIncidentTypeRaw
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    const nextTypeSelections = Object.fromEntries(INCIDENT_TYPES.map((t) => [t, false])) as Record<string, boolean>;
    const customTypes: string[] = [];
    for (const t of parsedTypes) {
      if (Object.prototype.hasOwnProperty.call(nextTypeSelections, t)) nextTypeSelections[t] = true;
      else customTypes.push(t);
    }
    setIncidentTypeSelections(nextTypeSelections);
    setIncidentTypeOther(customTypes.join(', '));

    const metadata = (editingIncident as any)?.metadata ?? null;
    const metaCategoriesRaw = Array.isArray(metadata?.categories) ? metadata.categories : null;
    const parsedMetaCategories: IncidentCategory[] = Array.isArray(metaCategoriesRaw)
      ? metaCategoriesRaw
          .map((c: unknown) => String(c ?? '').trim())
          .filter((c): c is IncidentCategory => (INCIDENT_CATEGORIES as readonly string[]).includes(c))
      : [];
    const baseCategory = (editingIncident.category as IncidentCategory) ?? INCIDENT_CATEGORIES[0];
    const nextCategories: IncidentCategory[] =
      parsedMetaCategories.length > 0 ? Array.from(new Set(parsedMetaCategories)) : [baseCategory];
    setSelectedCategories(nextCategories);
    setCategory(nextCategories[0] ?? INCIDENT_CATEGORIES[0]);

    const existingSubcategory = String(editingIncident.subcategory ?? '');
    const metaSubcategoriesRaw = Array.isArray(metadata?.subcategories) ? metadata.subcategories : null;
    const parsedMetaSubcategories: string[] = Array.isArray(metaSubcategoriesRaw)
      ? metaSubcategoriesRaw.map((s: unknown) => String(s ?? '').trim()).filter((s) => s.length > 0)
      : [];
    const validSubcategories = INCIDENT_SUBCATEGORIES[baseCategory as IncidentCategory] ?? [];
    if (parsedMetaSubcategories.length > 0) {
      setSelectedSubcategories(parsedMetaSubcategories);
    } else if (existingSubcategory) {
      setSelectedSubcategories([existingSubcategory]);
    } else {
      setSelectedSubcategories([]);
    }
    if (validSubcategories.includes(existingSubcategory)) {
      setSubcategory(existingSubcategory);
      setSubcategoryManual('');
      setUseManualSubcategory(false);
    } else {
      setSubcategory('');
      setSubcategoryManual(existingSubcategory);
      setUseManualSubcategory(Boolean(existingSubcategory));
    }
    setTitle(editingIncident.title ?? '');
    setProjectClient((editingIncident as any).project_client ?? '');
    setBriefDescription(String(editingIncident.description ?? ''));
    setOccurredAtInput(occurredAtValue);
    setLocation(editingIncident.location ?? '');
    setNatureOfIncident((editingIncident as any).nature_of_incident ?? '');
    setCauseOfIncident((editingIncident as any).cause_of_incident ?? (editingIncident as any).cause ?? '');
    setAffectedPersonId((editingIncident as any).affected_person_id ?? null);
    setAffectedPersonName((editingIncident as any).affected_person ?? '');
    // Keep the primary HR employee reference separate so we can persist both employee_id and user_id consistently.
    setAffectedEmployeeId((editingIncident as any).affected_person_id ?? null);
    const metadataPersons = Array.isArray(metadata?.affectedPersons) ? metadata.affectedPersons : null;
    if (metadataPersons && metadataPersons.length > 0) {
      setAffectedPersons(
        metadataPersons.map((entry: any) => ({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          personId: (entry?.personId as UUID) ?? null,
          personName: String(entry?.personName ?? ''),
          role: String(entry?.role ?? ''),
          department: String(entry?.department ?? ''),
          injuryType: String(entry?.injuryType ?? ''),
          contactDetails: String(entry?.contactDetails ?? '')
        }))
      );
    } else {
      setAffectedPersons([
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          personId: (editingIncident as any).affected_person_id ?? null,
          personName: (editingIncident as any).affected_person ?? '',
          role: '',
          department: '',
          injuryType: '',
          contactDetails: ''
        }
      ]);
    }
    setReportedBy((editingIncident as any).reported_by ?? '');
    setReportedTo((editingIncident as any).reported_to ?? '');
    setCopyTo(Array.isArray((editingIncident as any).copy_to_emails) ? (editingIncident as any).copy_to_emails.join(', ') : '');
    setRiskCategorySimple(((editingIncident as any).risk_category ?? 'Medium') as 'Low' | 'Medium' | 'High');
    setRiskLikelihood(Math.max(1, Math.min(5, Number((editingIncident as any).risk_likelihood_1_5 ?? 3))) as 1 | 2 | 3 | 4 | 5);
    setRiskSeverity(Math.max(1, Math.min(5, Number((editingIncident as any).risk_severity_1_5 ?? 3))) as 1 | 2 | 3 | 4 | 5);
    setInvestigationRequired(Boolean((editingIncident as any).investigation_required));
    setGenerateNcr(false);
    const existingLossTypes = (editingIncident as any).loss_types ?? null;
    setLossTypes(Array.isArray(existingLossTypes) ? existingLossTypes.filter((x: unknown) => typeof x === 'string') : []);
    setLossOther((editingIncident as any).loss_other_text ?? '');
    setLossNotes((editingIncident as any).loss_notes ?? '');
    const mapCauseEntries = (value: unknown) => {
      const next: Record<string, UnsafeCauseEntry> = {};
      if (!Array.isArray(value)) return next;
      for (const entry of value as Array<any>) {
        if (!entry || typeof entry !== 'object') continue;
        const group = String(entry.group ?? '').trim();
        const item = String(entry.item ?? '').trim();
        if (!group || !item) continue;
        const key = makeCauseKey(group, item);
        next[key] = { group, item, note: String(entry.note ?? '') };
      }
      return next;
    };

    const mappedUnsafeActs = mapCauseEntries((editingIncident as any).immediate_causes_unsafe_acts);
    const mappedUnsafeConditions = mapCauseEntries((editingIncident as any).immediate_causes_unsafe_conditions);
    setUnsafeActs(mappedUnsafeActs);
    setUnsafeConditions(mappedUnsafeConditions);
    setRootCauseHuman({});
    setRootCauseWorkplace({});
    setSystemFailures({});
    setIncidentTimelineEvents([]);
    setPotentialConsequence('');
    setContributingFactors('');
    setLessonsLearned('');
    setInvestigationTeam('');
    setConclusion('');
    setPreparedBy('');
    setDistributionList('');
    setInvestigationSections({
      ...emptyInvestigationSectionSelection(),
      immediateCauses: Object.keys(mappedUnsafeActs).length > 0 || Object.keys(mappedUnsafeConditions).length > 0,
      unsafeActs: Object.keys(mappedUnsafeActs).length > 0,
      unsafeConditions: Object.keys(mappedUnsafeConditions).length > 0
    });
    setActualOutcome(String((editingIncident as any)?.metadata?.actualOutcome ?? ''));
    setEvidenceUploads([]);
    setInvestigationUploads([]);
    setError(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, props.open, editingIncident?.id, restoreDraft]);

  useEffect(() => {
    if (!props.open || !editingIncident?.id) return;
    (async () => {
      try {
        const inv = await getIncidentInvestigation(props.companyId, editingIncident.id);
        if (!inv) return;
        setPotentialConsequence(inv.potential_consequence ?? '');
        setContributingFactors(inv.contributing_factors ?? '');
        setLessonsLearned(inv.lessons_learnt ?? '');
        setConclusion(inv.conclusion ?? '');
        setPreparedBy(inv.prepared_by ?? '');
        setInvestigationTeam(Array.isArray(inv.investigation_team) ? inv.investigation_team.join(', ') : '');
        setDistributionList(Array.isArray(inv.distributions) ? inv.distributions.join(', ') : '');
        if (typeof inv.event_timeline === 'string' && inv.event_timeline.trim()) {
          const events = inv.event_timeline
            .split('\n')
            .map((line) => {
              const [timestamp, ...rest] = line.split(' - ');
              return { timestamp: timestamp?.trim() ?? '', notes: rest.join(' - ').trim() };
            })
            .filter((e) => e.timestamp || e.notes);
          setIncidentTimelineEvents(events);
        }
        const hasUnsafeActs = (Array.isArray((editingIncident as any)?.immediate_causes_unsafe_acts) && (editingIncident as any).immediate_causes_unsafe_acts.length > 0)
          || (Array.isArray(inv.immediate_causes) && inv.immediate_causes.some((entry: any) => String(entry?.group ?? '').trim() in IMMEDIATE_CAUSES_UNSAFE_ACTS_GROUPS));
        const hasUnsafeConditions = (Array.isArray((editingIncident as any)?.immediate_causes_unsafe_conditions) && (editingIncident as any).immediate_causes_unsafe_conditions.length > 0)
          || (Array.isArray(inv.immediate_causes) && inv.immediate_causes.some((entry: any) => String(entry?.group ?? '').trim() in IMMEDIATE_CAUSES_UNSAFE_CONDITIONS_GROUPS));
        const hasRootCauses = (Array.isArray(inv.root_causes_human) && inv.root_causes_human.length > 0)
          || (Array.isArray(inv.root_causes_workplace) && inv.root_causes_workplace.length > 0);
        const hasSystemFailures = Array.isArray(inv.system_failures) && inv.system_failures.length > 0;
        const hasContributingFactors = Boolean((inv.contributing_factors ?? '').trim());
        const hasLessonsLearned = Boolean((inv.lessons_learnt ?? '').trim());
        const hasCorrectiveActions = Boolean((inv.notes ?? '').trim())
          || Boolean((inv.conclusion ?? '').trim())
          || Boolean((inv.prepared_by ?? '').trim())
          || (Array.isArray(inv.investigation_team) && inv.investigation_team.length > 0)
          || (Array.isArray(inv.distributions) && inv.distributions.length > 0);
        setInvestigationSections({
          immediateCauses: hasUnsafeActs || hasUnsafeConditions,
          unsafeActs: hasUnsafeActs,
          unsafeConditions: hasUnsafeConditions,
          systemFailures: hasSystemFailures,
          rootCauses: hasRootCauses,
          humanFactorsCauses: Array.isArray(inv.root_causes_human) && inv.root_causes_human.length > 0,
          workFactors: Array.isArray(inv.root_causes_workplace) && inv.root_causes_workplace.length > 0,
          contributingFactors: hasContributingFactors,
          correctiveActions: hasCorrectiveActions,
          lessonsLearned: hasLessonsLearned
        });
        if (Array.isArray(inv.root_causes_human)) {
          const next: Record<string, CauseDetailEntry> = {};
          for (const entry of inv.root_causes_human as any[]) {
            const group = String(entry?.group ?? '').trim();
            const item = String(entry?.item ?? '').trim();
            if (!group || !item) continue;
            next[makeCauseKey(group, item)] = { group, item, note: String(entry?.note ?? '') };
          }
          setRootCauseHuman(next);
        }
        if (Array.isArray(inv.root_causes_workplace)) {
          const next: Record<string, CauseDetailEntry> = {};
          for (const entry of inv.root_causes_workplace as any[]) {
            const group = String(entry?.group ?? '').trim();
            const item = String(entry?.item ?? '').trim();
            if (!group || !item) continue;
            next[makeCauseKey(group, item)] = { group, item, note: String(entry?.note ?? '') };
          }
          setRootCauseWorkplace(next);
        }
        if (Array.isArray(inv.system_failures)) {
          const next: Record<string, CauseDetailEntry> = {};
          for (const entry of inv.system_failures as any[]) {
            const item = String(entry?.item ?? entry ?? '').trim();
            if (!item) continue;
            next[makeCauseKey('System Failure', item)] = {
              group: 'System Failure',
              item,
              note: String(entry?.note ?? '')
            };
          }
          setSystemFailures(next);
        }
      } catch (_) {
        // Investigation data is optional in create/edit flow.
      }
    })();
  }, [props.open, props.companyId, editingIncident?.id]);

  useEffect(() => {
    return () => {
      releasePreviews(evidenceUploads);
      releasePreviews(investigationUploads);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addUploads(files: FileList | null, section: 'evidence' | 'investigation', displayPrefix?: string) {
    if (!files) return;
    const drafts = Array.from(files).map((file) => {
      const draft = buildUploadDraft(file);
      if (!displayPrefix) return draft;
      return {
        ...draft,
        displayName: `${displayPrefix} - ${draft.displayName}`
      };
    });
    if (section === 'evidence') {
      setEvidenceUploads((prev) => [...prev, ...drafts]);
      return;
    }
    setInvestigationUploads((prev) => [...prev, ...drafts]);
  }

  function removeUpload(id: string, section: 'evidence' | 'investigation') {
    const setter = section === 'evidence' ? setEvidenceUploads : setInvestigationUploads;
    setter((prev) => {
      const target = prev.find((x) => x.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((x) => x.id !== id);
    });
  }

  function renameUpload(id: string, value: string, section: 'evidence' | 'investigation') {
    const setter = section === 'evidence' ? setEvidenceUploads : setInvestigationUploads;
    setter((prev) => prev.map((x) => (x.id === id ? { ...x, displayName: value } : x)));
  }

  function toggleCause(target: 'acts' | 'conditions', group: string, item: string, checked: boolean) {
    const key = makeCauseKey(group, item);
    const setter = target === 'acts' ? setUnsafeActs : setUnsafeConditions;
    setter((prev) => {
      if (!checked) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return {
        ...prev,
        [key]: {
          group,
          item,
          note: prev[key]?.note ?? ''
        }
      };
    });
  }

  function setCauseNote(target: 'acts' | 'conditions', key: string, note: string) {
    const setter = target === 'acts' ? setUnsafeActs : setUnsafeConditions;
    setter((prev) => {
      const current = prev[key];
      if (!current) return prev;
      return {
        ...prev,
        [key]: {
          ...current,
          note
        }
      };
    });
  }

  function toggleDetailedCause(
    setter: React.Dispatch<React.SetStateAction<Record<string, CauseDetailEntry>>>,
    group: string,
    item: string,
    checked: boolean
  ) {
    const key = makeCauseKey(group, item);
    setter((prev) => {
      if (!checked) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return {
        ...prev,
        [key]: {
          group,
          item,
          note: prev[key]?.note ?? ''
        }
      };
    });
  }

  function updateDetailedCauseNote(
    setter: React.Dispatch<React.SetStateAction<Record<string, CauseDetailEntry>>>,
    key: string,
    note: string
  ) {
    setter((prev) => {
      const entry = prev[key];
      if (!entry) return prev;
      return {
        ...prev,
        [key]: {
          ...entry,
          note
        }
      };
    });
  }

  async function uploadEvidenceForIncident(incidentId: UUID, entries: UploadDraft[], entityType: string) {
    for (const entry of entries) {
      if (!entry.file) continue; // File cannot be restored; user must re-select to upload.

      const safeName = (entry.originalFileName || entry.file.name).replace(/\s+/g, '_');
      const key = `${props.companyId}/${entityType}/${incidentId}/${Date.now()}-${safeName}`;
      const uploaded = await uploadFile(EVIDENCE_BUCKET, entry.file, { key });
      await createEvidence({
        companyId: props.companyId,
        entityType,
        entityId: incidentId,
        storageBucket: uploaded.bucket,
        storageKey: uploaded.key,
        createdByUserId: props.createdByUserId,
        originalFilename: entry.originalFileName || entry.file.name,
        displayTitle: (entry.displayName || entry.originalFileName || entry.file.name).trim(),
        fileKind: entry.kind
      });
    }
  }

  function buildImmediateCausesPayload() {
    return [
      ...Object.values(unsafeActs).map((entry) => ({
        group: entry.group,
        item: entry.item,
        note: entry.note ?? ''
      })),
      ...Object.values(unsafeConditions).map((entry) => ({
        group: entry.group,
        item: entry.item,
        note: entry.note ?? ''
      }))
    ];
  }

  async function createCorrectiveActionRecords(incidentId: UUID) {
    for (const draft of correctiveActionDrafts) {
      if (!draft.actionRequired.trim() || !draft.responsibleUserId || !draft.dueDate) continue;
      await createIncidentCorrectiveAction({
        incidentId,
        companyId: props.companyId,
        actionTitle: draft.actionRequired.trim(),
        ownerUserId: draft.responsibleUserId,
        dueDate: draft.dueDate,
        createdByUserId: props.createdByUserId,
        sourceCauseType: draft.links[0]?.type,
        sourceCauseText: draft.links.map((link) => `${link.type}: ${link.text}`).join('\n') || undefined
      });
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const hasInvalidDraftAction = correctiveActionDrafts.some(
      (draft) => Boolean(draft.actionRequired.trim() || draft.responsibleUserId || draft.dueDate)
        && (!draft.actionRequired.trim() || !draft.responsibleUserId || !draft.dueDate)
    );
    if (hasInvalidDraftAction) {
      setError('Each corrective action row must include Action Required, Responsible Person, and Due Date.');
      return;
    }

    setError(null);
    try {
      setLoading(true);
      const occurredAt = new Date(occurredAtInput).toISOString();

      const copyToEmails = copyTo
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const unsafeActsData = Object.values(unsafeActs);
      const unsafeConditionsData = Object.values(unsafeConditions);
      const incidentTitle = title.trim();
      const affectedPersonValue = affectedPersonName.trim() || undefined;
      const affectedPersonNameSnapshot = affectedPersonName.trim() || null;
      const affectedPersonsPayload = affectedPersons
        .map((entry) => ({
          personId: entry.personId,
          personName: entry.personName.trim() || null,
          role: entry.role.trim() || null,
          department: entry.department.trim() || null,
          injuryType: entry.injuryType.trim() || null,
          contactDetails: entry.contactDetails.trim() || null
        }))
        .filter((entry) => entry.personId || entry.personName);
      const incidentTypeValue = finalIncidentType;
      const primaryCategory = (selectedCategories[0] ?? category) as IncidentCategory;
      const subcategoriesForMetadata = allSelectedSubcategories;

      if (isEditing && editingIncident) {
        const updated = await updateIncident(editingIncident.id, {
          module,
          category: primaryCategory,
          subcategory: finalSubcategory,
          title: incidentTitle,
          description: briefDescription.trim() || null,
          incidentType: incidentTypeValue || null,
          projectClient: projectClient.trim() || null,
          natureOfIncident: natureOfIncident.trim() || null,
          causeOfIncident: causeOfIncident.trim() || null,
          affectedPerson: affectedPersonValue || null,
          affectedUserId: affectedPersonId ?? null,
          affectedPersonName: affectedPersonNameSnapshot,
          affectedEmployeeId: affectedEmployeeId ?? null,
          reportedBy: reportedBy.trim() || null,
          reportedTo: reportedTo.trim() || null,
          copyToEmails: copyToEmails.length > 0 ? copyToEmails : null,
          investigationRequired,
          unsafeActs: unsafeActsData,
          unsafeConditions: unsafeConditionsData,
          lossProductionValue: null,
          lossFinancialValue: null,
          lossReputationalValue: null,
          lossDamageAssetValue: null,
          lossIllnessInjuryValue: null,
          lossIllnessValue: null,
          lossInjuryValue: null,
          lossCivilLiabilityValue: null,
          lossCriminalLiabilityValue: null,
          lossVicariousLiabilityValue: null,
          lossSubstandardQualityValue: null,
          lossTypes: lossTypes.length > 0 ? lossTypes : null,
          lossOtherText: lossOther.trim() || null,
          lossNotes: lossNotes.trim() || null,
          riskSeverity1To5: riskSeverity,
          riskLikelihood1To5: riskLikelihood,
          riskRatingProduct: calculatedRisk,
          riskClassification: calculatedRiskCategory,
          riskCategorySimple,
          severity: toLegacySeverity(riskSeverity),
          occurredAt,
          location: location.trim() || null,
          metadata: {
            ...(editingIncident as any)?.metadata,
            affectedPersons: affectedPersonsPayload,
            categories: selectedCategories,
            subcategories: subcategoriesForMetadata
          }
        } as any);
        await uploadEvidenceForIncident(updated.id, evidenceUploads, 'incident');
        await uploadEvidenceForIncident(updated.id, investigationUploads, 'incident_investigation');
        await createCorrectiveActionRecords(updated.id);
        if (investigationRequired) {
          await upsertIncidentInvestigation({
            companyId: props.companyId,
            incidentId: updated.id,
            actorUserId: props.createdByUserId,
            patch: {
              notes: actualOutcome.trim() ? `Actual outcome: ${actualOutcome.trim()}` : null,
              event_timeline: incidentTimelineEvents
                .map((event) => `${event.timestamp} - ${event.notes}`.trim())
                .join('\n') || null,
              risk: `${riskLikelihood} x ${riskSeverity} = ${calculatedRisk}`.trim(),
              potential_consequence: potentialConsequence.trim() || null,
              immediate_causes: buildImmediateCausesPayload(),
              root_causes_human: Object.values(rootCauseHuman),
              root_causes_workplace: Object.values(rootCauseWorkplace),
              system_failures: Object.values(systemFailures),
              contributing_factors: contributingFactors.trim() || null,
              lessons_learnt: lessonsLearned.trim() || null,
              conclusion: conclusion.trim() || null,
              prepared_by: preparedBy.trim() || null,
              investigation_team: investigationTeam
                .split(',')
                .map((entry) => entry.trim())
                .filter(Boolean),
              distributions: distributionList
                .split(',')
                .map((entry) => entry.trim())
                .filter(Boolean)
            } as any
          });
        }
        props.onUpdated?.(updated);
        clearDraft(draftKey);
      } else {
        const incident = await createIncident({
          companyId: props.companyId,
          module,
          category: primaryCategory,
          subcategory: finalSubcategory,
          title: incidentTitle,
          description: briefDescription.trim() || undefined,
          incidentType: incidentTypeValue || undefined,
          projectClient: projectClient.trim() || undefined,
          natureOfIncident: natureOfIncident.trim(),
          causeOfIncident: causeOfIncident.trim(),
          affectedPerson: affectedPersonValue || undefined,
          affectedUserId: affectedPersonId ?? null,
          affectedPersonName: affectedPersonNameSnapshot,
          affectedEmployeeId: affectedEmployeeId ?? null,
          reportedBy: reportedBy.trim(),
          reportedTo: reportedTo.trim(),
          copyToEmails,
          investigationRequired,
          unsafeActs: unsafeActsData,
          unsafeConditions: unsafeConditionsData,
          losses: {
            productionLoss: null,
            financialLoss: null,
            reputationalLoss: null,
            damageAssetLoss: null,
            illnessInjuryImpact: null,
            illnessLoss: null,
            injuryLoss: null,
            civilLiabilityLoss: null,
            criminalLiabilityLoss: null,
            vicariousLiabilityLoss: null,
            substandardQualityLoss: null,
            types: lossTypes.length > 0 ? lossTypes : null,
            other: lossOther.trim() || null,
            notes: lossNotes.trim() || null
          },
          riskSeverity1To5: riskSeverity,
          riskLikelihood1To5: riskLikelihood,
          riskRatingProduct: calculatedRisk,
          riskClassification: calculatedRiskCategory,
          riskCategorySimple,
          severity: toLegacySeverity(riskSeverity),
          occurredAt,
          location: location.trim() || undefined,
          createdByUserId: props.createdByUserId,
          autoGenerateNcr: generateNcr,
          metadata: {
            affectedPersons: affectedPersonsPayload,
            categories: selectedCategories,
            subcategories: subcategoriesForMetadata
          }
        });

        await uploadEvidenceForIncident(incident.id, evidenceUploads, 'incident');
        await uploadEvidenceForIncident(incident.id, investigationUploads, 'incident_investigation');
        await createCorrectiveActionRecords(incident.id);
        if (investigationRequired) {
          await upsertIncidentInvestigation({
            companyId: props.companyId,
            incidentId: incident.id,
            actorUserId: props.createdByUserId,
            patch: {
              notes: actualOutcome.trim() ? `Actual outcome: ${actualOutcome.trim()}` : null,
              event_timeline: incidentTimelineEvents
                .map((event) => `${event.timestamp} - ${event.notes}`.trim())
                .join('\n') || null,
              risk: `${riskLikelihood} x ${riskSeverity} = ${calculatedRisk}`.trim(),
              potential_consequence: potentialConsequence.trim() || null,
              immediate_causes: buildImmediateCausesPayload(),
              root_causes_human: Object.values(rootCauseHuman),
              root_causes_workplace: Object.values(rootCauseWorkplace),
              system_failures: Object.values(systemFailures),
              contributing_factors: contributingFactors.trim() || null,
              lessons_learnt: lessonsLearned.trim() || null,
              conclusion: conclusion.trim() || null,
              prepared_by: preparedBy.trim() || null,
              investigation_team: investigationTeam
                .split(',')
                .map((entry) => entry.trim())
                .filter(Boolean),
              distributions: distributionList
                .split(',')
                .map((entry) => entry.trim())
                .filter(Boolean)
            } as any
          });
        }
        props.onCreated?.();
        clearDraft(draftKey);
      }
      props.onClose();
      resetForm();
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  function setInvestigationSection(section: InvestigationSectionKey, selected: boolean) {
    setInvestigationSections((prev) => ({ ...prev, [section]: selected }));
  }

  function renderUploadSection(titleText: string, section: 'evidence' | 'investigation', items: UploadDraft[]) {
    return (
      <div className="space-y-3">
        <label className="block text-sm font-semibold text-charcoal">{titleText}</label>
        <input
          type="file"
          multiple
          onChange={(e) => addUploads(e.target.files, section)}
          className="w-full text-sm"
        />
        {items.length > 0 && (
          <div className="space-y-2">
            {items.map((entry) => (
              <div
                key={entry.id}
                className={`rounded-lg border p-3 bg-surface-50 ${
                  !entry.file ? 'border-amber-300 bg-amber-50/60' : 'border-surface-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="shrink-0 mt-1">
                    {entry.kind === 'image' ? <ImageIcon className="w-4 h-4 text-teal" /> : <FileTextIcon className="w-4 h-4 text-charcoal-500" />}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs text-charcoal-500 truncate">Original: {entry.originalFileName}</p>
                      {!entry.file && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-[11px] text-amber-800">
                          Restored (metadata only)
                        </span>
                      )}
                    </div>
                    {!entry.file && <p className="text-[11px] text-charcoal-400">File cannot be restored; reselect to upload.</p>}
                    <input
                      value={entry.displayName}
                      onChange={(e) => renameUpload(entry.id, e.target.value, section)}
                      placeholder="Display name"
                      className="w-full px-3 py-2 text-sm border border-surface-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal"
                    />
                    {entry.previewUrl && (
                      <img src={entry.previewUrl} alt={entry.displayName || entry.originalFileName} className="w-24 h-24 object-cover rounded-lg border border-surface-200" />
                    )}
                    <div className="flex items-center gap-3 text-xs">
                      <a
                        href={entry.previewUrl ?? '#'}
                        target="_blank"
                        rel="noreferrer"
                        className={`inline-flex items-center gap-1 ${entry.previewUrl ? 'text-teal hover:text-teal-700' : 'text-charcoal-400 pointer-events-none'}`}
                      >
                        <ExternalLinkIcon className="w-3.5 h-3.5" />
                        Open
                      </a>
                      <a
                        href={entry.previewUrl ?? '#'}
                        download={entry.displayName || entry.originalFileName}
                        className={`inline-flex items-center gap-1 ${entry.previewUrl ? 'text-charcoal-600 hover:text-charcoal' : 'text-charcoal-400 pointer-events-none'}`}
                      >
                        <DownloadIcon className="w-3.5 h-3.5" />
                        Download
                      </a>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeUpload(entry.id, section)}
                    className="text-critical hover:text-critical-600 p-1"
                    aria-label="Remove file"
                  >
                    <Trash2Icon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderCauseGroups(
    titleText: string,
    groups: Record<string, readonly string[]>,
    target: 'acts' | 'conditions',
    selected: Record<string, UnsafeCauseEntry>
  ) {
    return (
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-charcoal">{titleText}</h4>
        {Object.entries(groups).map(([groupName, options]) => (
          <div key={groupName} className="rounded-lg border border-surface-200 p-3">
            <p className="text-xs font-semibold text-charcoal-500 uppercase tracking-wide mb-2">{groupName}</p>
            <div className="space-y-2">
              {options.map((item) => {
                const key = makeCauseKey(groupName, item);
                const isSelected = Boolean(selected[key]);
                return (
                  <div key={key} className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-2 md:gap-3 items-center">
                    <label className="flex items-center gap-2 text-sm text-charcoal">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => toggleCause(target, groupName, item, e.target.checked)}
                        className="w-4 h-4 text-teal border-surface-300 rounded focus:ring-teal"
                      />
                      <span>{item}</span>
                    </label>
                    <input
                      value={selected[key]?.note ?? ''}
                      onChange={(e) => setCauseNote(target, key, e.target.value)}
                      disabled={!isSelected}
                      placeholder="Explain / notes"
                      className="w-full px-3 py-2 text-sm border border-surface-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal disabled:bg-surface-100 disabled:text-charcoal-400"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderDetailedCauseGroups(
    titleText: string,
    groups: Record<string, readonly string[]>,
    selected: Record<string, CauseDetailEntry>,
    setter: React.Dispatch<React.SetStateAction<Record<string, CauseDetailEntry>>>
  ) {
    return (
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-charcoal">{titleText}</h4>
        {Object.entries(groups).map(([groupName, options]) => (
          <div key={groupName} className="rounded-lg border border-surface-200 p-3">
            <p className="text-xs font-semibold text-charcoal-500 uppercase tracking-wide mb-2">{groupName}</p>
            <div className="space-y-2">
              {options.map((item) => {
                const key = makeCauseKey(groupName, item);
                const isSelected = Boolean(selected[key]);
                return (
                  <div key={key} className="space-y-2 rounded border border-surface-100 p-2">
                    <label className="flex items-center gap-2 text-sm text-charcoal">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => toggleDetailedCause(setter, groupName, item, e.target.checked)}
                        className="w-4 h-4 text-teal border-surface-300 rounded focus:ring-teal"
                      />
                      <span>{item}</span>
                    </label>
                    <input
                      value={selected[key]?.note ?? ''}
                      onChange={(e) => updateDetailedCauseNote(setter, key, e.target.value)}
                      disabled={!isSelected}
                      placeholder="Explanation / notes"
                      className="w-full px-3 py-2 text-sm border border-surface-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal disabled:bg-surface-100 disabled:text-charcoal-400"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderInvestigationCard(section: InvestigationSectionKey, titleText: string, children: React.ReactNode) {
    const expanded = investigationSections[section];
    return (
      <div className="rounded-xl border border-surface-200 p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => setInvestigationSection(section, !expanded)} className="flex items-center gap-2 text-left">
            {expanded ? <ChevronDownIcon className="w-4 h-4 text-charcoal-500" /> : <ChevronRightIcon className="w-4 h-4 text-charcoal-500" />}
            <h4 className="text-sm font-semibold text-charcoal">{titleText}</h4>
          </button>
          <button
            type="button"
            onClick={() => setInvestigationSection(section, !expanded)}
            className="text-xs font-medium text-charcoal-500 hover:text-charcoal"
          >
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
        {expanded && children}
      </div>
    );
  }

  if (!props.open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto p-3 pt-16 sm:p-6 sm:pt-20">
      <div className="absolute inset-0 bg-black/45" onClick={props.onClose} />
      <div className="relative w-full max-w-6xl bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90dvh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-surface-200 px-4 py-4 sm:px-6 flex items-center justify-between z-10">
          <div>
            <p className="text-sm font-semibold text-charcoal">{isEditing ? 'Edit Incident (Updated Form)' : 'Updated Incident Form'}</p>
            <p className="text-xs text-charcoal-500 mt-0.5">Likelihood and severity use 1-5 scale. Risk is auto-calculated.</p>
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

        <form onSubmit={onSubmit} className="p-4 sm:p-6 space-y-6">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-critical">Could not create incident</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Incident Title *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Project / Client *</label>
              <input
                value={projectClient}
                onChange={(e) => setProjectClient(e.target.value)}
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Module</label>
              <select
                value={module}
                onChange={(e) => setModule(e.target.value as ModuleKey)}
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
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
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-charcoal mb-1.5">Type of incident * (multi-select)</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 rounded-lg border border-surface-200 p-3">
                {INCIDENT_TYPES.map((type) => (
                  <label key={type} className="flex items-start gap-2 text-sm text-charcoal">
                    <input
                      type="checkbox"
                      checked={Boolean(incidentTypeSelections[type])}
                      onChange={(e) => setIncidentTypeSelections((prev) => ({ ...prev, [type]: e.target.checked }))}
                      className="mt-0.5 w-4 h-4 text-teal border-surface-300 rounded focus:ring-teal"
                    />
                    <span>{type}</span>
                  </label>
                ))}
              </div>
              <input
                value={incidentTypeOther}
                onChange={(e) => setIncidentTypeOther(e.target.value)}
                placeholder="Other / Type manually"
                className="mt-2 w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Category * (multi-select)</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 rounded-lg border border-surface-200 p-3">
                {INCIDENT_CATEGORIES.map((c) => {
                  const checked = selectedCategories.includes(c);
                  return (
                    <label key={c} className="flex items-start gap-2 text-sm text-charcoal">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setSelectedCategories((prev) => {
                            const next = e.target.checked ? [...prev, c] : prev.filter((x) => x !== c);
                            const deduped = Array.from(new Set(next));
                            const fallback = deduped.length > 0 ? deduped : [INCIDENT_CATEGORIES[0]];
                            setCategory(fallback[0]);
                            return fallback;
                          });
                        }}
                        className="mt-0.5 w-4 h-4 text-teal border-surface-300 rounded focus:ring-teal"
                      />
                      <span>{c}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Subcategory *</label>
              <div className="space-y-2">
                {!useManualSubcategory && availableSubcategories.length > 0 ? (
                  <select
                    value={subcategory}
                    onChange={(e) => {
                      if (e.target.value === '__manual__') {
                        setUseManualSubcategory(true);
                        return;
                      }
                      const value = e.target.value;
                      setSubcategory(value);
                      setSelectedSubcategories((prev) =>
                        value && !prev.includes(value) ? [...prev, value] : prev
                      );
                    }}
                    className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                    required
                  >
                    <option value="">Select subcategory</option>
                    {availableSubcategories.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                    <option value="__manual__">Other (Type manually)</option>
                  </select>
                ) : (
                  <div className="space-y-2">
                    <input
                      value={subcategoryManual}
                      onChange={(e) => setSubcategoryManual(e.target.value)}
                      placeholder="Type subcategory"
                      className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setUseManualSubcategory(false);
                        setSubcategory('');
                      }}
                      className="text-xs text-teal hover:text-teal-700"
                    >
                      Select from category list
                    </button>
                  </div>
                )}
                {allSelectedSubcategories.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {allSelectedSubcategories.map((s) => (
                      <span
                        key={s}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-100 text-xs text-charcoal"
                      >
                        {s}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSubcategories((prev) => prev.filter((x) => x !== s));
                            if (subcategory === s) {
                              setSubcategory('');
                            }
                            if (useManualSubcategory && subcategoryManual.trim() === s) {
                              setSubcategoryManual('');
                            }
                          }}
                          className="text-charcoal-400 hover:text-charcoal-600"
                          aria-label={`Remove ${s}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Date & Time *</label>
              <input
                type="datetime-local"
                value={occurredAtInput}
                onChange={(e) => setOccurredAtInput(e.target.value)}
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                required
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-charcoal mb-1.5">Location / Site / Department</label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>
            <div className="md:col-span-2 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <label className="block text-sm font-medium text-charcoal">Affected persons</label>
                <button
                  type="button"
                  onClick={() =>
                    setAffectedPersons((prev) => [
                      ...prev,
                      {
                        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                        personId: null,
                        personName: '',
                        role: '',
                        department: '',
                        injuryType: '',
                        contactDetails: ''
                      }
                    ])
                  }
                  className="text-xs font-medium text-teal hover:text-teal-700"
                >
                  + Add Person
                </button>
              </div>
              <div className="space-y-3">
                {affectedPersons.map((entry, index) => (
                  <div key={entry.id} className="rounded-lg border border-surface-200 p-3 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-charcoal">
                        Person {index + 1}
                        {index === 0 && ' (primary)'}
                      </p>
                      {affectedPersons.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setAffectedPersons((prev) => prev.filter((p) => p.id !== entry.id))
                          }
                          className="text-xs text-critical hover:text-critical-600"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-charcoal mb-1">
                          Name
                        </label>
                        <AffectedPersonSelector
                          companyId={props.companyId}
                          selectedPersonId={entry.personId}
                          selectedPersonName={entry.personName}
                          onChange={(personId, personName, employeeId) => {
                            if (index === 0) {
                              setAffectedPersonId(personId);
                              setAffectedPersonName(personName ?? '');
                              setAffectedEmployeeId(employeeId);
                            }
                            setAffectedPersons((prev) =>
                              prev.map((p) =>
                                p.id === entry.id
                                  ? {
                                      ...p,
                                      personId,
                                      personName: personName ?? ''
                                    }
                                  : p
                              )
                            );
                          }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-charcoal mb-1">
                          Role / Position
                        </label>
                        <input
                          value={entry.role}
                          onChange={(e) =>
                            setAffectedPersons((prev) =>
                              prev.map((p) =>
                                p.id === entry.id ? { ...p, role: e.target.value } : p
                              )
                            )
                          }
                          className="w-full px-3 py-2 text-sm border border-surface-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-charcoal mb-1">
                          Department
                        </label>
                        <input
                          value={entry.department}
                          onChange={(e) =>
                            setAffectedPersons((prev) =>
                              prev.map((p) =>
                                p.id === entry.id ? { ...p, department: e.target.value } : p
                              )
                            )
                          }
                          className="w-full px-3 py-2 text-sm border border-surface-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-charcoal mb-1">
                          Injury type (if applicable)
                        </label>
                        <input
                          value={entry.injuryType}
                          onChange={(e) =>
                            setAffectedPersons((prev) =>
                              prev.map((p) =>
                                p.id === entry.id ? { ...p, injuryType: e.target.value } : p
                              )
                            )
                          }
                          className="w-full px-3 py-2 text-sm border border-surface-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-charcoal mb-1">
                          Contact details (optional)
                        </label>
                        <input
                          value={entry.contactDetails}
                          onChange={(e) =>
                            setAffectedPersons((prev) =>
                              prev.map((p) =>
                                p.id === entry.id ? { ...p, contactDetails: e.target.value } : p
                              )
                            )
                          }
                          className="w-full px-3 py-2 text-sm border border-surface-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Risk category (core)</label>
              <select
                value={riskCategorySimple}
                onChange={(e) => setRiskCategorySimple(e.target.value as 'Low' | 'Medium' | 'High')}
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-surface-200 pt-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-charcoal mb-1.5">Brief incident description *</label>
              <textarea
                value={briefDescription}
                onChange={(e) => setBriefDescription(e.target.value)}
                rows={3}
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Nature of incident *</label>
              <textarea
                value={natureOfIncident}
                onChange={(e) => setNatureOfIncident(e.target.value)}
                rows={3}
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Cause of incident *</label>
              <textarea
                value={causeOfIncident}
                onChange={(e) => setCauseOfIncident(e.target.value)}
                rows={3}
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Reported by *</label>
              <input
                value={reportedBy}
                onChange={(e) => setReportedBy(e.target.value)}
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Reported to *</label>
              <input
                value={reportedTo}
                onChange={(e) => setReportedTo(e.target.value)}
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Copy to (comma-separated emails)</label>
              <input
                value={copyTo}
                onChange={(e) => setCopyTo(e.target.value)}
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>
          </div>

          <details className="border-t border-surface-200 pt-4">
            <summary className="cursor-pointer text-sm font-semibold text-charcoal py-2">Losses (optional)</summary>
            <div className="pt-3 space-y-4">
              <p className="text-xs text-charcoal-500">
                Select all applicable loss types and optionally add free-text notes for additional context.
              </p>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-charcoal mb-1.5">Loss types (multi-select)</label>
                <div className="space-y-2">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between gap-2 px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm hover:border-teal"
                    onClick={(e) => {
                      e.preventDefault();
                      const container = (e.currentTarget.nextSibling as HTMLElement | null);
                      if (!container) return;
                      const isHidden = container.getAttribute('data-open') !== 'true';
                      container.setAttribute('data-open', isHidden ? 'true' : 'false');
                    }}
                  >
                    <span className="text-charcoal-700">Select loss types</span>
                    <ChevronDownIcon className="w-4 h-4 text-charcoal-400" />
                  </button>
                  <div
                    data-open="false"
                    className="hidden data-[open=true]:block mt-2 rounded-lg border border-surface-200 bg-white max-h-56 overflow-y-auto p-3 space-y-2"
                  >
                    {LOSS_TYPE_OPTIONS.map((option) => {
                      const checked = lossTypes.includes(option);
                      return (
                        <label key={option} className="flex items-start gap-2 text-sm text-charcoal">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const isChecked = e.target.checked;
                              setLossTypes((prev) =>
                                isChecked ? [...prev, option] : prev.filter((value) => value !== option)
                              );
                            }}
                            className="mt-0.5 w-4 h-4 text-teal border-surface-300 rounded focus:ring-teal"
                          />
                          <span>{option}</span>
                        </label>
                      );
                    })}
                  </div>
                  {lossTypes.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {lossTypes.map((type) => (
                        <span
                          key={type}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-teal/10 text-teal rounded text-xs"
                        >
                          {type}
                          <button
                            type="button"
                            onClick={() =>
                              setLossTypes((prev) => prev.filter((value) => value !== type))
                            }
                            className="hover:text-teal-700"
                          >
                            <XIcon className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Other loss details</label>
                <input
                  value={lossOther}
                  onChange={(e) => setLossOther(e.target.value)}
                  placeholder="Other / specify loss details"
                  className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal mb-2"
                />
                <textarea
                  value={lossNotes}
                  onChange={(e) => setLossNotes(e.target.value)}
                  rows={4}
                  placeholder="Describe financial, operational, reputational, legal, injury, or any other losses in your own words."
                  className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                />
              </div>
            </div>
          </details>

          <div className="border-t border-surface-200 pt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-charcoal mb-1.5">Investigation required?</label>
                <select
                  value={investigationRequired ? 'yes' : 'no'}
                  onChange={(e) => setInvestigationRequired(e.target.value === 'yes')}
                  className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-charcoal mb-1.5">NCR integration</label>
                <label className="flex items-center gap-2 text-sm text-charcoal border border-surface-300 rounded-lg px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={generateNcr}
                    onChange={(e) => setGenerateNcr(e.target.checked)}
                    className="w-4 h-4 text-teal border-surface-300 rounded focus:ring-teal"
                  />
                  <span>Generate/link NCR for this incident</span>
                </label>
              </div>
            </div>

            <details>
              <summary className="cursor-pointer text-sm font-semibold text-charcoal">Evidence (optional)</summary>
              <div className="pt-3">{renderUploadSection('Upload evidence', 'evidence', evidenceUploads)}</div>
            </details>
            {investigationRequired && (
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-charcoal">Investigation files (optional)</summary>
                <div className="pt-3">{renderUploadSection('Upload investigation files', 'investigation', investigationUploads)}</div>
              </details>
            )}
            {(investigationRequired || riskSeverity >= 4) && (
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-charcoal">Risk & Consequence</summary>
                <div className="pt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Risk rating</label>
                    <div className="w-full px-4 py-2.5 rounded-lg border border-surface-300 text-sm bg-surface-50">{calculatedRiskCategory} ({calculatedRisk})</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Potential consequence</label>
                    <textarea value={potentialConsequence} onChange={(e) => setPotentialConsequence(e.target.value)} rows={2} className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Actual outcome</label>
                    <textarea value={actualOutcome} onChange={(e) => setActualOutcome(e.target.value)} rows={2} className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal" />
                  </div>
                </div>
              </details>
            )}

            {investigationRequired && (
              <div className="space-y-5">
                <div className="rounded-xl border border-surface-200 p-4">
                  <p className="text-sm font-semibold text-charcoal">Investigation sections</p>
                  <p className="text-xs text-charcoal-500 mt-0.5">All sections are collapsed by default. Click a section card to expand or collapse.</p>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                    {INVESTIGATION_SECTION_DEFINITIONS.map((section) => (
                      <button
                        type="button"
                        key={section.key}
                        onClick={() => setInvestigationSection(section.key, !investigationSections[section.key])}
                        className="flex items-start gap-2 rounded-lg border border-surface-200 p-3 text-sm text-charcoal text-left hover:border-teal"
                      >
                        {investigationSections[section.key] ? <ChevronDownIcon className="w-4 h-4 mt-0.5 text-charcoal-500" /> : <ChevronRightIcon className="w-4 h-4 mt-0.5 text-charcoal-500" />}
                        <span className="min-w-0">
                          <span className="block font-medium">{section.label}</span>
                          <span className="block text-xs text-charcoal-500">{section.description}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {renderInvestigationCard(
                  'immediateCauses',
                  'Immediate Causes',
                  <div className="space-y-4">
                    {renderCauseGroups('Unsafe Acts (tickbox + explanation)', IMMEDIATE_CAUSES_UNSAFE_ACTS_GROUPS, 'acts', unsafeActs)}
                    {renderCauseGroups('Unsafe Conditions (tickbox + explanation)', IMMEDIATE_CAUSES_UNSAFE_CONDITIONS_GROUPS, 'conditions', unsafeConditions)}
                  </div>
                )}

                {renderInvestigationCard('unsafeActs', 'Unsafe Acts', renderCauseGroups('Unsafe Acts (tickbox + explanation)', IMMEDIATE_CAUSES_UNSAFE_ACTS_GROUPS, 'acts', unsafeActs))}

                {renderInvestigationCard('unsafeConditions', 'Unsafe Conditions', renderCauseGroups('Unsafe Conditions (tickbox + explanation)', IMMEDIATE_CAUSES_UNSAFE_CONDITIONS_GROUPS, 'conditions', unsafeConditions))}

                {renderInvestigationCard('systemFailures', 'System Failures', renderDetailedCauseGroups('System Failures', { 'System Failures': SYSTEM_FAILURE_OPTIONS }, systemFailures, setSystemFailures))}

                {renderInvestigationCard(
                  'rootCauses',
                  'Root Causes',
                  <div className="space-y-4">
                    {renderDetailedCauseGroups('Human Factors Causes', ROOT_CAUSE_HUMAN_FACTORS_CATEGORIES, rootCauseHuman, setRootCauseHuman)}
                    {renderDetailedCauseGroups('Work Factors', ROOT_CAUSE_WORKPLACE_FACTORS_CATEGORIES, rootCauseWorkplace, setRootCauseWorkplace)}
                  </div>
                )}

                {renderInvestigationCard(
                  'humanFactorsCauses',
                  'Human Factors Causes',
                  renderDetailedCauseGroups('Human Factors Causes', ROOT_CAUSE_HUMAN_FACTORS_CATEGORIES, rootCauseHuman, setRootCauseHuman)
                )}

                {renderInvestigationCard(
                  'workFactors',
                  'Work Factors',
                  renderDetailedCauseGroups('Work Factors', ROOT_CAUSE_WORKPLACE_FACTORS_CATEGORIES, rootCauseWorkplace, setRootCauseWorkplace)
                )}

                {renderInvestigationCard(
                  'contributingFactors',
                  'Contributing Factors',
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Contributing Factors</label>
                    <textarea value={contributingFactors} onChange={(e) => setContributingFactors(e.target.value)} rows={3} className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal" />
                  </div>
                )}

                {renderInvestigationCard(
                  'correctiveActions',
                  'Corrective Actions',
                  <div className="space-y-3">
                    <p className="text-xs text-charcoal-500">Each row creates a separate corrective action record after saving this incident.</p>
                    {correctiveActionDrafts.map((draft) => (
                      <div key={draft.id} className="rounded-lg border border-surface-200 p-3 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-charcoal mb-1">Action Required *</label>
                            <input value={draft.actionRequired} onChange={(e) => setCorrectiveActionDrafts((prev) => prev.map((row) => row.id === draft.id ? { ...row, actionRequired: e.target.value } : row))} className="w-full px-3 py-2 text-sm border border-surface-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-charcoal mb-1">Due Date *</label>
                            <input type="date" value={draft.dueDate} onChange={(e) => setCorrectiveActionDrafts((prev) => prev.map((row) => row.id === draft.id ? { ...row, dueDate: e.target.value } : row))} className="w-full px-3 py-2 text-sm border border-surface-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-charcoal mb-1">Responsible Person *</label>
                          <UserMultiSelect
                            companyId={props.companyId}
                            selectedUserIds={draft.responsibleUserId ? [draft.responsibleUserId] : []}
                            onChange={(userIds) => setCorrectiveActionDrafts((prev) => prev.map((row) => row.id === draft.id ? { ...row, responsibleUserId: (userIds[0] ?? null) } : row))}
                            placeholder="Select responsible person"
                            allowExternalEmails={false}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-charcoal mb-1">Linked Causes</label>
                          <div className="max-h-32 overflow-y-auto rounded-lg border border-surface-200 p-2 space-y-1">
                            {causeLinkOptions.length === 0 && <p className="text-xs text-charcoal-500">No causes captured yet.</p>}
                            {causeLinkOptions.map((option, idx) => {
                              const key = `${option.type}:${option.text}:${idx}`;
                              const checked = draft.links.some((link) => link.type === option.type && link.text === option.text);
                              return (
                                <label key={key} className="flex items-start gap-2 text-xs text-charcoal">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => setCorrectiveActionDrafts((prev) => prev.map((row) => {
                                      if (row.id !== draft.id) return row;
                                      const nextLinks = e.target.checked
                                        ? [...row.links, option]
                                        : row.links.filter((link) => !(link.type === option.type && link.text === option.text));
                                      return { ...row, links: nextLinks };
                                    }))}
                                    className="mt-0.5 w-3.5 h-3.5 text-teal border-surface-300 rounded focus:ring-teal"
                                  />
                                  <span>{option.type.replace('_', ' ')}: {option.text}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <button type="button" onClick={() => setCorrectiveActionDrafts((prev) => prev.filter((row) => row.id !== draft.id))} className="text-xs text-critical hover:text-critical-600">Remove row</button>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setCorrectiveActionDrafts((prev) => [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, actionRequired: '', responsibleUserId: null, dueDate: '', links: [] }])}
                      className="px-3 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
                    >
                      Add Corrective Action
                    </button>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Investigation team</label>
                        <input value={investigationTeam} onChange={(e) => setInvestigationTeam(e.target.value)} placeholder="Comma-separated names" className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Prepared by</label>
                        <input value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Conclusion</label>
                      <textarea value={conclusion} onChange={(e) => setConclusion(e.target.value)} rows={2} className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Distribution list (copy to)</label>
                      <input value={distributionList} onChange={(e) => setDistributionList(e.target.value)} placeholder="Comma-separated emails/names" className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal" />
                    </div>
                  </div>
                )}

                {renderInvestigationCard(
                  'lessonsLearned',
                  'Lessons Learned',
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Lessons Learned</label>
                    <textarea value={lessonsLearned} onChange={(e) => setLessonsLearned(e.target.value)} rows={3} className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal" />
                  </div>
                )}

              </div>
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-4 border-t border-surface-200">
            <button
              type="button"
              onClick={props.onClose}
              className="min-h-[44px] inline-flex items-center justify-center px-4 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || loading}
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-lg bg-critical text-white text-sm font-semibold hover:bg-critical-600 disabled:opacity-60 disabled:cursor-not-allowed w-full sm:w-auto"
            >
              {loading && <LoadingSpinner size={16} />}
              {isEditing ? 'Save changes' : 'Save incident'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
