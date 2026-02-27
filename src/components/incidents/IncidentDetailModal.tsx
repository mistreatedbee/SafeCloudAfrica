import React, { useEffect, useMemo, useState } from 'react';
import { XIcon, SaveIcon, ExternalLinkIcon, FileTextIcon } from 'lucide-react';
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
  const { fullName, organisationName } = useIdentity();

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
    } catch (e: any) {
      setError(formatAuthError(e));
    } finally {
      setLoading(false);
    }
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
                      disabled={loading}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60"
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

                <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Notes</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      disabled={!props.canEditInvestigation}
                      rows={4}
                      className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Instruction breakdown / flow</label>
                    <textarea
                      value={instructionBreakdown}
                      onChange={(e) => setInstructionBreakdown(e.target.value)}
                      disabled={!props.canEditInvestigation}
                      rows={4}
                      className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Risk (L/M/H)</label>
                    <input
                      value={risk}
                      onChange={(e) => setRisk(e.target.value)}
                      disabled={!props.canEditInvestigation}
                      className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Risk profile (hazards)</label>
                    <input
                      value={riskProfile}
                      onChange={(e) => setRiskProfile(e.target.value)}
                      disabled={!props.canEditInvestigation}
                      className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Consequence / potential consequence</label>
                    <textarea
                      value={potentialConsequence}
                      onChange={(e) => setPotentialConsequence(e.target.value)}
                      disabled={!props.canEditInvestigation}
                      rows={3}
                      className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Task sequence</label>
                    <textarea
                      value={taskSequence}
                      onChange={(e) => setTaskSequence(e.target.value)}
                      disabled={!props.canEditInvestigation}
                      rows={4}
                      className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Incident event timeline</label>
                    <textarea
                      value={eventTimeline}
                      onChange={(e) => setEventTimeline(e.target.value)}
                      disabled={!props.canEditInvestigation}
                      rows={4}
                      className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="block text-sm font-medium text-charcoal mb-1.5">
                      Immediate causes (comma-separated)
                    </label>
                    <textarea
                      value={immediateCauses}
                      onChange={(e) => setImmediateCauses(e.target.value)}
                      disabled={!props.canEditInvestigation}
                      rows={3}
                      placeholder="e.g. Shortcuts, Improper lifting, PPE not used"
                      className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="block text-sm font-medium text-charcoal mb-1.5">
                      Root causes (Human factors) (comma-separated)
                    </label>
                    <textarea
                      value={rootHuman}
                      onChange={(e) => setRootHuman(e.target.value)}
                      disabled={!props.canEditInvestigation}
                      rows={3}
                      className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="block text-sm font-medium text-charcoal mb-1.5">
                      Root causes (Workplace factors) (comma-separated)
                    </label>
                    <textarea
                      value={rootWorkplace}
                      onChange={(e) => setRootWorkplace(e.target.value)}
                      disabled={!props.canEditInvestigation}
                      rows={3}
                      className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="block text-sm font-medium text-charcoal mb-1.5">
                      System failures (comma-separated)
                    </label>
                    <textarea
                      value={systemFailures}
                      onChange={(e) => setSystemFailures(e.target.value)}
                      disabled={!props.canEditInvestigation}
                      rows={3}
                      className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Contributing factors</label>
                    <textarea
                      value={contributingFactors}
                      onChange={(e) => setContributingFactors(e.target.value)}
                      disabled={!props.canEditInvestigation}
                      rows={3}
                      className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Lessons learnt</label>
                    <textarea
                      value={lessonsLearnt}
                      onChange={(e) => setLessonsLearnt(e.target.value)}
                      disabled={!props.canEditInvestigation}
                      rows={4}
                      className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Conclusion</label>
                    <textarea
                      value={conclusion}
                      onChange={(e) => setConclusion(e.target.value)}
                      disabled={!props.canEditInvestigation}
                      rows={4}
                      className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Prepared by</label>
                    <input
                      value={preparedBy}
                      onChange={(e) => setPreparedBy(e.target.value)}
                      disabled={!props.canEditInvestigation}
                      className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Investigation team (comma-separated)</label>
                    <input
                      value={investigationTeam}
                      onChange={(e) => setInvestigationTeam(e.target.value)}
                      disabled={!props.canEditInvestigation}
                      className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Distributions / copy to (comma-separated)</label>
                    <input
                      value={distributions}
                      onChange={(e) => setDistributions(e.target.value)}
                      disabled={!props.canEditInvestigation}
                      className="w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60"
                    />
                  </div>
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
        />
      )}
    </div>
  );
}

