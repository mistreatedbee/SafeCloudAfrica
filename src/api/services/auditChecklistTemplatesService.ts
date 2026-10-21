import { insforge } from '../insforge/client';
import type { AuditChecklistTemplate, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';

export async function listAuditChecklistTemplates(companyId: UUID): Promise<AuditChecklistTemplate[]> {
  const { data, error } = await insforge.database
    .from('audit_checklist_templates')
    .select('*')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as AuditChecklistTemplate[];
}

export async function getAuditChecklistTemplate(companyId: UUID, id: UUID): Promise<AuditChecklistTemplate | null> {
  const { data, error } = await insforge.database
    .from('audit_checklist_templates')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', id)
    .single();
  if (error && error.code !== 'PGRST116') throw new Error(getErrorMessage(error));
  return (data as AuditChecklistTemplate) || null;
}

export async function createAuditChecklistTemplate(input: {
  companyId: UUID;
  name: string;
  sourceType?: 'googleDoc' | 'manual';
  googleDocId?: string | null;
  googleDocUrl?: string | null;
  sections?: unknown;
  questions?: unknown;
  createdByUserId: UUID;
}): Promise<AuditChecklistTemplate> {
  const { data, error } = await insforge.database
    .from('audit_checklist_templates')
    .insert({
      company_id: input.companyId,
      name: input.name,
      source_type: input.sourceType ?? 'manual',
      google_doc_id: input.googleDocId ?? null,
      google_doc_url: input.googleDocUrl ?? null,
      sections: input.sections ?? null,
      questions: input.questions ?? null,
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create audit checklist template.');
  return data as AuditChecklistTemplate;
}

export async function updateAuditChecklistTemplate(input: {
  companyId: UUID;
  id: UUID;
  name: string;
  sections?: unknown;
  questions?: unknown;
}): Promise<AuditChecklistTemplate> {
  const { data, error } = await insforge.database
    .from('audit_checklist_templates')
    .update({
      name: input.name,
      sections: input.sections ?? null,
      questions: input.questions ?? null,
      updated_at: new Date().toISOString()
    })
    .eq('company_id', input.companyId)
    .eq('id', input.id)
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to update audit checklist template.');
  return data as AuditChecklistTemplate;
}

export async function deleteAuditChecklistTemplate(companyId: UUID, id: UUID): Promise<void> {
  const { error } = await insforge.database
    .from('audit_checklist_templates')
    .delete()
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) throw new Error(getErrorMessage(error));
}
