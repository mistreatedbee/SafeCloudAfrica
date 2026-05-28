import { getDashboardRoute } from '../api/services/platformAdminService';
import { acceptPendingInviteForCurrentUser } from '../api/services/tenantService';
import type { CompanyMembership, UUID } from '../api/models/entities';
import { clearPendingInviteContext, consumePendingAuthRedirect } from './pendingAuthRedirect';

const TENANT_REFRESH_MAX_WAIT_MS = 1500;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export type PendingInviteWorkspaceResult =
  | { status: 'accepted'; membership: CompanyMembership; redirectPath: string }
  | { status: 'none' };

export async function acceptPendingInviteAndActivateWorkspace(input: {
  userId: UUID;
  setActiveCompanyId: (companyId: UUID | null) => void;
  refreshTenant: () => Promise<void>;
}): Promise<PendingInviteWorkspaceResult> {
  const membership = await acceptPendingInviteForCurrentUser({ userId: input.userId });
  if (!membership) return { status: 'none' };

  input.setActiveCompanyId(membership.company_id);
  await Promise.race([
    input.refreshTenant(),
    wait(TENANT_REFRESH_MAX_WAIT_MS)
  ]);
  clearPendingInviteContext();
  consumePendingAuthRedirect();

  return {
    status: 'accepted',
    membership,
    redirectPath: getDashboardRoute(membership.role)
  };
}
