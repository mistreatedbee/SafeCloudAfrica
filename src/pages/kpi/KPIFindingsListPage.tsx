import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import { listKPIFindings, attachProofToFinding, closeKPIFindingWithSignOff } from '../../api/services/kpiFindingService';
import { uploadFile } from '../../api/services/storageService';
import type { KPIFinding, KpiFindingStatus } from '../../api/models/entities';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { ListEmptyState } from '../../components/ui/ListEmptyState';
import { SearchIcon } from 'lucide-react';

export function KPIFindingsListPage() {
  const navigate = useNavigate();
  const { activeCompanyId } = useTenant();
  const { user } = useUser();
  const [statusFilter, setStatusFilter] = useState<'all' | KpiFindingStatus>('all');
  const [refreshKey, setRefreshKey] = useState(0);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [signOffComments, setSignOffComments] = useState<Record<string, string>>({});
  const [proofFile, setProofFile] = useState<File | null>(null);

  const { data: findings, loading } = useAsync<KPIFinding[]>(
    async () => {
      if (!activeCompanyId) return [];
      return listKPIFindings({
        organizationId: activeCompanyId,
        status: statusFilter === 'all' ? undefined : statusFilter,
        limit: 200
      });
    },
    [activeCompanyId, statusFilter, refreshKey]
  );

  const list = findings ?? [];
  const canClose = (f: KPIFinding) => f.assigned_line_manager_id === user?.id || true;

  const handleUploadProof = async (findingId: string) => {
    if (!activeCompanyId || !proofFile || !user?.id) return;
    const result = await uploadFile('sca-evidence', proofFile, {
      key: `kpi-finding-${findingId}-${Date.now()}-${proofFile.name}`
    });
    await attachProofToFinding(
      findingId as any,
      activeCompanyId,
      {
        storage_bucket: result.bucket,
        storage_key: result.key,
        url: result.url,
        filename: proofFile.name
      },
      user.id as any
    );
    setProofFile(null);
    setRefreshKey((k) => k + 1);
  };

  const handleClose = async (f: KPIFinding) => {
    if (!activeCompanyId || !user?.id) return;
    setClosingId(f.finding_id);
    try {
      await closeKPIFindingWithSignOff({
        findingId: f.finding_id,
        organizationId: activeCompanyId,
        managerUserId: user.id as any,
        comment: signOffComments[f.finding_id] ?? undefined,
        signatureMethod: 'password_confirm'
      });
      setSignOffComments((prev) => {
        const next = { ...prev };
        delete next[f.finding_id];
        return next;
      });
      setRefreshKey((k) => k + 1);
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
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="px-3 py-2 border border-surface-300 rounded-lg text-sm"
        >
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="awaiting_evidence">Awaiting evidence</option>
          <option value="under_review">Under review</option>
          <option value="closed">Closed</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>

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
                    Due: {f.due_date} · Status: <span className="capitalize">{f.status.replace('_', ' ')}</span>
                  </p>
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
                      <input
                        type="file"
                        onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                        className="text-sm"
                      />
                      {proofFile && (
                        <button
                          type="button"
                          onClick={() => handleUploadProof(f.finding_id)}
                          className="text-sm px-3 py-1 rounded-lg bg-teal text-white hover:bg-teal-600"
                        >
                          Upload proof
                        </button>
                      )}
                      {canClose(f) && f.status !== 'closed' && (
                        <>
                          <input
                            type="text"
                            placeholder="Sign-off comment"
                            value={signOffComments[f.finding_id] ?? ''}
                            onChange={(e) =>
                              setSignOffComments((prev) => ({ ...prev, [f.finding_id]: e.target.value }))
                            }
                            className="px-2 py-1 border border-surface-300 rounded text-sm w-48"
                          />
                          <button
                            type="button"
                            onClick={() => handleClose(f)}
                            disabled={closingId === f.finding_id}
                            className="text-sm px-3 py-1 rounded-lg bg-navy text-white hover:bg-navy-800 disabled:opacity-50"
                          >
                            {closingId === f.finding_id ? 'Closing…' : 'Close with sign-off'}
                          </button>
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
