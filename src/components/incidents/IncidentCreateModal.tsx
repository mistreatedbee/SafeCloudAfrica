import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  SYSTEM_FAILURE_OPTIONS
} from '../../api/models/core';
import type { Incident } from '../../api/models/entities';
import { createIncident, updateIncident } from '../../api/services/incidentsService';
import { getIncidentInvestigation, upsertIncidentInvestigation } from '../../api/services/incidentInvestigationsService';
import { createIncidentCorrectiveAction } from '../../api/services/incidentCorrectiveActionsService';
import { createEvidence } from '../../api/services/evidenceService';
import { uploadFile } from '../../api/services/storageService';
import { useAsync } from '../../api/hooks/useAsync';
import { listHrEmployees, type HrEmployee } from '../../api/services/hrService';
import { AffectedPersonSelector } from './AffectedPersonSelector';
import type { TimelineEvent } from './IncidentTimelineBuilder';
import { UserMultiSelect } from '../ui/UserMultiSelect';

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
  file: File;
  displayName: string;
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
    previewUrl: isImage ? URL.createObjectURL(file) : null,
    kind: isImage ? 'image' : 'document'
  };
}

function makeCauseKey(group: string, item: string): string {
  return `${group}::${item}`;
}

function getRiskCategoryFromScore(score: number): 'Low' | 'Medium' | 'High' {
  const value = Math.max(1, Math.min(25, Number(score) || 1));
  if (value <= 5) return 'Low';
  if (value <= 12) return 'Medium';
  return 'High';
}

function buildEmployeeName(employee: HrEmployee): string {
  const fullName = `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim();
  if (fullName) return fullName;
  return employee.email ?? employee.employee_no ?? 'Unknown employee';
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
  const [module, setModule] = useState<ModuleKey>(props.defaultModule ?? 'safety');
  const [incidentTypeSelections, setIncidentTypeSelections] = useState<Record<string, boolean>>(
    Object.fromEntries(INCIDENT_TYPES.map((t) => [t, false]))
  );
  const [incidentTypeOther, setIncidentTypeOther] = useState('');
  const [category, setCategory] = useState<IncidentCategory>(INCIDENT_CATEGORIES[0]);
  const [subcategory, setSubcategory] = useState('');
  const [subcategoryManual, setSubcategoryManual] = useState('');
  const [useManualSubcategory, setUseManualSubcategory] = useState(false);

  const [title, setTitle] = useState('');
  const [briefDescription, setBriefDescription] = useState('');
  const [occurredAtInput, setOccurredAtInput] = useState(new Date().toISOString().slice(0, 16));
  const [location, setLocation] = useState('');
  const [natureOfIncident, setNatureOfIncident] = useState('');
  const [causeOfIncident, setCauseOfIncident] = useState('');
  const [affectedPersonId, setAffectedPersonId] = useState<UUID | null>(null);
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
  const [reportedByEmployeeId, setReportedByEmployeeId] = useState<UUID | null>(null);
  const [reportedToEmployeeId, setReportedToEmployeeId] = useState<UUID | null>(null);
  const [copyTo, setCopyTo] = useState('');
  const [riskCategorySimple, setRiskCategorySimple] = useState<'Low' | 'Medium' | 'High'>('Medium');

  const [riskLikelihood, setRiskLikelihood] = useState<1 | 2 | 3 | 4 | 5 | ''>('');
  const [riskSeverity, setRiskSeverity] = useState<1 | 2 | 3 | 4 | 5 | ''>('');

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
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  const draftStorageKey = useMemo(
    () => `incident-form-draft:v2:${props.companyId}:${props.createdByUserId}:${editingIncident?.id ?? 'new'}`,
    [props.companyId, props.createdByUserId, editingIncident?.id]
  );
  const isHydratingDraftRef = useRef(false);

  const {
    data: hrEmployeesData,
    loading: hrEmployeesLoading,
    error: hrEmployeesError,
    retry: retryHrEmployees
  } = useAsync<HrEmployee[]>(
    async () => {
      if (!props.open || !props.companyId) return [];
      const rows = await listHrEmployees(props.companyId);
      return rows
        .filter((row) => Boolean(row.user_id))
        .sort((a, b) => buildEmployeeName(a).localeCompare(buildEmployeeName(b)));
    },
    [props.open, props.companyId]
  );
  const hrEmployees = hrEmployeesData ?? [];

  const availableSubcategories = useMemo(() => INCIDENT_SUBCATEGORIES[category] || [], [category]);
  const finalSubcategory = useMemo(
    () => (useManualSubcategory ? subcategoryManual.trim() : subcategory.trim()),
    [useManualSubcategory, subcategory, subcategoryManual]
  );
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
  const calculatedRisk = useMemo(() => {
    if (!riskLikelihood || !riskSeverity) return null;
    return riskLikelihood * riskSeverity;
  }, [riskLikelihood, riskSeverity]);
  const calculatedRiskCategory = useMemo(() => {
    if (!calculatedRisk) return null;
    return getRiskCategoryFromScore(calculatedRisk);
  }, [calculatedRisk]);
  const riskCategoryTone = useMemo(() => {
    if (!calculatedRiskCategory) return 'bg-surface-100 text-charcoal-500 border-surface-300';
    if (calculatedRiskCategory === 'Low') {
      return 'bg-success/15 text-success border-success/30';
    }
    if (calculatedRiskCategory === 'Medium') {
      return 'bg-warning/15 text-warning border-warning/30';
    }
    return 'bg-critical/15 text-critical border-critical/30';
  }, [calculatedRiskCategory]);
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
      briefDescription.trim().length > 0 &&
      finalIncidentType.length > 0 &&
      finalSubcategory.length > 0 &&
      natureOfIncident.trim().length > 0 &&
      causeOfIncident.trim().length > 0 &&
      reportedBy.trim().length > 0 &&
      reportedTo.trim().length > 0 &&
      Boolean(riskLikelihood) &&
      Boolean(riskSeverity)
    );
  }, [title, briefDescription, finalIncidentType, finalSubcategory, natureOfIncident, causeOfIncident, reportedBy, reportedTo, riskLikelihood, riskSeverity]);

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
    setSubcategory('');
    setSubcategoryManual('');
    setUseManualSubcategory(false);
    setTitle('');
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
    setReportedByEmployeeId(null);
    setReportedToEmployeeId(null);
    setCopyTo('');
    setRiskCategorySimple('Medium');
    setRiskLikelihood('');
    setRiskSeverity('');
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
    setSaveSuccessMessage(null);
  }

  useEffect(() => {
    if (!props.open) return;
    if (!editingIncident) {
      resetForm();
      setSaveSuccessMessage(null);
      isHydratingDraftRef.current = true;
      try {
        const raw = localStorage.getItem(draftStorageKey);
        if (raw) {
          const draft = JSON.parse(raw) as Record<string, unknown>;
          setModule((draft.module as ModuleKey) ?? (props.defaultModule ?? 'safety'));
          setIncidentTypeSelections((draft.incidentTypeSelections as Record<string, boolean>) ?? Object.fromEntries(INCIDENT_TYPES.map((t) => [t, false])));
          setIncidentTypeOther(String(draft.incidentTypeOther ?? ''));
          setCategory((draft.category as IncidentCategory) ?? INCIDENT_CATEGORIES[0]);
          setSubcategory(String(draft.subcategory ?? ''));
          setSubcategoryManual(String(draft.subcategoryManual ?? ''));
          setUseManualSubcategory(Boolean(draft.useManualSubcategory));
          setTitle(String(draft.title ?? ''));
          setBriefDescription(String(draft.briefDescription ?? ''));
          setOccurredAtInput(String(draft.occurredAtInput ?? new Date().toISOString().slice(0, 16)));
          setLocation(String(draft.location ?? ''));
          setNatureOfIncident(String(draft.natureOfIncident ?? ''));
          setCauseOfIncident(String(draft.causeOfIncident ?? ''));
          setAffectedPersonId((draft.affectedPersonId as UUID | null) ?? null);
          setAffectedPersonName(String(draft.affectedPersonName ?? ''));
          if (Array.isArray(draft.affectedPersons) && draft.affectedPersons.length > 0) {
            setAffectedPersons(
              draft.affectedPersons.map((entry: any) => ({
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                personId: (entry?.personId as UUID) ?? null,
                personName: String(entry?.personName ?? ''),
                role: String(entry?.role ?? ''),
                department: String(entry?.department ?? ''),
                injuryType: String(entry?.injuryType ?? ''),
                contactDetails: String(entry?.contactDetails ?? '')
              }))
            );
          }
          setReportedBy(String(draft.reportedBy ?? ''));
          setReportedTo(String(draft.reportedTo ?? ''));
          setReportedByEmployeeId((draft.reportedByEmployeeId as UUID | null) ?? null);
          setReportedToEmployeeId((draft.reportedToEmployeeId as UUID | null) ?? null);
          setCopyTo(String(draft.copyTo ?? ''));
          const draftLikelihood = Number(draft.riskLikelihood);
          const draftSeverity = Number(draft.riskSeverity);
          setRiskLikelihood(Number.isFinite(draftLikelihood) && draftLikelihood >= 1 && draftLikelihood <= 5 ? (draftLikelihood as 1 | 2 | 3 | 4 | 5) : '');
          setRiskSeverity(Number.isFinite(draftSeverity) && draftSeverity >= 1 && draftSeverity <= 5 ? (draftSeverity as 1 | 2 | 3 | 4 | 5) : '');
          setRiskCategorySimple((draft.riskCategorySimple as 'Low' | 'Medium' | 'High') ?? 'Medium');
          setInvestigationRequired(Boolean(draft.investigationRequired));
          setGenerateNcr(Boolean(draft.generateNcr));
          setActualOutcome(String(draft.actualOutcome ?? ''));
          setLossTypes(Array.isArray(draft.lossTypes) ? draft.lossTypes.filter((x: unknown) => typeof x === 'string') : []);
          setLossOther(String(draft.lossOther ?? ''));
          setLossNotes(String(draft.lossNotes ?? ''));
          setUnsafeActs((draft.unsafeActs as Record<string, UnsafeCauseEntry>) ?? {});
          setUnsafeConditions((draft.unsafeConditions as Record<string, UnsafeCauseEntry>) ?? {});
          setRootCauseHuman((draft.rootCauseHuman as Record<string, CauseDetailEntry>) ?? {});
          setRootCauseWorkplace((draft.rootCauseWorkplace as Record<string, CauseDetailEntry>) ?? {});
          setSystemFailures((draft.systemFailures as Record<string, CauseDetailEntry>) ?? {});
          setIncidentTimelineEvents((draft.incidentTimelineEvents as TimelineEvent[]) ?? []);
          setPotentialConsequence(String(draft.potentialConsequence ?? ''));
          setContributingFactors(String(draft.contributingFactors ?? ''));
          setLessonsLearned(String(draft.lessonsLearned ?? ''));
          setInvestigationTeam(String(draft.investigationTeam ?? ''));
          setConclusion(String(draft.conclusion ?? ''));
          setPreparedBy(String(draft.preparedBy ?? ''));
          setDistributionList(String(draft.distributionList ?? ''));
          setInvestigationSections((draft.investigationSections as Record<InvestigationSectionKey, boolean>) ?? emptyInvestigationSectionSelection());
          setCorrectiveActionDrafts((draft.correctiveActionDrafts as CorrectiveActionDraft[]) ?? []);
        }
      } catch {
        localStorage.removeItem(draftStorageKey);
      } finally {
        setTimeout(() => {
          isHydratingDraftRef.current = false;
        }, 0);
      }
      return;
    }
    isHydratingDraftRef.current = true;
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
    setCategory(editingIncident.category ?? INCIDENT_CATEGORIES[0]);
    const existingSubcategory = String(editingIncident.subcategory ?? '');
    const validSubcategories = INCIDENT_SUBCATEGORIES[editingIncident.category as IncidentCategory] ?? [];
    if (validSubcategories.includes(existingSubcategory)) {
      setSubcategory(existingSubcategory);
      setSubcategoryManual('');
      setUseManualSubcategory(false);
    } else {
      setSubcategory('');
      setSubcategoryManual(existingSubcategory);
      setUseManualSubcategory(true);
    }
    setTitle(editingIncident.title ?? '');
    setBriefDescription(String(editingIncident.description ?? ''));
    setOccurredAtInput(occurredAtValue);
    setLocation(editingIncident.location ?? '');
    setNatureOfIncident((editingIncident as any).nature_of_incident ?? '');
    setCauseOfIncident((editingIncident as any).cause_of_incident ?? (editingIncident as any).cause ?? '');
    setAffectedPersonId((editingIncident as any).affected_person_id ?? null);
    setAffectedPersonName((editingIncident as any).affected_person ?? '');
    const metadata = (editingIncident as any)?.metadata ?? null;
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
    setReportedByEmployeeId((metadata?.reportedByEmployeeId as UUID | null) ?? null);
    setReportedToEmployeeId((metadata?.reportedToEmployeeId as UUID | null) ?? null);
    setCopyTo(Array.isArray((editingIncident as any).copy_to_emails) ? (editingIncident as any).copy_to_emails.join(', ') : '');
    setRiskCategorySimple(((editingIncident as any).risk_category ?? getRiskCategoryFromScore((editingIncident as any).risk_rating_product ?? 9)) as 'Low' | 'Medium' | 'High');
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
    setSaveSuccessMessage(null);
    setTimeout(() => {
      isHydratingDraftRef.current = false;
    }, 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, editingIncident?.id, draftStorageKey]);

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

  useEffect(() => {
    if (calculatedRiskCategory) setRiskCategorySimple(calculatedRiskCategory);
  }, [calculatedRiskCategory]);

  useEffect(() => {
    if (!props.open || hrEmployees.length === 0) return;
    if (!reportedByEmployeeId && reportedBy.trim()) {
      const match = hrEmployees.find((employee) => buildEmployeeName(employee).toLowerCase() === reportedBy.trim().toLowerCase());
      if (match) setReportedByEmployeeId(match.id);
    }
    if (!reportedToEmployeeId && reportedTo.trim()) {
      const match = hrEmployees.find((employee) => buildEmployeeName(employee).toLowerCase() === reportedTo.trim().toLowerCase());
      if (match) setReportedToEmployeeId(match.id);
    }
  }, [props.open, hrEmployees, reportedByEmployeeId, reportedToEmployeeId, reportedBy, reportedTo]);

  useEffect(() => {
    if (!props.open || isHydratingDraftRef.current) return;
    const draftPayload = {
      module,
      incidentTypeSelections,
      incidentTypeOther,
      category,
      subcategory,
      subcategoryManual,
      useManualSubcategory,
      title,
      briefDescription,
      occurredAtInput,
      location,
      natureOfIncident,
      causeOfIncident,
      affectedPersonId,
      affectedPersonName,
      affectedPersons,
      reportedBy,
      reportedTo,
      reportedByEmployeeId,
      reportedToEmployeeId,
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
      correctiveActionDrafts
    };
    localStorage.setItem(draftStorageKey, JSON.stringify(draftPayload));
  }, [
    props.open,
    draftStorageKey,
    module,
    incidentTypeSelections,
    incidentTypeOther,
    category,
    subcategory,
    subcategoryManual,
    useManualSubcategory,
    title,
    briefDescription,
    occurredAtInput,
    location,
    natureOfIncident,
    causeOfIncident,
    affectedPersonId,
    affectedPersonName,
    affectedPersons,
    reportedBy,
    reportedTo,
    reportedByEmployeeId,
    reportedToEmployeeId,
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
    correctiveActionDrafts
  ]);

  const hasUnsavedChanges = useMemo(() => {
    if (loading) return false;
    return Boolean(
      title.trim() ||
      briefDescription.trim() ||
      finalIncidentType ||
      finalSubcategory ||
      location.trim() ||
      natureOfIncident.trim() ||
      causeOfIncident.trim() ||
      reportedBy.trim() ||
      reportedTo.trim() ||
      copyTo.trim() ||
      actualOutcome.trim() ||
      potentialConsequence.trim() ||
      contributingFactors.trim() ||
      lessonsLearned.trim() ||
      conclusion.trim() ||
      lossOther.trim() ||
      lossNotes.trim() ||
      affectedPersons.some((entry) => entry.personName.trim() || entry.role.trim() || entry.department.trim() || entry.injuryType.trim() || entry.contactDetails.trim()) ||
      correctiveActionDrafts.length > 0 ||
      incidentTimelineEvents.length > 0 ||
      evidenceUploads.length > 0 ||
      investigationUploads.length > 0
    );
  }, [
    loading,
    title,
    briefDescription,
    finalIncidentType,
    finalSubcategory,
    location,
    natureOfIncident,
    causeOfIncident,
    reportedBy,
    reportedTo,
    copyTo,
    actualOutcome,
    potentialConsequence,
    contributingFactors,
    lessonsLearned,
    conclusion,
    lossOther,
    lossNotes,
    affectedPersons,
    correctiveActionDrafts.length,
    incidentTimelineEvents.length,
    evidenceUploads.length,
    investigationUploads.length
  ]);

  function requestClose() {
    if (!hasUnsavedChanges) {
      props.onClose();
      return;
    }
    const shouldClose = window.confirm('You have unsaved changes. Close the form? Your draft will be kept and restored next time.');
    if (shouldClose) {
      props.onClose();
    }
  }

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
      const safeName = entry.file.name.replace(/\s+/g, '_');
      const key = `${props.companyId}/${entityType}/${incidentId}/${Date.now()}-${safeName}`;
      const uploaded = await uploadFile(EVIDENCE_BUCKET, entry.file, { key });
      await createEvidence({
        companyId: props.companyId,
        entityType,
        entityId: incidentId,
        storageBucket: uploaded.bucket,
        storageKey: uploaded.key,
        createdByUserId: props.createdByUserId,
        originalFilename: entry.file.name,
        displayTitle: (entry.displayName || entry.file.name).trim(),
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
    if (!riskLikelihood || !riskSeverity || !calculatedRisk || !calculatedRiskCategory) {
      setError('Severity and likelihood are required to calculate risk rating.');
      return;
    }
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

      if (isEditing && editingIncident) {
        const updated = await updateIncident(editingIncident.id, {
          module,
          category,
          subcategory: finalSubcategory,
          title: incidentTitle,
          description: briefDescription.trim() || null,
          incidentType: incidentTypeValue || null,
          projectClient: incidentTitle || null,
          natureOfIncident: natureOfIncident.trim() || null,
          causeOfIncident: causeOfIncident.trim() || null,
          affectedPerson: affectedPersonValue || null,
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
            reportedByEmployeeId: reportedByEmployeeId ?? null,
            reportedToEmployeeId: reportedToEmployeeId ?? null
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
      } else {
        const incident = await createIncident({
          companyId: props.companyId,
          module,
          category,
          subcategory: finalSubcategory,
          title: incidentTitle,
          description: briefDescription.trim() || undefined,
          incidentType: incidentTypeValue || undefined,
          projectClient: incidentTitle || undefined,
          natureOfIncident: natureOfIncident.trim(),
          causeOfIncident: causeOfIncident.trim(),
          affectedPerson: affectedPersonValue || undefined,
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
            reportedByEmployeeId: reportedByEmployeeId ?? null,
            reportedToEmployeeId: reportedToEmployeeId ?? null
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
      }
      localStorage.removeItem(draftStorageKey);
      sessionStorage.setItem('incidents.flash.success', 'Incident saved successfully.');
      setSaveSuccessMessage('Incident saved successfully.');
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
              <div key={entry.id} className="rounded-lg border border-surface-200 p-3 bg-surface-50">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 mt-1">
                    {entry.kind === 'image' ? <ImageIcon className="w-4 h-4 text-teal" /> : <FileTextIcon className="w-4 h-4 text-charcoal-500" />}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <p className="text-xs text-charcoal-500 truncate">Original: {entry.file.name}</p>
                    <input
                      value={entry.displayName}
                      onChange={(e) => renameUpload(entry.id, e.target.value, section)}
                      placeholder="Display name"
                      className="w-full px-3 py-2 text-sm border border-surface-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal"
                    />
                    {entry.previewUrl && (
                      <img src={entry.previewUrl} alt={entry.displayName || entry.file.name} className="w-24 h-24 object-cover rounded-lg border border-surface-200" />
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
                        download={entry.displayName || entry.file.name}
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
      <div className="absolute inset-0 bg-black/45" />
      <div className="relative w-full max-w-6xl bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-3rem)] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-surface-200 px-5 py-4 flex items-center justify-between z-10">
          <div>
            <p className="text-sm font-semibold text-charcoal">{isEditing ? 'Edit Incident (Updated Form)' : 'Updated Incident Form'}</p>
            <p className="text-xs text-charcoal-500 mt-0.5">Likelihood and severity use 1-5 scale. Risk is auto-calculated.</p>
          </div>
          <button type="button" onClick={requestClose} className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-500">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-6">
          {saveSuccessMessage && (
            <div className="bg-success/10 border border-success/30 rounded-xl p-3">
              <p className="text-sm font-semibold text-success">{saveSuccessMessage}</p>
            </div>
          )}
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-critical">Could not create incident</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Project / Client *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
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
              <label className="block text-sm font-medium text-charcoal mb-1.5">Category *</label>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value as IncidentCategory);
                  setSubcategory('');
                  setSubcategoryManual('');
                  setUseManualSubcategory(false);
                }}
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              >
                {INCIDENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
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
                      setSubcategory(e.target.value);
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
                          onChange={(personId, personName) => {
                            if (index === 0) {
                              setAffectedPersonId(personId);
                              setAffectedPersonName(personName ?? '');
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
            <div className="md:col-span-2 rounded-xl border border-surface-200 bg-surface-50/50 p-4 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-charcoal">Risk Rating</h3>
                <p className="text-xs text-charcoal-500 mt-0.5">Severity x Likelihood = Risk Rating</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-charcoal mb-1">Likelihood (1-5) *</label>
                  <select
                    value={riskLikelihood === '' ? '' : String(riskLikelihood)}
                    onChange={(e) => {
                      if (!e.target.value) {
                        setRiskLikelihood('');
                        return;
                      }
                      setRiskLikelihood(Math.max(1, Math.min(5, Number(e.target.value) || 1)) as 1 | 2 | 3 | 4 | 5);
                    }}
                    className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                    required
                  >
                    <option value="">Select likelihood</option>
                    <option value="1">1 - Rare</option>
                    <option value="2">2 - Unlikely</option>
                    <option value="3">3 - Possible</option>
                    <option value="4">4 - Likely</option>
                    <option value="5">5 - Almost Certain</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-charcoal mb-1">Severity (1-5) *</label>
                  <select
                    value={riskSeverity === '' ? '' : String(riskSeverity)}
                    onChange={(e) => {
                      if (!e.target.value) {
                        setRiskSeverity('');
                        return;
                      }
                      setRiskSeverity(Math.max(1, Math.min(5, Number(e.target.value) || 1)) as 1 | 2 | 3 | 4 | 5);
                    }}
                    className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                    required
                  >
                    <option value="">Select severity</option>
                    <option value="1">1 - Negligible</option>
                    <option value="2">2 - Minor Injury</option>
                    <option value="3">3 - Major Injury</option>
                    <option value="4">4 - Fatality</option>
                    <option value="5">5 - Multiple Fatality</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-charcoal mb-1">Calculated risk</label>
                  <div className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm bg-white font-semibold text-charcoal">
                    {calculatedRisk ?? '-'}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-charcoal mb-1">Calculated category</label>
                  <div className={`w-full px-3 py-2 border rounded-lg text-sm font-semibold ${riskCategoryTone}`}>
                    {calculatedRiskCategory ?? '-'}
                  </div>
                </div>
              </div>
              <p className="text-xs text-charcoal-500">1-5 Low (Green), 6-12 Medium (Yellow), 13-25 High (Red)</p>
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
              <select
                value={reportedByEmployeeId ?? ''}
                onChange={(e) => {
                  const selectedId = (e.target.value || null) as UUID | null;
                  setReportedByEmployeeId(selectedId);
                  const match = hrEmployees.find((row) => row.id === selectedId);
                  setReportedBy(match ? buildEmployeeName(match) : '');
                }}
                disabled={hrEmployeesLoading}
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:bg-surface-100"
                required
              >
                <option value="">{hrEmployeesLoading ? 'Loading employees...' : 'Select employee'}</option>
                {hrEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.employee_no ? `${employee.employee_no} - ${buildEmployeeName(employee)}` : buildEmployeeName(employee)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Reported to *</label>
              <select
                value={reportedToEmployeeId ?? ''}
                onChange={(e) => {
                  const selectedId = (e.target.value || null) as UUID | null;
                  setReportedToEmployeeId(selectedId);
                  const match = hrEmployees.find((row) => row.id === selectedId);
                  setReportedTo(match ? buildEmployeeName(match) : '');
                }}
                disabled={hrEmployeesLoading}
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:bg-surface-100"
                required
              >
                <option value="">{hrEmployeesLoading ? 'Loading employees...' : 'Select employee'}</option>
                {hrEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.employee_no ? `${employee.employee_no} - ${buildEmployeeName(employee)}` : buildEmployeeName(employee)}
                  </option>
                ))}
              </select>
            </div>
            {hrEmployeesError && (
              <div className="md:col-span-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2">
                <p className="text-xs text-charcoal">
                  Could not load employee names. {hrEmployeesError.message}
                </p>
                <button
                  type="button"
                  onClick={retryHrEmployees}
                  className="mt-1 text-xs font-medium text-teal hover:text-teal-700"
                >
                  Retry loading employees
                </button>
              </div>
            )}
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
            {(investigationRequired || Number(riskSeverity || 0) >= 4) && (
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-charcoal">Consequence & Outcome</summary>
                <div className="pt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
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

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-200">
            <button
              type="button"
              onClick={requestClose}
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
              {isEditing ? 'Save changes' : 'Save incident'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
