import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import { withInsforgeSession } from '../insforge/ensureSession';
import type { UUID } from '../models/entities';
import { AI_MODELS, AiResponseParseError, completeJson } from '../../ai/aiClient';
import { countIncidentsByStatus, countNearMissesThisMonth, listIncidentsWithFilters } from './incidentsService';
import { countOpenCorrectiveActions, countOverdueCorrectiveActions } from './correctiveActionsService';
import { countExpiringTraining } from './trainingService';
import { countOpenQualityNcrs } from './qualityNcrsService';
import { listContractors } from './contractorsService';

/**
 * The AI Digital Safety Manager (roadmap §1 / brief #1): a daily executive
 * briefing generated from data already tracked across the platform.
 *
 * Deliberately split in two: `stats` is computed with exact, deterministic
 * queries (the same count functions DashboardPage.tsx already trusts) so
 * every number in the briefing is verifiably correct; the LLM's only job is
 * to turn those exact numbers into a readable narrative and prioritised
 * recommendations -- it is instructed to use the given numbers, not invent
 * its own, so the briefing can never hallucinate a statistic.
 */

export type BriefingStats = {
  incidentsYesterday: number;
  highRiskIncidentsYesterday: number;
  openIncidents: number;
  nearMissesThisMonth: number;
  overdueCorrectiveActions: number;
  openCorrectiveActions: number;
  expiringTrainingWithin30Days: number;
  openNonConformances: number;
  contractorsNeedingAttention: number;
};

export type BriefingRecommendation = {
  action: string;
  reasoning: string;
  priority: 'low' | 'medium' | 'high';
};

export type AiBriefing = {
  id: UUID;
  company_id: UUID;
  briefing_date: string;
  stats: BriefingStats;
  narrative: string;
  recommendations: BriefingRecommendation[];
  model: string;
  created_by_user_id: UUID | null;
  created_at: string;
  updated_at: string;
};

function startOfYesterdayIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

async function gatherBriefingStats(companyId: UUID): Promise<{ stats: BriefingStats; highlights: string[] }> {
  const [yesterdaysIncidents, openIncidents, nearMisses, overdueCapas, openCapas, expiringTraining, openNcrs, contractors] =
    await Promise.all([
      listIncidentsWithFilters({ companyId, from: startOfYesterdayIso(), to: startOfTodayIso(), limit: 50 }),
      countIncidentsByStatus(companyId, 'open'),
      countNearMissesThisMonth(companyId),
      countOverdueCorrectiveActions(companyId),
      countOpenCorrectiveActions(companyId),
      countExpiringTraining(companyId, 30),
      countOpenQualityNcrs(companyId),
      listContractors(companyId, 200)
    ]);

  const highRiskYesterday = yesterdaysIncidents.filter((i) => i.severity === 'high' || i.severity === 'critical');
  const contractorsNeedingAttention = contractors.filter(
    (c) => c.documents_status && c.documents_status !== 'approved'
  ).length;

  const highlights = [
    ...highRiskYesterday.map((i) => `High-severity incident: "${i.title}" (${i.category})`),
    ...yesterdaysIncidents
      .filter((i) => i.severity !== 'high' && i.severity !== 'critical')
      .slice(0, 5)
      .map((i) => `Incident: "${i.title}" (${i.severity})`)
  ];

  return {
    stats: {
      incidentsYesterday: yesterdaysIncidents.length,
      highRiskIncidentsYesterday: highRiskYesterday.length,
      openIncidents,
      nearMissesThisMonth: nearMisses,
      overdueCorrectiveActions: overdueCapas,
      openCorrectiveActions: openCapas,
      expiringTrainingWithin30Days: expiringTraining,
      openNonConformances: openNcrs,
      contractorsNeedingAttention
    },
    highlights
  };
}

const BRIEFING_SYSTEM_PROMPT = `You are the AI Digital Safety Manager inside Safe Cloud Africa, a SHEQ platform.
Write a short "Good morning" executive briefing for a Safety Manager using ONLY the exact statistics and highlights provided -- never invent a number, incident, or fact that is not given to you.
Be direct and practical. Call out what needs attention today, in priority order.
Return ONLY compact JSON with this exact shape, no markdown, no commentary:
{
  "narrative": "2-4 sentence plain-language summary of yesterday and today's priorities",
  "recommendations": [ { "action": "string", "reasoning": "string, must reference one of the given statistics or highlights", "priority": "low|medium|high" } ]
}`;

export async function generateDailyBriefing(input: { companyId: UUID; createdByUserId?: UUID }): Promise<AiBriefing> {
  return withInsforgeSession('ai:generate-briefing', async () => {
    const { stats, highlights } = await gatherBriefingStats(input.companyId);

    const userPrompt = `Statistics:\n${JSON.stringify(stats, null, 2)}\n\nHighlights from yesterday:\n${
      highlights.length > 0 ? highlights.map((h) => `- ${h}`).join('\n') : '- No incidents logged yesterday.'
    }`;

    let narrative: string;
    let recommendations: BriefingRecommendation[];
    let model: string = AI_MODELS.fast;
    try {
      const result = await completeJson<{ narrative: string; recommendations: BriefingRecommendation[] }>({
        system: BRIEFING_SYSTEM_PROMPT,
        user: userPrompt,
        model: AI_MODELS.fast,
        maxTokens: 700
      });
      narrative = result.data.narrative;
      recommendations = result.data.recommendations ?? [];
      model = result.model;
    } catch (err) {
      if (!(err instanceof AiResponseParseError)) throw err;
      // Fall back to a deterministic, still-accurate briefing rather than
      // failing outright -- every number below is exact even without the AI.
      narrative = `Yesterday: ${stats.incidentsYesterday} incident(s) logged (${stats.highRiskIncidentsYesterday} high-severity). ${stats.overdueCorrectiveActions} corrective action(s) are overdue and ${stats.expiringTrainingWithin30Days} employee(s) need refresher training within 30 days.`;
      recommendations = [];
      model = 'fallback';
    }

    const { data, error } = await insforge.database
      .from('ai_briefings')
      .upsert(
        {
          company_id: input.companyId,
          briefing_date: todayDateKey(),
          stats,
          narrative,
          recommendations,
          model,
          created_by_user_id: input.createdByUserId ?? null,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'company_id,briefing_date' }
      )
      .select('*')
      .single();
    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to save the briefing.');
    return data as AiBriefing;
  });
}

export async function getTodaysBriefing(companyId: UUID): Promise<AiBriefing | null> {
  return withInsforgeSession('ai:get-todays-briefing', async () => {
    const { data, error } = await insforge.database
      .from('ai_briefings')
      .select('*')
      .eq('company_id', companyId)
      .eq('briefing_date', todayDateKey())
      .maybeSingle();
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? null) as AiBriefing | null;
  });
}

export async function listBriefings(companyId: UUID, limit = 30): Promise<AiBriefing[]> {
  return withInsforgeSession('ai:list-briefings', async () => {
    const { data, error } = await insforge.database
      .from('ai_briefings')
      .select('*')
      .eq('company_id', companyId)
      .order('briefing_date', { ascending: false })
      .limit(limit);
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? []) as AiBriefing[];
  });
}
