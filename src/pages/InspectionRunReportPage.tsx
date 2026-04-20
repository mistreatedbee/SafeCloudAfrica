import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import type { UUID } from '../api/models/entities';
import { useAsync } from '../api/hooks/useAsync';
import { getInspectionRunReport } from '../api/services/inspectionReportsService';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ArrowLeftIcon } from 'lucide-react';

export function InspectionRunReportPage() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const { activeCompanyId } = useTenant();

  const { data: report, loading, error } = useAsync(
    async () => {
      if (!activeCompanyId || !runId) return null;
      return await getInspectionRunReport(activeCompanyId as UUID, runId as unknown as UUID);
    },
    [activeCompanyId, runId]
  );

  const findings = report?.findings ?? [];
  const highRiskFindings = report?.highRiskFindings ?? [];
  const nonConformances = report?.nonConformances ?? [];
  const auditScoreHistory = report?.auditScoreHistory ?? [];
  const evidenceByItemId = report?.evidenceByItemId ?? {};

  return (
    <Layout title="Inspection run report">
      <div className="max-w-6xl mx-auto px-4 py-4 space-y-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-sm text-charcoal-500 hover:text-charcoal-800"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back
        </button>

        {loading && (
          <div className="bg-white rounded-xl border border-surface-300 p-6 shadow-card flex items-center gap-3">
            <LoadingSpinner size={18} />
            <p className="text-sm text-charcoal-500">Loading report…</p>
          </div>
        )}

        {error && (
          <div className="bg-white rounded-xl border border-critical/30 p-4 shadow-card">
            <p className="text-sm font-semibold text-critical">Unable to load report</p>
            <p className="text-sm text-charcoal-500 mt-1">{error.message}</p>
          </div>
        )}

        {!loading && !error && !report && (
          <div className="bg-white rounded-xl border border-surface-300 p-6 shadow-card">
            <p className="text-sm font-semibold text-charcoal">No report data available</p>
            <p className="text-sm text-charcoal-500 mt-1">This inspection run has no report payload yet, or the session no longer has access to it.</p>
          </div>
        )}

        {report && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
              <h2 className="text-base font-semibold text-charcoal mb-2">
                Score summary {report.checklistName ? `– ${report.checklistName}` : ''}
              </h2>
              <p className="text-sm text-charcoal-600">
                Total score: <span className="font-semibold">{report.totalScore}</span> /{' '}
                <span className="font-semibold">{report.maxScore}</span> (
                {report.compliancePercent.toFixed(1)}% compliant)
              </p>
              <p className="text-sm text-charcoal-600 mt-1">
                Department performance score: <span className="font-semibold">{report.departmentPerformanceScore}%</span>
              </p>
              <p className="text-sm text-charcoal-600 mt-1">
                Repeat findings: <span className="font-semibold">{report.repeatFindingsCount}</span> ({report.repeatFindingsIndicator})
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <section className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
                <h3 className="text-sm font-semibold text-charcoal mb-2">Inspection findings (PC / NC)</h3>
                {findings.length === 0 ? (
                  <p className="text-sm text-charcoal-500">No partially or non-compliant items.</p>
                ) : (
                  <ul className="space-y-2 text-sm text-charcoal-700">
                    {findings.map((i: any) => (
                      <li key={i.id} className="border border-surface-200 rounded-lg px-3 py-2">
                        <p className="font-medium">{i.question}</p>
                        <p className="text-xs text-charcoal-500 mt-0.5">
                          Rating: {i.inspection_rating} • Risk: {i.risk_level || 'n/a'}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
                <h3 className="text-sm font-semibold text-charcoal mb-2">High risk findings</h3>
                {highRiskFindings.length === 0 ? (
                  <p className="text-sm text-charcoal-500">No high risk items.</p>
                ) : (
                  <ul className="space-y-2 text-sm text-charcoal-700">
                    {highRiskFindings.map((i: any) => (
                      <li key={i.id} className="border border-critical/30 rounded-lg px-3 py-2 bg-critical/5">
                        <p className="font-medium">{i.question}</p>
                        <p className="text-xs text-charcoal-500 mt-0.5">
                          Rating: {i.inspection_rating} • Non-conformance: {i.nonconformance_flag ? 'Yes' : 'No'}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <section className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <h3 className="text-sm font-semibold text-charcoal mb-2">Non-conformance register</h3>
              {nonConformances.length === 0 ? (
                <p className="text-sm text-charcoal-500">No non-conformances recorded.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-surface-200 text-xs text-charcoal-500">
                        <th className="py-2 pr-3 text-left font-medium">Question</th>
                        <th className="py-2 pr-3 text-left font-medium">Rating</th>
                        <th className="py-2 pr-3 text-left font-medium">Risk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nonConformances.map((i: any) => (
                        <tr key={i.id} className="border-b border-surface-100">
                          <td className="py-2 pr-3">{i.question}</td>
                          <td className="py-2 pr-3 text-xs">{i.inspection_rating}</td>
                          <td className="py-2 pr-3 text-xs">{i.risk_level || 'n/a'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <h3 className="text-sm font-semibold text-charcoal mb-2">Evidence gallery (by item)</h3>
              {Object.keys(evidenceByItemId).length === 0 ? (
                <p className="text-sm text-charcoal-500">No evidence uploaded against checklist items.</p>
              ) : (
                <div className="space-y-4">
                  {nonConformances.map((item: any) => {
                    const evidences = evidenceByItemId[item.id] || [];
                    if (evidences.length === 0) return null;
                    return (
                      <div key={item.id} className="border border-surface-200 rounded-lg px-3 py-2">
                        <p className="text-sm font-semibold text-charcoal">{item.question}</p>
                        <ul className="mt-1 space-y-1 text-xs text-charcoal-600">
                          {evidences.map((ev: any) => {
                            const filename = ev.original_filename || ev.file_url.split('/').pop() || 'evidence';
                            return (
                              <li key={ev.id} className="flex items-center justify-between gap-2">
                                <span>{filename}</span>
                                <a
                                  href={ev.file_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-teal hover:underline"
                                >
                                  View
                                </a>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
              <h3 className="text-sm font-semibold text-charcoal mb-2">Audit score history</h3>
              {auditScoreHistory.length === 0 ? (
                <p className="text-sm text-charcoal-500">No linked score history.</p>
              ) : (
                <ul className="space-y-2 text-sm text-charcoal-700">
                  {auditScoreHistory.map((h) => (
                    <li key={h.runId} className="border border-surface-200 rounded-lg px-3 py-2">
                      Run {String(h.runId).slice(0, 8)} - {h.compliancePercent.toFixed(1)}%
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </Layout>
  );
}
