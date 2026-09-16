import { describe, expect, it } from 'vitest';
import { buildReviewMeetingRecordNumber } from './reviewMeetingsService';

function toDbItemEvidenceFields(item: {
  evidenceFileIds?: string[];
  linkedDocumentIds?: string[];
}) {
  return {
    evidence_file_ids: item.evidenceFileIds ?? [],
    linked_document_ids: item.linkedDocumentIds ?? []
  };
}

describe('review meeting item payload', () => {
  it('uses empty arrays instead of null for evidence and linked document ids', () => {
    expect(toDbItemEvidenceFields({})).toEqual({
      evidence_file_ids: [],
      linked_document_ids: []
    });
    expect(toDbItemEvidenceFields({ evidenceFileIds: [], linkedDocumentIds: [] })).toEqual({
      evidence_file_ids: [],
      linked_document_ids: []
    });
    expect(
      toDbItemEvidenceFields({
        evidenceFileIds: ['file-1'],
        linkedDocumentIds: ['doc-1']
      })
    ).toEqual({
      evidence_file_ids: ['file-1'],
      linked_document_ids: ['doc-1']
    });
  });

  it('formats review meeting record numbers with a four-digit sequence', () => {
    expect(buildReviewMeetingRecordNumber(2026, 1)).toBe('MM-2026-0001');
    expect(buildReviewMeetingRecordNumber(2026, 12)).toBe('MM-2026-0012');
  });
});
