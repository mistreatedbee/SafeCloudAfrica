import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import { withInsforgeSession } from '../insforge/ensureSession';
import type { UUID } from '../models/entities';
import { AI_MODELS, AiResponseParseError, completeJson } from '../../ai/aiClient';
import { countNearMissesThisMonth, listIncidentsWithFilters } from './incidentsService';
import { countOverdueCorrectiveActions } from './correctiveActionsService';
import { countExpiringTraining } from './trainingService';
import { listContractors } from './contractorsService';
import { listWorkHoursMonthly } from './workHoursMonthlyService';

/**
 * AI Predictive Risk Engine, v1 (roadmap §2 / brief #4): a reasoning-based
 * pass over real trend data, not a bespoke statistical/ML model -- exactly
 * the sequencing the roadmap recommended ("LLM-reasoned trend synthesis...
 * before investing in a bespoke ML model"). Every input number is an exact
 * query result; the model's job is pattern recognition and calibrated
 * qualitative reasoning across them, not invention.
 *
 * Data sources deliberately limited to what this app actually tracks today:
 * incident category trend, near misses, overdue corrective actions,
 * expiring training, overtime hours (work_hours_monthly), and contractor
 * document compliance. Weather, vehicle telemetry, wearables and CCTV are
 * named in the roadmap's long-term vision precisely because no such data
 * exists in this schema yet -- not fabricated here.
 */

export type PredictiveRiskInputs = {
  incidentsByCategoryThisMonth: Record<string, number>;
  incidentsByCategoryLastMonth: Record<string, number>;
  nearMissesThisMonth: number;
  overdueCorrectiveActions: number;
  expiringTrainingWithin30Days: number;
  overtimeHoursThisMonth: number;
  overtimeHoursLastMonth: number;
  contractorsNeedingAttention: number;
};

export type RiskPrediction = {
  id: UUID;
  prediction_type: string;
  probability: number;
  confidence: number;
  reasoning: string;
  contributing_factors: string[];
  recommended_actions: string[];
  valid_until: string;
};

function monthRange(monthsAgo: number): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  const to = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

function groupByCategory(rows: Array<{ category: string }>): Record<string, number> {
  const map: Record<string, number> = {};
  for (const row of rows) {
    map[row.category] = (map[row.category] ?? 0) + 1;
  }
  return map;
}

async function gatherPredictiveInputs(companyId: UUID): Promise<PredictiveRiskInputs> {
  const thisMonth = monthRange(0);
  const lastMonth = monthRange(1);
  const now = new Date();
  const currentMonthNum = now.getMonth() + 1;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthNum = lastMonthDate.getMonth() + 1;
  const lastMonthYear = lastMonthDate.getFullYear();

  const [incidentsThisMonth, incidentsLastMonth, nearMisses, overdueCapas, expiringTraining, contractors, workHoursCurrentYear, workHoursLastMonthYear] =
    await Promise.all([
      listIncidentsWithFilters({ companyId, from: thisMonth.from, to: thisMonth.to, limit: 300 }),
      listIncidentsWithFilters({ companyId, from: lastMonth.from, to: lastMonth.to, limit: 300 }),
      countNearMissesThisMonth(companyId),
      countOverdueCorrectiveActions(companyId),
      countExpiringTraining(companyId, 30),
      listContractors(companyId, 200),
      listWorkHoursMonthly({ companyId, year: now.getFullYear() }),
      lastMonthYear === now.getFullYear() ? Promise.resolve(null) : listWorkHoursMonthly({ companyId, year: lastMonthYear })
    ]);

  const sumOvertime = (rows: Array<{ overtime_hours_week_or_sat: number; overtime_hours_sunday: number }>) =>
    rows.reduce((sum, r) => sum + (r.overtime_hours_week_or_sat ?? 0) + (r.overtime_hours_sunday ?? 0), 0);

  const thisMonthRows = workHoursCurrentYear.filter((r) => r.month === currentMonthNum);
  const lastMonthRows = (workHoursLastMonthYear ?? workHoursCurrentYear).filter((r) => r.month === lastMonthNum);

  return {
    incidentsByCategoryThisMonth: groupByCategory(incidentsThisMonth),
    incidentsByCategoryLastMonth: groupByCategory(incidentsLastMonth),
    nearMissesThisMonth: nearMisses,
    overdueCorrectiveActions: overdueCapas,
    expiringTrainingWithin30Days: expiringTraining,
    overtimeHoursThisMonth: sumOvertime(thisMonthRows),
    overtimeHoursLastMonth: sumOvertime(lastMonthRows),
    contractorsNeedingAttention: contractors.filter((c) => c.documents_status && c.documents_status !== 'approved').length
  };
}

const SYSTEM_PROMPT = `You are the AI Predictive Risk Engine inside Safe Cloud Africa, a SHEQ platform.
You will be given exact statistics comparing this month to last month. Identify the 2-4 most significant emerging risks by reasoning over trend direction and magnitude -- do not invent any number not given to you, and do not predict a risk with no supporting trend in the data.
Be conservative: probability should reflect genuine trend strength, not just presence of any activity. If nothing stands out, return fewer predictions rather than manufacturing one.
Return ONLY compact JSON with this exact shape, no markdown, no commentary:
{
  "predictions": [
    {
      "prediction_type": "short slug, e.g. increasing_hand_injuries, contractor_non_compliance, fatigue_related_incidents",
      "probability": 0.0-1.0 (calibrated likelihood this risk materialises in the next 30 days),
      "confidence": 0.0-1.0 (how confident you are in this estimate given the data available),
      "reasoning": "plain-language explanation citing the specific statistics that led to this prediction",
      "contributing_factors": ["short phrase", "short phrase"],
      "recommended_actions": ["specific, actionable recommendation"]
    }
  ]
}`;

export async function generateRiskPredictions(input: { companyId: UUID }): Promise<RiskPrediction[]> {
  return withInsforgeSession('ai:generate-predictions', async () => {
    const stats = await gatherPredictiveInputs(input.companyId);
    const user = `Statistics (this month vs last month):\n${JSON.stringify(stats, null, 2)}`;

    let predictions: Array<Omit<RiskPrediction, 'id' | 'valid_until'>>;
    let model: string = AI_MODELS.reasoning;
    try {
      const result = await completeJson<{ predictions: Array<Omit<RiskPrediction, 'id' | 'valid_until'>> }>({
        system: SYSTEM_PROMPT,
        user,
        model: AI_MODELS.reasoning,
        maxTokens: 1400
      });
      predictions = result.data.predictions ?? [];
      model = result.model;
    } catch (err) {
      if (err instanceof AiResponseParseError) {
        throw new Error('The predictive risk engine returned an unexpected response. Please try again.');
      }
      throw err;
    }

    if (predictions.length === 0) return [];

    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 30);

    const rows = predictions.map((p) => ({
      company_id: input.companyId,
      scope: 'company' as const,
      scope_id: null,
      prediction_type: p.prediction_type,
      probability: Math.min(1, Math.max(0, Number(p.probability) || 0)),
      confidence: Math.min(1, Math.max(0, Number(p.confidence) || 0)),
      reasoning: p.reasoning,
      contributing_factors: p.contributing_factors ?? [],
      recommended_actions: p.recommended_actions ?? [],
      model,
      valid_until: validUntil.toISOString()
    }));

    const { data, error } = await insforge.database.from('ai_predictions').insert(rows).select('*');
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? []) as RiskPrediction[];
  });
}

export async function listActiveRiskPredictions(companyId: UUID): Promise<RiskPrediction[]> {
  return withInsforgeSession('ai:list-predictions', async () => {
    const { data, error } = await insforge.database
      .from('ai_predictions')
      .select('*')
      .eq('company_id', companyId)
      .gte('valid_until', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? []) as RiskPrediction[];
  });
}
