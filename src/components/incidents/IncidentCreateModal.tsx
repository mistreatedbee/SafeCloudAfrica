import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { XIcon, FileTextIcon, ImageIcon, Trash2Icon, ExternalLinkIcon, DownloadIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { UUID } from '../../api/models/core';
import type { IncidentCategory, ModuleKey, Severity } from '../../api/models/core';
import {
  INCIDENT_CATEGORIES,
  INCIDENT_SUBCATEGORIES,
  IMMEDIATE_CAUSES_UNSAFE_ACTS_GROUPS,
  IMMEDIATE_CAUSES_UNSAFE_CONDITIONS_GROUPS,
  getIncidentRiskCategory
} from '../../api/models/core';
import type { Incident } from '../../api/models/entities';
import { createIncident, updateIncident } from '../../api/services/incidentsService';
import { createEvidence } from '../../api/services/evidenceService';
import { uploadFile } from '../../api/services/storageService';

const EVIDENCE_BUCKET = 'sca-evidence';

type UnsafeCauseEntry = {
  group: string;
  item: string;
  note: string;
};

type UploadDraft = {
  id: string;
  file: File;
  displayName: string;
  previewUrl: string | null;
  kind: 'image' | 'document';
};

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
  const [incidentType, setIncidentType] = useState('Accident');
  const [category, setCategory] = useState<IncidentCategory>(INCIDENT_CATEGORIES[0]);
  const [subcategory, setSubcategory] = useState('');
  const [subcategoryManual, setSubcategoryManual] = useState('');
  const [useManualSubcategory, setUseManualSubcategory] = useState(false);

  const [title, setTitle] = useState('');
  const [projectClient, setProjectClient] = useState('');
  const [incidentDate, setIncidentDate] = useState(new Date().toISOString().slice(0, 10));
  const [incidentTime, setIncidentTime] = useState(new Date().toTimeString().slice(0, 5));
  const [location, setLocation] = useState('');
  const [natureOfIncident, setNatureOfIncident] = useState('');
  const [causeOfIncident, setCauseOfIncident] = useState('');
  const [affectedPerson, setAffectedPerson] = useState('');

  const [reportedBy, setReportedBy] = useState('');
  const [reportedTo, setReportedTo] = useState('');
  const [copyTo, setCopyTo] = useState('');

  const [riskLikelihood, setRiskLikelihood] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [riskSeverity, setRiskSeverity] = useState<1 | 2 | 3 | 4 | 5>(3);

  const [investigationRequired, setInvestigationRequired] = useState(false);

  const [lossProduction, setLossProduction] = useState('');
  const [lossFinancial, setLossFinancial] = useState('');
  const [lossReputational, setLossReputational] = useState('');
  const [lossDamageAsset, setLossDamageAsset] = useState('');
  const [lossIllnessInjury, setLossIllnessInjury] = useState('');
  const [lossOther, setLossOther] = useState('');
  const [lossNotes, setLossNotes] = useState('');

  const [unsafeActs, setUnsafeActs] = useState<Record<string, UnsafeCauseEntry>>({});
  const [unsafeConditions, setUnsafeConditions] = useState<Record<string, UnsafeCauseEntry>>({});

  const [evidenceUploads, setEvidenceUploads] = useState<UploadDraft[]>([]);
  const [investigationUploads, setInvestigationUploads] = useState<UploadDraft[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableSubcategories = useMemo(() => INCIDENT_SUBCATEGORIES[category] || [], [category]);
  const finalSubcategory = useMemo(
    () => (useManualSubcategory ? subcategoryManual.trim() : subcategory.trim()),
    [useManualSubcategory, subcategory, subcategoryManual]
  );

  const calculatedRisk = riskLikelihood * riskSeverity;
  const calculatedRiskCategory = useMemo(() => getIncidentRiskCategory(calculatedRisk), [calculatedRisk]);

  const canSubmit = useMemo(() => {
    return (
      title.trim().length > 0 &&
      finalSubcategory.length > 0 &&
      natureOfIncident.trim().length > 0 &&
      causeOfIncident.trim().length > 0 &&
      reportedBy.trim().length > 0 &&
      reportedTo.trim().length > 0
    );
  }, [title, finalSubcategory, natureOfIncident, causeOfIncident, reportedBy, reportedTo]);

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
    setIncidentType('Accident');
    setCategory(INCIDENT_CATEGORIES[0]);
    setSubcategory('');
    setSubcategoryManual('');
    setUseManualSubcategory(false);
    setTitle('');
    setProjectClient('');
    setIncidentDate(new Date().toISOString().slice(0, 10));
    setIncidentTime(new Date().toTimeString().slice(0, 5));
    setLocation('');
    setNatureOfIncident('');
    setCauseOfIncident('');
    setAffectedPerson('');
    setReportedBy('');
    setReportedTo('');
    setCopyTo('');
    setRiskLikelihood(3);
    setRiskSeverity(3);
    setInvestigationRequired(false);
    setLossProduction('');
    setLossFinancial('');
    setLossReputational('');
    setLossDamageAsset('');
    setLossIllnessInjury('');
    setLossOther('');
    setLossNotes('');
    setUnsafeActs({});
    setUnsafeConditions({});
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
    const datePart = isValidOccurred ? occurred.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    const timePart = isValidOccurred ? `${String(occurred.getHours()).padStart(2, '0')}:${String(occurred.getMinutes()).padStart(2, '0')}` : '08:00';

    setModule((editingIncident.module as ModuleKey) ?? (props.defaultModule ?? 'safety'));
    setIncidentType((editingIncident as any).incident_type ?? (editingIncident as any).type_of_incident ?? 'Accident');
    setCategory(editingIncident.category ?? INCIDENT_CATEGORIES[0]);
    setSubcategory(editingIncident.subcategory ?? '');
    setSubcategoryManual('');
    setUseManualSubcategory(false);
    setTitle(editingIncident.title ?? '');
    setProjectClient((editingIncident as any).project_client ?? '');
    setIncidentDate(datePart);
    setIncidentTime(timePart);
    setLocation(editingIncident.location ?? '');
    setNatureOfIncident((editingIncident as any).nature_of_incident ?? '');
    setCauseOfIncident((editingIncident as any).cause_of_incident ?? (editingIncident as any).cause ?? '');
    setAffectedPerson((editingIncident as any).affected_person ?? '');
    setReportedBy((editingIncident as any).reported_by ?? '');
    setReportedTo((editingIncident as any).reported_to ?? '');
    setCopyTo(Array.isArray((editingIncident as any).copy_to_emails) ? (editingIncident as any).copy_to_emails.join(', ') : '');
    setRiskLikelihood(Math.max(1, Math.min(5, Number((editingIncident as any).risk_likelihood_1_5 ?? 3))) as 1 | 2 | 3 | 4 | 5);
    setRiskSeverity(Math.max(1, Math.min(5, Number((editingIncident as any).risk_severity_1_5 ?? 3))) as 1 | 2 | 3 | 4 | 5);
    setInvestigationRequired(Boolean((editingIncident as any).investigation_required));
    setLossProduction((editingIncident as any).loss_production_value != null ? String((editingIncident as any).loss_production_value) : '');
    setLossFinancial((editingIncident as any).loss_financial_value != null ? String((editingIncident as any).loss_financial_value) : '');
    setLossReputational((editingIncident as any).loss_reputational_value != null ? String((editingIncident as any).loss_reputational_value) : '');
    setLossDamageAsset((editingIncident as any).loss_damage_asset_value != null ? String((editingIncident as any).loss_damage_asset_value) : '');
    setLossIllnessInjury((editingIncident as any).loss_illness_injury_value != null ? String((editingIncident as any).loss_illness_injury_value) : '');
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

    setUnsafeActs(mapCauseEntries((editingIncident as any).immediate_causes_unsafe_acts));
    setUnsafeConditions(mapCauseEntries((editingIncident as any).immediate_causes_unsafe_conditions));
    setEvidenceUploads([]);
    setInvestigationUploads([]);
    setError(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, editingIncident?.id]);

  useEffect(() => {
    return () => {
      releasePreviews(evidenceUploads);
      releasePreviews(investigationUploads);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addUploads(files: FileList | null, section: 'evidence' | 'investigation') {
    if (!files) return;
    const drafts = Array.from(files).map(buildUploadDraft);
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
      const occurredAt = new Date(`${incidentDate}T${incidentTime}`).toISOString();

      const copyToEmails = copyTo
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const unsafeActsData = Object.values(unsafeActs);
      const unsafeConditionsData = Object.values(unsafeConditions);

      if (isEditing && editingIncident) {
        const updated = await updateIncident(editingIncident.id, {
          module,
          category,
          subcategory: finalSubcategory,
          title: title.trim(),
          description: null,
          incidentType: incidentType.trim() || null,
          projectClient: projectClient.trim() || null,
          natureOfIncident: natureOfIncident.trim() || null,
          causeOfIncident: causeOfIncident.trim() || null,
          affectedPerson: affectedPerson.trim() || null,
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
          lossOtherText: lossOther.trim() || null,
          lossNotes: lossNotes.trim() || null,
          riskSeverity1To5: riskSeverity,
          riskLikelihood1To5: riskLikelihood,
          riskRatingProduct: calculatedRisk,
          riskClassification: calculatedRiskCategory,
          severity: toLegacySeverity(riskSeverity),
          occurredAt,
          location: location.trim() || null
        } as any);
        await uploadEvidenceForIncident(updated.id, evidenceUploads, 'incident');
        await uploadEvidenceForIncident(updated.id, investigationUploads, 'incident_investigation');
        props.onUpdated?.(updated);
      } else {
        const incident = await createIncident({
          companyId: props.companyId,
          module,
          category,
          subcategory: finalSubcategory,
          title: title.trim(),
          description: null,
          incidentType: incidentType.trim() || undefined,
          projectClient: projectClient.trim() || undefined,
          natureOfIncident: natureOfIncident.trim(),
          causeOfIncident: causeOfIncident.trim(),
          affectedPerson: affectedPerson.trim() || undefined,
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
            other: lossOther.trim() || null,
            notes: lossNotes.trim() || null
          },
          riskSeverity1To5: riskSeverity,
          riskLikelihood1To5: riskLikelihood,
          riskRatingProduct: calculatedRisk,
          riskClassification: calculatedRiskCategory,
          severity: toLegacySeverity(riskSeverity),
          occurredAt,
          location: location.trim() || undefined,
          createdByUserId: props.createdByUserId
        });

        await uploadEvidenceForIncident(incident.id, evidenceUploads, 'incident');
        await uploadEvidenceForIncident(incident.id, investigationUploads, 'incident_investigation');
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
              <label className="block text-sm font-medium text-charcoal mb-1.5">Title *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Project / Client</label>
              <input
                value={projectClient}
                onChange={(e) => setProjectClient(e.target.value)}
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
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
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Incident Type</label>
              <input
                value={incidentType}
                onChange={(e) => setIncidentType(e.target.value)}
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
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
                {availableSubcategories.length > 0 && (
                  <label className="flex items-center gap-2 text-xs text-charcoal-500">
                    <input
                      type="checkbox"
                      checked={useManualSubcategory}
                      onChange={(e) => setUseManualSubcategory(e.target.checked)}
                      className="w-4 h-4 text-teal border-surface-300 rounded focus:ring-teal"
                    />
                    Type manually
                  </label>
                )}
                {!useManualSubcategory && availableSubcategories.length > 0 ? (
                  <select
                    value={subcategory}
                    onChange={(e) => setSubcategory(e.target.value)}
                    className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                    required
                  >
                    <option value="">Select subcategory</option>
                    {availableSubcategories.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={subcategoryManual}
                    onChange={(e) => setSubcategoryManual(e.target.value)}
                    className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
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
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Time *</label>
              <input
                type="time"
                value={incidentTime}
                onChange={(e) => setIncidentTime(e.target.value)}
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                required
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-charcoal mb-1.5">Location</label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-surface-200 pt-6">
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
              <label className="block text-sm font-medium text-charcoal mb-1.5">Affected person</label>
              <input
                value={affectedPerson}
                onChange={(e) => setAffectedPerson(e.target.value)}
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
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

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border-t border-surface-200 pt-6">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Likelihood (1-5)</label>
              <select
                value={riskLikelihood}
                onChange={(e) => setRiskLikelihood(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              >
                <option value={1}>1 - Rare</option>
                <option value={2}>2 - Unlikely</option>
                <option value={3}>3 - Possible</option>
                <option value={4}>4 - Likely</option>
                <option value={5}>5 - Almost Certain</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Severity (1-5)</label>
              <select
                value={riskSeverity}
                onChange={(e) => setRiskSeverity(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
                className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              >
                <option value={1}>1 - Insignificant</option>
                <option value={2}>2 - Minor</option>
                <option value={3}>3 - Moderate</option>
                <option value={4}>4 - Major</option>
                <option value={5}>5 - Catastrophic</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Calculated risk</label>
              <div className="w-full px-4 py-2.5 rounded-lg border border-surface-300 text-sm font-semibold bg-surface-50">{calculatedRisk}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Risk category</label>
              <div className="w-full px-4 py-2.5 rounded-lg border border-surface-300 text-sm font-semibold bg-surface-50">{calculatedRiskCategory}</div>
            </div>
          </div>

          <div className="border-t border-surface-200 pt-6 space-y-4">
            <h3 className="text-sm font-semibold text-charcoal">Losses</h3>
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
                <label className="block text-sm font-medium text-charcoal mb-1.5">Other loss</label>
                <input value={lossOther} onChange={(e) => setLossOther(e.target.value)} className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-charcoal mb-1.5">Loss notes</label>
                <textarea value={lossNotes} onChange={(e) => setLossNotes(e.target.value)} rows={3} className="w-full px-4 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal" />
              </div>
            </div>
          </div>

          <div className="border-t border-surface-200 pt-6 space-y-4">
            {renderCauseGroups('Unsafe Acts (tickbox + explanation)', IMMEDIATE_CAUSES_UNSAFE_ACTS_GROUPS, 'acts', unsafeActs)}
            {renderCauseGroups('Unsafe Conditions (tickbox + explanation)', IMMEDIATE_CAUSES_UNSAFE_CONDITIONS_GROUPS, 'conditions', unsafeConditions)}
          </div>

          <div className="border-t border-surface-200 pt-6 space-y-4">
            <label className="flex items-center gap-2 text-sm font-semibold text-charcoal">
              <input
                type="checkbox"
                checked={investigationRequired}
                onChange={(e) => setInvestigationRequired(e.target.checked)}
                className="w-4 h-4 text-teal border-surface-300 rounded focus:ring-teal"
              />
              Investigation required
            </label>
            {renderUploadSection('Upload evidence', 'evidence', evidenceUploads)}
            {renderUploadSection('Upload investigation files', 'investigation', investigationUploads)}
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
