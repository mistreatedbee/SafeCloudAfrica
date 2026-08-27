import { AlertCircleIcon, CheckCircleIcon } from 'lucide-react';
import type { InspectionRun, InspectionRunItem, UserProfile } from '../../api/models/entities';
import { formatUserProfileLabel } from '../../utils/userDisplayNames';

export type InspectionChecklistItemHandlers = {
  onUpdateItem: (item: InspectionRunItem, patch: Record<string, unknown>) => void | Promise<void>;
  onOpenEvidence: (itemId: string) => void;
};

export type InspectionChecklistItemProps = InspectionChecklistItemHandlers & {
  item: InspectionRunItem;
  idx: number;
  run: InspectionRun;
  userProfiles: UserProfile[];
  canScore: boolean;
  isAuditee: boolean;
  isManager: boolean;
  isAuditor: boolean;
  savingItemId: string | null;
  userId: string | undefined;
};

const selectTable = 'px-2 py-1 border border-surface-300 rounded text-xs';
const selectCard = 'w-full min-h-[44px] px-3 py-2 border border-surface-300 rounded-lg text-sm bg-white';
const fieldLabel = 'text-xs font-medium text-charcoal-500 mb-1';

export function InspectionChecklistItemTableRow(props: InspectionChecklistItemProps) {
  const {
    item,
    idx,
    run,
    userProfiles,
    canScore,
    isAuditee,
    isManager,
    isAuditor,
    savingItemId,
    userId,
    onUpdateItem,
    onOpenEvidence
  } = props;
  const completed = run.status === 'completed';

  return (
    <tr className="border-b border-surface-100 align-top">
      <td className="py-2 pr-3 text-xs">{idx + 1}</td>
      <td className="py-2 pr-3 text-xs">{item.audit_section_or_category || item.section || '-'}</td>
      <td className="py-2 pr-3 text-xs">{item.requirement_reference || '-'}</td>
      <td className="py-2 pr-3 text-xs">
        <p>{item.question}</p>
        <textarea
          disabled={(!canScore && !isAuditee) || completed}
          defaultValue={item.comments || ''}
          onBlur={(e) => void onUpdateItem(item, { comments: e.target.value })}
          rows={2}
          className="mt-1 w-full px-2 py-1 border border-surface-300 rounded text-xs"
        />
      </td>
      <td className="py-2 pr-3">
        <select
          disabled={!canScore || completed}
          value={item.inspection_method ?? 'observation'}
          onChange={(e) => void onUpdateItem(item, { inspection_method: e.target.value })}
          className={selectTable}
        >
          <option value="physical-inspection">Physical</option>
          <option value="observation">Observation</option>
          <option value="record-review">Record review</option>
        </select>
      </td>
      <td className="py-2 pr-3">
        <select
          disabled={!canScore || completed}
          value={item.inspection_rating ?? 'C'}
          onChange={(e) => void onUpdateItem(item, { inspection_rating: e.target.value })}
          className={selectTable}
        >
          <option value="C">C — Compliant</option>
          <option value="PC">PC — Partially</option>
          <option value="NC">NC — Non-Compliant</option>
        </select>
      </td>
      <td className="py-2 pr-3">
        <select
          disabled={!canScore || completed}
          value={item.risk_level ?? 'medium'}
          onChange={(e) => void onUpdateItem(item, { risk_level: e.target.value })}
          className={selectTable}
        >
          <option value="low">L — Low</option>
          <option value="medium">M — Medium</option>
          <option value="high">H — High</option>
        </select>
      </td>
      <td className="py-2 pr-3">
        <select
          disabled={!canScore || completed}
          value={item.evidence_required ? 'yes' : 'no'}
          onChange={(e) => void onUpdateItem(item, { evidence_required: e.target.value === 'yes' })}
          className={selectTable}
        >
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </td>
      <td className="py-2 pr-3">
        <select
          disabled={!canScore || completed}
          value={item.corrective_action_required ? 'yes' : 'no'}
          onChange={(e) => void onUpdateItem(item, { corrective_action_required: e.target.value === 'yes' })}
          className={selectTable}
        >
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </td>
      <td className="py-2 pr-3">
        <select
          disabled={!canScore || completed}
          value={item.responsible_person_id ?? ''}
          onChange={(e) => void onUpdateItem(item, { responsible_person_id: e.target.value || null })}
          className={`${selectTable} mb-1`}
        >
          <option value="">Responsible</option>
          {userProfiles.map((p) => (
            <option key={p.user_id} value={p.user_id}>
              {formatUserProfileLabel(p)}
            </option>
          ))}
        </select>
        <input
          type="date"
          defaultValue={item.due_date ?? ''}
          disabled={!canScore || completed}
          onBlur={(e) => void onUpdateItem(item, { due_date: e.target.value || null })}
          className={selectTable}
        />
      </td>
      <td className="py-2 pr-3 text-xs">
        <button
          type="button"
          onClick={() => onOpenEvidence(String(item.id))}
          className="px-2 py-1 rounded border border-surface-300 hover:bg-surface-50"
        >
          Upload/View
        </button>
      </td>
      <td className="py-2 pr-3 text-xs">
        {item.inspection_rating === 'NC' ? (
          <span className="inline-flex items-center gap-1 text-critical">
            <AlertCircleIcon className="w-4 h-4" />
            NC
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-success">
            <CheckCircleIcon className="w-4 h-4" />
            OK
          </span>
        )}
        <div className="mt-1">{item.status}</div>
        {isAuditee && item.status !== 'closed' && (
          <button
            type="button"
            disabled={savingItemId === String(item.id)}
            onClick={() =>
              void onUpdateItem(item, {
                status: 'awaiting-evidence',
                closure_requested_at: new Date().toISOString(),
                closure_evidence_submitted_at: new Date().toISOString()
              })
            }
            className="mt-1 px-2 py-0.5 rounded border border-surface-300"
          >
            Submit closure
          </button>
        )}
        {isManager && item.status === 'awaiting-evidence' && (
          <button
            type="button"
            disabled={savingItemId === String(item.id)}
            onClick={() =>
              void onUpdateItem(item, {
                status: 'in-progress',
                manager_approved_by_user_id: userId ?? null,
                manager_approved_at: new Date().toISOString()
              })
            }
            className="mt-1 px-2 py-0.5 rounded border border-surface-300"
          >
            Manager sign-off
          </button>
        )}
        {(canScore || isAuditor) && item.status === 'in-progress' && (
          <button
            type="button"
            disabled={savingItemId === String(item.id)}
            onClick={() =>
              void onUpdateItem(item, {
                status: 'closed',
                auditor_verified_by_user_id: userId ?? null,
                auditor_verified_at: new Date().toISOString()
              })
            }
            className="mt-1 px-2 py-0.5 rounded border border-surface-300"
          >
            Verify & close
          </button>
        )}
      </td>
    </tr>
  );
}

export function InspectionChecklistItemCard(props: InspectionChecklistItemProps) {
  const {
    item,
    idx,
    run,
    userProfiles,
    canScore,
    isAuditee,
    isManager,
    isAuditor,
    savingItemId,
    userId,
    onUpdateItem,
    onOpenEvidence
  } = props;
  const completed = run.status === 'completed';

  return (
    <div className="rounded-xl border border-surface-200 p-4 space-y-4 bg-surface-50/30">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-charcoal">
          <span className="text-charcoal-500 font-normal">#{idx + 1}</span>{' '}
          {item.audit_section_or_category || item.section || 'Item'}
        </p>
        {item.inspection_rating === 'NC' ? (
          <span className="inline-flex items-center gap-1 text-critical text-xs font-medium shrink-0">
            <AlertCircleIcon className="w-4 h-4" />
            NC
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-success text-xs font-medium shrink-0">
            <CheckCircleIcon className="w-4 h-4" />
            OK
          </span>
        )}
      </div>
      {item.requirement_reference && (
        <div>
          <p className={fieldLabel}>Req ref</p>
          <p className="text-sm text-charcoal">{item.requirement_reference}</p>
        </div>
      )}
      <div>
        <p className={fieldLabel}>Question</p>
        <p className="text-sm text-charcoal">{item.question}</p>
        <label className="sr-only" htmlFor={`insp-comments-${item.id}`}>
          Comments
        </label>
        <textarea
          id={`insp-comments-${item.id}`}
          disabled={(!canScore && !isAuditee) || completed}
          defaultValue={item.comments || ''}
          onBlur={(e) => void onUpdateItem(item, { comments: e.target.value })}
          rows={3}
          className="mt-2 w-full min-h-[88px] px-3 py-2 border border-surface-300 rounded-lg text-sm"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className={fieldLabel}>Method</p>
          <select
            disabled={!canScore || completed}
            value={item.inspection_method ?? 'observation'}
            onChange={(e) => void onUpdateItem(item, { inspection_method: e.target.value })}
            className={selectCard}
          >
            <option value="physical-inspection">Physical</option>
            <option value="observation">Observation</option>
            <option value="record-review">Record review</option>
          </select>
        </div>
        <div>
          <p className={fieldLabel}>Rating</p>
          <select
            disabled={!canScore || completed}
            value={item.inspection_rating ?? 'C'}
            onChange={(e) => void onUpdateItem(item, { inspection_rating: e.target.value })}
            className={selectCard}
          >
            <option value="C">C — Compliant</option>
            <option value="PC">PC — Partially</option>
            <option value="NC">NC — Non-Compliant</option>
          </select>
        </div>
        <div>
          <p className={fieldLabel}>Risk</p>
          <select
            disabled={!canScore || completed}
            value={item.risk_level ?? 'medium'}
            onChange={(e) => void onUpdateItem(item, { risk_level: e.target.value })}
            className={selectCard}
          >
            <option value="low">L — Low</option>
            <option value="medium">M — Medium</option>
            <option value="high">H — High</option>
          </select>
        </div>
        <div>
          <p className={fieldLabel}>Evidence required</p>
          <select
            disabled={!canScore || completed}
            value={item.evidence_required ? 'yes' : 'no'}
            onChange={(e) => void onUpdateItem(item, { evidence_required: e.target.value === 'yes' })}
            className={selectCard}
          >
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
        <div>
          <p className={fieldLabel}>CAPA required</p>
          <select
            disabled={!canScore || completed}
            value={item.corrective_action_required ? 'yes' : 'no'}
            onChange={(e) => void onUpdateItem(item, { corrective_action_required: e.target.value === 'yes' })}
            className={selectCard}
          >
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className={fieldLabel}>Responsible</p>
          <select
            disabled={!canScore || completed}
            value={item.responsible_person_id ?? ''}
            onChange={(e) => void onUpdateItem(item, { responsible_person_id: e.target.value || null })}
            className={selectCard}
          >
            <option value="">Select person</option>
            {userProfiles.map((p) => (
              <option key={p.user_id} value={p.user_id}>
                {formatUserProfileLabel(p)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <p className={fieldLabel}>Due date</p>
          <input
            type="date"
            defaultValue={item.due_date ?? ''}
            disabled={!canScore || completed}
            onBlur={(e) => void onUpdateItem(item, { due_date: e.target.value || null })}
            className={selectCard}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={() => onOpenEvidence(String(item.id))}
        className="min-h-[44px] w-full sm:w-auto inline-flex items-center justify-center px-4 rounded-lg border border-surface-300 text-sm font-medium hover:bg-surface-50"
      >
        Upload / view evidence
      </button>
      <div>
        <p className={fieldLabel}>Status</p>
        <p className="text-sm text-charcoal mb-2">{item.status}</p>
        <div className="flex flex-col gap-2">
          {isAuditee && item.status !== 'closed' && (
            <button
              type="button"
              disabled={savingItemId === String(item.id)}
              onClick={() =>
                void onUpdateItem(item, {
                  status: 'awaiting-evidence',
                  closure_requested_at: new Date().toISOString(),
                  closure_evidence_submitted_at: new Date().toISOString()
                })
              }
              className="min-h-[44px] px-3 rounded-lg border border-surface-300 text-sm font-medium hover:bg-surface-50 disabled:opacity-60"
            >
              Submit closure
            </button>
          )}
          {isManager && item.status === 'awaiting-evidence' && (
            <button
              type="button"
              disabled={savingItemId === String(item.id)}
              onClick={() =>
                void onUpdateItem(item, {
                  status: 'in-progress',
                  manager_approved_by_user_id: userId ?? null,
                  manager_approved_at: new Date().toISOString()
                })
              }
              className="min-h-[44px] px-3 rounded-lg border border-surface-300 text-sm font-medium hover:bg-surface-50 disabled:opacity-60"
            >
              Manager sign-off
            </button>
          )}
          {(canScore || isAuditor) && item.status === 'in-progress' && (
            <button
              type="button"
              disabled={savingItemId === String(item.id)}
              onClick={() =>
                void onUpdateItem(item, {
                  status: 'closed',
                  auditor_verified_by_user_id: userId ?? null,
                  auditor_verified_at: new Date().toISOString()
                })
              }
              className="min-h-[44px] px-3 rounded-lg border border-surface-300 text-sm font-medium hover:bg-surface-50 disabled:opacity-60"
            >
              Verify & close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
