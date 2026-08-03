import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SparklesIcon, Loader2Icon, ArrowRightIcon } from 'lucide-react';
import { useUser } from '@insforge/react';
import { useAsync } from '../../api/hooks/useAsync';
import { useToast } from '../ui/ToastProvider';
import { toUserFacingError } from '../../utils/userFacingMessage';
import { generateDailyBriefing, getTodaysBriefing } from '../../api/services/aiBriefingService';
import type { UUID } from '../../api/models/entities';

const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-critical',
  medium: 'bg-warning',
  low: 'bg-success'
};

/** Compact "Good morning" briefing surfaced at the top of the main Dashboard (roadmap §7). */
export function AiBriefingCard({ companyId }: { companyId: UUID }) {
  const navigate = useNavigate();
  const { user } = useUser();
  const { showError } = useToast();
  const [generating, setGenerating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: briefing, loading } = useAsync(
    async () => (companyId ? await getTodaysBriefing(companyId) : null),
    [companyId, refreshKey]
  );

  async function handleGenerate() {
    if (!companyId) return;
    setGenerating(true);
    try {
      await generateDailyBriefing({ companyId, createdByUserId: user?.id as UUID | undefined });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      showError(toUserFacingError(err, 'Could not generate today’s briefing.'));
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return null;

  return (
    <div className="bg-white rounded-2xl border border-surface-300 p-5 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <SparklesIcon className="w-5 h-5 text-teal shrink-0" />
          <p className="text-sm font-semibold text-charcoal">AI Digital Safety Manager</p>
        </div>
        {!briefing ? (
          <button
            type="button"
            disabled={generating}
            onClick={() => void handleGenerate()}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-teal text-white text-xs font-semibold hover:bg-teal-600 disabled:opacity-60 shrink-0"
          >
            {generating ? <Loader2Icon className="w-3.5 h-3.5 animate-spin" /> : <SparklesIcon className="w-3.5 h-3.5" />}
            {generating ? 'Preparing briefing...' : "Generate today's briefing"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => navigate('/dashboard/ai/briefing')}
            className="inline-flex items-center gap-1 text-xs font-medium text-teal hover:text-teal-700 shrink-0"
          >
            Full briefing <ArrowRightIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {briefing ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-charcoal-600">{briefing.narrative}</p>
          {briefing.recommendations.length > 0 && (
            <ul className="space-y-1.5">
              {briefing.recommendations.slice(0, 3).map((rec, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-charcoal-600">
                  <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${PRIORITY_DOT[rec.priority] ?? 'bg-charcoal-300'}`} />
                  <span>{rec.action}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="mt-2 text-sm text-charcoal-500">
          Generate a briefing summarising yesterday's incidents, overdue actions, and what needs attention today.
        </p>
      )}
    </div>
  );
}
