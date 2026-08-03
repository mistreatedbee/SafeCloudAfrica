import type { AiCitedSource, Incident, UUID } from '../models/entities';
import { AI_MODELS, AiResponseParseError, completeJson } from '../../ai/aiClient';
import { buildRetrievalContext, searchSimilarChunks } from '../../ai/retrieval';
import { createActivityLog } from './activityLogService';

/**
 * AI Incident Investigator (roadmap §2 / brief #3). Reconstructs an incident
 * from the incident record itself plus similar past incidents already
 * indexed for RAG.
 *
 * Deliberately returns the draft rather than writing it to
 * incident_investigations directly: IncidentDetailModal keeps its own local
 * text-field state for the investigation form (autosaved via its existing
 * useDraftRegistration draft, persisted only when the user presses its own
 * "Save Investigation" button). Populating those same local fields lets the
 * user review and edit the AI's draft before anything is written, instead
 * of this service silently overwriting a saved investigation the moment
 * it's called -- consistent with "human approval before high-impact
 * actions" from the governance requirements.
 *
 * Also deliberately narrower than the full roadmap vision: it drafts the
 * narrative fields (root/contributing causes, timeline, conclusion, lessons
 * learnt) as free text rather than attempting to auto-select the app's
 * controlled-vocabulary cause checkboxes (see IMMEDIATE_CAUSES_UNSAFE_ACTS_GROUPS
 * etc. in api/models/core.ts) -- mapping free-form AI output onto that fixed
 * taxonomy reliably needs its own pass, flagged as a follow-up rather than
 * shipped half-working here.
 */

const SYSTEM_PROMPT = `You are the AI Incident Investigator inside Safe Cloud Africa, a SHEQ platform.
Given an incident report and similar past incidents from this company's history, draft a professional investigation.
Be specific and evidence-based; where you infer something rather than knowing it, say so plainly (e.g. "likely," "possible").
Return ONLY compact JSON with this exact shape, no markdown, no commentary:
{
  "event_timeline": "chronological reconstruction of what happened, one line per event, separated by newlines",
  "root_causes_summary": "probable root causes and contributing factors, referencing the hierarchy of causation (immediate causes -> underlying/root causes)",
  "contributing_factors": "short paragraph on contributing factors (training gaps, supervision, environment, equipment)",
  "lessons_learnt": "short paragraph of lessons learnt",
  "conclusion": "conclusion paragraph covering severity assessment, recurrence likelihood (state a qualitative likelihood: low/medium/high and why), and any legal/compliance implications",
  "potential_consequence": "what could have happened under slightly different circumstances (worst-case reasonably foreseeable outcome)"
}`;

export type IncidentInvestigationDraftFields = {
  event_timeline: string;
  root_causes_summary: string;
  contributing_factors: string;
  lessons_learnt: string;
  conclusion: string;
  potential_consequence: string;
};

export async function generateIncidentInvestigationDraft(input: {
  companyId: UUID;
  incident: Incident;
  actorUserId: UUID;
}): Promise<{ draft: IncidentInvestigationDraftFields; citedSources: AiCitedSource[]; model: string }> {
  const incident = input.incident;

  let citedSources: AiCitedSource[] = [];
  let contextBlock = 'No similar past incidents were found.';
  try {
    const query = `${incident.title} ${incident.description ?? ''} ${incident.category} ${incident.subcategory ?? ''}`.trim();
    const matches = await searchSimilarChunks({
      companyId: input.companyId,
      query,
      entityTypes: ['incident', 'ai_generated_document'],
      limit: 5
    });
    const built = buildRetrievalContext(matches.filter((m) => m.entity_id !== incident.id));
    contextBlock = built.contextBlock;
    citedSources = built.citations;
  } catch (err) {
    console.warn('[ai-incident-investigator] retrieval unavailable, generating without similar-incident context', err);
  }

  const incidentSummary = [
    `Title: ${incident.title}`,
    `Category: ${incident.category}${incident.subcategory ? ` / ${incident.subcategory}` : ''}`,
    `Severity: ${incident.severity}`,
    `Location: ${incident.location ?? 'not recorded'}`,
    `Occurred at: ${incident.occurred_at}`,
    `Description: ${incident.description ?? 'not recorded'}`,
    incident.cause_of_incident ? `Reported cause: ${incident.cause_of_incident}` : null,
    incident.nature_of_incident ? `Nature of incident: ${incident.nature_of_incident}` : null
  ]
    .filter(Boolean)
    .join('\n');

  const user = `Incident to investigate:\n${incidentSummary}\n\nSimilar past incidents at this company (for pattern recognition, most similar first):\n${contextBlock}`;

  let draft: IncidentInvestigationDraftFields;
  let model: string = AI_MODELS.reasoning;
  try {
    const result = await completeJson<IncidentInvestigationDraftFields>({
      system: SYSTEM_PROMPT,
      user,
      model: AI_MODELS.reasoning,
      maxTokens: 1600
    });
    draft = result.data;
    model = result.model;
  } catch (err) {
    if (err instanceof AiResponseParseError) {
      throw new Error('The AI investigator returned an unexpected response. Please try again.');
    }
    throw err;
  }

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'ai.incident_investigation.generate',
    entityType: 'incident',
    entityId: incident.id,
    metadata: { model, citedSourceCount: citedSources.length }
  });

  return { draft, citedSources, model };
}
