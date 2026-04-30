import { describe, expect, it } from 'vitest';

import { readEditorConfigResponse, toFriendlyEditorMessage } from './documentEditorResponse';

describe('DocumentEditorPage response helpers', () => {
  it('treats HTML editor-config responses as a route misconfiguration', async () => {
    const response = new Response('<!DOCTYPE html><html><body>Not found</body></html>', {
      status: 404,
      headers: { 'content-type': 'text/html' }
    });

    await expect(readEditorConfigResponse(response)).rejects.toThrow(
      'Document editor service route is unavailable or misconfigured. Please contact the system administrator.'
    );
  });

  it('returns JSON editor errors so callers can show backend-provided messages', async () => {
    const response = new Response(JSON.stringify({
      ok: false,
      error: 'The document record exists, but the uploaded file could not be retrieved from storage.',
      code: 'DMS_STORAGE_FILE_UNAVAILABLE'
    }), {
      status: 404,
      headers: { 'content-type': 'application/json' }
    });

    await expect(readEditorConfigResponse(response)).resolves.toMatchObject({
      ok: false,
      error: 'The document record exists, but the uploaded file could not be retrieved from storage.'
    });
  });

  it('maps storage retrieval errors to a non-route-misconfigured message', () => {
    expect(toFriendlyEditorMessage('DMS_STORAGE_FILE_UNAVAILABLE')).toBe(
      'The document record was saved, but the uploaded file could not be retrieved from storage. Please re-upload the file or contact the system administrator.'
    );
  });
});
