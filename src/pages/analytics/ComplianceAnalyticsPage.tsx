import React from 'react';
import { motion } from 'framer-motion';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { getComplianceDashboardData } from '../../api/services/complianceScoringService';
import { ComplianceScore } from '../../components/ui/ComplianceScore';
import { RiskHeatMap } from '../../components/ui/RiskHeatMap';

function ragPillClass(status: 'green' | 'yellow' | 'red') {
  return (
    status === 'green' ? 'bg-success/10 text-success' :
    status === 'yellow' ? 'bg-warning/15 text-warning-700' :
    'bg-critical/10 text-critical'
  );
}

function scoreBarColor(score: number) {
  if (score >= 85) return '#2ECC71';
  if (score >= 70) return '#F5A623';
  return '#E74C3C';
}

export function ComplianceAnalyticsPage() {
  const { activeCompanyId } = useTenant();
  const { data, loading, error } = useAsync(
    async () => {
      if (!activeCompanyId) return null;
      return getComplianceDashboardData(activeCompanyId);
    },
    [activeCompanyId]
  );

  const heatMapData =
    data?.topRisks.map((risk, index) => {
      const highRisks = Number(risk.high_risks ?? 0);
      const likelihood = Math.max(1, Math.min(5, 5 - index));
      const consequence = Math.max(1, Math.min(5, highRisks > 3 ? 5 : highRisks > 1 ? 4 : 3));
      return {
        likelihood,
        consequence,
        count: Math.max(1, highRisks),
        level:
          consequence >= 5 ? 'critical' :
          consequence >= 4 ? 'high' :
          consequence >= 3 ? 'medium' :
          'low'
      };
    }) ?? [];

  return (
    <Layout title="Compliance Intelligence">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-charcoal">Compliance Intelligence</h1>
            <p className="text-sm text-charcoal-500 mt-1">
              Deterministic compliance scoring with AI-assisted risk signals, ISO traceability, and drill-downs.
            </p>
          </div>
          {data && (
            <div className="inline-flex items-center gap-3 rounded-xl border border-surface-300 bg-white px-4 py-3 shadow-card">
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${ragPillClass(data.overall.ragStatus)}`}>
                {data.overall.ragStatus}
              </span>
              <span className="text-sm text-charcoal-500">
                Generated {new Date(data.overall.generatedAt).toLocaleString('en-ZA')}
              </span>
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-critical/30 bg-critical/5 p-4 text-critical">
            <p className="font-medium">Failed to load compliance intelligence</p>
            <p className="text-sm mt-1">{String(error)}</p>
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border border-surface-300 bg-white p-6 shadow-card text-charcoal-500">
            Loading compliance dashboard...
          </div>
        ) : data ? (
          <>
            <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)] gap-6">
              <div className="rounded-2xl border border-surface-300 bg-white p-6 shadow-card">
                <ComplianceScore score={Math.round(data.overall.scorePercentage)} size="lg" label="Overall Compliance" />
                <div className="mt-5 space-y-3 text-sm text-charcoal-600">
                  <div className="flex items-center justify-between">
                    <span>Weighted score</span>
                    <span className="font-semibold text-charcoal">{data.overall.weightedScore.toFixed(2)}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>AI deterioration risk</span>
                    <span className="font-semibold text-charcoal">{data.aiInsight.predictedDeteriorationRisk}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Next month risk</span>
                    <span className="font-semibold capitalize text-charcoal">{data.aiInsight.nextMonthRiskFlag}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                {data.domains.map((domain) => (
                  <div key={domain.domainKey} className="rounded-xl border border-surface-300 bg-white p-4 shadow-card">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-charcoal">{domain.label}</p>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase ${ragPillClass(domain.ragStatus)}`}>
                        {domain.ragStatus}
                      </span>
                    </div>
                    <p className="mt-3 text-3xl font-bold text-charcoal">{domain.scorePercentage.toFixed(1)}%</p>
                    <div className="mt-3 h-2 w-full rounded-full bg-surface-200">
                      <div
                        className="h-2 rounded-full"
                        style={{ width: `${Math.max(2, domain.scorePercentage)}%`, backgroundColor: scoreBarColor(domain.scorePercentage) }}
                      />
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-charcoal-500">
                      <p>Total: {domain.totalCount}</p>
                      <p>Compliant: {domain.compliantCount}</p>
                      <p>Overdue: {domain.overdueCount}</p>
                      <p>Attention: {domain.attentionCount}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="rounded-xl border border-surface-300 bg-white p-4 shadow-card">
                <h3 className="text-base font-semibold text-charcoal mb-4">12-Month Compliance Trend</h3>
                {data.trendHistory.length === 0 ? (
                  <div className="flex items-center justify-center text-charcoal-400 text-sm" style={{ height: 260 }}>
                    No trend data for this period
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={data.trendHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E8ECF0" />
                      <XAxis dataKey="month" tick={{ fill: '#757575', fontSize: 12 }} />
                      <YAxis tick={{ fill: '#757575', fontSize: 12 }} domain={[0, 100]} />
                      <Tooltip />
                      <Line type="monotone" dataKey="scorePercentage" stroke="#0FB9B1" strokeWidth={3} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="rounded-xl border border-surface-300 bg-white p-4 shadow-card">
                <h3 className="text-base font-semibold text-charcoal mb-4">Module Performance</h3>
                {data.domains.length === 0 ? (
                  <div className="flex items-center justify-center text-charcoal-400 text-sm" style={{ height: 260 }}>
                    No module data available
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={data.domains}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E8ECF0" />
                      <XAxis dataKey="label" tick={{ fill: '#757575', fontSize: 12 }} />
                      <YAxis tick={{ fill: '#757575', fontSize: 12 }} domain={[0, 100]} />
                      <Tooltip />
                      <Bar dataKey="scorePercentage" radius={[8, 8, 0, 0]}>
                        {data.domains.map((entry) => (
                          <Cell key={entry.domainKey} fill={scoreBarColor(entry.scorePercentage)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6">
              <div className="rounded-xl border border-surface-300 bg-white p-5 shadow-card">
                <h3 className="text-base font-semibold text-charcoal mb-4">ISO Clause Coverage</h3>
                <div className="space-y-5">
                  {data.isoSummary.map((standard) => (
                    <div key={standard.standard} className="rounded-xl border border-surface-200 p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div>
                          <p className="font-semibold text-charcoal uppercase">{standard.standard}</p>
                          <p className="text-sm text-charcoal-500">
                            {standard.compliantLinks} compliant link(s) out of {standard.totalLinks}
                          </p>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ragPillClass(calculateIsoRag(standard.scorePercentage))}`}>
                          {standard.scorePercentage.toFixed(1)}%
                        </span>
                      </div>
                      <div className="mt-3 space-y-2">
                        {standard.byClause.slice(0, 4).map((clause) => (
                          <div key={clause.clauseNumber} className="flex items-center justify-between text-sm">
                            <span className="text-charcoal-600">
                              Clause {clause.clauseNumber}: {clause.clauseTitle}
                            </span>
                            <span className="font-medium text-charcoal">{clause.scorePercentage.toFixed(1)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <RiskHeatMap data={heatMapData} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="rounded-xl border border-surface-300 bg-white p-5 shadow-card">
                <h3 className="text-base font-semibold text-charcoal mb-4">AI Recommendations</h3>
                <div className="space-y-3">
                  {data.aiInsight.recommendations.map((recommendation) => (
                    <div key={recommendation.title} className="rounded-lg border border-surface-200 p-3">
                      <p className="font-medium text-charcoal">{recommendation.title}</p>
                      <p className="text-sm text-charcoal-500 mt-1">{recommendation.reason}</p>
                      <p className="text-sm text-teal mt-2">{recommendation.action}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-surface-300 bg-white p-5 shadow-card">
                <h3 className="text-base font-semibold text-charcoal mb-4">Top Risks and Overdue Actions</h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-charcoal mb-2">Top risks</p>
                    <div className="space-y-2">
                      {data.topRisks.slice(0, 5).map((risk) => (
                        <div key={String(risk.id)} className="flex items-center justify-between rounded-lg border border-surface-200 px-3 py-2 text-sm">
                          <span className="text-charcoal">{String(risk.title ?? risk.id)}</span>
                          <span className="font-medium text-critical">{Number(risk.high_risks ?? 0)} high</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-charcoal mb-2">Overdue actions</p>
                    <div className="space-y-2">
                      {data.overdueActions.slice(0, 5).map((action) => (
                        <div key={String(action.id)} className="flex items-center justify-between rounded-lg border border-surface-200 px-3 py-2 text-sm">
                          <span className="text-charcoal">{String(action.title ?? action.id)}</span>
                          <span className="font-medium text-warning-700">{String(action.due_date ?? '')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-surface-300 bg-white p-5 shadow-card">
              <h3 className="text-base font-semibold text-charcoal mb-4">Score Drill-Down</h3>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {data.domains.map((domain) => (
                  <div key={domain.domainKey} className="rounded-xl border border-surface-200 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-charcoal">{domain.label}</p>
                      <span className="text-sm font-medium text-charcoal">{domain.scorePercentage.toFixed(1)}%</span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {domain.drilldownRecords.slice(0, 4).map((record) => (
                        <div key={String(record.id)} className="rounded-lg bg-surface-50 px-3 py-2 text-sm">
                          <div className="flex items-start justify-between gap-3">
                            <span className="font-medium text-charcoal">{String(record.label ?? record.id)}</span>
                            <span className="text-charcoal-500">{String(record.status ?? '')}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </motion.div>
    </Layout>
  );
}

function calculateIsoRag(scorePercentage: number): 'green' | 'yellow' | 'red' {
  if (scorePercentage >= 85) return 'green';
  if (scorePercentage >= 70) return 'yellow';
  return 'red';
}
