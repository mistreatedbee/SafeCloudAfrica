import React, { useEffect, useMemo, useState } from 'react';
import { XIcon, SaveIcon, ExternalLinkIcon, FileTextIcon, ChevronDownIcon } from 'lucide-react';
import type { EvidenceAttachment, Incident, IncidentCorrectiveAction, IncidentInvestigation, UUID } from '../../api/models/entities';
import { listEvidence, updateEvidence } from '../../api/services/evidenceService';
import { getPublicUrl } from '../../api/services/storageService';
import { formatAuthError } from '../../auth/authMessages';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { getIncidentInvestigation, upsertIncidentInvestigation } from '../../api/services/incidentInvestigationsService';
import { exportIncidentPDF, downloadFile } from '../../api/services/exportService';
import { useIdentity } from '../../hooks/useIdentity';
import { useAsync } from '../../api/hooks/useAsync';
import { listIncidentCorrectiveActions } from '../../api/services/incidentCorrectiveActionsService';
import { IncidentCorrectiveActionsList } from './IncidentCorrectiveActionsList';
import { IncidentCorrectiveActionModal } from './IncidentCorrectiveActionModal';

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
    immediateCauses: true,
    rootCauseHuman: true,
    rootCauseWorkplace: true,
    systemFailure: true,
    contributingFactors: true,
    correctiveActions: true,
    lessonsLearnt: true
  };
}

type ImmediateCauseEntry = {
  category: string;
  subcategory: string;
  explanation: string;
};

function parseStringList(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === 'string') return entry.trim();
        if (entry && typeof entry === 'object') {
          const group = String((entry as any).group ?? '').trim();
          const item = String((entry as any).item ?? '').trim();
          const note = String((entry as any).note ?? (entry as any).explanation ?? '').trim();
          return [group, item, note].filter(Boolean).join(' - ');
        }
        return '';
      })
      .filter(Boolean)
      .join(', ');
  }
  return typeof value === 'string' ? value : '';
}

function parseImmediateCauseEntries(value: unknown): ImmediateCauseEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === 'string') {
        const text = entry.trim();
        if (!text) return null;
        return { category: 'Immediate Cause', subcategory: 'Manual', explanation: text } satisfies ImmediateCauseEntry;
      }
      if (!entry || typeof entry !== 'object') return null;
      const category = String((entry as any).category ?? (entry as any).group ?? 'Immediate Cause').trim() || 'Immediate Cause';
      const subcategory = String((entry as any).subcategory ?? (entry as any).item ?? 'Manual').trim() || 'Manual';
      const explanation = String((entry as any).explanation ?? (entry as any).note ?? '').trim();
      if (!explanation) return null;
      return { category, subcategory, explanation } satisfies ImmediateCauseEntry;
    })
    .filter((entry): entry is ImmediateCauseEntry => Boolean(entry));
}

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [evidence, setEvidence] = useState<EvidenceAttachment[]>([]);
  const [investigationEvidence, setInvestigationEvidence] = useState<EvidenceAttachment[]>([]);
  const [evidenceRenamingId, setEvidenceRenamingId] = useState<string | null>(null);
  const [evidenceRenameValue, setEvidenceRenameValue] = useState('');
  const [investigation, setInvestigation] = useState<IncidentInvestigation | null>(null);
  const [correctiveActionModalOpen, setCorrectiveActionModalOpen] = useState(false);
  const [editingCorrectiveActionId, setEditingCorrectiveActionId] = useState<UUID | null>(null);
  const [createFromCause, setCreateFromCause] = useState<{ type: 'unsafe_act' | 'unsafe_condition' | 'root_cause' | 'system_failure'; text: string } | null>(null);
  const [refreshCorrectiveActions, setRefreshCorrectiveActions] = useState(0);

  const { data: correctiveActions = [] } = useAsync<IncidentCorrectiveAction[]>(
    async () => (incident && props.companyId ? listIncidentCorrectiveActions(incident.id) : []),
    [incident?.id, props.companyId, refreshCorrectiveActions]
  );

  const [notes, setNotes] = useState('');
  const [instructionBreakdown, setInstructionBreakdown] = useState('');
  const [taskSequence, setTaskSequence] = useState('');
  const [eventTimeline, setEventTimeline] = useState('');
  const [riskLikelihood, setRiskLikelihood] = useState<number>(3);
  const [riskSeverity, setRiskSeverity] = useState<number>(3);
  const [riskProfile, setRiskProfile] = useState('');
  const [potentialConsequence, setPotentialConsequence] = useState('');
  const [immediateCauseNarrative, setImmediateCauseNarrative] = useState('');
  const [immediateCauseCategoryInput, setImmediateCauseCategoryInput] = useState('');
  const [immediateCauseSubcategoryInput, setImmediateCauseSubcategoryInput] = useState('');
  const [immediateCauseExplanationInput, setImmediateCauseExplanationInput] = useState('');
  const [immediateCauseEntries, setImmediateCauseEntries] = useState<ImmediateCauseEntry[]>([]);
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
  const calculatedRiskScore = Math.max(1, Math.min(5, Number(riskLikelihood) || 1)) * Math.max(1, Math.min(5, Number(riskSeverity) || 1));

  useEffect(() => {
    if (!props.open || !incident) return;
    setTab('details');
    setError(null);
    setEvidence([]);
    setInvestigationEvidence([]);
    setInvestigation(null);
    setSaveFeedback(null);
    setNotes('');
    setInstructionBreakdown('');
    setTaskSequence('');
    setEventTimeline('');
    setRiskLikelihood(3);
    setRiskSeverity(3);
    setRiskProfile('');
    setPotentialConsequence('');
    setImmediateCauseNarrative('');
    setImmediateCauseCategoryInput('');
    setImmediateCauseSubcategoryInput('');
    setImmediateCauseExplanationInput('');
    setImmediateCauseEntries([]);
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
          const existingLikelihood = Math.max(1, Math.min(5, Number((incident as any).risk_likelihood_1_5 ?? 3) || 3));
          const existingSeverity = Math.max(1, Math.min(5, Number((incident as any).risk_severity_1_5 ?? 3) || 3));
          setRiskLikelihood(existingLikelihood);
          setRiskSeverity(existingSeverity);
          setRiskProfile(inv.risk_profile ?? '');
          setPotentialConsequence(inv.potential_consequence ?? '');
          const parsedImmediateCauses = parseImmediateCauseEntries(inv.immediate_causes);
          setImmediateCauseEntries(parsedImmediateCauses);
          setImmediateCauseNarrative(
            parsedImmediateCauses.length === 0
              ? parseStringList(inv.immediate_causes)
              : ''
          );
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

  const correctiveActionCauseOptions = useMemo(() => {
    if (!incident) return [];
    const options: Array<{ type: 'unsafe_act' | 'unsafe_condition' | 'root_cause' | 'system_failure'; text: string }> = [];
    for (const entry of immediateCauseEntries) {
      const text = `${entry.category} / ${entry.subcategory}: ${entry.explanation}`.trim();
      if (text) options.push({ type: 'unsafe_act', text });
    }
    for (const row of (incident as any).immediate_causes_unsafe_acts ?? []) {
      const text = [row?.group, row?.item, row?.note].filter(Boolean).join(' - ').trim();
      if (text) options.push({ type: 'unsafe_act', text });
    }
    for (const row of (incident as any).immediate_causes_unsafe_conditions ?? []) {
      const text = [row?.group, row?.item, row?.note].filter(Boolean).join(' - ').trim();
      if (text) options.push({ type: 'unsafe_condition', text });
    }
    for (const text of rootHuman.split(',').map((x) => x.trim()).filter(Boolean)) {
      options.push({ type: 'root_cause', text });
    }
    for (const text of rootWorkplace.split(',').map((x) => x.trim()).filter(Boolean)) {
      options.push({ type: 'root_cause', text });
    }
    for (const text of systemFailures.split(',').map((x) => x.trim()).filter(Boolean)) {
      options.push({ type: 'system_failure', text });
    }

    const dedupe = new Map<string, { type: 'unsafe_act' | 'unsafe_condition' | 'root_cause' | 'system_failure'; text: string }>();
    for (const option of options) {
      dedupe.set(`${option.type}:${option.text}`, option);
    }
    return Array.from(dedupe.values());
  }, [incident, immediateCauseEntries, rootHuman, rootWorkplace, systemFailures]);

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
    setSaveFeedback(null);
    const nextImmediateCauses: ImmediateCauseEntry[] = [
      ...immediateCauseEntries,
      ...(immediateCauseNarrative.trim()
        ? [{ category: 'Immediate Cause', subcategory: 'Manual', explanation: immediateCauseNarrative.trim() }]
        : [])
    ];
    if (nextImmediateCauses.length === 0 && !instructionBreakdown.trim() && !taskSequence.trim()) {
      setSaveFeedback({
        kind: 'error',
        message: 'Enter at least one immediate cause explanation or investigation instruction details before saving.'
      });
      return;
    }
    try {
      setSaving(true);
      const saved = await upsertIncidentInvestigation({
        companyId: props.companyId,
        incidentId: incident.id,
        actorUserId: props.actorUserId,
        patch: {
          notes: notes.trim() || null,
          instruction_breakdown: instructionBreakdown.trim() || null,
          task_sequence: taskSequence.trim() || null,
          event_timeline: eventTimeline.trim() || null,
          risk: `Likelihood ${Math.max(1, Math.min(5, Number(riskLikelihood) || 1))} x Severity ${Math.max(1, Math.min(5, Number(riskSeverity) || 1))} = ${calculatedRiskScore}`,
          risk_profile: riskProfile.trim() || null,
          potential_consequence: potentialConsequence.trim() || null,
          immediate_causes: nextImmediateCauses,
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
      setSaveFeedback({ kind: 'success', message: 'Investigation saved successfully.' });
    } catch (e: any) {
      const message = formatAuthError(e);
      setError(message);
      setSaveFeedback({ kind: 'error', message });
    } finally {
      setSaving(false);
    }
  }

  function setInvestigationSection(section: InvestigationSectionKey, selected?: boolean) {
    setInvestigationSections((prev) => ({ ...prev, [section]: selected ?? !prev[section] }));
  }

  function addImmediateCauseEntry() {
    const category = immediateCauseCategoryInput.trim() || 'Immediate Cause';
    const subcategory = immediateCauseSubcategoryInput.trim() || 'Manual';
    const explanation = immediateCauseExplanationInput.trim();
    if (!explanation) return;
    setImmediateCauseEntries((prev) => [...prev, { category, subcategory, explanation }]);
    setImmediateCauseCategoryInput('');
    setImmediateCauseSubcategoryInput('');
    setImmediateCauseExplanationInput('');
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

  if (!props.open || !incident) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-4xl mx-4 bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-charcoal truncate">{incident.title}</p>
            <p className="text-xs text-charcoal-500 mt-0.5">
              {incident.category} • {incident.subcategory} • {riskSummary}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleExportPdf()}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-surface-300 text-xs font-medium text-charcoal hover:bg-surface-50"
            >
              <FileTextIcon className="w-4 h-4" />
              Export PDF
            </button>
            <button
              type="button"
              onClick={props.onClose}
              className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-500"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-b border-surface-200 bg-surface-50">
          <button
            type="button"
            onClick={() => setTab('details')}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${tab === 'details' ? 'bg-white border border-surface-200' : 'text-charcoal-500 hover:text-charcoal'}`}
          >
            Details
          </button>
          <button
            type="button"
            onClick={() => setTab('investigation')}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${tab === 'investigation' ? 'bg-white border border-surface-200' : 'text-charcoal-500 hover:text-charcoal'}`}
          >
            Investigation
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-critical">Error</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
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
                    <div>
                      <p className="text-xs text-charcoal-500">Risk score</p>
                      <p className="text-charcoal">{(incident as any).risk_rating_product ?? (((incident as any).risk_likelihood_1_5 ?? 0) * ((incident as any).risk_severity_1_5 ?? 0) || '—')}</p>
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
                                    } catch (_) {}
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
                <div className="flex items-center justify-between gap-3">
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
                      disabled={saving}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60"
                    >
                      {saving ? <LoadingSpinner size={16} /> : <SaveIcon className="w-4 h-4" />}
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
                  {saveFeedback && (
                    <div className={`rounded-xl p-3 border ${saveFeedback.kind === 'success' ? 'bg-success/5 border-success/20' : 'bg-critical/5 border-critical/20'}`}>
                      <p className={`text-sm font-semibold ${saveFeedback.kind === 'success' ? 'text-success' : 'text-critical'}`}>
                        {saveFeedback.kind === 'success' ? 'Saved' : 'Save failed'}
                      </p>
                      <p className="text-sm text-charcoal-600 mt-1">{saveFeedback.message}</p>
                    </div>
                  )}

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
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Likelihood (1-5)</label>
                        <input type="number" min={1} max={5} value={riskLikelihood} onChange={(e) => setRiskLikelihood(Math.max(1, Math.min(5, Number(e.target.value || 1))))} disabled={!props.canEditInvestigation} className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Severity (1-5)</label>
                        <input type="number" min={1} max={5} value={riskSeverity} onChange={(e) => setRiskSeverity(Math.max(1, Math.min(5, Number(e.target.value || 1))))} disabled={!props.canEditInvestigation} className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Risk score</label>
                        <div className="w-full px-3 py-2 rounded-lg border border-surface-300 text-sm font-semibold bg-surface-50">{calculatedRiskScore}</div>
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
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Immediate causes explanation (free text)</label>
                        <textarea value={immediateCauseNarrative} onChange={(e) => setImmediateCauseNarrative(e.target.value)} disabled={!props.canEditInvestigation} rows={3} placeholder="Explain immediate causes in plain language." className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60" />
                      </div>
                      <div className="lg:col-span-2 rounded-lg border border-surface-200 p-3 bg-surface-50">
                        <p className="text-sm font-semibold text-charcoal">Immediate cause categories and subcategories</p>
                        <p className="text-xs text-charcoal-500 mt-0.5">Select/type a category and subcategory, then describe the cause. Manual entries are allowed.</p>
                        <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-charcoal-500 mb-1">Category</label>
                            <input value={immediateCauseCategoryInput} onChange={(e) => setImmediateCauseCategoryInput(e.target.value)} disabled={!props.canEditInvestigation} placeholder="e.g. Unsafe Act" className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-charcoal-500 mb-1">Subcategory</label>
                            <input value={immediateCauseSubcategoryInput} onChange={(e) => setImmediateCauseSubcategoryInput(e.target.value)} disabled={!props.canEditInvestigation} placeholder="e.g. Improper lifting" className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60" />
                          </div>
                          <div className="lg:col-span-1">
                            <label className="block text-xs font-medium text-charcoal-500 mb-1">Explanation</label>
                            <input value={immediateCauseExplanationInput} onChange={(e) => setImmediateCauseExplanationInput(e.target.value)} disabled={!props.canEditInvestigation} placeholder="Explain this cause" className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60" />
                          </div>
                        </div>
                        <div className="mt-2">
                          <button type="button" onClick={addImmediateCauseEntry} disabled={!props.canEditInvestigation || !immediateCauseExplanationInput.trim()} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal text-white hover:bg-teal-600 disabled:opacity-60">
                            Add cause
                          </button>
                        </div>
                        <div className="mt-3 space-y-2">
                          {immediateCauseEntries.length === 0 && <p className="text-xs text-charcoal-500">No category/subcategory cause entries added yet.</p>}
                          {immediateCauseEntries.map((entry, index) => (
                            <div key={`${entry.category}-${entry.subcategory}-${index}`} className="flex items-start justify-between gap-2 rounded border border-surface-200 p-2 bg-white">
                              <div className="text-xs text-charcoal-600">
                                <p className="font-semibold text-charcoal">{entry.category} / {entry.subcategory}</p>
                                <p>{entry.explanation}</p>
                              </div>
                              {props.canEditInvestigation && (
                                <button type="button" onClick={() => setImmediateCauseEntries((prev) => prev.filter((_, idx) => idx !== index))} className="text-xs text-critical hover:text-critical-600">
                                  Remove
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
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
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="lg:col-span-2 rounded-lg border border-surface-200 p-3 bg-surface-50">
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
                          disabled={!props.canEditInvestigation}
                        />
                      </div>
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
          initialSourceCauseType={createFromCause?.type}
          initialSourceCauseText={createFromCause?.text}
          causeOptions={correctiveActionCauseOptions}
        />
      )}
    </div>
  );
}

