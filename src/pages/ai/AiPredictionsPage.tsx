import { useState } from 'react';
import { SparklesIcon, Loader2Icon, TrendingUpIcon } from 'lucide-react';
import { Layout } from '../../components/layout/Layout';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useToast } from '../../components/ui/ToastProvider';
import { useTenant } from '../../tenant/TenantContext';
import { useAsync } from '../../api/hooks/useAsync';
import { toUserFacingError } from '../../utils/userFacingMessage';
import { generateRiskPredictions, listActiveRiskPredictions, type RiskPrediction } from '../../api/services/aiPredictiveRiskService';

function formatPredictionType(type: string): string {
  return type.replace(/_/g, ' ');
}

function probabilityTone(probability: number): string {
  if (probability >= 0.66) return 'bg-critical/10 text-critical border-critical/30';
  if (probability >= 0.33) return 'bg-warning/15 text-charcoal border-warning/30';
  return 'bg-success/10 text-success border-success/30';
}

function PredictionCard({ prediction }: { prediction: RiskPrediction }) {
  return (
    <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-charcoal capitalize">{formatPredictionType(prediction.prediction_type)}</h3>
        <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold shrink-0 ${probabilityTone(prediction.probability)}`}>
          {Math.round(prediction.probability * 100)}% likelihood
        </span>
      </div>
      <p className="text-sm text-charcoal-600">{prediction.reasoning}</p>

      {prediction.contributing_factors.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-charcoal-500 uppercase tracking-wide mb-1">Contributing factors</p>
          <ul className="text-sm text-charcoal-600 list-disc list-inside space-y-0.5">
            {prediction.contributing_factors.map((factor, idx) => (
              <li key={idx}>{factor}</li>
            ))}
          </ul>
        </div>
      )}

      {prediction.recommended_actions.length > 0 && (
        <div className="border-t border-surface-200 pt-3">
          <p className="text-xs font-semibold text-charcoal-500 uppercase tracking-wide mb-1">Recommended actions</p>
          <ul className="text-sm text-charcoal-600 list-disc list-inside space-y-0.5">
            {prediction.recommended_actions.map((action, idx) => (
              <li key={idx}>{action}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-charcoal-400">
        Confidence {Math.round(prediction.confidence * 100)}% · valid until {new Date(prediction.valid_until).toLocaleDateString()}
      </p>
    </div>
  );
}

export function AiPredictionsPage() {
  const { activeCompanyId } = useTenant();
  const { showSuccess, showError } = useToast();
  const [generating, setGenerating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: predictions, loading } = useAsync<RiskPrediction[]>(
    async () => (activeCompanyId ? await listActiveRiskPredictions(activeCompanyId) : []),
    [activeCompanyId, refreshKey]
  );

  async function handleGenerate() {
    if (!activeCompanyId) return;
    setGenerating(true);
    try {
      const results = await generateRiskPredictions({ companyId: activeCompanyId });
      setRefreshKey((k) => k + 1);
      showSuccess(
        results.length > 0
          ? `${results.length} risk prediction(s) generated from this month's trends.`
          : 'No significant emerging risks found in the current trend data.'
      );
    } catch (err) {
      showError(toUserFacingError(err, 'Could not generate risk predictions.'));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Layout title="AI Predictive Risk Engine">
      <div className="space-y-5">
        <div className="bg-white rounded-xl border border-surface-300 p-5 shadow-card flex items-start justify-between gap-4">
          <div className="flex items-start gap-2">
            <TrendingUpIcon className="w-5 h-5 text-teal shrink-0 mt-0.5" />
            <div>
              <h1 className="text-lg font-semibold text-charcoal">Emerging risks, reasoned from your own trend data</h1>
              <p className="text-sm text-charcoal-500 mt-1">
                Compares this month against last month across incidents, near misses, overdue actions, training, overtime hours, and contractor compliance — every number behind a prediction is an exact query, not an estimate.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={generating}
            onClick={() => void handleGenerate()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60 shrink-0"
          >
            {generating ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <SparklesIcon className="w-4 h-4" />}
            {generating ? 'Analysing...' : 'Analyse trends'}
          </button>
        </div>

        {loading && (predictions ?? []).length === 0 && (
          <div className="bg-white rounded-xl border border-surface-300 p-8 shadow-card flex justify-center"><LoadingSpinner size={24} /></div>
        )}

        {!loading && (predictions ?? []).length === 0 && (
          <div className="bg-white rounded-xl border border-surface-300 p-8 shadow-card text-center">
            <p className="text-sm text-charcoal-500">No active predictions. Click "Analyse trends" above to run the engine.</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(predictions ?? []).map((prediction) => (
            <PredictionCard key={prediction.id} prediction={prediction} />
          ))}
        </div>
      </div>
    </Layout>
  );
}
