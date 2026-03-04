import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { XIcon, FileTextIcon, ImageIcon, Trash2Icon, ExternalLinkIcon, DownloadIcon, ChevronDownIcon } from 'lucide-react';
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
import { createEvidence } from '../../api/services/evidenceService';
import { uploadFile } from '../../api/services/storageService';
import { AffectedPersonSelector } from './AffectedPersonSelector';
import { IncidentTimelineBuilder, type TimelineEvent } from './IncidentTimelineBuilder';

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

type ManualImmediateCauseEntry = {
  category: string;
  subcategory: string;
  explanation: string;
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
  | 'rootCauseHuman'
  | 'rootCauseWorkplace'
  | 'systemFailure'
  | 'contributingFactors'
  | 'correctiveActions'
  | 'lessonsLearnt';

function emptyInvestigationSectionSelection(): Record<InvestigationSectionKey, boolean> {
  return {
    immediateCauses: false,
    rootCauseHuman: false,
    rootCauseWorkplace: false,
    systemFailure: false,
    contributingFactors: false,
    correctiveActions: false,
    lessonsLearnt: false
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

  const [reportedBy, setReportedBy] = useState('');
  const [reportedTo, setReportedTo] = useState('');
  const [copyTo, setCopyTo] = useState('');
  const [riskCategorySimple, setRiskCategorySimple] = useState<'Low' | 'Medium' | 'High'>('Medium');

  const [riskLikelihood, setRiskLikelihood] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [riskSeverity, setRiskSeverity] = useState<1 | 2 | 3 | 4 | 5>(3);

  const [investigationRequired, setInvestigationRequired] = useState(false);
  const [generateNcr, setGenerateNcr] = useState(false);
  const [immediateCauseFlags, setImmediateCauseFlags] = useState({
    unsafeAct: false,
    unsafeCondition: false,
    equipmentIssue: false,
    otherImmediateCause: false
  });
  const [equipmentIssueExplanation, setEquipmentIssueExplanation] = useState('');
  const [otherImmediateCauseExplanation, setOtherImmediateCauseExplanation] = useState('');
  const [actualOutcome, setActualOutcome] = useState('');

  const [lossProduction, setLossProduction] = useState('');
  const [lossFinancial, setLossFinancial] = useState('');
  const [lossReputational, setLossReputational] = useState('');
  const [lossDamageAsset, setLossDamageAsset] = useState('');
  const [lossIllnessInjury, setLossIllnessInjury] = useState('');
  const [lossIllness, setLossIllness] = useState('');
  const [lossInjury, setLossInjury] = useState('');
  const [lossCivilLiability, setLossCivilLiability] = useState('');
  const [lossCriminalLiability, setLossCriminalLiability] = useState('');
  const [lossVicariousLiability, setLossVicariousLiability] = useState('');
  const [lossSubstandardQuality, setLossSubstandardQuality] = useState('');
  const [lossOther, setLossOther] = useState('');
  const [lossNotes, setLossNotes] = useState('');
  const [lossTypes, setLossTypes] = useState<Record<string, boolean>>({
    'production loss': false,
    'financial loss': false,
    'reputational loss': false,
    damage: false,
    illness: false,
    injury: false,
    'asset loss': false,
    'civil liability': false,
    'criminal liability': false,
    'vicarious liability': false,
    'sub-standard quality product/service': false
  });

  const [unsafeActs, setUnsafeActs] = useState<Record<string, UnsafeCauseEntry>>({});
  const [unsafeConditions, setUnsafeConditions] = useState<Record<string, UnsafeCauseEntry>>({});
  const [immediateCauseCategories, setImmediateCauseCategories] = useState<Record<string, CauseDetailEntry>>({});
  const [manualImmediateCauseEntries, setManualImmediateCauseEntries] = useState<ManualImmediateCauseEntry[]>([]);
  const [manualImmediateCategoryInput, setManualImmediateCategoryInput] = useState('');
  const [manualImmediateSubcategoryInput, setManualImmediateSubcategoryInput] = useState('');
  const [manualImmediateExplanationInput, setManualImmediateExplanationInput] = useState('');
  const [immediateCauseFreeText, setImmediateCauseFreeText] = useState('');
  const [rootCauseHuman, setRootCauseHuman] = useState<Record<string, CauseDetailEntry>>({});
  const [rootCauseWorkplace, setRootCauseWorkplace] = useState<Record<string, CauseDetailEntry>>({});
  const [systemFailures, setSystemFailures] = useState<Record<string, CauseDetailEntry>>({});
  const [instructionBreakdown, setInstructionBreakdown] = useState('');
  const [taskSequence, setTaskSequence] = useState('');
  const [incidentTimelineEvents, setIncidentTimelineEvents] = useState<TimelineEvent[]>([]);
  const [riskProfile, setRiskProfile] = useState('');
  const [potentialConsequence, setPotentialConsequence] = useState('');
  const [contributingFactors, setContributingFactors] = useState('');
  const [lessonsLearnt, setLessonsLearnt] = useState('');
  const [investigationTeam, setInvestigationTeam] = useState('');
  const [conclusion, setConclusion] = useState('');
  const [preparedBy, setPreparedBy] = useState('');
  const [distributionList, setDistributionList] = useState('');
  const [investigationSections, setInvestigationSections] = useState<Record<InvestigationSectionKey, boolean>>(emptyInvestigationSectionSelection);

  const [evidenceUploads, setEvidenceUploads] = useState<UploadDraft[]>([]);
  const [investigationUploads, setInvestigationUploads] = useState<UploadDraft[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const calculatedRisk = riskLikelihood * riskSeverity;
  const calculatedRiskCategory = useMemo(() => getIncidentRiskCategory(calculatedRisk), [calculatedRisk]);
  const manualImmediateSubcategoryOptions = useMemo(() => {
    const key = manualImmediateCategoryInput.trim() as keyof typeof IMMEDIATE_CAUSES_UNSAFE_ACTS_GROUPS;
    const list = IMMEDIATE_CAUSES_UNSAFE_ACTS_GROUPS[key];
    return Array.isArray(list) ? Array.from(list) : [];
  }, [manualImmediateCategoryInput]);

  const canSubmit = useMemo(() => {
    return (
      title.trim().length > 0 &&
      briefDescription.trim().length > 0 &&
      finalIncidentType.length > 0 &&
      finalSubcategory.length > 0 &&
      natureOfIncident.trim().length > 0 &&
      causeOfIncident.trim().length > 0 &&
      reportedBy.trim().length > 0 &&
      reportedTo.trim().length > 0
    );
  }, [title, briefDescription, finalIncidentType, finalSubcategory, natureOfIncident, causeOfIncident, reportedBy, reportedTo]);

  function parseOptionalNumber(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

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
    setReportedBy('');
    setReportedTo('');
    setCopyTo('');
    setRiskCategorySimple('Medium');
    setRiskLikelihood(3);
    setRiskSeverity(3);
    setInvestigationRequired(false);
    setGenerateNcr(false);
    setImmediateCauseFlags({
      unsafeAct: false,
      unsafeCondition: false,
      equipmentIssue: false,
      otherImmediateCause: false
    });
    setEquipmentIssueExplanation('');
    setOtherImmediateCauseExplanation('');
    setActualOutcome('');
    setLossProduction('');
    setLossFinancial('');
    setLossReputational('');
    setLossDamageAsset('');
    setLossIllnessInjury('');
    setLossIllness('');
    setLossInjury('');
    setLossCivilLiability('');
    setLossCriminalLiability('');
    setLossVicariousLiability('');
    setLossSubstandardQuality('');
    setLossOther('');
    setLossNotes('');
    setLossTypes({
      'production loss': false,
      'financial loss': false,
      'reputational loss': false,
      damage: false,
      illness: false,
      injury: false,
      'asset loss': false,
      'civil liability': false,
      'criminal liability': false,
      'vicarious liability': false,
      'sub-standard quality product/service': false
    });
    setUnsafeActs({});
    setUnsafeConditions({});
    setImmediateCauseCategories({});
    setManualImmediateCauseEntries([]);
    setManualImmediateCategoryInput('');
    setManualImmediateSubcategoryInput('');
    setManualImmediateExplanationInput('');
    setImmediateCauseFreeText('');
    setRootCauseHuman({});
    setRootCauseWorkplace({});
    setSystemFailures({});
    setInstructionBreakdown('');
    setTaskSequence('');
    setIncidentTimelineEvents([]);
    setRiskProfile('');
    setPotentialConsequence('');
    setContributingFactors('');
    setLessonsLearnt('');
    setInvestigationTeam('');
    setConclusion('');
    setPreparedBy('');
    setDistributionList('');
    setInvestigationSections(emptyInvestigationSectionSelection());
    setEvidenceUploads([]);
    setInvestigationUploads([]);
    setError(null);
  }

  useEffect(() => {
    if (!props.open) return;
    if (!editingIncident) {
      resetForm();
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
    setReportedBy((editingIncident as any).reported_by ?? '');
    setReportedTo((editingIncident as any).reported_to ?? '');
    setCopyTo(Array.isArray((editingIncident as any).copy_to_emails) ? (editingIncident as any).copy_to_emails.join(', ') : '');
    setRiskCategorySimple(((editingIncident as any).risk_category ?? 'Medium') as 'Low' | 'Medium' | 'High');
    setRiskLikelihood(Math.max(1, Math.min(5, Number((editingIncident as any).risk_likelihood_1_5 ?? 3))) as 1 | 2 | 3 | 4 | 5);
    setRiskSeverity(Math.max(1, Math.min(5, Number((editingIncident as any).risk_severity_1_5 ?? 3))) as 1 | 2 | 3 | 4 | 5);
    setInvestigationRequired(Boolean((editingIncident as any).investigation_required));
    setGenerateNcr(false);
    setLossProduction((editingIncident as any).loss_production_value != null ? String((editingIncident as any).loss_production_value) : '');
    setLossFinancial((editingIncident as any).loss_financial_value != null ? String((editingIncident as any).loss_financial_value) : '');
    setLossReputational((editingIncident as any).loss_reputational_value != null ? String((editingIncident as any).loss_reputational_value) : '');
    setLossDamageAsset((editingIncident as any).loss_damage_asset_value != null ? String((editingIncident as any).loss_damage_asset_value) : '');
    setLossIllnessInjury((editingIncident as any).loss_illness_injury_value != null ? String((editingIncident as any).loss_illness_injury_value) : '');
    setLossIllness((editingIncident as any).loss_illness_value != null ? String((editingIncident as any).loss_illness_value) : '');
    setLossInjury((editingIncident as any).loss_injury_value != null ? String((editingIncident as any).loss_injury_value) : '');
    setLossCivilLiability((editingIncident as any).loss_civil_liability_value != null ? String((editingIncident as any).loss_civil_liability_value) : '');
    setLossCriminalLiability((editingIncident as any).loss_criminal_liability_value != null ? String((editingIncident as any).loss_criminal_liability_value) : '');
    setLossVicariousLiability((editingIncident as any).loss_vicarious_liability_value != null ? String((editingIncident as any).loss_vicarious_liability_value) : '');
    setLossSubstandardQuality((editingIncident as any).loss_substandard_quality_value != null ? String((editingIncident as any).loss_substandard_quality_value) : '');
    setLossOther((editingIncident as any).loss_other_text ?? '');
    setLossNotes((editingIncident as any).loss_notes ?? '');
    const selectedLossTypes = Array.isArray((editingIncident as any).loss_types) ? (editingIncident as any).loss_types : [];
    setLossTypes({
      'production loss': selectedLossTypes.includes('production loss'),
      'financial loss': selectedLossTypes.includes('financial loss'),
      'reputational loss': selectedLossTypes.includes('reputational loss'),
      damage: selectedLossTypes.includes('damage'),
      illness: selectedLossTypes.includes('illness'),
      injury: selectedLossTypes.includes('injury'),
      'asset loss': selectedLossTypes.includes('asset loss'),
      'civil liability': selectedLossTypes.includes('civil liability'),
      'criminal liability': selectedLossTypes.includes('criminal liability'),
      'vicarious liability': selectedLossTypes.includes('vicarious liability'),
      'sub-standard quality product/service': selectedLossTypes.includes('sub-standard quality product/service')
    });

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
    setImmediateCauseCategories({});
    setManualImmediateCauseEntries([]);
    setManualImmediateCategoryInput('');
    setManualImmediateSubcategoryInput('');
    setManualImmediateExplanationInput('');
    setImmediateCauseFreeText('');
    setRootCauseHuman({});
    setRootCauseWorkplace({});
    setSystemFailures({});
    setInstructionBreakdown('');
    setTaskSequence('');
    setIncidentTimelineEvents([]);
    setRiskProfile('');
    setPotentialConsequence('');
    setContributingFactors('');
    setLessonsLearnt('');
    setInvestigationTeam('');
    setConclusion('');
    setPreparedBy('');
    setDistributionList('');
    setInvestigationSections({
      ...emptyInvestigationSectionSelection(),
      immediateCauses: Object.keys(mappedUnsafeActs).length > 0 || Object.keys(mappedUnsafeConditions).length > 0
    });
    setImmediateCauseFlags({
      unsafeAct: Object.keys(mappedUnsafeActs).length > 0,
      unsafeCondition: Object.keys(mappedUnsafeConditions).length > 0,
      equipmentIssue: false,
      otherImmediateCause: false
    });
    setEquipmentIssueExplanation('');
    setOtherImmediateCauseExplanation('');
    setActualOutcome(String((editingIncident as any)?.metadata?.actualOutcome ?? ''));
    setEvidenceUploads([]);
    setInvestigationUploads([]);
    setError(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, editingIncident?.id]);

  useEffect(() => {
    if (!props.open || !editingIncident?.id) return;
    (async () => {
      try {
        const inv = await getIncidentInvestigation(props.companyId, editingIncident.id);
        if (!inv) return;
        setInstructionBreakdown(inv.instruction_breakdown ?? '');
        setTaskSequence(inv.task_sequence ?? '');
        setRiskProfile(inv.risk_profile ?? '');
        setPotentialConsequence(inv.potential_consequence ?? '');
        setContributingFactors(inv.contributing_factors ?? '');
        setLessonsLearnt(inv.lessons_learnt ?? '');
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
        if (Array.isArray(inv.immediate_causes)) {
          const next: Record<string, CauseDetailEntry> = {};
          const manual: ManualImmediateCauseEntry[] = [];
          const freeText: string[] = [];
          for (const entry of inv.immediate_causes as any[]) {
            if (typeof entry === 'string') {
              const text = entry.trim();
              if (text) freeText.push(text);
              continue;
            }
            const group = String(entry?.group ?? entry?.category ?? '').trim();
            const item = String(entry?.item ?? entry?.subcategory ?? '').trim();
            const note = String(entry?.note ?? entry?.explanation ?? '').trim();
            if (!note) continue;
            if (!group || !item) {
              freeText.push(note);
              continue;
            }
            if (group === 'Manual' || group === 'Immediate Cause') {
              manual.push({ category: group, subcategory: item, explanation: note });
              continue;
            }
            next[makeCauseKey(group, item)] = { group, item, note };
          }
          setImmediateCauseCategories(next);
          setManualImmediateCauseEntries(manual);
          setImmediateCauseFreeText(freeText.join('\n'));
        }
        setInvestigationSections(emptyInvestigationSectionSelection());
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

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
      const selectedLossTypes = Object.entries(lossTypes)
        .filter(([, selected]) => selected)
        .map(([type]) => type);
      const incidentTitle = title.trim();
      const affectedPersonValue = affectedPersonName.trim() || undefined;
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
          lossProductionValue: parseOptionalNumber(lossProduction),
          lossFinancialValue: parseOptionalNumber(lossFinancial),
          lossReputationalValue: parseOptionalNumber(lossReputational),
          lossDamageAssetValue: parseOptionalNumber(lossDamageAsset),
          lossIllnessInjuryValue: parseOptionalNumber(lossIllnessInjury),
          lossIllnessValue: parseOptionalNumber(lossIllness),
          lossInjuryValue: parseOptionalNumber(lossInjury),
          lossCivilLiabilityValue: parseOptionalNumber(lossCivilLiability),
          lossCriminalLiabilityValue: parseOptionalNumber(lossCriminalLiability),
          lossVicariousLiabilityValue: parseOptionalNumber(lossVicariousLiability),
          lossSubstandardQualityValue: parseOptionalNumber(lossSubstandardQuality),
          lossTypes: selectedLossTypes.length > 0 ? selectedLossTypes : null,
          lossOtherText: lossOther.trim() || null,
          lossNotes: lossNotes.trim() || null,
          riskSeverity1To5: riskSeverity,
          riskLikelihood1To5: riskLikelihood,
          riskRatingProduct: calculatedRisk,
          riskClassification: calculatedRiskCategory,
          riskCategorySimple,
          severity: toLegacySeverity(riskSeverity),
          occurredAt,
          location: location.trim() || null
        } as any);
        await uploadEvidenceForIncident(updated.id, evidenceUploads, 'incident');
        await uploadEvidenceForIncident(updated.id, investigationUploads, 'incident_investigation');
        if (investigationRequired) {
          await upsertIncidentInvestigation({
            companyId: props.companyId,
            incidentId: updated.id,
            actorUserId: props.createdByUserId,
            patch: {
              notes: actualOutcome.trim() ? `Actual outcome: ${actualOutcome.trim()}` : null,
              instruction_breakdown: instructionBreakdown.trim() || null,
              task_sequence: taskSequence.trim() || null,
              event_timeline: incidentTimelineEvents
                .map((event) => `${event.timestamp} - ${event.notes}`.trim())
                .join('\n') || null,
              risk: `${riskLikelihood} x ${riskSeverity} = ${calculatedRisk}`.trim(),
              risk_profile: riskProfile.trim() || null,
              potential_consequence: potentialConsequence.trim() || null,
              immediate_causes: [
                ...Object.values(immediateCauseCategories),
                ...manualImmediateCauseEntries.map((entry) => ({
                  group: entry.category || 'Immediate Cause',
                  item: entry.subcategory || 'Manual',
                  note: entry.explanation
                })),
                ...(immediateCauseFreeText.trim()
                  ? [{ group: 'Immediate Cause', item: 'Manual', note: immediateCauseFreeText.trim() }]
                  : [])
              ],
              root_causes_human: Object.values(rootCauseHuman),
              root_causes_workplace: Object.values(rootCauseWorkplace),
              system_failures: Object.values(systemFailures),
              contributing_factors: [contributingFactors.trim(), equipmentIssueExplanation.trim(), otherImmediateCauseExplanation.trim()].filter(Boolean).join('\n') || null,
              lessons_learnt: lessonsLearnt.trim() || null,
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
            productionLoss: parseOptionalNumber(lossProduction),
            financialLoss: parseOptionalNumber(lossFinancial),
            reputationalLoss: parseOptionalNumber(lossReputational),
            damageAssetLoss: parseOptionalNumber(lossDamageAsset),
            illnessInjuryImpact: parseOptionalNumber(lossIllnessInjury),
            illnessLoss: parseOptionalNumber(lossIllness),
            injuryLoss: parseOptionalNumber(lossInjury),
            civilLiabilityLoss: parseOptionalNumber(lossCivilLiability),
            criminalLiabilityLoss: parseOptionalNumber(lossCriminalLiability),
            vicariousLiabilityLoss: parseOptionalNumber(lossVicariousLiability),
            substandardQualityLoss: parseOptionalNumber(lossSubstandardQuality),
            types: selectedLossTypes,
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
          autoGenerateNcr: generateNcr
        });

        await uploadEvidenceForIncident(incident.id, evidenceUploads, 'incident');
        await uploadEvidenceForIncident(incident.id, investigationUploads, 'incident_investigation');
        if (investigationRequired) {
          await upsertIncidentInvestigation({
            companyId: props.companyId,
            incidentId: incident.id,
            actorUserId: props.createdByUserId,
            patch: {
              notes: actualOutcome.trim() ? `Actual outcome: ${actualOutcome.trim()}` : null,
              instruction_breakdown: instructionBreakdown.trim() || null,
              task_sequence: taskSequence.trim() || null,
              event_timeline: incidentTimelineEvents
                .map((event) => `${event.timestamp} - ${event.notes}`.trim())
                .join('\n') || null,
              risk: `${riskLikelihood} x ${riskSeverity} = ${calculatedRisk}`.trim(),
              risk_profile: riskProfile.trim() || null,
              potential_consequence: potentialConsequence.trim() || null,
              immediate_causes: [
                ...Object.values(immediateCauseCategories),
                ...manualImmediateCauseEntries.map((entry) => ({
                  group: entry.category || 'Immediate Cause',
                  item: entry.subcategory || 'Manual',
                  note: entry.explanation
                })),
                ...(immediateCauseFreeText.trim()
                  ? [{ group: 'Immediate Cause', item: 'Manual', note: immediateCauseFreeText.trim() }]
                  : [])
              ],
              root_causes_human: Object.values(rootCauseHuman),
              root_causes_workplace: Object.values(rootCauseWorkplace),
              system_failures: Object.values(systemFailures),
              contributing_factors: [contributingFactors.trim(), equipmentIssueExplanation.trim(), otherImmediateCauseExplanation.trim()].filter(Boolean).join('\n') || null,
              lessons_learnt: lessonsLearnt.trim() || null,
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
      props.onClose();
      resetForm();
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  function setInvestigationSection(section: InvestigationSectionKey, selected?: boolean) {
    setInvestigationSections((prev) => ({ ...prev, [section]: selected ?? !prev[section] }));
  }

  function addManualImmediateCause() {
    const explanation = manualImmediateExplanationInput.trim();
    if (!explanation) return;
    setManualImmediateCauseEntries((prev) => [
      ...prev,
      {
        category: manualImmediateCategoryInput.trim() || 'Immediate Cause',
        subcategory: manualImmediateSubcategoryInput.trim() || 'Manual',
        explanation
      }
    ]);
    setManualImmediateCategoryInput('');
    setManualImmediateSubcategoryInput('');
    setManualImmediateExplanationInput('');
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
                    <input
                      type="file"
                      multiple
                      disabled={!isSelected}
                      onChange={(e) => addUploads(e.target.files, 'investigation', `${groupName}: ${item}`)}
                      className="w-full text-xs disabled:opacity-60"
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
    const expanded = Boolean(investigationSections[section]);
    return (
      <div className="rounded-xl border border-surface-200 p-4 transition-all duration-200">
        <button
          type="button"
          onClick={() => setInvestigationSection(section, !expanded)}
          className="w-full flex items-center justify-between gap-2 text-left"
        >
          <h4 className="text-sm font-semibold text-charcoal">{titleText}</h4>
          <ChevronDownIcon className={`w-4 h-4 text-charcoal-500 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
        </button>
        <div className={`grid transition-all duration-200 ${expanded ? 'grid-rows-[1fr] opacity-100 mt-3' : 'grid-rows-[0fr] opacity-0 mt-0'}`}>
          <div className="overflow-hidden">{children}</div>
        </div>
      </div>
    );
  }

  if (!props.open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto p-3 pt-16 sm:p-6 sm:pt-20">
      <div className="absolute inset-0 bg-black/45" onClick={props.onClose} />
      <div className="relative w-full max-w-6xl bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-3rem)] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-surface-200 px-5 py-4 flex items-center justify-between z-10">
          <div>
            <p className="text-sm font-semibold text-charcoal">{isEditing ? 'Edit Incident (Updated Form)' : 'Updated Incident Form'}</p>
            <p className="text-xs text-charcoal-500 mt-0.5">Likelihood and severity use 1-5 scale. Risk is auto-calculated.</p>
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
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Affected person</label>
              <AffectedPersonSelector
                companyId={props.companyId}
                selectedPersonId={affectedPersonId}
                selectedPersonName={affectedPersonName}
                onChange={(personId, personName) => {
                  setAffectedPersonId(personId);
                  setAffectedPersonName(personName ?? '');
                }}
              />
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {Object.keys(lossTypes).map((type) => (
                <label key={type} className="flex items-center gap-2 text-sm text-charcoal">
                  <input
                    type="checkbox"
                    checked={lossTypes[type]}
                    onChange={(e) => setLossTypes((prev) => ({ ...prev, [type]: e.target.checked }))}
                    className="w-4 h-4 text-teal border-surface-300 rounded focus:ring-teal"
                  />
                  <span className="capitalize">{type}</span>
                </label>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Production loss</label>
                <input value={lossProduction} onChange={(e) => setLossProduction(e.target.value)} type="number" step="0.01" className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal" />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Financial loss</label>
                <input value={lossFinancial} onChange={(e) => setLossFinancial(e.target.value)} type="number" step="0.01" className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal" />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Reputational loss</label>
                <input value={lossReputational} onChange={(e) => setLossReputational(e.target.value)} type="number" step="0.01" className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal" />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Damage / asset loss</label>
                <input value={lossDamageAsset} onChange={(e) => setLossDamageAsset(e.target.value)} type="number" step="0.01" className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal" />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Illness/injury impact</label>
                <input value={lossIllnessInjury} onChange={(e) => setLossIllnessInjury(e.target.value)} type="number" step="0.01" className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal" />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Illness</label>
                <input value={lossIllness} onChange={(e) => setLossIllness(e.target.value)} type="number" step="0.01" className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal" />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Injury</label>
                <input value={lossInjury} onChange={(e) => setLossInjury(e.target.value)} type="number" step="0.01" className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal" />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Civil liability</label>
                <input value={lossCivilLiability} onChange={(e) => setLossCivilLiability(e.target.value)} type="number" step="0.01" className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal" />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Criminal liability</label>
                <input value={lossCriminalLiability} onChange={(e) => setLossCriminalLiability(e.target.value)} type="number" step="0.01" className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal" />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Vicarious liability</label>
                <input value={lossVicariousLiability} onChange={(e) => setLossVicariousLiability(e.target.value)} type="number" step="0.01" className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal" />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Sub-standard quality product/service</label>
                <input value={lossSubstandardQuality} onChange={(e) => setLossSubstandardQuality(e.target.value)} type="number" step="0.01" className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal" />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Other loss</label>
                <input value={lossOther} onChange={(e) => setLossOther(e.target.value)} className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-charcoal mb-1.5">Loss notes</label>
                <textarea value={lossNotes} onChange={(e) => setLossNotes(e.target.value)} rows={3} className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal" />
              </div>
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
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Likelihood x Severity = Risk Score</label>
                    <div className="w-full px-4 py-2.5 rounded-lg border border-surface-300 text-sm bg-surface-50">{riskLikelihood} x {riskSeverity} = {calculatedRisk}</div>
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
                  <p className="text-sm font-semibold text-charcoal">Immediate cause triggers</p>
                  <p className="text-xs text-charcoal-500 mt-0.5">Select only relevant triggers. Detailed fields will only appear for selected triggers.</p>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 text-sm text-charcoal"><input type="checkbox" checked={immediateCauseFlags.unsafeAct} onChange={(e) => { setImmediateCauseFlags((prev) => ({ ...prev, unsafeAct: e.target.checked })); if (e.target.checked) setInvestigationSection('immediateCauses', true); }} className="w-4 h-4 text-teal border-surface-300 rounded focus:ring-teal" />Unsafe Act</label>
                    <label className="flex items-center gap-2 text-sm text-charcoal"><input type="checkbox" checked={immediateCauseFlags.unsafeCondition} onChange={(e) => { setImmediateCauseFlags((prev) => ({ ...prev, unsafeCondition: e.target.checked })); if (e.target.checked) setInvestigationSection('immediateCauses', true); }} className="w-4 h-4 text-teal border-surface-300 rounded focus:ring-teal" />Unsafe Condition</label>
                    <label className="flex items-center gap-2 text-sm text-charcoal"><input type="checkbox" checked={immediateCauseFlags.equipmentIssue} onChange={(e) => { setImmediateCauseFlags((prev) => ({ ...prev, equipmentIssue: e.target.checked })); if (e.target.checked) setInvestigationSection('immediateCauses', true); }} className="w-4 h-4 text-teal border-surface-300 rounded focus:ring-teal" />Equipment Issue</label>
                    <label className="flex items-center gap-2 text-sm text-charcoal"><input type="checkbox" checked={immediateCauseFlags.otherImmediateCause} onChange={(e) => { setImmediateCauseFlags((prev) => ({ ...prev, otherImmediateCause: e.target.checked })); if (e.target.checked) setInvestigationSection('immediateCauses', true); }} className="w-4 h-4 text-teal border-surface-300 rounded focus:ring-teal" />Other Immediate Cause</label>
                  </div>
                </div>
                {renderInvestigationCard(
                  'immediateCauses',
                  'Immediate Causes',
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Instruction breakdown / flow</label>
                      <textarea value={instructionBreakdown} onChange={(e) => setInstructionBreakdown(e.target.value)} rows={3} className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Task sequence</label>
                      <textarea value={taskSequence} onChange={(e) => setTaskSequence(e.target.value)} rows={3} className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal" />
                    </div>
                    <IncidentTimelineBuilder events={incidentTimelineEvents} onChange={setIncidentTimelineEvents} />
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Likelihood (1-5)</label>
                        <input type="number" min={1} max={5} value={riskLikelihood} onChange={(e) => setRiskLikelihood(Math.max(1, Math.min(5, Number(e.target.value || 1))) as 1 | 2 | 3 | 4 | 5)} className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Severity (1-5)</label>
                        <input type="number" min={1} max={5} value={riskSeverity} onChange={(e) => setRiskSeverity(Math.max(1, Math.min(5, Number(e.target.value || 1))) as 1 | 2 | 3 | 4 | 5)} className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Calculated risk</label>
                        <div className="w-full px-4 py-2.5 rounded-lg border border-surface-300 text-sm font-semibold bg-surface-50">{calculatedRisk}</div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Calculated category</label>
                        <div className="w-full px-4 py-2.5 rounded-lg border border-surface-300 text-sm font-semibold bg-surface-50">{calculatedRiskCategory}</div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Risk profile (Hazards)</label>
                      <textarea value={riskProfile} onChange={(e) => setRiskProfile(e.target.value)} rows={2} className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Consequence / Potential consequence</label>
                      <textarea value={potentialConsequence} onChange={(e) => setPotentialConsequence(e.target.value)} rows={2} className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal" />
                    </div>
                    <div className="rounded-lg border border-surface-200 p-3 bg-surface-50 space-y-3">
                      <p className="text-sm font-semibold text-charcoal">Immediate cause explanation (free text)</p>
                      <textarea
                        value={immediateCauseFreeText}
                        onChange={(e) => setImmediateCauseFreeText(e.target.value)}
                        rows={2}
                        placeholder="Describe immediate causes in plain language."
                        className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal bg-white"
                      />
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <input
                          value={manualImmediateCategoryInput}
                          onChange={(e) => setManualImmediateCategoryInput(e.target.value)}
                          list="manual-immediate-parent-options"
                          placeholder="Parent category"
                          className="w-full px-3 py-2 text-sm border border-surface-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal bg-white"
                        />
                        <datalist id="manual-immediate-parent-options">
                          {Object.keys(IMMEDIATE_CAUSES_UNSAFE_ACTS_GROUPS).map((entry) => (
                            <option key={entry} value={entry} />
                          ))}
                        </datalist>
                        <input
                          value={manualImmediateSubcategoryInput}
                          onChange={(e) => setManualImmediateSubcategoryInput(e.target.value)}
                          list="manual-immediate-subcategory-options"
                          placeholder="Subcategory"
                          className="w-full px-3 py-2 text-sm border border-surface-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal bg-white"
                        />
                        <datalist id="manual-immediate-subcategory-options">
                          {manualImmediateSubcategoryOptions.map((entry) => (
                            <option key={entry} value={entry} />
                          ))}
                        </datalist>
                        <input
                          value={manualImmediateExplanationInput}
                          onChange={(e) => setManualImmediateExplanationInput(e.target.value)}
                          placeholder="Explanation"
                          className="w-full px-3 py-2 text-sm border border-surface-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal bg-white"
                        />
                      </div>
                      <div>
                        <button type="button" onClick={addManualImmediateCause} disabled={!manualImmediateExplanationInput.trim()} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal text-white hover:bg-teal-600 disabled:opacity-60">
                          Add immediate cause link
                        </button>
                      </div>
                      <div className="space-y-2">
                        {manualImmediateCauseEntries.length === 0 && <p className="text-xs text-charcoal-500">No manual immediate-cause entries added.</p>}
                        {manualImmediateCauseEntries.map((entry, index) => (
                          <div key={`${entry.category}-${entry.subcategory}-${index}`} className="flex items-start justify-between gap-2 rounded border border-surface-200 p-2 bg-white">
                            <div className="text-xs text-charcoal-600">
                              <p className="font-semibold text-charcoal">{entry.category} / {entry.subcategory}</p>
                              <p>{entry.explanation}</p>
                            </div>
                            <button type="button" onClick={() => setManualImmediateCauseEntries((prev) => prev.filter((_, idx) => idx !== index))} className="text-xs text-critical hover:text-critical-600">
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                    {immediateCauseFlags.unsafeAct && renderCauseGroups('Unsafe Acts (tickbox + explanation)', IMMEDIATE_CAUSES_UNSAFE_ACTS_GROUPS, 'acts', unsafeActs)}
                    {immediateCauseFlags.unsafeCondition && renderCauseGroups('Unsafe Conditions (tickbox + explanation)', IMMEDIATE_CAUSES_UNSAFE_CONDITIONS_GROUPS, 'conditions', unsafeConditions)}
                    {immediateCauseFlags.equipmentIssue && (
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Equipment issue explanation</label>
                        <textarea value={equipmentIssueExplanation} onChange={(e) => setEquipmentIssueExplanation(e.target.value)} rows={2} className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal" />
                      </div>
                    )}
                    {immediateCauseFlags.otherImmediateCause && (
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Other immediate cause explanation</label>
                        <textarea value={otherImmediateCauseExplanation} onChange={(e) => setOtherImmediateCauseExplanation(e.target.value)} rows={2} className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal" />
                      </div>
                    )}
                    {renderDetailedCauseGroups('Additional immediate cause details', IMMEDIATE_CAUSES_UNSAFE_ACTS_GROUPS, immediateCauseCategories, setImmediateCauseCategories)}
                  </div>
                )}

                {renderInvestigationCard(
                  'rootCauseHuman',
                  'Root Cause (Human Factors)',
                  renderDetailedCauseGroups('Root Cause Analysis - Human Factors', ROOT_CAUSE_HUMAN_FACTORS_CATEGORIES, rootCauseHuman, setRootCauseHuman)
                )}

                {renderInvestigationCard(
                  'rootCauseWorkplace',
                  'Root Cause (Workplace Factors)',
                  renderDetailedCauseGroups('Root Cause Analysis - Workplace Factors', ROOT_CAUSE_WORKPLACE_FACTORS_CATEGORIES, rootCauseWorkplace, setRootCauseWorkplace)
                )}

                {renderInvestigationCard(
                  'systemFailure',
                  'System Failure',
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {SYSTEM_FAILURE_OPTIONS.map((option) => {
                      const key = makeCauseKey('System Failure', option);
                      const selected = Boolean(systemFailures[key]);
                      return (
                        <div key={key} className="rounded border border-surface-100 p-2 space-y-2">
                          <label className="flex items-center gap-2 text-sm text-charcoal">
                            <input type="checkbox" checked={selected} onChange={(e) => toggleDetailedCause(setSystemFailures, 'System Failure', option, e.target.checked)} className="w-4 h-4 text-teal border-surface-300 rounded focus:ring-teal" />
                            <span>{option}</span>
                          </label>
                          <input value={systemFailures[key]?.note ?? ''} onChange={(e) => updateDetailedCauseNote(setSystemFailures, key, e.target.value)} disabled={!selected} placeholder="Explanation / notes" className="w-full px-3 py-2 text-sm border border-surface-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal disabled:bg-surface-100 disabled:text-charcoal-400" />
                          <input type="file" multiple disabled={!selected} onChange={(e) => addUploads(e.target.files, 'investigation', `System Failure: ${option}`)} className="w-full text-xs disabled:opacity-60" />
                        </div>
                      );
                    })}
                  </div>
                )}

                {renderInvestigationCard(
                  'contributingFactors',
                  'Contributing Factors',
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Contributing factors</label>
                    <textarea value={contributingFactors} onChange={(e) => setContributingFactors(e.target.value)} rows={3} className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal" />
                  </div>
                )}

                {renderInvestigationCard(
                  'correctiveActions',
                  'Corrective Actions',
                  <div className="space-y-3">
                    <div className="rounded-lg border border-surface-200 bg-surface-50 p-3">
                      <p className="text-sm text-charcoal-700">Use <span className="font-semibold">Create Corrective Action</span> in Incident Details after saving this incident. Actions are linked to Task Manager and tracked for closure.</p>
                    </div>
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
                  'lessonsLearnt',
                  'Lessons Learnt',
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Lessons learnt</label>
                    <textarea value={lessonsLearnt} onChange={(e) => setLessonsLearnt(e.target.value)} rows={3} className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal" />
                  </div>
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
              {isEditing ? 'Save changes' : 'Save incident'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
