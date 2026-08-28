import React, { useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DownloadIcon, CalendarIcon, FileTextIcon } from 'lucide-react';
import { useAsync } from '../../api/hooks/useAsync';
import type { TrainingRecord, UUID } from '../../api/models/entities';
import {
  getTrainingSpendSummary,
  getTrainingComplianceSummary,
  listOutstandingTraining,
  listExpiringSoonTraining,
  listTrainingCourses,
  listTrainingProviders,
  listJobDescriptions,
  type OutstandingTrainingRow
} from '../../api/services/trainingService';
import { listUserProfiles } from '../../api/services/profilesService';
import { listHrEmployees, type HrEmployee } from '../../api/services/hrService';
import { useTenant } from '../../tenant/TenantContext';
import { useIdentity } from '../../hooks/useIdentity';
import { insforge } from '../../api/insforge/client';
import { drawPdfCoverWithLogo } from '../../api/services/reportExportService';
import { buildFinancialYearOptions, currentFinancialYearStartYear, financialYearForStartYear } from '../../utils/financialYear';
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
  const { activeCompany } = useTenant();
  const { fullName, organisationName } = useIdentity();

  const financialYearOptions = useMemo(() => buildFinancialYearOptions(1, 1), []);
  const [fyStartYear, setFyStartYear] = useState(() => currentFinancialYearStartYear());
  const currentFy = useMemo(() => financialYearForStartYear(fyStartYear), [fyStartYear]);

  // Date pickers pre-fill from the selected FY but stay independently editable -- picking a
  // new FY resets them; typing in the pickers afterwards doesn't change the FY selector back.
  const [fromDate, setFromDate] = useState(currentFy.fromDate);
  const [toDate, setToDate] = useState(currentFy.toDate);
  const [expiringDays, setExpiringDays] = useState(30);

  function onSelectFinancialYear(startYear: number) {
    setFyStartYear(startYear);
    const fy = financialYearForStartYear(startYear);
    setFromDate(fy.fromDate);
    setToDate(fy.toDate);
  }

  const fromIso = `${fromDate}T00:00:00.000Z`;
  const toIso = `${toDate}T23:59:59.999Z`;

  const logoUrl = useMemo(() => {
    const meta = (activeCompany?.metadata ?? {}) as Record<string, unknown>;
    const bucket = meta.logo_bucket as string | undefined;
    const key = meta.logo_key as string | undefined;
    if (!bucket || !key) return null;
    try {
      return insforge.storage.from(bucket).getPublicUrl(key);
    } catch {
      return null;
    }
  }, [activeCompany?.metadata]);

  const { data: summary, loading: summaryLoading } = useAsync<
    Awaited<ReturnType<typeof getTrainingSpendSummary>> | { totalCost: number; byCourse: never[]; byProvider: never[]; byJob: never[]; recordCount: number }
  >(
    () =>
      props.companyId
        ? getTrainingSpendSummary(props.companyId, { fromDate: fromIso, toDate: toIso })
        : Promise.resolve({ totalCost: 0, byCourse: [], byProvider: [], byJob: [], recordCount: 0 }),
    [props.companyId, fromDate, toDate]
  );
  const { data: compliance } = useAsync<Awaited<ReturnType<typeof getTrainingComplianceSummary>>>(
    () => (props.companyId ? getTrainingComplianceSummary(props.companyId) : Promise.resolve({ required: 0, met: 0, percent: 100 })),
    [props.companyId]
  );
  const { data: outstanding } = useAsync<OutstandingTrainingRow[]>(
    () => (props.companyId ? listOutstandingTraining(props.companyId) : Promise.resolve([])),
    [props.companyId]
  );
  const { data: expiringSoon } = useAsync<TrainingRecord[]>(
    () => (props.companyId ? listExpiringSoonTraining(props.companyId, expiringDays) : Promise.resolve([])),
    [props.companyId, expiringDays]
  );
  const { data: courses } = useAsync<Awaited<ReturnType<typeof listTrainingCourses>>>(
    () => (props.companyId ? listTrainingCourses(props.companyId) : Promise.resolve([])),
    [props.companyId]
  );
  const { data: providers } = useAsync<Awaited<ReturnType<typeof listTrainingProviders>>>(
    () => (props.companyId ? listTrainingProviders(props.companyId) : Promise.resolve([])),
    [props.companyId]
  );
  const { data: jobs } = useAsync<Awaited<ReturnType<typeof listJobDescriptions>>>(
    () => (props.companyId ? listJobDescriptions(props.companyId) : Promise.resolve([])),
    [props.companyId]
  );
  const { data: profiles } = useAsync<Awaited<ReturnType<typeof listUserProfiles>>>(
    () => (props.companyId ? listUserProfiles(props.companyId) : Promise.resolve([])),
    [props.companyId]
  );
  const { data: employees } = useAsync<HrEmployee[]>(
    () => (props.companyId ? listHrEmployees(props.companyId) : Promise.resolve([])),
    [props.companyId]
  );

  const courseById = new Map((courses ?? []).map((c) => [c.id, c.name]));
  const profileByUserId = new Map((profiles ?? []).map((p) => [p.user_id, p]));
  const employeeById = new Map((employees ?? []).map((e) => [e.id, e]));
  function traineeName(r: TrainingRecord): string {
    const emp = r.employee_id ? employeeById.get(r.employee_id) : null;
    if (emp) return `${emp.last_name ?? ''}, ${emp.first_name ?? ''}`.replace(/^,\s*|,\s*$/g, '').trim() || emp.email || emp.employee_no;
    if (r.user_id) return profileByUserId.get(r.user_id)?.full_name || profileByUserId.get(r.user_id)?.email || String(r.user_id).slice(0, 8);
    return 'Unknown';
  }

  function outstandingStatusLabel(r: OutstandingTrainingRow): string {
    return r.outstandingReason === 'expired' ? 'Expired' : 'Not started';
  }

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

  async function exportCostSummaryPdf() {
    if (!summary) return;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    let y = await drawPdfCoverWithLogo(doc, {
      title: 'Training Cost Report',
      subtitle: `${currentFy.label} (${fromDate} to ${toDate})`,
      companyName: organisationName,
      generatedBy: fullName,
      logoUrl
    });

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total spend: ZAR ${summary.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${summary.recordCount} records with cost)`, 40, y);
    y += 14;

    const sections: { title: string; head: string[]; rows: (string | number)[][] }[] = [
      {
        title: 'By course',
        head: ['Course', 'ZAR', 'Count'],
        rows: [...summary.byCourse].sort((a, b) => b.totalCost - a.totalCost).map((r) => [r.courseName || r.courseId, r.totalCost.toFixed(2), r.count])
      },
      {
        title: 'By provider',
        head: ['Provider', 'ZAR', 'Count'],
        rows: [...summary.byProvider].sort((a, b) => b.totalCost - a.totalCost).map((r) => [r.providerName || r.providerId, r.totalCost.toFixed(2), r.count])
      },
      {
        title: 'By job description',
        head: ['Job', 'ZAR', 'Count'],
        rows: [...summary.byJob].sort((a, b) => b.totalCost - a.totalCost).map((r) => [r.jobTitle || r.jobDescriptionId, r.totalCost.toFixed(2), r.count])
      }
    ];

    for (const section of sections) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(section.title, 40, y + 14);
      autoTable(doc, {
        startY: y + 20,
        head: [section.head],
        body: section.rows.length > 0 ? section.rows : [['No cost data', '', '']],
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [11, 158, 117], textColor: 255 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 40, right: 40 }
      });
      y = (doc as any).lastAutoTable.finalY + 24;
    }

    doc.save(`SCA_TrainingCosts_${fyStartYear}-${String(fyStartYear + 1).slice(-2)}.pdf`);
  }

  function exportOutstanding() {
    const rows = [
      ['Employee', 'Course', 'Status', 'Due date', 'User ID', 'Record ID'],
      ...(outstanding ?? []).map((r) => [
        traineeName(r),
        courseById.get(r.course_id) ?? '',
        outstandingStatusLabel(r),
        r.expires_at ?? '',
        r.user_id ?? r.employee_id ?? '',
        r.id
      ])
    ];
    downloadCsv(`training-outstanding-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  function exportExpiringSoon() {
    const rows = [
      ['Expiring soon (within ' + expiringDays + ' days)', 'User', 'Course', 'Expiry date', 'User ID', 'Record ID'],
      ...(expiringSoon ?? []).map((r) => [
        traineeName(r),
        courseById.get(r.course_id) ?? '',
        r.expires_at ?? '',
        r.user_id ?? r.employee_id ?? '',
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
          <select
            value={fyStartYear}
            onChange={(e) => onSelectFinancialYear(Number(e.target.value))}
            className="px-3 py-2 border border-surface-300 rounded-lg text-sm"
          >
            {financialYearOptions.map((fy) => (
              <option key={fy.startYear} value={fy.startYear}>{fy.label}</option>
            ))}
          </select>
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
        <button
          type="button"
          onClick={() => void exportCostSummaryPdf()}
          disabled={summaryLoading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-teal text-teal text-sm font-medium hover:bg-teal-50 disabled:opacity-60"
        >
          <FileTextIcon className="w-4 h-4" />
          Export PDF
        </button>
      </div>

      {compliance && (
        <div className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-charcoal">
              Training Compliance: {compliance.percent}% ({compliance.met} of {compliance.required} requirements met)
            </p>
          </div>
          <div className="h-2.5 bg-surface-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${compliance.percent >= 80 ? 'bg-success' : compliance.percent >= 50 ? 'bg-warning' : 'bg-critical'}`}
              style={{ width: `${Math.min(100, Math.max(0, compliance.percent))}%` }}
            />
          </div>
        </div>
      )}

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
                  <th className="px-3 py-2 text-left font-medium text-charcoal-500">Employee</th>
                  <th className="px-3 py-2 text-left font-medium text-charcoal-500">Course</th>
                  <th className="px-3 py-2 text-left font-medium text-charcoal-500">Status</th>
                  <th className="px-3 py-2 text-left font-medium text-charcoal-500">Due date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {(outstanding ?? []).slice(0, 50).map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-charcoal">
                      {traineeName(r)}
                    </td>
                    <td className="px-3 py-2 text-charcoal">{courseById.get(r.course_id) ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${r.outstandingReason === 'expired' ? 'bg-critical/15 text-critical' : 'bg-warning/15 text-warning'}`}>
                        {outstandingStatusLabel(r)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-charcoal-500">{r.expires_at ? new Date(r.expires_at).toLocaleDateString('en-ZA') : '—'}</td>
                  </tr>
                ))}
                {(outstanding ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-charcoal-500 text-center">None</td>
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
                      {traineeName(r)}
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
