import { insforge } from '../insforge/client';
import type { UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';

export type InspectionItemEvidence = {
  id: UUID;
  company_id: UUID;
  run_item_id: UUID;
  evidence_type: 'initial' | 'closure';
  file_url: string;
  original_filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by_user_id: UUID;
  uploaded_at: string;
  description: string | null;
  metadata: any | null;
};

export async function listInspectionItemEvidence(
  companyId: UUID,
  runItemId: UUID
): Promise<InspectionItemEvidence[]> {
  const { data, error } = await insforge.database
    .from('inspection_item_evidence')
    .select('*')
    .eq('company_id', companyId)
    .eq('run_item_id', runItemId)
    .order('uploaded_at', { ascending: false });
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as InspectionItemEvidence[];
}

export async function createInspectionItemEvidence(input: {
  companyId: UUID;
  runItemId: UUID;
  evidenceType: 'initial' | 'closure';
  fileUrl: string;
  originalFilename?: string;
  mimeType?: string;
  sizeBytes?: number;
  description?: string;
  uploadedByUserId: UUID;
  metadata?: any;
}): Promise<InspectionItemEvidence> {
  const { data, error } = await insforge.database
    .from('inspection_item_evidence')
    .insert({
      company_id: input.companyId,
      run_item_id: input.runItemId,
      evidence_type: input.evidenceType,
      file_url: input.fileUrl,
      original_filename: input.originalFilename ?? null,
      mime_type: input.mimeType ?? null,
      size_bytes: input.sizeBytes ?? null,
      uploaded_by_user_id: input.uploadedByUserId,
      description: input.description ?? null,
      metadata: input.metadata ?? null
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  return data as InspectionItemEvidence;
}

