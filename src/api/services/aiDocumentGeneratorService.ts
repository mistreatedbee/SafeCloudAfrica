import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import { withInsforgeSession } from '../insforge/ensureSession';
import type { AiCitedSource, AiDocType, AiGeneratedDocument, UUID } from '../models/entities';
import { AI_MODELS, AiResponseParseError, completeJson } from '../../ai/aiClient';
import { buildRetrievalContext, searchSimilarChunks } from '../../ai/retrieval';
import { createActivityLog } from './activityLogService';
import { indexRecordForAi } from './aiEmbeddingIndexService';

/**
 * The AI Safety Assistant (roadmap §2): "Create a risk assessment for tree
 * felling" -> an editable draft saved into ai_generated_documents. One
 * generator serves every document type in the brief (HIRA, JSA, SOP, SWP,
 * Toolbox Talk, Permit, Emergency Plan, Policy, Method Statement,
 * Environmental Plan, Checklist, Inspection Form) via a shared JSON
 * contract, so the UI and storage layer don't need a bespoke shape per type.
 */

export type AiDocumentSection = { heading: string; body: string };

export type AiDocumentHazard = {
  hazard: string;
  risk_rating: 'Low' | 'Medium' | 'High' | 'Critical';
  controls: string[];
  ppe: string[];
  legislation: string[];
};

export type AiGeneratedDocumentContent = {
  title: string;
  summary: string;
  sections: AiDocumentSection[];
  hazards?: AiDocumentHazard[];
  review_schedule?: string;
};

const DOC_TYPE_LABELS: Record<AiDocType, string> = {
  hira: 'Hazard Identification & Risk Assessment (HIRA)',
  jsa: 'Job Safety Analysis (JSA)',
  sop: 'Standard Operating Procedure (SOP)',
  swp: 'Safe Work Procedure (SWP)',
  toolbox_talk: 'Toolbox Talk',
  permit: 'Permit to Work',
  emergency_plan: 'Emergency Response Plan',
  policy: 'Policy',
  method_statement: 'Method Statement',
  environmental_plan: 'Environmental Plan',
  checklist: 'Checklist',
  inspection_form: 'Inspection Form'
};

const HAZARD_LED_DOC_TYPES: AiDocType[] = ['hira', 'jsa', 'swp', 'permit'];

function buildSystemPrompt(docType: AiDocType, companyName: string | null): string {
  const label = DOC_TYPE_LABELS[docType];
  const needsHazards = HAZARD_LED_DOC_TYPES.includes(docType);

  return `You are the AI Safety Assistant inside Safe Cloud Africa, a SHEQ (Safety, Health, Environment & Quality) platform${companyName ? ` for ${companyName}` : ''}.
Generate a professional, practical ${label} from the user's description of the work.
Ground your answer in the "Company context" the user provides where relevant, and prefer the hierarchy of controls (elimination, substitution, engineering, administrative, PPE) when recommending controls.
Return ONLY compact JSON with this exact shape, no markdown, no commentary:
{
  "title": "string",
  "summary": "one paragraph plain-language summary",
  "sections": [ { "heading": "string", "body": "string" } ]${
    needsHazards
      ? `,
  "hazards": [ { "hazard": "string", "risk_rating": "Low|Medium|High|Critical", "controls": ["string"], "ppe": ["string"], "legislation": ["string"] } ],
  "review_schedule": "string, e.g. 'Review every 12 months or after any incident'"`
      : ''
  }
}`;
}

export type GenerateAiDocumentInput = {
  companyId: UUID;
  companyName?: string | null;
  createdByUserId: UUID;
  docType: AiDocType;
  /** e.g. "Create a risk assessment for tree felling near overhead power lines" */
  prompt: string;
  entityType?: string;
  entityId?: UUID;
};

export async function generateAiDocument(input: GenerateAiDocumentInput): Promise<AiGeneratedDocument> {
  return withInsforgeSession('ai:generate-document', async () => {
    let citedSources: AiCitedSource[] = [];
    let contextBlock = 'No related company records were found.';

    try {
      const matches = await searchSimilarChunks({
        companyId: input.companyId,
        query: input.prompt,
        entityTypes: ['hira', 'incident', 'quality_ncr', 'legal_requirement', 'ai_generated_document'],
        limit: 6
      });
      const built = buildRetrievalContext(matches);
      contextBlock = built.contextBlock;
      citedSources = built.citations;
    } catch (err) {
      // RAG is an enhancement, not a dependency -- generate without context
      // rather than fail the whole request if retrieval is unavailable.
      console.warn('[ai-document-generator] retrieval unavailable, generating without company context', err);
    }

    const system = buildSystemPrompt(input.docType, input.companyName ?? null);
    const user = `Work description: ${input.prompt}\n\nCompany context (existing related records, most similar first):\n${contextBlock}`;

    let content: AiGeneratedDocumentContent;
    let model: string = AI_MODELS.fast;
    try {
      const result = await completeJson<AiGeneratedDocumentContent>({
        system,
        user,
        model: AI_MODELS.fast,
        maxTokens: 1800
      });
      content = result.data;
      model = result.model;
    } catch (err) {
      if (err instanceof AiResponseParseError) {
        throw new Error('The AI assistant returned an unexpected response. Please try rephrasing the work description.');
      }
      throw err;
    }

    const confidence = citedSources.length > 0 ? Math.min(0.95, 0.6 + citedSources.length * 0.05) : 0.55;

    const { data, error } = await insforge.database
      .from('ai_generated_documents')
      .insert({
        company_id: input.companyId,
        doc_type: input.docType,
        title: content.title || DOC_TYPE_LABELS[input.docType],
        prompt: input.prompt,
        content,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        model,
        confidence,
        cited_sources: citedSources,
        status: 'draft',
        created_by_user_id: input.createdByUserId
      })
      .select('*')
      .single();
    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to save the generated document.');

    const saved = data as AiGeneratedDocument;

    await createActivityLog({
      companyId: input.companyId,
      actorUserId: input.createdByUserId,
      action: `ai.${input.docType}.generate`,
      entityType: 'ai_generated_document',
      entityId: saved.id,
      metadata: { prompt: input.prompt, model, citedSourceCount: citedSources.length }
    });

    // Index the new draft itself, so a later HIRA generation can retrieve
    // and build on it. Non-blocking -- see aiEmbeddingIndexService.ts.
    void indexRecordForAi({
      companyId: input.companyId,
      entityType: 'ai_generated_document',
      entityId: saved.id,
      text: `${saved.title}\n${content.summary}\n${content.sections.map((s) => `${s.heading}: ${s.body}`).join('\n')}`,
      metadata: { title: saved.title, docType: input.docType }
    });

    return saved;
  });
}

export async function listAiGeneratedDocuments(input: {
  companyId: UUID;
  docType?: AiDocType;
  limit?: number;
}): Promise<AiGeneratedDocument[]> {
  return withInsforgeSession('ai:list-generated-documents', async () => {
    let q = insforge.database.from('ai_generated_documents').select('*').eq('company_id', input.companyId);
    if (input.docType) q = q.eq('doc_type', input.docType);
    const { data, error } = await q.order('created_at', { ascending: false }).limit(input.limit ?? 50);
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? []) as AiGeneratedDocument[];
  });
}

export async function updateAiGeneratedDocument(
  id: UUID,
  companyId: UUID,
  patch: Partial<Pick<AiGeneratedDocument, 'title' | 'content' | 'status'>>,
  actorUserId: UUID
): Promise<AiGeneratedDocument> {
  return withInsforgeSession('ai:update-generated-document', async () => {
    const isApproving = patch.status === 'approved' || patch.status === 'published';
    const { data, error } = await insforge.database
      .from('ai_generated_documents')
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
        ...(isApproving ? { approved_by_user_id: actorUserId, approved_at: new Date().toISOString() } : {})
      })
      .eq('id', id)
      .eq('company_id', companyId)
      .select('*')
      .single();
    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Document not found.');

    await createActivityLog({
      companyId,
      actorUserId,
      action: 'ai_generated_document.update',
      entityType: 'ai_generated_document',
      entityId: id,
      metadata: { status: patch.status ?? null }
    });

    return data as AiGeneratedDocument;
  });
}
