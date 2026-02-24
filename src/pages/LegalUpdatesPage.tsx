import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { useAsync } from '../api/hooks/useAsync';
import type { LegalUpdateCompletionStatus, UUID } from '../api/models/entities';
import {
  LEGAL_UPDATE_COMPLETION_OPTIONS,
  listLegalUpdates,
  renderLegalUpdatesPdfHtml,
  runLegalUpdateReminderSweep,
  toLegalUpdatesCsv
} from '../api/services/legalRequirementsService';
import { listUserProfiles } from '../api/services/profilesService';
import { downloadTextFile } from '../utils/csv';

export function LegalUpdatesPage() {
  const { activeCompanyId } = useTenant();
  const { user } = useUser();
  const [refreshKey, setRefreshKey] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [completionStatus, setCompletionStatus] = useState<'' | LegalUpdateCompletionStatus>('');
  const [responsibleUserId, setResponsibleUserId] = useState('');
  const [deadlineFrom, setDeadlineFrom] = useState('');
  const [deadlineTo, setDeadlineTo] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [requirementSearch, setRequirementSearch] = useState('');

  const { data: profiles } = useAsync(async () => (activeCompanyId ? await listUserProfiles(activeCompanyId) : []), [activeCompanyId]);
  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    (profiles ?? []).forEach((p) => map.set(p.user_id, p.full_name || p.email || p.user_id));
    return map;
  }, [profiles]);

  const { data, loading, error } = useAsync(
    async () => {
      if (!activeCompanyId) return null;
      await runLegalUpdateReminderSweep(activeCompanyId).catch(() => undefined);
      return await listLegalUpdates({
        companyId: activeCompanyId,
        completionStatus: completionStatus || undefined,
        responsibleUserId: (responsibleUserId || undefined) as UUID | undefined,
        deadlineFrom: deadlineFrom || undefined,
        deadlineTo: deadlineTo || undefined,
        overdueOnly,
        requirementSearch,
        page,
        pageSize
      });
    },
    [activeCompanyId, completionStatus, responsibleUserId, deadlineFrom, deadlineTo, overdueOnly, requirementSearch, page, pageSize, refreshKey]
  );

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const exportCsv = () => {
    const csv = toLegalUpdatesCsv(rows, profiles ?? []);
    downloadTextFile(`legal-updates-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8');
  };

  const exportPdf = () => {
    const html = renderLegalUpdatesPdfHtml(rows, userMap);
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.print();
  };

  return (
    <Layout title="Legal Update Tracking">
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-surface-300 p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <input
              value={requirementSearch}
              onChange={(e) => setRequirementSearch(e.target.value)}
              placeholder="Requirement/Standard search"
              className="px-3 py-2 border border-surface-300 rounded-lg text-sm min-w-[240px]"
            />
            <select value={completionStatus} onChange={(e) => setCompletionStatus((e.target.value || '') as any)} className="px-3 py-2 border border-surface-300 rounded-lg text-sm">
              <option value="">All completion status</option>
              {LEGAL_UPDATE_COMPLETION_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <select value={responsibleUserId} onChange={(e) => setResponsibleUserId(e.target.value)} className="px-3 py-2 border border-surface-300 rounded-lg text-sm">
              <option value="">All responsible persons</option>
              {(profiles ?? []).map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  {p.full_name || p.email || p.user_id}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-2 px-3 py-2 border border-surface-300 rounded-lg text-sm">
              <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
              Overdue only
            </label>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-charcoal-500">Deadline range</span>
            <input type="date" value={deadlineFrom} onChange={(e) => setDeadlineFrom(e.target.value)} className="px-2 py-2 border border-surface-300 rounded-lg text-sm" />
            <input type="date" value={deadlineTo} onChange={(e) => setDeadlineTo(e.target.value)} className="px-2 py-2 border border-surface-300 rounded-lg text-sm" />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={exportCsv} className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium hover:bg-surface-50">
              Export CSV
            </button>
            <button type="button" onClick={exportPdf} className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium hover:bg-surface-50">
              Export PDF
            </button>
            {activeCompanyId && user?.id && (
              <button type="button" onClick={() => setRefreshKey((k) => k + 1)} className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium hover:bg-surface-50">
                Refresh
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-surface-300 overflow-auto">
          {error && <p className="p-4 text-sm text-critical">{error.message}</p>}
          {loading && <p className="p-4 text-sm text-charcoal-500">Loading legal updates...</p>}
          {!loading && !error && (
            <table className="w-full min-w-[1280px] text-sm">
              <thead className="bg-surface-50">
                <tr>
                  <th className="px-3 py-2 text-left">Requirement/Standard</th>
                  <th className="px-3 py-2 text-left">Date amended</th>
                  <th className="px-3 py-2 text-left">Law updated date</th>
                  <th className="px-3 py-2 text-left">Summary of change</th>
                  <th className="px-3 py-2 text-left">Impact on business</th>
                  <th className="px-3 py-2 text-left">Action required</th>
                  <th className="px-3 py-2 text-left">Responsible person</th>
                  <th className="px-3 py-2 text-left">Deadline</th>
                  <th className="px-3 py-2 text-left">Completion status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {rows.map((row) => {
                  const responsible = row.responsible_user_id ? userMap.get(row.responsible_user_id) ?? row.responsible_user_id : row.responsible_external_name || '-';
                  const overdue =
                    row.completion_status === 'OPEN' &&
                    !!row.deadline &&
                    new Date(row.deadline).getTime() < new Date(new Date().toISOString().slice(0, 10)).getTime();
                  return (
                    <tr key={row.id}>
                      <td className="px-3 py-2">
                        <Link to={`/dashboard/legal/register/${row.legal_requirement_id}?tab=updates`} className="text-teal hover:underline">
                          {row.requirement_standard || row.legal_requirement_id}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{row.date_amended || '-'}</td>
                      <td className="px-3 py-2">{row.law_updated_date || '-'}</td>
                      <td className="px-3 py-2">{row.summary_of_change || '-'}</td>
                      <td className="px-3 py-2">{row.impact_on_business || '-'}</td>
                      <td className="px-3 py-2">{row.action_required || '-'}</td>
                      <td className="px-3 py-2">{responsible}</td>
                      <td className="px-3 py-2">
                        {row.deadline || '-'}
                        {overdue && <span className="ml-2 inline-flex px-2 py-0.5 rounded bg-critical/10 text-critical text-xs font-semibold">OVERDUE</span>}
                      </td>
                      <td className="px-3 py-2">{row.completion_status}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center text-charcoal-500">
                      No legal updates found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm text-charcoal-500">
            Page {page} of {totalPages} ({total} records)
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1.5 rounded border border-surface-300 text-sm disabled:opacity-50">
              Previous
            </button>
            <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 rounded border border-surface-300 text-sm disabled:opacity-50">
              Next
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
