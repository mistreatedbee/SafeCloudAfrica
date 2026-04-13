import React, { useEffect, useMemo, useState } from 'react';
import { XIcon, SaveIcon, ExternalLinkIcon, FileTextIcon, ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import type { EvidenceAttachment, Incident, IncidentCorrectiveAction, IncidentInvestigation, UUID } from '../../api/models/entities';
import { listEvidence, updateEvidence } from '../../api/services/evidenceService';
import { getPublicUrl } from '../../api/services/storageService';
import { formatAuthError } from '../../auth/authMessages';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { getIncidentInvestigation, upsertIncidentInvestigation } from '../../api/services/incidentInvestigationsService';
import { exportIncidentPDF, downloadFile } from '../../api/services/exportService';
import { useIdentity } from '../../hooks/useIdentity';
import { useAsync } from '../../api/hooks/useAsync';
import { deleteIncidentCorrectiveAction, listIncidentCorrectiveActions } from '../../api/services/incidentCorrectiveActionsService';
import { IncidentCorrectiveActionsList } from './IncidentCorrectiveActionsList';
import { IncidentCorrectiveActionModal } from './IncidentCorrectiveActionModal';
import { useDraftManager } from '../../session/DraftManagerProvider';
import { useDraftRegistration } from '../../session/useDraftRegistration';

type InvestigationSectionKey =
  | 'immediateCauses'
  | 'rootCauseHuman'
  | 'rootCauseWorkplace'
  | 'systemFailure'
  | 'contributingFactors'
  | 'correctiveActions'
  | 'lessonsLearnt';

const INVESTIGATION_SECTION_DEFINITIONS: Array<{
  key: InvestigationSectionKey;
  label: string;
  description: string;
}> = [
  { key: 'immediateCauses', label: 'Immediate Causes', description: 'Task flow, risk context and immediate cause details' },
  { key: 'rootCauseHuman', label: 'Root Cause (Human Factors)', description: 'Human performance and behavior factors' },
  { key: 'rootCauseWorkplace', label: 'Root Cause (Workplace Factors)', description: 'Workplace and environment factors' },
  { key: 'systemFailure', label: 'System Failure', description: 'System/process management failures' },
  { key: 'contributingFactors', label: 'Contributing Factors', description: 'Other factors that influenced the outcome' },
  { key: 'correctiveActions', label: 'Corrective Actions', description: 'Action notes, sign-off and distribution details' },
  { key: 'lessonsLearnt', label: 'Lessons Learnt', description: 'Key learning points for prevention' }
];

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

type IncidentInvestigationDraft = {
  notes: string;
  instructionBreakdown: string;
  taskSequence: string;
  eventTimeline: string;
  risk: string;
  riskProfile: string;
  potentialConsequence: string;
  immediateCauses: string;
  rootHuman: string;
  rootWorkplace: string;
  systemFailures: string;
  contributingFactors: string;
  lessonsLearnt: string;
  conclusion: string;
  preparedBy: string;
  investigationTeam: string;
  distributions: string;
  investigationSections: Record<InvestigationSectionKey, boolean>;
};

export function IncidentDetailModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  incident: Incident | null;
  actorUserId: UUID;
  canEditInvestigation: boolean;
}) {
  const incident = props.incident;
  const [tab, setTab] = useState<'details' | 'investigation'>('details');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<EvidenceAttachment[]>([]);
  const [investigationEvidence, setInvestigationEvidence] = useState<EvidenceAttachment[]>([]);
  const [evidenceRenamingId, setEvidenceRenamingId] = useState<string | null>(null);
  const [evidenceRenameValue, setEvidenceRenameValue] = useState('');
  const [, setInvestigation] = useState<IncidentInvestigation | null>(null);
  const [correctiveActionModalOpen, setCorrectiveActionModalOpen] = useState(false);
  const [editingCorrectiveActionId, setEditingCorrectiveActionId] = useState<UUID | null>(null);
  const [createFromCause, setCreateFromCause] = useState<{ type: 'unsafe_act' | 'unsafe_condition' | 'root_cause' | 'system_failure'; text: string } | null>(null);
  const [refreshCorrectiveActions, setRefreshCorrectiveActions] = useState(0);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const { data: correctiveActionsData } = useAsync<IncidentCorrectiveAction[]>(
    async () => (incident && props.companyId ? listIncidentCorrectiveActions(props.companyId, incident.id) : []),
    [incident?.id, props.companyId, refreshCorrectiveActions]
  );
  const correctiveActions = correctiveActionsData ?? [];

  const [notes, setNotes] = useState('');
  const [instructionBreakdown, setInstructionBreakdown] = useState('');
  const [taskSequence, setTaskSequence] = useState('');
  const [eventTimeline, setEventTimeline] = useState('');
  const [risk, setRisk] = useState('');
  const [riskProfile, setRiskProfile] = useState('');
  const [potentialConsequence, setPotentialConsequence] = useState('');
  const [immediateCauses, setImmediateCauses] = useState('');
  const [rootHuman, setRootHuman] = useState('');
  const [rootWorkplace, setRootWorkplace] = useState('');
  const [systemFailures, setSystemFailures] = useState('');
  const [contributingFactors, setContributingFactors] = useState('');
  const [lessonsLearnt, setLessonsLearnt] = useState('');
  const [conclusion, setConclusion] = useState('');
  const [preparedBy, setPreparedBy] = useState('');
  const [investigationTeam, setInvestigationTeam] = useState('');
  const [distributions, setDistributions] = useState('');
  const [investigationSections, setInvestigationSections] = useState<Record<InvestigationSectionKey, boolean>>(emptyInvestigationSectionSelection);
  const { fullName, organisationName } = useIdentity();

  const { restoreDraft, clearDraft } = useDraftManager();
  const draftKey = `incident-investigation:${props.companyId}:${incident?.id ?? 'unknown'}:${props.actorUserId}`;

  const hasDirtyDraft = useMemo(
    () =>
      props.open &&
      props.canEditInvestigation &&
      (notes.trim().length > 0 ||
        instructionBreakdown.trim().length > 0 ||
        taskSequence.trim().length > 0 ||
        eventTimeline.trim().length > 0 ||
        risk.trim().length > 0 ||
        riskProfile.trim().length > 0 ||
        potentialConsequence.trim().length > 0 ||
        immediateCauses.trim().length > 0 ||
        rootHuman.trim().length > 0 ||
        rootWorkplace.trim().length > 0 ||
        systemFailures.trim().length > 0 ||
        contributingFactors.trim().length > 0 ||
        lessonsLearnt.trim().length > 0 ||
        conclusion.trim().length > 0 ||
        preparedBy.trim().length > 0 ||
        investigationTeam.trim().length > 0 ||
        distributions.trim().length > 0 ||
        Object.values(investigationSections).some(Boolean)),
    [
      contributingFactors,
      conclusion,
      distributions,
      immediateCauses,
      investigationSections,
      investigationTeam,
      instructionBreakdown,
      lessonsLearnt,
      potentialConsequence,
      preparedBy,
      notes,
      props.canEditInvestigation,
      props.open,
      risk,
      riskProfile,
      rootHuman,
      rootWorkplace,
      systemFailures,
      taskSequence,
      eventTimeline
    ]
  );

  useDraftRegistration({
    key: draftKey,
    enabled: Boolean(incident?.id) && props.open && props.canEditInvestigation,
    isDirty: () => hasDirtyDraft,
    serialize: () =>
      ({
        notes,
        instructionBreakdown,
        taskSequence,
        eventTimeline,
        risk,
        riskProfile,
        potentialConsequence,
        immediateCauses,
        rootHuman,
        rootWorkplace,
        systemFailures,
        contributingFactors,
        lessonsLearnt,
        conclusion,
        preparedBy,
        investigationTeam,
        distributions,
        investigationSections
      }) satisfies IncidentInvestigationDraft
  });

  useEffect(() => {
    if (!props.open || !incident) return;
    setTab('details');
    setError(null);
    setEvidence([]);
    setInvestigationEvidence([]);
    setInvestigation(null);
    setNotes('');
    setInstructionBreakdown('');
    setTaskSequence('');
    setEventTimeline('');
    setRisk('');
    setRiskProfile('');
    setPotentialConsequence('');
    setImmediateCauses('');
    setRootHuman('');
    setRootWorkplace('');
    setSystemFailures('');
    setContributingFactors('');
    setLessonsLearnt('');
    setConclusion('');
    setPreparedBy('');
    setInvestigationTeam('');
    setDistributions('');
    setInvestigationSections(emptyInvestigationSectionSelection());
    setSaveSuccess(null);

    (async () => {
      try {
        setLoading(true);
        const [ev, invEvidence, inv] = await Promise.all([
          listEvidence(props.companyId, { entityType: 'incident', entityId: incident.id, limit: 200 }),
          listEvidence(props.companyId, { entityType: 'incident_investigation', entityId: incident.id, limit: 200 }),
          getIncidentInvestigation(props.companyId, incident.id)
        ]);
        setEvidence(ev);
        setInvestigationEvidence(invEvidence);
        setInvestigation(inv);
        if (inv) {
          setNotes(inv.notes ?? '');
          setInstructionBreakdown(inv.instruction_breakdown ?? '');
          setTaskSequence(inv.task_sequence ?? '');
          setEventTimeline(inv.event_timeline ?? '');
          setRisk(inv.risk ?? '');
          setRiskProfile(inv.risk_profile ?? '');
          setPotentialConsequence(inv.potential_consequence ?? '');
          setImmediateCauses(Array.isArray(inv.immediate_causes) ? inv.immediate_causes.join(', ') : '');
          setRootHuman(Array.isArray(inv.root_causes_human) ? inv.root_causes_human.join(', ') : '');
          setRootWorkplace(Array.isArray(inv.root_causes_workplace) ? inv.root_causes_workplace.join(', ') : '');
          setSystemFailures(Array.isArray(inv.system_failures) ? inv.system_failures.join(', ') : '');
          setContributingFactors(inv.contributing_factors ?? '');
          setLessonsLearnt(inv.lessons_learnt ?? '');
          setConclusion(inv.conclusion ?? '');
          setPreparedBy(inv.prepared_by ?? '');
          setInvestigationTeam(Array.isArray(inv.investigation_team) ? inv.investigation_team.join(', ') : '');
          setDistributions(Array.isArray(inv.distributions) ? inv.distributions.join(', ') : '');
          setInvestigationSections(emptyInvestigationSectionSelection());
        }

        // Restore local, unsaved investigation edits (if any).
        if (props.canEditInvestigation) {
          const restored = restoreDraft<IncidentInvestigationDraft>(draftKey);
          if (restored) {
            setNotes(restored.notes ?? '');
            setInstructionBreakdown(restored.instructionBreakdown ?? '');
            setTaskSequence(restored.taskSequence ?? '');
            setEventTimeline(restored.eventTimeline ?? '');
            setRisk(restored.risk ?? '');
            setRiskProfile(restored.riskProfile ?? '');
            setPotentialConsequence(restored.potentialConsequence ?? '');
            setImmediateCauses(restored.immediateCauses ?? '');
            setRootHuman(restored.rootHuman ?? '');
            setRootWorkplace(restored.rootWorkplace ?? '');
            setSystemFailures(restored.systemFailures ?? '');
            setContributingFactors(restored.contributingFactors ?? '');
            setLessonsLearnt(restored.lessonsLearnt ?? '');
            setConclusion(restored.conclusion ?? '');
            setPreparedBy(restored.preparedBy ?? '');
            setInvestigationTeam(restored.investigationTeam ?? '');
            setDistributions(restored.distributions ?? '');
            setInvestigationSections(restored.investigationSections ?? emptyInvestigationSectionSelection());
          }
        }
      } catch (e: any) {
        setError(formatAuthError(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [incident?.id, props.companyId, props.open]);

  const riskSummary = useMemo(() => {
    if (!incident) return '—';
    const score = (incident as any).risk_rating_product ?? (incident as any).risk_score ?? null;
    const rating = (incident as any).risk_classification ?? (incident as any).risk_rating ?? (incident as any)?.metadata?.riskLevel ?? null;
    if (!score && !rating) return '—';
    return [score ? `Score ${score}` : null, rating ? String(rating).toUpperCase() : null].filter(Boolean).join(' • ');
  }, [incident]);

  const categoryDisplay = useMemo(() => {
    if (!incident) return '—';
    const metadata = (incident as any)?.metadata ?? null;
    const metaCategoriesRaw = Array.isArray(metadata?.categories) ? metadata.categories : null;
    const parsedMetaCategories: string[] = Array.isArray(metaCategoriesRaw)
      ? metaCategoriesRaw.map((c: unknown) => String(c ?? '').trim()).filter((c) => c.length > 0)
      : [];
    if (parsedMetaCategories.length === 0) return incident.category;
    const unique = Array.from(new Set(parsedMetaCategories));
    const primary = incident.category;
    const extras = unique.filter((c) => c !== primary);
    return extras.length > 0 ? [primary, ...extras].join('; ') : primary;
  }, [incident]);

  const subcategoryDisplay = useMemo(() => {
    if (!incident) return '—';
    const metadata = (incident as any)?.metadata ?? null;
    const metaSubcategoriesRaw = Array.isArray(metadata?.subcategories) ? metadata.subcategories : null;
    const parsedMetaSubcategories: string[] = Array.isArray(metaSubcategoriesRaw)
      ? metaSubcategoriesRaw.map((s: unknown) => String(s ?? '').trim()).filter((s) => s.length > 0)
      : [];
    if (parsedMetaSubcategories.length === 0) return incident.subcategory;
    const unique = Array.from(new Set(parsedMetaSubcategories));
    const primary = incident.subcategory;
    const extras = unique.filter((s) => s !== primary);
    return extras.length > 0 ? [primary, ...extras].join('; ') : primary;
  }, [incident]);

  const causeOptions = useMemo(() => {
    const parseCsv = (raw: string, type: 'unsafe_act' | 'unsafe_condition' | 'root_cause' | 'system_failure') =>
      raw
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((text) => ({ type, text, label: `${type.replace('_', ' ')}: ${text}` }));

    return [
      ...parseCsv(immediateCauses, 'unsafe_act'),
      ...parseCsv(rootHuman, 'root_cause'),
      ...parseCsv(rootWorkplace, 'root_cause'),
      ...parseCsv(systemFailures, 'system_failure')
    ];
  }, [immediateCauses, rootHuman, rootWorkplace, systemFailures]);

  async function handleExportPdf() {
    if (!incident) return;
    const blob = await exportIncidentPDF(incident, {
      companyName: organisationName,
      generatedBy: fullName,
      includeEvidence: true,
      evidenceList: evidence,
      correctiveActions: correctiveActions
    });
    downloadFile(blob, `incident-${incident.id.slice(0, 8)}.pdf`);
  }

  async function saveInvestigation() {
    if (!incident) return;
    setError(null);
    setSaveSuccess(null);
    try {
      setLoading(true);
      const saved = await upsertIncidentInvestigation({
        companyId: props.companyId,
        incidentId: incident.id,
        actorUserId: props.actorUserId,
        patch: {
          notes: notes.trim() || null,
          instruction_breakdown: instructionBreakdown.trim() || null,
          task_sequence: taskSequence.trim() || null,
          event_timeline: eventTimeline.trim() || null,
          risk: risk.trim() || null,
          risk_profile: riskProfile.trim() || null,
          potential_consequence: potentialConsequence.trim() || null,
          immediate_causes: immediateCauses
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          root_causes_human: rootHuman
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          root_causes_workplace: rootWorkplace
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          system_failures: systemFailures
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          contributing_factors: contributingFactors.trim() || null,
          lessons_learnt: lessonsLearnt.trim() || null,
          conclusion: conclusion.trim() || null,
          prepared_by: preparedBy.trim() || null,
          investigation_team: investigationTeam
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          distributions: distributions
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        } as any
      });
      setInvestigation(saved);
      clearDraft(draftKey);
      setSaveSuccess('Investigation saved successfully.');
    } catch (e: any) {
      setError(formatAuthError(e));
    } finally {
      setLoading(false);
    }
  }

  function setInvestigationSection(section: InvestigationSectionKey, selected: boolean) {
    setInvestigationSections((prev) => ({ ...prev, [section]: selected }));
  }

  async function handleDeleteCorrectiveAction(actionId: UUID) {
    if (!props.canEditInvestigation) return;
    const confirmed = window.confirm('Delete this corrective action? This cannot be undone.');
    if (!confirmed) return;

    try {
      setError(null);
      await deleteIncidentCorrectiveAction(props.companyId, actionId);
      if (editingCorrectiveActionId === actionId) {
        setEditingCorrectiveActionId(null);
        setCorrectiveActionModalOpen(false);
      }
      setRefreshCorrectiveActions((c) => c + 1);
    } catch (err: any) {
      setError(formatAuthError(err));
    }
  }

  function renderInvestigationCard(section: InvestigationSectionKey, titleText: string, children: React.ReactNode) {
    const expanded = investigationSections[section];
    return (
      <div className="rounded-xl border border-surface-200 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setInvestigationSection(section, !expanded)}
            className="flex items-center gap-2 text-left"
          >
            {expanded ? <ChevronDownIcon className="w-4 h-4 text-charcoal-500" /> : <ChevronRightIcon className="w-4 h-4 text-charcoal-500" />}
            <h4 className="text-sm font-semibold text-charcoal">{titleText}</h4>
          </button>
          <button
            type="button"
            onClick={() => setInvestigationSection(section, !expanded)}
            className="text-xs font-medium text-charcoal-500 hover:text-charcoal"
            disabled={!props.canEditInvestigation}
          >
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
        {expanded && <div className="animate-[fadeIn_.18s_ease-in]">{children}</div>}
      </div>
    );
  }

  if (!props.open || !incident) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto p-3 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90dvh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 flex flex-wrap items-center justify-between gap-2 px-4 py-4 sm:px-6 border-b border-surface-200">
          <div className="min-w-0 flex-1 basis-full sm:basis-auto">
            <p className="text-sm font-semibold text-charcoal truncate">{incident.title}</p>
            <p className="text-xs text-charcoal-500 mt-0.5">
              {categoryDisplay} • {subcategoryDisplay} • {riskSummary}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            <button
              type="button"
              onClick={() => void handleExportPdf()}
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-3 rounded-lg border border-surface-300 text-xs font-medium text-charcoal hover:bg-surface-50"
            >
              <FileTextIcon className="w-4 h-4" />
              Export PDF
            </button>
            <button
              type="button"
              onClick={props.onClose}
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-surface-100 text-charcoal-500"
              aria-label="Close"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-6 border-b border-surface-200 bg-surface-50">
          <button
            type="button"
            onClick={() => setTab('details')}
            className={`min-h-[44px] px-3 inline-flex items-center rounded-lg text-sm font-semibold ${tab === 'details' ? 'bg-white border border-surface-200' : 'text-charcoal-500 hover:text-charcoal'}`}
          >
            Details
          </button>
          <button
            type="button"
            onClick={() => setTab('investigation')}
            className={`min-h-[44px] px-3 inline-flex items-center rounded-lg text-sm font-semibold ${tab === 'investigation' ? 'bg-white border border-surface-200' : 'text-charcoal-500 hover:text-charcoal'}`}
          >
            Investigation
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-critical">Error</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          {saveSuccess && (
            <div className="bg-success/5 border border-success/20 rounded-xl p-3">
              <p className="text-sm text-success">{saveSuccess}</p>
            </div>
          )}

          {loading && (
            <div className="bg-white rounded-xl border border-surface-200 p-4">
              <p className="text-sm text-charcoal-500">Loading…</p>
            </div>
          )}

          {tab === 'details' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <div className="rounded-xl border border-surface-200 p-4">
                  <p className="text-sm font-semibold text-charcoal">Report details</p>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-charcoal-500">Incident type</p>
                      <p className="text-charcoal">{(incident as any).incident_type ?? (incident as any)?.metadata?.incidentType ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-charcoal-500">Occurred</p>
                      <p className="text-charcoal">{new Date(incident.occurred_at).toLocaleString('en-ZA')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-charcoal-500">Location</p>
                      <p className="text-charcoal">{incident.location ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-charcoal-500">Risk</p>
                      <p className="text-charcoal">{riskSummary}</p>
                    </div>
                    <div>
                      <p className="text-xs text-charcoal-500">Risk category (core)</p>
                      <p className="text-charcoal">{(incident as any).risk_category ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-charcoal-500">Likelihood x Severity</p>
                      <p className="text-charcoal">{(incident as any).risk_likelihood_1_5 ?? '—'} x {(incident as any).risk_severity_1_5 ?? '—'}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-xs text-charcoal-500">Cause</p>
                      <p className="text-charcoal">{(incident as any).cause ?? (incident as any)?.metadata?.cause ?? '—'}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-xs text-charcoal-500">Description</p>
                      <p className="text-charcoal whitespace-pre-wrap">{incident.description ?? '—'}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-surface-200 p-4">
                  <p className="text-sm font-semibold text-charcoal">Evidence</p>
                  <div className="mt-3 space-y-2">
                    {evidence.length === 0 && <p className="text-sm text-charcoal-500">No evidence uploaded yet.</p>}
                    {evidence.map((ev) => {
                      const url = getPublicUrl(ev.storage_bucket as any, ev.storage_key);
                      const displayName = ev.display_title ?? ev.title ?? (ev as any).original_filename ?? ev.storage_key?.split('/').pop() ?? '—';
                      const isRenaming = evidenceRenamingId === ev.id;
                      return (
                        <div
                          key={ev.id}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-200 hover:bg-surface-50"
                        >
                          {isRenaming ? (
                            <>
                              <input
                                type="text"
                                value={evidenceRenameValue}
                                onChange={(e) => setEvidenceRenameValue(e.target.value)}
                                onBlur={async () => {
                                  if (evidenceRenameValue.trim()) {
                                    try {
                                      await updateEvidence(ev.id, { displayTitle: evidenceRenameValue.trim() });
                                      setEvidence(prev => prev.map(e => e.id === ev.id ? { ...e, display_title: evidenceRenameValue.trim() } : e));
                                    } catch {
                                      // Ignore rename failures; user can retry.
                                    }
                                  }
                                  setEvidenceRenamingId(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                  if (e.key === 'Escape') setEvidenceRenamingId(null);
                                }}
                                className="flex-1 px-2 py-1 text-sm border border-surface-300 rounded"
                                autoFocus
                              />
                              <button type="button" onClick={() => setEvidenceRenamingId(null)} className="text-xs text-charcoal-500">Cancel</button>
                            </>
                          ) : (
                            <>
                              <a href={url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 truncate text-sm text-charcoal hover:underline">
                                {displayName}
                              </a>
                              <button
                                type="button"
                                onClick={() => {
                                  setEvidenceRenamingId(ev.id);
                                  setEvidenceRenameValue(displayName);
                                }}
                                className="text-xs text-teal hover:text-teal-600 shrink-0"
                              >
                                Rename
                              </button>
                              <a href={url} target="_blank" rel="noreferrer" className="shrink-0"><ExternalLinkIcon className="w-4 h-4 text-charcoal-400" /></a>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {incident && (
                  <div className="rounded-xl border border-surface-200 p-4">
                    <IncidentCorrectiveActionsList
                      incidentId={incident.id}
                      companyId={props.companyId}
                      actions={correctiveActions}
                      onAdd={() => {
                        setCreateFromCause(null);
                        setEditingCorrectiveActionId(null);
                        setCorrectiveActionModalOpen(true);
                      }}
                      onEdit={(actionId) => {
                        setEditingCorrectiveActionId(actionId);
                        setCreateFromCause(null);
                        setCorrectiveActionModalOpen(true);
                      }}
                      onDelete={(actionId) => void handleDeleteCorrectiveAction(actionId)}
                      disabled={!props.canEditInvestigation}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-surface-200 p-4">
                  <p className="text-sm font-semibold text-charcoal">Investigation required</p>
                  <p className="mt-1 text-sm text-charcoal-600">
                    {(incident as any).investigation_required ? 'Yes' : 'No'}
                  </p>
                  {((incident as any)?.metadata?.investigationNotes as string | undefined) && (
                    <p className="mt-2 text-sm text-charcoal-500 whitespace-pre-wrap">
                      {String((incident as any).metadata.investigationNotes)}
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-surface-200 p-4">
                  <p className="text-sm font-semibold text-charcoal">Losses</p>
                  <div className="mt-2 space-y-1 text-sm text-charcoal-600">
                    <p>Production: {(incident as any).loss_production_value ?? '—'}</p>
                    <p>Financial: {(incident as any).loss_financial_value ?? '—'}</p>
                    <p>Reputational: {(incident as any).loss_reputational_value ?? '—'}</p>
                    <p>Damage/Asset: {(incident as any).loss_damage_asset_value ?? '—'}</p>
                    <p>Illness/Injury: {(incident as any).loss_illness_injury_value ?? '—'}</p>
                    <p>Illness: {(incident as any).loss_illness_value ?? '—'}</p>
                    <p>Injury: {(incident as any).loss_injury_value ?? '—'}</p>
                    <p>Civil liability: {(incident as any).loss_civil_liability_value ?? '—'}</p>
                    <p>Criminal liability: {(incident as any).loss_criminal_liability_value ?? '—'}</p>
                    <p>Vicarious liability: {(incident as any).loss_vicarious_liability_value ?? '—'}</p>
                    <p>Sub-standard quality: {(incident as any).loss_substandard_quality_value ?? '—'}</p>
                    <p>Loss types: {Array.isArray((incident as any).loss_types) ? (incident as any).loss_types.join(', ') : '—'}</p>
                    <p>Other: {(incident as any).loss_other_text ?? '—'}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-surface-200 p-4">
                  <p className="text-sm font-semibold text-charcoal">Unsafe acts & conditions</p>
                  <div className="mt-2 space-y-2 text-xs text-charcoal-600">
                    <p className="font-semibold text-charcoal-700">Acts</p>
                    {Array.isArray((incident as any).immediate_causes_unsafe_acts) && (incident as any).immediate_causes_unsafe_acts.length > 0 ? (
                      (incident as any).immediate_causes_unsafe_acts.map((entry: any, index: number) => (
                        <div key={`act-${index}`} className="rounded border border-surface-200 p-2">
                          <p className="font-medium text-charcoal">{entry.item ?? '—'}</p>
                          <p>{entry.group ?? '—'}</p>
                          <p>{entry.note ?? 'No notes'}</p>
                        </div>
                      ))
                    ) : (
                      <p>No unsafe acts recorded.</p>
                    )}
                    <p className="font-semibold text-charcoal-700 pt-1">Conditions</p>
                    {Array.isArray((incident as any).immediate_causes_unsafe_conditions) && (incident as any).immediate_causes_unsafe_conditions.length > 0 ? (
                      (incident as any).immediate_causes_unsafe_conditions.map((entry: any, index: number) => (
                        <div key={`condition-${index}`} className="rounded border border-surface-200 p-2">
                          <p className="font-medium text-charcoal">{entry.item ?? '—'}</p>
                          <p>{entry.group ?? '—'}</p>
                          <p>{entry.note ?? 'No notes'}</p>
                        </div>
                      ))
                    ) : (
                      <p>No unsafe conditions recorded.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-surface-200 p-4">
                  <p className="text-sm font-semibold text-charcoal">Investigation evidence</p>
                  <div className="mt-2 space-y-2">
                    {investigationEvidence.length === 0 && <p className="text-sm text-charcoal-500">No investigation evidence uploaded yet.</p>}
                    {investigationEvidence.map((ev) => {
                      const url = getPublicUrl(ev.storage_bucket as any, ev.storage_key);
                      const displayName = ev.display_title ?? ev.title ?? (ev as any).original_filename ?? ev.storage_key?.split('/').pop() ?? '—';
                      return (
                        <a key={ev.id} href={url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 px-2 py-1.5 rounded border border-surface-200 text-sm text-charcoal hover:bg-surface-50">
                          <span className="truncate">{displayName}</span>
                          <ExternalLinkIcon className="w-3.5 h-3.5 shrink-0 text-charcoal-400" />
                        </a>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'investigation' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-surface-200 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-charcoal">Investigation notes & structured fields</p>
                    <p className="text-xs text-charcoal-500 mt-0.5">
                      Fill in what you have now; you can return later to complete the rest.
                    </p>
                  </div>
                  {props.canEditInvestigation && (
                    <button
                      type="button"
                      onClick={() => void saveInvestigation()}
                      disabled={loading}
                      className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60 w-full sm:w-auto shrink-0"
                    >
                      {loading ? <LoadingSpinner size={16} /> : <SaveIcon className="w-4 h-4" />}
                      Save
                    </button>
                  )}
                </div>

                {!props.canEditInvestigation && (
                  <div className="mt-3 bg-warning/5 border border-warning/20 rounded-xl p-3">
                    <p className="text-sm font-semibold text-warning">Read-only</p>
                    <p className="text-sm text-charcoal-600 mt-1">You don’t have permission to edit investigations.</p>
                  </div>
                )}

                <div className="mt-4 space-y-4">
                  <div className="rounded-xl border border-surface-200 p-4">
                    <p className="text-sm font-semibold text-charcoal">Investigation sections</p>
                    <p className="text-xs text-charcoal-500 mt-0.5">All sections are collapsed by default. Click a section to expand or collapse it.</p>
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
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Instruction breakdown / flow</label>
                        <textarea value={instructionBreakdown} onChange={(e) => setInstructionBreakdown(e.target.value)} disabled={!props.canEditInvestigation} rows={4} className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Task sequence</label>
                        <textarea value={taskSequence} onChange={(e) => setTaskSequence(e.target.value)} disabled={!props.canEditInvestigation} rows={4} className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Risk (L/M/H)</label>
                        <input value={risk} onChange={(e) => setRisk(e.target.value)} disabled={!props.canEditInvestigation} className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Risk profile (hazards)</label>
                        <input value={riskProfile} onChange={(e) => setRiskProfile(e.target.value)} disabled={!props.canEditInvestigation} className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60" />
                      </div>
                      <div className="lg:col-span-2">
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Consequence / potential consequence</label>
                        <textarea value={potentialConsequence} onChange={(e) => setPotentialConsequence(e.target.value)} disabled={!props.canEditInvestigation} rows={3} className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60" />
                      </div>
                      <div className="lg:col-span-2">
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Incident event timeline</label>
                        <textarea value={eventTimeline} onChange={(e) => setEventTimeline(e.target.value)} disabled={!props.canEditInvestigation} rows={4} className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60" />
                      </div>
                      <div className="lg:col-span-2">
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Immediate causes (comma-separated)</label>
                        <textarea value={immediateCauses} onChange={(e) => setImmediateCauses(e.target.value)} disabled={!props.canEditInvestigation} rows={3} placeholder="e.g. Shortcuts, Improper lifting, PPE not used" className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60" />
                      </div>
                    </div>
                  )}

                  {renderInvestigationCard(
                    'rootCauseHuman',
                    'Root Cause (Human Factors)',
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Root causes (Human factors) (comma-separated)</label>
                      <textarea value={rootHuman} onChange={(e) => setRootHuman(e.target.value)} disabled={!props.canEditInvestigation} rows={3} className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60" />
                    </div>
                  )}

                  {renderInvestigationCard(
                    'rootCauseWorkplace',
                    'Root Cause (Workplace Factors)',
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Root causes (Workplace factors) (comma-separated)</label>
                      <textarea value={rootWorkplace} onChange={(e) => setRootWorkplace(e.target.value)} disabled={!props.canEditInvestigation} rows={3} className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60" />
                    </div>
                  )}

                  {renderInvestigationCard(
                    'systemFailure',
                    'System Failure',
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">System failures (comma-separated)</label>
                      <textarea value={systemFailures} onChange={(e) => setSystemFailures(e.target.value)} disabled={!props.canEditInvestigation} rows={3} className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60" />
                    </div>
                  )}

                  {renderInvestigationCard(
                    'contributingFactors',
                    'Contributing Factors',
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Contributing factors</label>
                      <textarea value={contributingFactors} onChange={(e) => setContributingFactors(e.target.value)} disabled={!props.canEditInvestigation} rows={3} className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60" />
                    </div>
                  )}

                  {renderInvestigationCard(
                    'correctiveActions',
                    'Corrective Actions',
                    <div className="space-y-4">
                      <IncidentCorrectiveActionsList
                        incidentId={incident.id}
                        companyId={props.companyId}
                        actions={correctiveActions}
                        onAdd={() => {
                          setCreateFromCause(null);
                          setEditingCorrectiveActionId(null);
                          setCorrectiveActionModalOpen(true);
                        }}
                        onEdit={(actionId) => {
                          setEditingCorrectiveActionId(actionId);
                          setCreateFromCause(null);
                          setCorrectiveActionModalOpen(true);
                        }}
                        onDelete={(actionId) => void handleDeleteCorrectiveAction(actionId)}
                        disabled={!props.canEditInvestigation}
                      />
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="lg:col-span-2">
                          <label className="block text-sm font-medium text-charcoal mb-1.5">Notes</label>
                          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!props.canEditInvestigation} rows={4} className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-charcoal mb-1.5">Prepared by</label>
                          <input value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} disabled={!props.canEditInvestigation} className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-charcoal mb-1.5">Investigation team (comma-separated)</label>
                          <input value={investigationTeam} onChange={(e) => setInvestigationTeam(e.target.value)} disabled={!props.canEditInvestigation} className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60" />
                        </div>
                        <div className="lg:col-span-2">
                          <label className="block text-sm font-medium text-charcoal mb-1.5">Conclusion</label>
                          <textarea value={conclusion} onChange={(e) => setConclusion(e.target.value)} disabled={!props.canEditInvestigation} rows={3} className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60" />
                        </div>
                        <div className="lg:col-span-2">
                          <label className="block text-sm font-medium text-charcoal mb-1.5">Distributions / copy to (comma-separated)</label>
                          <input value={distributions} onChange={(e) => setDistributions(e.target.value)} disabled={!props.canEditInvestigation} className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60" />
                        </div>
                      </div>
                    </div>
                  )}

                  {renderInvestigationCard(
                    'lessonsLearnt',
                    'Lessons Learnt',
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Lessons learnt</label>
                      <textarea value={lessonsLearnt} onChange={(e) => setLessonsLearnt(e.target.value)} disabled={!props.canEditInvestigation} rows={4} className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60" />
                    </div>
                  )}

                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {incident && (
        <IncidentCorrectiveActionModal
          open={correctiveActionModalOpen}
          onClose={() => {
            setCorrectiveActionModalOpen(false);
            setEditingCorrectiveActionId(null);
            setCreateFromCause(null);
          }}
          incidentId={incident.id}
          companyId={props.companyId}
          actionId={editingCorrectiveActionId}
          initial={editingCorrectiveActionId ? (correctiveActions.find(a => a.id === editingCorrectiveActionId) ?? null) : null}
          createdByUserId={props.actorUserId}
          onSaved={() => setRefreshCorrectiveActions(c => c + 1)}
          onDeleted={() => setRefreshCorrectiveActions(c => c + 1)}
          initialSourceCauseType={createFromCause?.type}
          initialSourceCauseText={createFromCause?.text}
          causeOptions={causeOptions}
        />
      )}
    </div>
  );
}
