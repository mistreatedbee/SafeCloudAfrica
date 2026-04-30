import { describe, expect, it } from 'vitest';

import { getProxyBody } from './_insforge-proxy/_shared';

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
