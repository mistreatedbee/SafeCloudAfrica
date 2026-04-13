import React, { useEffect, useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { PjoObservation, PjoResponse, UUID } from '../../api/models/entities';
import { closePjo, listPjoResponses, updatePjoResponse, updatePjo } from '../../api/services/pjoService';
import { useAsync } from '../../api/hooks/useAsync';
import { createQualityNcr, closeQualityNcr } from '../../api/services/qualityNcrsService';
import { createCorrectiveAction } from '../../api/services/correctiveActionsService';
import { useNavigate } from 'react-router-dom';

function severityForResponse(r: { yes_no: boolean | null; rating: number | null }): 'low' | 'medium' | 'high' | 'critical' {
  if (r.rating === 1 || r.yes_no === false) return 'high';
  if (r.rating === 2) return 'medium';
  return 'low';
}

function needsNcr(r: PjoResponse): boolean {
  const hasDeviation = Boolean(r.deviation && r.deviation.trim().length > 0);
  return r.yes_no === false || r.rating === 1 || hasDeviation;
}

export function PjoDetailModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  actorUserId: UUID;
  activeRole: string | null;
  pjo: PjoObservation | null;
}) {
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [savingId, setSavingId] = useState<UUID | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [headerSaving, setHeaderSaving] = useState(false);
  const [closingPjo, setClosingPjo] = useState(false);
  const [localPjo, setLocalPjo] = useState<PjoObservation | null>(props.pjo);
  const [nextObservationDate, setNextObservationDate] = useState<string>(
    props.pjo?.next_observation_at ?? ''
  );

  useEffect(() => {
    setLocalPjo(props.pjo);
    setNextObservationDate(props.pjo?.next_observation_at ?? '');
  }, [props.pjo]);

  const canManage =
    props.activeRole === 'admin' ||
    props.activeRole === 'manager' ||
    props.activeRole === 'supervisor' ||
    props.activeRole === 'consultant';
  const canSignOff =
    props.activeRole === 'admin' ||
    props.activeRole === 'manager' ||
    props.activeRole === 'supervisor';

  const { data: responses, loading } = useAsync<PjoResponse[]>(
    async () => {
      if (!props.open || !props.companyId || !localPjo?.id) return [];
      return await listPjoResponses(props.companyId, localPjo.id);
    },
    [props.open, props.companyId, localPjo?.id, refreshKey]
  );

  const list = responses ?? [];
  const flaggedCount = useMemo(() => list.filter(needsNcr).length, [list]);
  const openItemsCount = useMemo(() => list.filter((r) => !r.closed).length, [list]);

  async function saveRow(r: PjoResponse, patch: Partial<PjoResponse>) {
    if (!localPjo) return;
    setError(null);
    try {
      setSavingId(r.id);
      const nowIso = new Date().toISOString();
      const finalPatch: Partial<PjoResponse> = { ...patch };
      if (finalPatch.closed && canSignOff) {
        finalPatch.manager_signoff_user_id = props.actorUserId;
        finalPatch.manager_signoff_at = nowIso;
        finalPatch.closed_at = nowIso;
        finalPatch.closed_by_user_id = props.actorUserId;
      }

      const updated = await updatePjoResponse({
        companyId: props.companyId,
        responseId: r.id,
        actorUserId: props.actorUserId,
        patch: finalPatch
      });

      // Auto-create NCR for non-compliant findings.
      if (needsNcr(updated) && !updated.ncr_id) {
        const severity = severityForResponse(updated);
        const riskClassification =
          severity === 'critical' ? 'critical' : severity === 'high' ? 'high' : severity === 'medium' ? 'medium' : 'low';
        const ncr = await createQualityNcr({
          companyId: props.companyId,
          module: 'hr',
          title: `PJO Finding: ${localPjo.employee_name} (Q${updated.question_no})`,
          description: updated.deviation || updated.question_text,
          severity,
          createdByUserId: props.actorUserId,
          source_entity_type: 'pjo',
          source_entity_id: localPjo.id,
          risk_classification: riskClassification,
          risk_rating: String(updated.rating ?? ''),
          metadata: {
            pjoId: localPjo.id,
            responseId: updated.id,
            questionNo: updated.question_no
          }
        });
        await updatePjoResponse({
          companyId: props.companyId,
          responseId: updated.id,
          actorUserId: props.actorUserId,
          patch: { ncr_id: ncr.id }
        });
      }

      // Auto-close linked NCR when response is closed + signed off.
      if (updated.closed && updated.ncr_id && canSignOff) {
        await closeQualityNcr(updated.ncr_id, props.companyId, props.actorUserId, props.actorUserId);
      }

      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setSavingId(null);
    }
  }

  async function saveHeaderNextObservation() {
    if (!localPjo) return;
    setHeaderSaving(true);
    setError(null);
    try {
      const updated = await updatePjo({
        companyId: props.companyId,
        pjoId: localPjo.id,
        actorUserId: props.actorUserId,
        patch: {
          next_observation_at: nextObservationDate || null
        }
      });
      setLocalPjo(updated);
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setHeaderSaving(false);
    }
  }

  async function handleClosePjo() {
    if (!localPjo) return;
    setClosingPjo(true);
    setError(null);
    try {
      const updated = await closePjo({
        companyId: props.companyId,
        pjoId: localPjo.id,
        actorUserId: props.actorUserId
      });
      setLocalPjo(updated);
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setClosingPjo(false);
    }
  }

  if (!props.open || !localPjo) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-6xl bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90dvh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-surface-200 px-5 py-4 flex items-center justify-between z-10">
          <div>
            <p className="text-sm font-semibold text-charcoal">Plan Job Observation</p>
            <p className="text-xs text-charcoal-500 mt-0.5">
              {localPjo.employee_name} • {localPjo.job_observed} • {localPjo.observed_at} •{' '}
              {flaggedCount} finding(s)
            </p>
          </div>
          <div className="flex items-center gap-3">
            {canSignOff && localPjo.status === 'open' && (
              <button
                type="button"
                disabled={closingPjo || openItemsCount > 0}
                onClick={() => void handleClosePjo()}
                className="px-4 py-2 rounded-lg bg-teal text-white text-xs font-semibold hover:bg-teal-600 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {closingPjo ? <LoadingSpinner size={14} /> : openItemsCount > 0 ? `Close PJO (items open)` : 'Close PJO'}
              </button>
            )}
            <button
              type="button"
              onClick={props.onClose}
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-surface-100 text-charcoal-500 shrink-0"
              aria-label="Close"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-critical">Could not save</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          <div className="bg-surface-50 border border-surface-200 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-charcoal">Section 1 (Header)</p>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm text-charcoal-600">
              <div>
                <p className="text-xs text-charcoal-500">Employee</p>
                <p className="font-medium">{localPjo.employee_name}</p>
              </div>
              <div>
                <p className="text-xs text-charcoal-500">Reason</p>
                <p className="font-medium">{localPjo.reason}</p>
              </div>
              <div>
                <p className="text-xs text-charcoal-500">Department / Site</p>
                <p className="font-medium">
                  {localPjo.department ?? '—'} / {localPjo.site ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-charcoal-500">Status</p>
                <p className="font-medium uppercase">{localPjo.status}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-charcoal-600">
              <div>
                <p className="text-xs text-charcoal-500">Job observed</p>
                <p className="font-medium">{localPjo.job_observed}</p>
              </div>
              <div>
                <p className="text-xs text-charcoal-500">Observed at</p>
                <p className="font-medium">{localPjo.observed_at}</p>
              </div>
              <div>
                <p className="text-xs text-charcoal-500 mb-1">Next observation</p>
                {canManage ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={nextObservationDate}
                      onChange={(e) => setNextObservationDate(e.target.value)}
                      className="px-3 py-1.5 bg-white border border-surface-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                    />
                    <button
                      type="button"
                      disabled={headerSaving}
                      onClick={() => void saveHeaderNextObservation()}
                      className="px-3 py-1.5 rounded-lg bg-teal text-white text-xs font-semibold hover:bg-teal-600 disabled:opacity-60"
                    >
                      {headerSaving ? <LoadingSpinner size={12} /> : 'Save'}
                    </button>
                  </div>
                ) : (
                  <p className="font-medium">{localPjo.next_observation_at ?? '—'}</p>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
              <h3 className="font-semibold text-charcoal">Section 2 (Checklist)</h3>
              {!canManage && <span className="text-xs text-charcoal-500">Read-only (role restricted)</span>}
            </div>

            {loading && (
              <div className="px-5 py-4 text-sm text-charcoal-500">Loading checklist…</div>
            )}

            {!loading && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface-50">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">#</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Question</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Category</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Yes/No</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Rating</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Deviation / NC</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Corrective action</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Responsible</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Sign-off</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold text-charcoal-500 uppercase tracking-wider">Save</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {list.map((r) => (
                      <PjoResponseRow
                        key={r.id}
                        row={r}
                        canEdit={canManage}
                        canSignOff={canSignOff}
                        saving={savingId === r.id}
                        onSave={(patch) => void saveRow(r, patch)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PjoResponseRow(props: {
  row: PjoResponse;
  canEdit: boolean;
  canSignOff: boolean;
  saving: boolean;
  onSave: (patch: Partial<PjoResponse>) => void;
}) {
  const [yesNo, setYesNo] = useState<string>(props.row.yes_no === null ? '' : props.row.yes_no ? 'yes' : 'no');
  const [rating, setRating] = useState<string>(props.row.rating === null ? '' : String(props.row.rating));
  const [deviation, setDeviation] = useState(props.row.deviation ?? '');
  const [action, setAction] = useState(props.row.suggested_corrective_action ?? '');
  const [responsible, setResponsible] = useState(props.row.responsible_person ?? '');
  const [responsibleDept, setResponsibleDept] = useState(props.row.responsible_department ?? '');
  const [implemented, setImplemented] = useState<boolean>(props.row.corrective_action_implemented);
  const [implementedAt, setImplementedAt] = useState<string>(props.row.implemented_at ?? '');
  const [closed, setClosed] = useState(Boolean(props.row.closed));

  const hasNcr = Boolean(props.row.ncr_id);

  useEffect(() => {
    setYesNo(props.row.yes_no === null ? '' : props.row.yes_no ? 'yes' : 'no');
    setRating(props.row.rating === null ? '' : String(props.row.rating));
    setDeviation(props.row.deviation ?? '');
    setAction(props.row.suggested_corrective_action ?? '');
    setResponsible(props.row.responsible_person ?? '');
    setResponsibleDept(props.row.responsible_department ?? '');
    setImplemented(props.row.corrective_action_implemented);
    setImplementedAt(props.row.implemented_at ?? '');
    setClosed(Boolean(props.row.closed));
  }, [props.row]);

  return (
    <tr className={needsNcr({ ...props.row, deviation }) ? 'bg-critical/5' : ''}>
      <td className="px-5 py-4 text-sm text-charcoal-500">{props.row.question_no}</td>
      <td className="px-5 py-4 text-sm text-charcoal">{props.row.question_text}</td>
      <td className="px-5 py-4 text-xs text-charcoal-500">
        {(props.row.category ?? '').trim() || '—'}
      </td>
      <td className="px-5 py-4">
        <select
          value={yesNo}
          disabled={!props.canEdit}
          onChange={(e) => setYesNo(e.target.value)}
          className="w-24 px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent disabled:bg-surface-50"
        >
          <option value="">—</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </td>
      <td className="px-5 py-4">
        <select
          value={rating}
          disabled={!props.canEdit}
          onChange={(e) => setRating(e.target.value)}
          className="w-24 px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent disabled:bg-surface-50"
        >
          <option value="">—</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
        </select>
      </td>
      <td className="px-5 py-4">
        <input
          value={deviation}
          disabled={!props.canEdit}
          onChange={(e) => setDeviation(e.target.value)}
          placeholder="Deviation / NC"
          className="w-56 px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent disabled:bg-surface-50"
        />
      </td>
      <td className="px-5 py-4">
        <input
          value={action}
          disabled={!props.canEdit}
          onChange={(e) => setAction(e.target.value)}
          placeholder="Suggested action"
          className="w-56 px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent disabled:bg-surface-50"
        />
      </td>
      <td className="px-5 py-4">
        <div className="space-y-2">
          <input
            value={responsible}
            disabled={!props.canEdit}
            onChange={(e) => setResponsible(e.target.value)}
            placeholder="Responsible person"
            className="w-44 px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent disabled:bg-surface-50"
          />
          <input
            value={responsibleDept}
            disabled={!props.canEdit}
            onChange={(e) => setResponsibleDept(e.target.value)}
            placeholder="Responsible department"
            className="w-44 px-3 py-2 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent disabled:bg-surface-50"
          />
        </div>
        <div className="mt-2 flex flex-col gap-1 text-xs text-charcoal-500">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={implemented}
              disabled={!props.canEdit}
              onChange={(e) => {
                const next = e.target.checked;
                setImplemented(next);
                if (next && !implementedAt) {
                  const today = new Date().toISOString().slice(0, 10);
                  setImplementedAt(today);
                }
              }}
              className="h-4 w-4"
            />
            Corrective action implemented
          </label>
          {implemented && (
            <div className="flex items-center gap-2">
              <span>on</span>
              <input
                type="date"
                value={implementedAt ?? ''}
                disabled={!props.canEdit}
                onChange={(e) => setImplementedAt(e.target.value)}
                className="px-2 py-1 bg-white border border-surface-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-teal focus:border-transparent disabled:bg-surface-50"
              />
            </div>
          )}
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={closed}
              disabled={!props.canSignOff}
              onChange={(e) => setClosed(e.target.checked)}
              className="h-4 w-4"
            />
            Closed
          </label>
          {hasNcr && <span className="text-critical font-semibold">NCR linked</span>}
        </div>
      </td>
      <td className="px-5 py-4 text-xs text-charcoal-500">
        {props.row.manager_signoff_at ? 'Signed' : '—'}
      </td>
      <td className="px-5 py-4 text-right">
        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            disabled={props.saving || (!props.canEdit && !props.canSignOff)}
            onClick={() =>
              props.onSave({
                yes_no: yesNo === '' ? null : yesNo === 'yes',
                rating: rating === '' ? null : (Number(rating) as any),
                deviation: deviation.trim() || null,
                suggested_corrective_action: action.trim() || null,
                responsible_person: responsible.trim() || null,
                responsible_department: responsibleDept.trim() || null,
                corrective_action_implemented: implemented,
                implemented_at: implemented
                  ? implementedAt || new Date().toISOString().slice(0, 10)
                  : null,
                closed
              })
            }
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {props.saving && <LoadingSpinner size={14} />}
            Save
          </button>
          {hasNcr && (
            <button
              type="button"
              onClick={() => navigate('/dashboard/management/ncrs')}
              className="text-[11px] text-critical underline"
            >
              View in NCR list
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

