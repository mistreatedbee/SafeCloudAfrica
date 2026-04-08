import React, { useState } from 'react';
import { XIcon, CheckCircle2Icon, ClipboardListIcon } from 'lucide-react';
import type { PpeIssueTracker, PpeIssueTrackerStatus, UUID } from '../../api/models/entities';
import { formatAuthError } from '../../auth/authMessages';
import {
  addPpeIssueProgressUpdate,
  deletePpeIssueTracker,
  setPpeIssueAuditorConfirmation,
  setPpeIssueManagerSignoff,
  setPpeIssueSafetyOfficerVerification,
  transitionPpeIssueStatus
} from '../../api/services/ppeIssueTrackerService';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { EvidenceModal } from '../evidence/EvidenceModal';

export function PpeIssueTrackerDetailModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  actorUserId: UUID;
  issue: PpeIssueTracker;
  /**
   * RBAC flags:
   * - canManagerSignoff: department manager / line manager
   * - canSafetyVerify: safety officer / safety management roles
   * - canAuditorConfirm: auditor role only
   */
  canManagerSignoff: boolean;
  canSafetyVerify: boolean;
  canAuditorConfirm: boolean;
  canDelete?: boolean;
  onChanged?: () => void;
}) {
  const [localIssue, setLocalIssue] = useState<PpeIssueTracker>(props.issue);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  if (!props.open) return null;

  const riskBadgeClass =
    localIssue.risk_level === 'critical'
      ? 'bg-critical/10 text-critical'
      : localIssue.risk_level === 'high'
      ? 'bg-warning/10 text-warning'
      : localIssue.risk_level === 'medium'
      ? 'bg-amber-100 text-amber-800'
      : 'bg-teal/10 text-teal';

  const statusBadgeClass =
    localIssue.status === 'closed'
      ? 'bg-emerald-100 text-emerald-800'
      : localIssue.status === 'overdue'
      ? 'bg-critical/10 text-critical'
      : localIssue.status === 'under_review'
      ? 'bg-indigo-100 text-indigo-800'
      : 'bg-surface-200 text-charcoal-700';
  const canManageWorkflow = props.canManagerSignoff || props.canSafetyVerify || props.canAuditorConfirm;

  async function handleStatusChange(nextStatus: PpeIssueTrackerStatus) {
    setError(null);
    try {
      setSaving(true);
      const updated = await transitionPpeIssueStatus({
        companyId: props.companyId,
        issueId: localIssue.id,
        actorUserId: props.actorUserId,
        nextStatus
      });
      setLocalIssue(updated);
      props.onChanged?.();
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleAddNote() {
    if (!note.trim()) return;
    setError(null);
    try {
      setSaving(true);
      const updated = await addPpeIssueProgressUpdate({
        companyId: props.companyId,
        issueId: localIssue.id,
        actorUserId: props.actorUserId,
        note: note.trim()
      });
      setLocalIssue(updated);
      setNote('');
      props.onChanged?.();
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleManagerSignoff() {
    setError(null);
    try {
      setSaving(true);
      const updated = await setPpeIssueManagerSignoff({
        companyId: props.companyId,
        issueId: localIssue.id,
        actorUserId: props.actorUserId
      });
      setLocalIssue(updated);
      props.onChanged?.();
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleSafetyVerify() {
    setError(null);
    try {
      setSaving(true);
      const updated = await setPpeIssueSafetyOfficerVerification({
        companyId: props.companyId,
        issueId: localIssue.id,
        actorUserId: props.actorUserId
      });
      setLocalIssue(updated);
      props.onChanged?.();
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleAuditorConfirm() {
    setError(null);
    try {
      setSaving(true);
      const updated = await setPpeIssueAuditorConfirmation({
        companyId: props.companyId,
        issueId: localIssue.id,
        actorUserId: props.actorUserId
      });
      setLocalIssue(updated);
      props.onChanged?.();
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteDuplicate() {
    setError(null);
    try {
      if (!props.canDelete) return;
      const ok = confirm('Delete this PPE issue tracker record? This is intended for removing duplicates.');
      if (!ok) return;
      setSaving(true);
      await deletePpeIssueTracker({
        companyId: props.companyId,
        issueId: localIssue.id,
        actorUserId: props.actorUserId
      });
      props.onChanged?.();
      props.onClose();
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 sm:p-6">
        <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
        <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90dvh] overflow-hidden flex flex-col">
          <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-4 border-b border-surface-200">
            <div>
              <p className="text-sm font-semibold text-charcoal flex items-center gap-2">
                <ClipboardListIcon className="w-4 h-4" />
                PPE Issue / Non-compliance
              </p>
              <p className="text-xs text-charcoal-500 mt-0.5">
                {localIssue.contractor_or_employee_name || 'Unnamed person'} •{' '}
                {localIssue.job_role_or_task || 'Task not specified'}
              </p>
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

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {error && (
              <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
                <p className="text-sm font-semibold text-critical">Action failed</p>
                <p className="text-sm text-charcoal-600 mt-1">{error}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-charcoal-400">Status</p>
                <span
                  className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold capitalize ${statusBadgeClass}`}
                >
                  {localIssue.status.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-charcoal-400">Risk level</p>
                <span
                  className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold capitalize ${riskBadgeClass}`}
                >
                  {localIssue.risk_level}
                </span>
              </div>
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-charcoal-400">Category</p>
                <p className="text-sm font-medium text-charcoal capitalize">
                  {localIssue.issue_category.replace(/_/g, ' ')}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-charcoal-400">Reported on</p>
                <p className="text-sm text-charcoal">
                  {new Date(localIssue.date_reported).toLocaleString('en-ZA')}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-charcoal-400">Reported by</p>
                <p className="text-sm text-charcoal">
                  {localIssue.reported_by_name || String(localIssue.reported_by_user_id).slice(0, 8)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-charcoal-400">Site</p>
                <p className="text-sm text-charcoal">
                  {localIssue.site_name_text || (localIssue.site_id ? String(localIssue.site_id).slice(0, 8) : '—')}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-charcoal-400">Department</p>
                <p className="text-sm text-charcoal">
                  {localIssue.department_name_text ||
                    (localIssue.department_id ? String(localIssue.department_id).slice(0, 8) : '—')}
                </p>
              </div>
            </div>

            <div className="space-y-2 border-t border-surface-200 pt-4">
              <p className="text-xs uppercase tracking-wide text-charcoal-400">Description of issue</p>
              <p className="text-sm text-charcoal whitespace-pre-wrap">{localIssue.description_of_issue}</p>
            </div>

            <div className="space-y-2 border-t border-surface-200 pt-4">
              <p className="text-xs uppercase tracking-wide text-charcoal-400">Immediate actions</p>
              <div className="flex flex-wrap gap-2 text-xs">
                {localIssue.immediate_work_stopped && (
                  <span className="px-2 py-0.5 rounded-full bg-surface-200 text-charcoal-700">
                    Work stopped
                  </span>
                )}
                {localIssue.immediate_ppe_issued && (
                  <span className="px-2 py-0.5 rounded-full bg-surface-200 text-charcoal-700">
                    PPE issued
                  </span>
                )}
                {localIssue.immediate_employee_removed && (
                  <span className="px-2 py-0.5 rounded-full bg-surface-200 text-charcoal-700">
                    Employee removed
                  </span>
                )}
                {localIssue.immediate_toolbox_talk && (
                  <span className="px-2 py-0.5 rounded-full bg-surface-200 text-charcoal-700">
                    Toolbox talk
                  </span>
                )}
                {localIssue.immediate_supervisor_notified && (
                  <span className="px-2 py-0.5 rounded-full bg-surface-200 text-charcoal-700">
                    Supervisor notified
                  </span>
                )}
              </div>
              {localIssue.immediate_action_notes && (
                <p className="text-xs text-charcoal-600 whitespace-pre-wrap">
                  {localIssue.immediate_action_notes}
                </p>
              )}
            </div>

            <div className="space-y-3 border-t border-surface-200 pt-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-charcoal-400">
                  Corrective actions & follow-up
                </p>
                <button
                  type="button"
                  onClick={() => setEvidenceOpen(true)}
                  className="text-xs font-medium text-teal hover:text-teal-700"
                >
                  Manage evidence
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-charcoal-400">Corrective action required</p>
                  <p className="text-sm text-charcoal">
                    {localIssue.corrective_action_required ? 'Yes' : 'No'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-charcoal-400">Responsible person</p>
                  <p className="text-sm text-charcoal">
                    {localIssue.responsible_user_name ||
                      (localIssue.responsible_user_id
                        ? String(localIssue.responsible_user_id).slice(0, 8)
                        : 'Not set')}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-charcoal-400">Target completion date</p>
                  <p className="text-sm text-charcoal">
                    {localIssue.target_completion_date
                      ? new Date(localIssue.target_completion_date).toLocaleDateString('en-ZA')
                      : 'Not set'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-charcoal-400">Replacement PPE issued</p>
                  <p className="text-sm text-charcoal">
                    {localIssue.replacement_ppe_issued ? 'Yes' : 'No'}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3 border-t border-surface-200 pt-4">
              <p className="text-xs uppercase tracking-wide text-charcoal-400">Progress log</p>
              <div className="space-y-2 max-h-40 overflow-y-auto border border-surface-200 rounded-lg p-3 bg-surface-50">
                {(!localIssue.progress_updates || localIssue.progress_updates.length === 0) && (
                  <p className="text-xs text-charcoal-500">No progress updates captured yet.</p>
                )}
                {localIssue.progress_updates?.map((u, idx) => (
                  <div key={`${u.timestamp}-${idx}`} className="text-xs text-charcoal-700">
                    <span className="font-semibold">
                      {new Date(u.timestamp).toLocaleString('en-ZA')}
                    </span>
                    {' — '}
                    <span>{u.note}</span>
                  </div>
                ))}
              </div>
              {(props.canManagerSignoff || props.canSafetyVerify || props.canAuditorConfirm) && (
                <div className="flex flex-col sm:flex-row gap-2 items-end">
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder="Add a progress note or update..."
                    className="flex-1 w-full px-3 py-2 bg-white border border-surface-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  />
                  <button
                    type="button"
                    disabled={!note.trim() || saving}
                    onClick={() => void handleAddNote()}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-navy-700 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {saving && <LoadingSpinner size={14} />}
                    Add note
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-3 border-t border-surface-200 pt-4">
              <p className="text-xs uppercase tracking-wide text-charcoal-400">Closure & sign-off</p>
              {props.canDelete && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleDeleteDuplicate()}
                    className="px-3 py-2 rounded-lg border border-critical/40 text-critical text-xs font-medium hover:bg-critical/5 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    Delete duplicate
                  </button>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="space-y-1">
                  <p className="text-charcoal-500">Department manager</p>
                  <p className="text-charcoal-700">
                    {localIssue.department_manager_user_id
                      ? `Signed ${localIssue.department_manager_signed_at
                          ? new Date(localIssue.department_manager_signed_at).toLocaleString('en-ZA')
                          : ''}`
                      : 'Pending'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-charcoal-500">Safety officer</p>
                  <p className="text-charcoal-700">
                    {localIssue.safety_officer_user_id
                      ? `Verified ${
                          localIssue.safety_officer_verified_at
                            ? new Date(localIssue.safety_officer_verified_at).toLocaleString('en-ZA')
                            : ''
                        }`
                      : 'Pending'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-charcoal-500">Auditor (if required)</p>
                  <p className="text-charcoal-700">
                    {localIssue.auditor_user_id
                      ? `Confirmed ${
                          localIssue.auditor_confirmed_at
                            ? new Date(localIssue.auditor_confirmed_at).toLocaleString('en-ZA')
                            : ''
                        }`
                      : localIssue.source_requires_auditor_confirmation
                      ? 'Required'
                      : 'Not required'}
                  </p>
                </div>
              </div>

              {canManageWorkflow && (
                <div className="flex flex-wrap gap-2">
                  {props.canManagerSignoff && !localIssue.department_manager_user_id && (
                    <button
                      type="button"
                      onClick={() => void handleManagerSignoff()}
                      className="px-3 py-2 rounded-lg bg-teal text-white text-xs font-medium hover:bg-teal-600 disabled:opacity-60 disabled:cursor-not-allowed"
                      disabled={saving}
                    >
                      Manager sign-off
                    </button>
                  )}
                  {props.canSafetyVerify && !localIssue.safety_officer_user_id && (
                    <button
                      type="button"
                      onClick={() => void handleSafetyVerify()}
                      className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
                      disabled={saving}
                    >
                      Safety officer verify
                    </button>
                  )}
                  {props.canAuditorConfirm &&
                    localIssue.source_requires_auditor_confirmation &&
                    !localIssue.auditor_user_id && (
                    <button
                      type="button"
                      onClick={() => void handleAuditorConfirm()}
                      className="px-3 py-2 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 disabled:opacity-60 disabled:cursor-not-allowed"
                      disabled={saving}
                    >
                      Auditor confirm
                    </button>
                  )}
                  {localIssue.status !== 'closed' && (
                    <button
                      type="button"
                      onClick={() => void handleStatusChange('closed')}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                      disabled={saving}
                    >
                      <CheckCircle2Icon className="w-4 h-4" />
                      Close issue
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="px-5 py-3 border-t border-surface-200 flex items-center justify-between text-xs text-charcoal-500">
            <span>
              Created {new Date(localIssue.created_by_user_id ? localIssue.date_reported : localIssue.date_reported).toLocaleString('en-ZA')}
            </span>
            {localIssue.repeat_issue_indicator && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning/10 text-warning font-medium">
                Repeat PPE issue in this area
              </span>
            )}
          </div>
        </div>
      </div>

      <EvidenceModal
        open={evidenceOpen}
        onClose={() => setEvidenceOpen(false)}
        companyId={props.companyId}
        actorUserId={props.actorUserId}
        entityType="ppe_issue_tracker"
        entityId={localIssue.id}
        title="PPE Issue Evidence"
      />
    </>
  );
}
