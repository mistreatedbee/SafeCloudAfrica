import { describe, expect, it } from 'vitest';

import { buildOnlyofficeDocumentKey } from './editorConfigHandler';

describe('buildOnlyofficeDocumentKey', () => {
  const base = {
    versionId: '819d06d8-f34d-4e78-bbbd-9b18e4436385',
    storageKey: 'company/doc.docx',
    updatedAt: '2026-04-30T12:00:00.000Z',
    fileSize: 1234
  };

  it('returns the same key for the same version and file metadata', () => {
    expect(buildOnlyofficeDocumentKey(base)).toBe(buildOnlyofficeDocumentKey(base));
  });

  it.each([
    [{ storageKey: 'company/edited.docx' }],
    [{ updatedAt: '2026-04-30T12:01:00.000Z' }],
    [{ fileSize: 5678 }]
  ])('changes when persisted file metadata changes', (patch) => {
    expect(buildOnlyofficeDocumentKey(base)).not.toBe(buildOnlyofficeDocumentKey({ ...base, ...patch }));
  });
});
