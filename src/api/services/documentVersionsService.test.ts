import { describe, expect, it, vi } from 'vitest';

const rpcMock = vi.fn();

vi.mock('../insforge/client', () => ({
  insforge: {
    database: {
      rpc: (...args: unknown[]) => rpcMock(...args)
    }
  }
}));

import { createDraftVersionFrom } from './documentVersionsService';

describe('createDraftVersionFrom', () => {
  it('passes p_unpublish=false for normal drafts', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { id: 'ver-1' },
      error: null
    });

    await createDraftVersionFrom({
      companyId: 'company-1' as any,
      documentId: 'doc-1' as any,
      supersedesVersionId: 'ver-0' as any,
      baseVersionLabel: 'v1',
      storageBucket: 'bucket',
      storageKey: 'key',
      createdByUserId: 'user-1' as any,
      setCurrent: true,
      unpublish: false
    });

    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [, payload] = rpcMock.mock.calls[0] as any;
    expect(payload.p_version_label).toBe('v2');
    expect(payload.p_set_current).toBe(true);
    expect(payload.p_unpublish).toBe(false);
  });

  it('passes p_unpublish=true for unpublish revisions', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { id: 'ver-2' },
      error: null
    });

    await createDraftVersionFrom({
      companyId: 'company-1' as any,
      documentId: 'doc-1' as any,
      supersedesVersionId: 'ver-1' as any,
      baseVersionLabel: 'v2',
      storageBucket: 'bucket',
      storageKey: 'key',
      createdByUserId: 'user-1' as any,
      setCurrent: true,
      unpublish: true
    });

    expect(rpcMock).toHaveBeenCalledTimes(2);
    const [, payload] = rpcMock.mock.calls[1] as any;
    expect(payload.p_version_label).toBe('v3');
    expect(payload.p_set_current).toBe(true);
    expect(payload.p_unpublish).toBe(true);
  });
});

