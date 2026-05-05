import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchWithInsforgeAuthMock = vi.fn();

vi.mock('../insforge/authenticatedFetch', () => ({
  fetchWithInsforgeAuth: (...args: unknown[]) => fetchWithInsforgeAuthMock(...args)
}));

import { sendEmail, sendTemplatedNotificationEmail } from './emailService';

describe('emailService', () => {
  beforeEach(() => {
    fetchWithInsforgeAuthMock.mockReset();
    fetchWithInsforgeAuthMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  });

  it('keeps sendEmail payloads backwards compatible', async () => {
    await sendEmail({
      to: 'user@example.com',
      subject: 'Plain update',
      html: '<p>Hello</p>',
      meta: { source: 'test' }
    });

    expect(fetchWithInsforgeAuthMock).toHaveBeenCalledWith(
      '/api/email/send',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          to: 'user@example.com',
          subject: 'Plain update',
          html: '<p>Hello</p>',
          meta: { source: 'test' }
        })
      }),
      'email:send'
    );
  });

  it('renders templated notification emails before sending', async () => {
    await sendTemplatedNotificationEmail({
      to: ['manager@example.com'],
      templateKey: 'approvals',
      variables: {
        title: 'Document version',
        itemType: 'document_version',
        requester: 'owner@example.com',
        status: 'Pending'
      },
      actionUrl: '/dashboard/management/approvals',
      meta: { approvalId: 'approval-1' }
    });

    const body = JSON.parse(fetchWithInsforgeAuthMock.mock.calls[0]?.[1]?.body as string);
    expect(body.to).toEqual(['manager@example.com']);
    expect(body.subject).toBe('Approval required: Document version');
    expect(body.html).toContain('Review approval');
    expect(body.text).toContain('Requested by: owner@example.com');
    expect(body.meta).toEqual({ approvalId: 'approval-1', templateKey: 'approvals' });
  });
});
