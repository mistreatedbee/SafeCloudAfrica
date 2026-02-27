import { insforge } from '../insforge/client';
import { ensureInsforgeSession } from '../insforge/ensureSession';
import { uploadFile, deleteFile, StorageBucket } from './storageService';
import type { UUID } from '../models/core';

export interface FormTemplate {
  id: UUID;
  company_id: UUID;
  module: string;
  name: string;
  description?: string;
  schema: FormField[];
  original_pdf_bucket?: StorageBucket;
  original_pdf_key?: string;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
}

export interface FormField {
  id: string;
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'date' | 'file';
  label: string;
  required: boolean;
  options?: string[]; // for select/radio
  placeholder?: string;
}

export interface FormSubmission {
  id: UUID;
  template_id: UUID;
  submitted_by_user_id: UUID;
  data: Record<string, any>;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  submitted_at: string;
  reviewed_by_user_id?: UUID;
  reviewed_at?: string;
  review_notes?: string;
}

export interface CreateFormTemplateInput {
  companyId: UUID;
  module: string;
  name: string;
  description?: string;
  schema: FormField[];
  pdfFile?: File; // Optional PDF upload
}

export interface UpdateFormTemplateInput {
  templateId: UUID;
  name?: string;
  description?: string;
  schema?: FormField[];
  pdfFile?: File;
}

export interface SubmitFormInput {
  templateId: UUID;
  data: Record<string, any>;
}

/**
 * Create a new form template
 */
export async function createFormTemplate(input: CreateFormTemplateInput): Promise<FormTemplate> {
  await ensureInsforgeSession();

  let storage_bucket: StorageBucket | undefined;
  let storage_key: string | undefined;

  // Upload PDF if provided
  if (input.pdfFile) {
    const bucket: StorageBucket = 'sca-templates';
    const uploadResult = await uploadFile(bucket, input.pdfFile, {
      key: `templates/${input.companyId}/${Date.now()}-${input.pdfFile.name}`,
      metadata: {
        company_id: input.companyId,
        module: input.module,
        name: input.name
      }
    });

    storage_bucket = uploadResult.bucket;
    storage_key = uploadResult.key;
  }

  const { data, error } = await insforge.database
    .from('form_templates')
    .insert({
      company_id: input.companyId,
      module: input.module,
      name: input.name,
      description: input.description,
      schema: input.schema,
      original_pdf_bucket: storage_bucket,
      original_pdf_key: storage_key
    })
    .select('*')
    .single();

  if (error) throw new Error(`Failed to create form template: ${error.message}`);
  if (!data) throw new Error('Failed to create form template.');

  return data as FormTemplate;
}

/**
 * Update a form template
 */
export async function updateFormTemplate(input: UpdateFormTemplateInput): Promise<FormTemplate> {
  await ensureInsforgeSession();

  const updates: any = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  if (input.schema !== undefined) updates.schema = input.schema;

  // Handle PDF update
  if (input.pdfFile) {
    const template = await getFormTemplateById(input.templateId);
    if (template.original_pdf_key) {
      // Delete old file
      await deleteFile(template.original_pdf_bucket!, template.original_pdf_key);
    }

    const bucket: StorageBucket = 'sca-templates';
    const uploadResult = await uploadFile(bucket, input.pdfFile, {
      key: `templates/${template.company_id}/${Date.now()}-${input.pdfFile.name}`,
      metadata: {
        template_id: input.templateId,
        name: input.name || template.name
      }
    });

    updates.original_pdf_bucket = uploadResult.bucket;
    updates.original_pdf_key = uploadResult.key;
  }

  const { data, error } = await insforge.database
    .from('form_templates')
    .update(updates)
    .eq('id', input.templateId)
    .select('*')
    .single();

  if (error) throw new Error(`Failed to update form template: ${error.message}`);
  if (!data) throw new Error('Form template not found.');

  return data as FormTemplate;
}

/**
 * Delete a form template
 */
export async function deleteFormTemplate(templateId: UUID): Promise<void> {
  await ensureInsforgeSession();

  // Get template to delete associated files
  const template = await getFormTemplateById(templateId);

  // Delete from database
  const { error } = await insforge.database
    .from('form_templates')
    .delete()
    .eq('id', templateId);

  if (error) throw new Error(`Failed to delete form template: ${error.message}`);

  // Delete associated files
  if (template.original_pdf_key && template.original_pdf_bucket) {
    await deleteFile(template.original_pdf_bucket, template.original_pdf_key);
  }
}

/**
 * Get form template by ID
 */
export async function getFormTemplateById(templateId: UUID): Promise<FormTemplate> {
  const { data, error } = await insforge.database
    .from('form_templates')
    .select('*')
    .eq('id', templateId)
    .single();

  if (error) throw new Error(`Failed to get form template: ${error.message}`);
  if (!data) throw new Error('Form template not found.');

  return data as FormTemplate;
}

/**
 * List form templates for a company
 */
export async function listFormTemplates(companyId: UUID, options?: {
  module?: string;
  status?: 'draft' | 'published' | 'archived';
  limit?: number;
}): Promise<FormTemplate[]> {
  let query = insforge.database
    .from('form_templates')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (options?.module) {
    query = query.eq('module', options.module);
  }

  if (options?.status) {
    query = query.eq('status', options.status);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) throw new Error(`Failed to list form templates: ${error.message}`);

  return (data || []) as FormTemplate[];
}

/**
 * Submit a form
 */
export async function submitForm(input: SubmitFormInput): Promise<FormSubmission> {
  await ensureInsforgeSession();

  const { data, error } = await insforge.database
    .from('form_submissions')
    .insert({
      template_id: input.templateId,
      data: input.data,
      status: 'submitted'
    })
    .select('*')
    .single();

  if (error) throw new Error(`Failed to submit form: ${error.message}`);
  if (!data) throw new Error('Failed to submit form.');

  return data as FormSubmission;
}

/**
 * List form submissions for a template
 */
export async function listFormSubmissions(templateId: UUID): Promise<FormSubmission[]> {
  const { data, error } = await insforge.database
    .from('form_submissions')
    .select('*')
    .eq('template_id', templateId)
    .order('submitted_at', { ascending: false });

  if (error) throw new Error(`Failed to list form submissions: ${error.message}`);

  return (data || []) as FormSubmission[];
}
