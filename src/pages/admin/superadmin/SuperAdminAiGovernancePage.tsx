import { useCallback, useEffect, useState } from 'react';
import { SparklesIcon, FileTextIcon, BuildingIcon, ClockIcon, InboxIcon, RefreshCwIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getAiUsageSummary, isAiPlatformSchemaMissingError, type AiUsageSummary } from '../../../api/services/aiGovernanceService';
import { ListEmptyState } from '../../../components/ui/ListEmptyState';

function StatTile({ label, value, icon: Icon }: { label: string; value: number | string; icon: LucideIcon }) {
  return (
    <div className="rounded-lg border border-surface-300 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase text-charcoal-400">{label}</p>
        <Icon className="h-4 w-4 text-teal" aria-hidden="true" />
      </div>
      <p className="mt-2 text-2xl font-semibold text-charcoal">{value}</p>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function formatAction(action: string): string {
  return action.replace(/^ai\./, '').replace(/[._]/g, ' ');
}

export function SuperAdminAiGovernancePage() {
  const [summary, setSummary] = useState<AiUsageSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schemaMissing, setSchemaMissing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSchemaMissing(false);
    try {
      const data = await getAiUsageSummary();
      setSummary(data);
    } catch (err) {
      if (isAiPlatformSchemaMissingError(err)) {
        setSchemaMissing(true);
        setSummary(null);
        setError('AI platform tables are not available yet. Apply docs/migrations/ai_platform_foundation_2026_08_03.sql and docs/migrations/ai_briefings_2026_08_03.sql to the active InsForge database, then refresh this page.');
      } else {
        setError((err as Error)?.message ?? 'Failed to load AI usage data.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-charcoal flex items-center gap-2">
            <SparklesIcon className="w-4 h-4 text-teal" /> AI Governance
          </p>
          <p className="text-sm text-charcoal-500 mt-1">
            Every AI generation across every module — audited, attributable, and reviewable. Reuses the same activity log every other action in this app writes to.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50 disabled:opacity-60 shrink-0"
        >
          <RefreshCwIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && (
        <div className="bg-white rounded-xl border border-warning/30 p-4 shadow-card">
          <p className="text-sm text-charcoal-600">{error}</p>
        </div>
      )}

      {loading && !summary && <p className="text-sm text-charcoal-500">Loading…</p>}

      {!loading && !summary && schemaMissing && (
        <ListEmptyState
          icon={SparklesIcon}
          title="AI platform not yet activated"
          description="Once the AI migrations are applied, usage across every AI feature (document generation, daily briefings, risk assessment drafts, agentic actions) will appear here."
          primaryAction={{ kind: 'button', label: 'Retry', onClick: load }}
        />
      )}

      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatTile label="AI events (recent)" value={summary.totalAiEvents} icon={SparklesIcon} />
            <StatTile label="Generated documents" value={Object.values(summary.documentsByType).reduce((a, b) => a + b, 0)} icon={FileTextIcon} />
            <StatTile label="Companies briefed today" value={`${summary.companiesWithBriefingToday}/${summary.totalCompanies}`} icon={BuildingIcon} />
            <StatTile label="Pending approvals" value={summary.pendingApprovalActions} icon={InboxIcon} />
            <StatTile label="Draft documents" value={summary.documentsByStatus.draft ?? 0} icon={ClockIcon} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-surface-300 shadow-card">
              <div className="px-5 py-3 border-b border-surface-200">
                <p className="text-sm font-semibold text-charcoal">Usage by feature</p>
              </div>
              <div className="divide-y divide-surface-100">
                {summary.eventsByAction.length === 0 && <p className="px-5 py-4 text-sm text-charcoal-500">No AI activity recorded yet.</p>}
                {summary.eventsByAction.map((row) => (
                  <div key={row.action} className="px-5 py-2.5 flex items-center justify-between text-sm">
                    <span className="text-charcoal capitalize">{formatAction(row.action)}</span>
                    <span className="text-charcoal-500 font-medium">{row.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-surface-300 shadow-card">
              <div className="px-5 py-3 border-b border-surface-200">
                <p className="text-sm font-semibold text-charcoal">Most active organisations</p>
              </div>
              <div className="divide-y divide-surface-100">
                {summary.eventsByCompany.length === 0 && <p className="px-5 py-4 text-sm text-charcoal-500">No AI activity recorded yet.</p>}
                {summary.eventsByCompany.map((row) => (
                  <div key={row.companyId} className="px-5 py-2.5 flex items-center justify-between text-sm">
                    <span className="text-charcoal">{row.companyName}</span>
                    <span className="text-charcoal-500 font-medium">{row.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
            <div className="px-5 py-3 border-b border-surface-200">
              <p className="text-sm font-semibold text-charcoal">Recent AI events</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface-50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Time</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Action</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Entity</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {summary.recentEvents.map((event) => (
                    <tr key={event.id} className="hover:bg-surface-50">
                      <td className="px-5 py-3 text-sm text-charcoal-500 whitespace-nowrap">{formatDate(event.created_at)}</td>
                      <td className="px-5 py-3 text-sm text-charcoal capitalize">{formatAction(event.action)}</td>
                      <td className="px-5 py-3 text-sm text-charcoal-500">{event.entity_type ?? '—'}</td>
                      <td className="px-5 py-3 text-xs text-charcoal-400 font-mono max-w-md truncate">
                        {event.metadata ? JSON.stringify(event.metadata) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {summary.recentEvents.length === 0 && (
              <p className="px-5 py-6 text-sm text-charcoal-500 text-center">No AI events recorded yet.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
