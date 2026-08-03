import type { AiCitedSource, UUID } from '../models/entities';
import { AI_MODELS, AiResponseParseError, completeJson } from '../../ai/aiClient';
import { buildRetrievalContext, searchSimilarChunks } from '../../ai/retrieval';
import type { RiskAssessmentType } from './riskAssessmentsService';
import type { RiskTableColumn } from '../../pages/risks/riskTemplates';

/**
 * AI Risk Assessment Builder (roadmap §5 / brief #5): "Installing
 * underground fibre cables" -> hazards, ratings, and controls pre-filled
 * directly into the existing Risk Assessment form's own row shape, rather
 * than a separate AI document. columnsForType(type) already varies per
 * assessment type (baseline/task/critical/prework, see riskTemplates.ts) so
 * the column keys are passed into the prompt instead of hardcoding a shape
 * per type -- one generator serves all four templates.
 */

export type GeneratedRiskRow = {
  json_data: Record<string, string>;
  severity: number;
  likelihood: number;
};

function buildSystemPrompt(columns: RiskTableColumn[], typeLabel: string): string {
  const fieldList = columns.map((c) => `"${c.key}"`).join(', ');
  return `You are the AI Risk Assessment Builder inside Safe Cloud Africa, a SHEQ platform.
Given a description of work, generate 3-8 realistic risk assessment rows for a ${typeLabel}.
Prefer the hierarchy of controls (elimination, substitution, engineering, administrative, PPE) when describing controls, and reference relevant legislation/standards where applicable.
Ground your answer in the "Company context" provided where relevant.
Return ONLY compact JSON with this exact shape, no markdown, no commentary:
{
  "rows": [
    {
      ${fieldList ? fieldList + ',' : ''}
      "severity": 1-5 integer (consequence severity if the risk occurs),
      "likelihood": 1-5 integer (probability of the risk occurring)
    }
  ]
}
Every field listed above (except severity/likelihood) must be a short plain-text string. Do not add fields that are not listed.`;
}

export async function generateRiskAssessmentRows(input: {
  companyId: UUID;
  type: RiskAssessmentType;
  typeLabel: string;
  columns: RiskTableColumn[];
  workDescription: string;
}): Promise<{ rows: GeneratedRiskRow[]; citedSources: AiCitedSource[] }> {
  let citedSources: AiCitedSource[] = [];
  let contextBlock = 'No related company records were found.';

  try {
    const matches = await searchSimilarChunks({
      companyId: input.companyId,
      query: input.workDescription,
      entityTypes: ['hira', 'incident', 'legal_requirement', 'ai_generated_document'],
      limit: 6
    });
    const built = buildRetrievalContext(matches);
    contextBlock = built.contextBlock;
    citedSources = built.citations;
  } catch (err) {
    console.warn('[ai-risk-assessment] retrieval unavailable, generating without company context', err);
  }

  const system = buildSystemPrompt(input.columns, input.typeLabel);
  const user = `Work description: ${input.workDescription}\n\nCompany context (existing related records, most similar first):\n${contextBlock}`;

  try {
    // The model returns each row's column fields flat (alongside severity/
    // likelihood), matching the prompt's shape -- not pre-nested under
    // json_data -- so json_data is reassembled here from whatever keys the
    // model actually used, restricted to the columns we asked for.
    const result = await completeJson<{ rows: Array<Record<string, unknown>> }>({
      system,
      user,
      model: AI_MODELS.fast,
      maxTokens: 1800
    });
    const allowedKeys = new Set(input.columns.map((c) => c.key));
    const rows: GeneratedRiskRow[] = (result.data.rows ?? []).map((row) => {
      const json_data: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        if (key === 'severity' || key === 'likelihood') continue;
        if (!allowedKeys.has(key)) continue;
        json_data[key] = String(value ?? '');
      }
      return {
        json_data,
        severity: Math.min(5, Math.max(1, Math.round(Number(row.severity) || 3))),
        likelihood: Math.min(5, Math.max(1, Math.round(Number(row.likelihood) || 3)))
      };
    });
    return { rows, citedSources };
  } catch (err) {
    if (err instanceof AiResponseParseError) {
      throw new Error('The AI builder returned an unexpected response. Please try rephrasing the work description.');
    }
    throw err;
  }
}
