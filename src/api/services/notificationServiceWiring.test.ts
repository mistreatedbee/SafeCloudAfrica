import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  sendTemplatedNotificationEmail: vi.fn()
}));

vi.mock('../insforge/client', () => ({
  insforge: {
    database: {
      from: (...args: unknown[]) => mocks.from(...args)
    }
  },
  insforgeReady: Promise.resolve()
}));

vi.mock('../insforge/ensureSession', () => ({
  withInsforgeSession: (_reason: string, fn: () => Promise<unknown>) => fn()
}));

vi.mock('./emailService', async () => {
  const actual = await vi.importActual<typeof import('./emailService')>('./emailService');
  return {
    ...actual,
    sendTemplatedNotificationEmail: (...args: unknown[]) => mocks.sendTemplatedNotificationEmail(...args)
  };
});

function insertBuilder(data: unknown) {
  return {
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({ data, error: null }))
      }))
    }))
  };
}

function selectEmailBuilder(email: string) {
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: { email }, error: null }))
  };
  return builder;
}

describe('notification service email wiring', () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.sendTemplatedNotificationEmail.mockReset();
  });

  it('sends a templated approval request email to the approver', async () => {
    const approval = {
      id: 'approval-1',
      company_id: 'company-1',
      entity_type: 'document_version',
      entity_id: 'version-1',
      requested_by_user_id: 'requester-1',
      approver_user_id: 'approver-1',
      status: 'pending'
    };
    mocks.from.mockImplementation((table: string) => {
      if (table === 'approvals') return insertBuilder(approval);
      if (table === 'activity_logs') return insertBuilder({ id: 'log-1' });
      if (table === 'user_profiles') return selectEmailBuilder('approver@example.com');
      throw new Error(`Unexpected table ${table}`);
    });

    const { createApproval } = await import('./approvalsService');
    await createApproval({
      companyId: 'company-1',
      entityType: 'document_version',
      entityId: 'version-1',
      requestedByUserId: 'requester-1',
      approverUserId: 'approver-1'
    });

    expect(mocks.sendTemplatedNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'approver@example.com',
        templateKey: 'approvals',
        actionUrl: '/dashboard/management/approvals',
        meta: expect.objectContaining({ approvalId: 'approval-1' })
      })
    );
  });
});
