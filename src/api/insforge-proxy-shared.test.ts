import { describe, expect, it } from 'vitest';

import { buildForwardHeaders, buildUpstreamUrl, getProxyBody } from '../../api/_insforge-proxy/_shared';

describe('api/_insforge-proxy/_shared getProxyBody', () => {
  it('converts raw Buffer payloads into fetch-compatible body data', () => {
    const body = getProxyBody({
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: Buffer.from('raw-payload')
    });

    expect(body).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(body as Uint8Array).toString('utf8')).toBe('raw-payload');
  });
});

describe('api/_insforge-proxy/_shared buildForwardHeaders', () => {
  it('does not forward accept-encoding to upstream fetch', () => {
    const headers = buildForwardHeaders({
      headers: {
        accept: 'application/json',
        'accept-encoding': 'gzip, deflate, br, zstd',
        'content-length': '42',
        authorization: 'Bearer token-1'
      }
    });

    expect(headers.get('accept')).toBe('application/json');
    expect(headers.get('authorization')).toBe('Bearer token-1');
    expect(headers.has('accept-encoding')).toBe(false);
    expect(headers.has('content-length')).toBe(false);
  });
});

describe('api/_insforge-proxy/_shared buildUpstreamUrl', () => {
  it('strips the internal path query parameter and keeps real query parameters', () => {
    const url = buildUpstreamUrl(
      'https://insforge.example',
      '/api/storage/buckets/sca-documents/objects/company%2Fdoc.pdf/confirm-upload',
      {
        url: '/api/insforge-proxy?path=storage/buckets/sca-documents/objects/company%2Fdoc.pdf/confirm-upload&download=1&name=doc%20one'
      }
    );

    expect(url).toBe(
      'https://insforge.example/api/storage/buckets/sca-documents/objects/company%2Fdoc.pdf/confirm-upload?download=1&name=doc%20one'
    );
  });

  it('omits the query string when only the internal path parameter is present', () => {
    const url = buildUpstreamUrl(
      'https://insforge.example',
      '/api/auth/sessions/current',
      { url: '/api/insforge-proxy?path=auth/sessions/current' }
    );

    expect(url).toBe('https://insforge.example/api/auth/sessions/current');
  });
});
