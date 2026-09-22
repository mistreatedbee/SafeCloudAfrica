import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import { listKPIFindings, attachProofToFinding, closeKPIFindingWithSignOff, rejectKPIFinding } from '../../api/services/kpiFindingService';
import { uploadFile } from '../../api/services/storageService';
import type { KPIFinding, KpiFindingStatus } from '../../api/models/entities';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { ListEmptyState } from '../../components/ui/ListEmptyState';
import { SearchIcon, XIcon, FileIcon } from 'lucide-react';
import { toUserFacingError } from '../../utils/userFacingMessage';

type StatusFilterValue = 'all' | KpiFindingStatus | 'overdue_derived';

function isPastDue(dueDate: string): boolean {
  return dueDate < new Date().toISOString().slice(0, 10);
}

export function KPIFindingsListPage() {
  const navigate = useNavigate();
  const { activeCompanyId } = useTenant();
  const { user } = useUser();
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all');
  const [refreshKey, setRefreshKey] = useState(0);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [signOffComments, setSignOffComments] = useState<Record<string, string>>({});
  const [proofFiles, setProofFiles] = useState<Record<string, File | null>>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadedProofName, setUploadedProofName] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [rejectSubmittingId, setRejectSubmittingId] = useState<string | null>(null);

  const { data: findings, loading } = useAsync<KPIFinding[]>(
    async () => {
      if (!activeCompanyId) return [];
      // "Overdue" is derived (open + past due), not a status ever stored on the row,
      // so it needs its own query shape rather than an .eq('status', ...) filter.
      if (statusFilter === 'overdue_derived') {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        return listKPIFindings({
          organizationId: activeCompanyId,
          status: 'open',
          dueTo: yesterday,
          limit: 200
        });
      }
      return listKPIFindings({
        organizationId: activeCompanyId,
        status: statusFilter === 'all' ? undefined : statusFilter,
        limit: 200
      });
    },
    [activeCompanyId, statusFilter, refreshKey]
  );

  const list = findings ?? [];
  const canClose = (f: KPIFinding) => f.assigned_line_manager_id === user?.id;

  const handleUploadProof = async (findingId: string) => {
    const file = proofFiles[findingId];
    if (!activeCompanyId || !file || !user?.id) return;
    setActionError(null);
    setUploadingId(findingId);
    try {
      const result = await uploadFile('sca-evidence', file, {
        key: `kpi-finding-${findingId}-${Date.now()}-${file.name}`
      });
      await attachProofToFinding(
        findingId as any,
        activeCompanyId,
        {
          storage_bucket: result.bucket,
          storage_key: result.key,
          url: result.url,
          filename: file.name
        },
        user.id as any
      );
      setUploadedProofName((prev) => ({ ...prev, [findingId]: file.name }));
      setProofFiles((prev) => ({ ...prev, [findingId]: null }));
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      setActionError(toUserFacingError(err, 'Failed to upload proof.'));
    } finally {
      setUploadingId(null);
    }
  };

  const handleReject = async (f: KPIFinding) => {
    if (!activeCompanyId || !user?.id) return;
    if (!rejectComment.trim()) return;
    setActionError(null);
    setRejectSubmittingId(f.finding_id);
    try {
      await rejectKPIFinding({
        findingId: f.finding_id,
        organizationId: activeCompanyId,
        actorUserId: user.id as any,
        rejectionReason: rejectComment.trim()
      });
      setRejectingId(null);
      setRejectComment('');
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      setActionError(toUserFacingError(err, 'Failed to reject finding.'));
    } finally {
      setRejectSubmittingId(null);
    }
  };

  const handleClose = async (f: KPIFinding) => {
    if (!activeCompanyId || !user?.id) return;
    const comment = (signOffComments[f.finding_id] ?? '').trim();
    if (!comment) {
      setActionError('A sign-off comment is required before closing this finding.');
      return;
    }
    if (!window.confirm('Close this finding? This cannot be undone.')) return;
    setActionError(null);
    setClosingId(f.finding_id);
    try {
      await closeKPIFindingWithSignOff({
        findingId: f.finding_id,
        organizationId: activeCompanyId,
        managerUserId: user.id as any,
        comment,
        signatureMethod: 'password_confirm'
      });
      setSignOffComments((prev) => {
        const next = { ...prev };
        delete next[f.finding_id];
        return next;
      });
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      setActionError(toUserFacingError(err, 'Failed to close finding.'));
    } finally {
      setClosingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-charcoal">KPI Findings (closure)</h2>
      <div className="flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilterValue)}
          className="px-3 py-2 border border-surface-300 rounded-lg text-sm"
        >
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="awaiting_evidence">Awaiting evidence</option>
          <option value="under_review">Under review</option>
          <option value="closed">Closed</option>
          <option value="rejected">Rejected</option>
          <option value="overdue_derived">Overdue</option>
        </select>
      </div>

      {actionError && (
        <div className="bg-critical/5 border border-critical/20 rounded-xl p-3 text-sm text-critical">
          {actionError}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-3 p-6">
          <LoadingSpinner size={20} />
          <span className="text-charcoal-500">Loading…</span>
        </div>
      )}

      {!loading && list.length === 0 && (
        <ListEmptyState
          icon={SearchIcon}
          title={statusFilter === 'all' ? 'No KPI findings yet' : 'No findings for this status'}
          description="Findings from assessments appear here for evidence upload and manager sign-off."
          primaryAction={{ kind: 'link', to: '/modules/hr/kpis/assessments', label: 'Open KPI assessments' }}
          secondaryAction={
            statusFilter !== 'all' ? { kind: 'button', label: 'Show all statuses', onClick: () => setStatusFilter('all') } : undefined
          }
        />
      )}

      {!loading && list.length > 0 && (
        <div className="space-y-4">
          {list.map((f) => (
            <div key={f.finding_id} className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-charcoal">{f.description}</p>
                  <p className="text-sm text-charcoal-500 mt-1">
                    Due: {f.due_date}
                    {f.status === 'open' && isPastDue(f.due_date) && (
                      <span className="ml-2 text-critical font-medium">Overdue</span>
                    )}
                    {' · '}Status: <span className="capitalize">{f.status.replace('_', ' ')}</span>
                  </p>
                  {f.status === 'rejected' && f.rejection_reason && (
                    <p className="text-sm text-critical mt-1">Rejection reason: {f.rejection_reason}</p>
                  )}
                  {f.proof_uploads && f.proof_uploads.length > 0 && (
                    <div className="mt-2 text-sm">
                      <p className="text-charcoal-500">Proof:</p>
                      <ul className="list-disc pl-4">
                        {(f.proof_uploads as any[]).map((p, i) => (
                          <li key={i}>
                            <a href={p.url} target="_blank" rel="noreferrer" className="text-teal hover:underline">
                              {p.filename ?? p.storage_key}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  {f.status !== 'closed' && (
                    <>
                      {uploadedProofName[f.finding_id] ? (
                        <div className="flex items-center gap-2 text-sm bg-surface-100 rounded-lg px-2 py-1">
                          <FileIcon className="w-3.5 h-3.5 shrink-0 text-charcoal-500" />
                          <span className="truncate max-w-[10rem]">{uploadedProofName[f.finding_id]}</span>
                          <button
                            type="button"
                            onClick={() => setUploadedProofName((prev) => { const next = { ...prev }; delete next[f.finding_id]; return next; })}
                            aria-label="Clear uploaded file indicator"
                            className="text-charcoal-400 hover:text-critical"
                          >
                            <XIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <input
                          type="file"
                          onChange={(e) => setProofFiles((prev) => ({ ...prev, [f.finding_id]: e.target.files?.[0] ?? null }))}
                          disabled={uploadingId === f.finding_id}
                          className="text-sm disabled:opacity-50"
                        />
                      )}
                      {proofFiles[f.finding_id] && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleUploadProof(f.finding_id)}
                            disabled={uploadingId === f.finding_id}
                            className="text-sm px-3 py-1 rounded-lg bg-teal text-white hover:bg-teal-600 disabled:opacity-50 inline-flex items-center gap-1.5"
                          >
                            {uploadingId === f.finding_id && <LoadingSpinner size={12} />}
                            {uploadingId === f.finding_id ? 'Uploading…' : 'Upload proof'}
                          </button>
                          {uploadingId !== f.finding_id && (
                            <button
                              type="button"
                              onClick={() => setProofFiles((prev) => ({ ...prev, [f.finding_id]: null }))}
                              aria-label="Remove selected file"
                              className="text-charcoal-400 hover:text-critical"
                            >
                              <XIcon className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}
                      {canClose(f) && (
                        <>
                          <input
                            type="text"
                            placeholder="Sign-off comment (required)"
                            value={signOffComments[f.finding_id] ?? ''}
                            onChange={(e) =>
                              setSignOffComments((prev) => ({ ...prev, [f.finding_id]: e.target.value }))
                            }
                            disabled={uploadingId === f.finding_id}
                            className="px-2 py-1 border border-surface-300 rounded text-sm w-48 disabled:opacity-50"
                          />
                          <button
                            type="button"
                            onClick={() => handleClose(f)}
                            disabled={closingId === f.finding_id || uploadingId === f.finding_id || !(signOffComments[f.finding_id] ?? '').trim()}
                            title={!(signOffComments[f.finding_id] ?? '').trim() ? 'A sign-off comment is required' : undefined}
                            className="text-sm px-3 py-1 rounded-lg bg-navy text-white hover:bg-navy-800 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {closingId === f.finding_id ? 'Closing…' : 'Close with sign-off'}
                          </button>
                          {rejectingId === f.finding_id ? (
                            <div className="flex flex-col gap-1.5 w-48">
                              <textarea
                                rows={2}
                                placeholder="Reason for rejecting (required)"
                                value={rejectComment}
                                onChange={(e) => setRejectComment(e.target.value)}
                                className="px-2 py-1 border border-surface-300 rounded text-sm"
                                disabled={rejectSubmittingId === f.finding_id}
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleReject(f)}
                                  disabled={!rejectComment.trim() || rejectSubmittingId === f.finding_id}
                                  className="text-sm px-3 py-1 rounded-lg bg-critical text-white hover:bg-critical-600 disabled:opacity-50"
                                >
                                  {rejectSubmittingId === f.finding_id ? 'Rejecting…' : 'Confirm reject'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setRejectingId(null); setRejectComment(''); }}
                                  className="text-sm px-3 py-1 rounded-lg border border-surface-300 hover:bg-surface-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => { setRejectingId(f.finding_id); setRejectComment(''); }}
                              className="text-sm px-3 py-1 rounded-lg border border-critical text-critical hover:bg-critical/5"
                            >
                              Reject
                            </button>
                          )}
                        </>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => navigate(`/modules/hr/kpis/assessments/${f.assessment_id}`)}
                    className="text-sm text-teal hover:underline"
                  >
                    View KPI Assessment
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
