import { useState } from 'react';
import { SparklesIcon, Loader2Icon, AlertTriangleIcon, ClipboardCheckIcon, GraduationCapIcon, ShieldAlertIcon } from 'lucide-react';
import { useUser } from '@insforge/react';
import { Layout } from '../../components/layout/Layout';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useToast } from '../../components/ui/ToastProvider';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { toUserFacingError } from '../../utils/userFacingMessage';
import { generateDailyBriefing, listBriefings, type AiBriefing } from '../../api/services/aiBriefingService';
import type { UUID } from '../../api/models/entities';

const PRIORITY_BADGE: Record<string, string> = {
  high: 'bg-critical/10 text-critical border-critical/30',
  medium: 'bg-warning/15 text-charcoal border-warning/30',
  low: 'bg-success/10 text-success border-success/30'
};

function formatBriefingDate(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function StatTile({ icon: Icon, label, value, tone }: { icon: typeof AlertTriangleIcon; label: string; value: number; tone: 'critical' | 'warning' | 'teal' | 'neutral' }) {
  const toneClass = {
    critical: 'text-critical',
    warning: 'text-warning',
    teal: 'text-teal',
    neutral: 'text-charcoal'
  }[tone];
  return (
    <div className="bg-surface-50 rounded-lg border border-surface-200 p-3">
      <div className="flex items-center gap-1.5 text-charcoal-500">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-xs">{label}</span>
      </div>
      <p className={`text-xl font-bold mt-1 ${toneClass}`}>{value}</p>
    </div>
  );
}

export function AiBriefingPage() {
  const { activeCompanyId } = useTenant();
  const { user } = useUser();
  const { showSuccess, showError } = useToast();
  const [generating, setGenerating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [active, setActive] = useState<AiBriefing | null>(null);

  const { data: briefings, loading } = useAsync<AiBriefing[]>(
    async () => (activeCompanyId ? await listBriefings(activeCompanyId, 30) : []),
    [activeCompanyId, refreshKey]
  );

  const shown = active ?? (briefings ?? [])[0] ?? null;

  async function handleGenerate() {
    if (!activeCompanyId) return;
    setGenerating(true);
    try {
      const briefing = await generateDailyBriefing({ companyId: activeCompanyId, createdByUserId: user?.id as UUID | undefined });
      setActive(briefing);
      setRefreshKey((k) => k + 1);
      showSuccess("Today's briefing is ready.");
    } catch (err) {
      showError(toUserFacingError(err, 'Could not generate the briefing.'));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Layout title="AI Digital Safety Manager">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <SparklesIcon className="w-5 h-5 text-teal" />
                <h1 className="text-lg font-semibold text-charcoal">Daily executive briefing</h1>
              </div>
              <button
                type="button"
                disabled={generating}
                onClick={() => void handleGenerate()}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60"
              >
                {generating ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <SparklesIcon className="w-4 h-4" />}
                {generating ? 'Generating...' : "Regenerate today's briefing"}
              </button>
            </div>
            <p className="text-sm text-charcoal-500 mt-1">
              Every number below comes from an exact query against your company's own data — the AI only writes the summary and recommendations from those numbers.
            </p>
          </div>

          {loading && !shown && (
            <div className="bg-white rounded-xl border border-surface-300 p-8 shadow-card flex justify-center"><LoadingSpinner size={24} /></div>
          )}

          {!loading && !shown && (
            <div className="bg-white rounded-xl border border-surface-300 p-8 shadow-card text-center">
              <p className="text-sm text-charcoal-500">No briefing yet. Generate today's briefing above to get started.</p>
            </div>
          )}

          {shown && (
            <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card space-y-4">
              <div>
                <p className="text-xs font-semibold text-charcoal-500 uppercase tracking-wide">{formatBriefingDate(shown.briefing_date)}</p>
                <p className="text-sm text-charcoal-700 mt-1">{shown.narrative}</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <StatTile icon={AlertTriangleIcon} label="Incidents yesterday" value={shown.stats.incidentsYesterday} tone={shown.stats.highRiskIncidentsYesterday > 0 ? 'critical' : 'neutral'} />
                <StatTile icon={ShieldAlertIcon} label="Open incidents" value={shown.stats.openIncidents} tone="warning" />
                <StatTile icon={ClipboardCheckIcon} label="Overdue actions" value={shown.stats.overdueCorrectiveActions} tone={shown.stats.overdueCorrectiveActions > 0 ? 'critical' : 'neutral'} />
                <StatTile icon={GraduationCapIcon} label="Training due (30d)" value={shown.stats.expiringTrainingWithin30Days} tone="teal" />
              </div>

              {shown.recommendations.length > 0 && (
                <div className="border-t border-surface-200 pt-3">
                  <h3 className="text-sm font-semibold text-charcoal mb-2">Recommended actions</h3>
                  <div className="space-y-2">
                    {shown.recommendations.map((rec, idx) => (
                      <div key={idx} className="border border-surface-200 rounded-lg p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-charcoal">{rec.action}</p>
                          <span className={`text-xs px-2 py-0.5 rounded border font-medium shrink-0 ${PRIORITY_BADGE[rec.priority] ?? ''}`}>
                            {rec.priority}
                          </span>
                        </div>
                        <p className="text-xs text-charcoal-500 mt-1">{rec.reasoning}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-surface-300 shadow-card h-fit">
          <div className="px-4 py-3 border-b border-surface-200">
            <h3 className="text-sm font-semibold text-charcoal">History</h3>
          </div>
          <div className="divide-y divide-surface-100 max-h-[70vh] overflow-y-auto">
            {(briefings ?? []).map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setActive(b)}
                className={`w-full text-left px-4 py-2.5 hover:bg-surface-50 text-sm ${shown?.id === b.id ? 'bg-teal/5 text-teal font-medium' : 'text-charcoal'}`}
              >
                {formatBriefingDate(b.briefing_date)}
              </button>
            ))}
            {(briefings ?? []).length === 0 && !loading && (
              <p className="px-4 py-4 text-xs text-charcoal-500">No briefings yet.</p>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
