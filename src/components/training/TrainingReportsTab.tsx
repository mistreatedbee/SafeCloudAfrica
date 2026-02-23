import React, { useState } from 'react';
import { DownloadIcon, CalendarIcon } from 'lucide-react';
import { useAsync } from '../../api/hooks/useAsync';
import type { TrainingRecord, UUID } from '../../api/models/entities';
import {
  getTrainingSpendSummary,
  listOutstandingTraining,
  listExpiringSoonTraining,
  listTrainingCourses,
  listTrainingProviders,
  listJobDescriptions
} from '../../api/services/trainingService';
import { listUserProfiles } from '../../api/services/profilesService';
import { LoadingSpinner } from '../ui/LoadingSpinner';

function toCsvRows(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? '');
          if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
          return s;
        })
        .join(',')
    )
    .join('\r\n');
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = toCsvRows(rows);
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function TrainingReportsTab(props: { companyId: UUID }) {
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 12);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expiringDays, setExpiringDays] = useState(30);

  const fromIso = `${fromDate}T00:00:00.000Z`;
  const toIso = `${toDate}T23:59:59.999Z`;

  const { data: summary, loading: summaryLoading } = useAsync(
    () =>
      props.companyId
        ? getTrainingSpendSummary(props.companyId, { fromDate: fromIso, toDate: toIso })
        : { totalCost: 0, byCourse: [], byProvider: [], byJob: [], recordCount: 0 },
    [props.companyId, fromDate, toDate]
  );
  const { data: outstanding } = useAsync(
    () => (props.companyId ? listOutstandingTraining(props.companyId) : []),
    [props.companyId]
  );
  const { data: expiringSoon } = useAsync(
    () => (props.companyId ? listExpiringSoonTraining(props.companyId, expiringDays) : []),
    [props.companyId, expiringDays]
  );
  const { data: courses } = useAsync(
    () => (props.companyId ? listTrainingCourses(props.companyId) : []),
    [props.companyId]
  );
  const { data: providers } = useAsync(
    () => (props.companyId ? listTrainingProviders(props.companyId) : []),
    [props.companyId]
  );
  const { data: jobs } = useAsync(
    () => (props.companyId ? listJobDescriptions(props.companyId) : []),
    [props.companyId]
  );
  const { data: profiles } = useAsync(
    () => (props.companyId ? listUserProfiles(props.companyId) : []),
    [props.companyId]
  );

  const courseById = new Map((courses ?? []).map((c) => [c.id, c.name]));
  const profileByUserId = new Map((profiles ?? []).map((p) => [p.user_id, p]));

  function exportCostSummary() {
    if (!summary) return;
    const rows = [
      ['Training cost summary', fromDate, 'to', toDate],
      [],
      ['Total cost (ZAR)', String(summary.totalCost.toFixed(2))],
      ['Records with cost', String(summary.recordCount)],
      [],
      ['By course', 'Course name', 'Total (ZAR)', 'Count'],
      ...summary.byCourse.map((r) => [r.courseId, r.courseName, r.totalCost.toFixed(2), String(r.count)]),
      [],
      ['By provider', 'Provider name', 'Total (ZAR)', 'Count'],
      ...summary.byProvider.map((r) => [r.providerId, r.providerName, r.totalCost.toFixed(2), String(r.count)]),
      [],
      ['By job', 'Job title', 'Total (ZAR)', 'Count'],
      ...summary.byJob.map((r) => [r.jobDescriptionId, r.jobTitle, r.totalCost.toFixed(2), String(r.count)])
    ];
    downloadCsv(`training-cost-summary-${fromDate}-${toDate}.csv`, rows);
  }

  function exportOutstanding() {
    const rows = [
      ['Outstanding training', 'User', 'Course', 'Status', 'User ID', 'Record ID'],
      ...(outstanding ?? []).map((r) => [
        courseById.get(r.course_id) ?? '',
        profileByUserId.get(r.user_id)?.full_name || profileByUserId.get(r.user_id)?.email || r.user_id,
        courseById.get(r.course_id) ?? '',
        r.status,
        r.user_id,
        r.id
      ])
    ];
    downloadCsv(`training-outstanding-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  function exportExpiringSoon() {
    const rows = [
      ['Expiring soon (within ' + expiringDays + ' days)', 'User', 'Course', 'Expiry date', 'User ID', 'Record ID'],
      ...(expiringSoon ?? []).map((r) => [
        profileByUserId.get(r.user_id)?.full_name || profileByUserId.get(r.user_id)?.email || r.user_id,
        courseById.get(r.course_id) ?? '',
        r.expires_at ?? '',
        r.user_id,
        r.id
      ])
    ];
    downloadCsv(`training-expiring-soon-${expiringDays}d-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-charcoal-500" />
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="px-3 py-2 border border-surface-300 rounded-lg text-sm"
          />
          <span className="text-charcoal-500">to</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="px-3 py-2 border border-surface-300 rounded-lg text-sm"
          />
        </div>
        <button
          type="button"
          onClick={exportCostSummary}
          disabled={summaryLoading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-medium hover:bg-teal-600 disabled:opacity-60"
        >
          {summaryLoading && <LoadingSpinner size={16} />}
          <DownloadIcon className="w-4 h-4" />
          Export cost summary (CSV)
        </button>
      </div>

      {summaryLoading ? (
        <div className="flex items-center gap-2 text-charcoal-500 py-8">
          <LoadingSpinner size={24} />
          Loading…
        </div>
      ) : summary ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <p className="text-sm text-charcoal-500">Total training spend (date range)</p>
              <p className="text-2xl font-bold text-teal mt-1">
                ZAR {summary.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-charcoal-500 mt-1">{summary.recordCount} records with cost</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-surface-300 overflow-hidden shadow-card">
              <div className="px-4 py-2 bg-surface-50 font-medium text-charcoal text-sm">By course</div>
              <div className="overflow-x-auto max-h-48 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface-100 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-charcoal-500">Course</th>
                      <th className="px-3 py-2 text-right font-medium text-charcoal-500">ZAR</th>
                      <th className="px-3 py-2 text-right font-medium text-charcoal-500">Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {summary.byCourse.map((r) => (
                      <tr key={r.courseId}>
                        <td className="px-3 py-2 text-charcoal">{r.courseName || r.courseId}</td>
                        <td className="px-3 py-2 text-right">{r.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="px-3 py-2 text-right">{r.count}</td>
                      </tr>
                    ))}
                    {summary.byCourse.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-3 py-4 text-charcoal-500 text-center">
                          No cost data
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-surface-300 overflow-hidden shadow-card">
              <div className="px-4 py-2 bg-surface-50 font-medium text-charcoal text-sm">By provider</div>
              <div className="overflow-x-auto max-h-48 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface-100 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-charcoal-500">Provider</th>
                      <th className="px-3 py-2 text-right font-medium text-charcoal-500">ZAR</th>
                      <th className="px-3 py-2 text-right font-medium text-charcoal-500">Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {summary.byProvider.map((r) => (
                      <tr key={r.providerId}>
                        <td className="px-3 py-2 text-charcoal">{r.providerName || r.providerId}</td>
                        <td className="px-3 py-2 text-right">{r.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="px-3 py-2 text-right">{r.count}</td>
                      </tr>
                    ))}
                    {summary.byProvider.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-3 py-4 text-charcoal-500 text-center">
                          No cost data
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-surface-300 overflow-hidden shadow-card">
              <div className="px-4 py-2 bg-surface-50 font-medium text-charcoal text-sm">By job description</div>
              <div className="overflow-x-auto max-h-48 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface-100 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-charcoal-500">Job</th>
                      <th className="px-3 py-2 text-right font-medium text-charcoal-500">ZAR</th>
                      <th className="px-3 py-2 text-right font-medium text-charcoal-500">Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {summary.byJob.map((r) => (
                      <tr key={r.jobDescriptionId}>
                        <td className="px-3 py-2 text-charcoal">{r.jobTitle || r.jobDescriptionId}</td>
                        <td className="px-3 py-2 text-right">{r.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="px-3 py-2 text-right">{r.count}</td>
                      </tr>
                    ))}
                    {summary.byJob.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-3 py-4 text-charcoal-500 text-center">
                          No cost data
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-surface-300 overflow-hidden shadow-card">
          <div className="px-4 py-2 bg-surface-50 flex items-center justify-between">
            <span className="font-medium text-charcoal text-sm">Outstanding training</span>
            <button
              type="button"
              onClick={exportOutstanding}
              className="text-xs px-2 py-1 rounded border border-surface-300 hover:bg-surface-100 text-charcoal-600"
            >
              Export CSV
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-100 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-charcoal-500">User</th>
                  <th className="px-3 py-2 text-left font-medium text-charcoal-500">Course</th>
                  <th className="px-3 py-2 text-left font-medium text-charcoal-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {(outstanding ?? []).slice(0, 50).map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-charcoal">
                      {profileByUserId.get(r.user_id)?.full_name || profileByUserId.get(r.user_id)?.email || String(r.user_id).slice(0, 8)}
                    </td>
                    <td className="px-3 py-2 text-charcoal">{courseById.get(r.course_id) ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded text-xs bg-critical/15 text-critical">{r.status}</span>
                    </td>
                  </tr>
                ))}
                {(outstanding ?? []).length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-charcoal-500 text-center">None</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-surface-300 overflow-hidden shadow-card">
          <div className="px-4 py-2 bg-surface-50 flex items-center justify-between flex-wrap gap-2">
            <span className="font-medium text-charcoal text-sm">Expiring soon</span>
            <div className="flex items-center gap-2">
              <select
                value={expiringDays}
                onChange={(e) => setExpiringDays(Number(e.target.value))}
                className="text-xs px-2 py-1 border border-surface-300 rounded"
              >
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
              </select>
              <button
                type="button"
                onClick={exportExpiringSoon}
                className="text-xs px-2 py-1 rounded border border-surface-300 hover:bg-surface-100 text-charcoal-600"
              >
                Export CSV
              </button>
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-100 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-charcoal-500">User</th>
                  <th className="px-3 py-2 text-left font-medium text-charcoal-500">Course</th>
                  <th className="px-3 py-2 text-left font-medium text-charcoal-500">Expiry</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {(expiringSoon ?? []).slice(0, 50).map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-charcoal">
                      {profileByUserId.get(r.user_id)?.full_name || profileByUserId.get(r.user_id)?.email || String(r.user_id).slice(0, 8)}
                    </td>
                    <td className="px-3 py-2 text-charcoal">{courseById.get(r.course_id) ?? '—'}</td>
                    <td className="px-3 py-2 text-charcoal">{r.expires_at ? new Date(r.expires_at).toLocaleDateString('en-ZA') : '—'}</td>
                  </tr>
                ))}
                {(expiringSoon ?? []).length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-charcoal-500 text-center">None</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
