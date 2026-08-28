import { useMemo } from 'react';
import { useUser } from '@insforge/react';

import { useTenant } from '../tenant/TenantContext';
import { useIdentity } from '../hooks/useIdentity';
import { getHrEmployeeByUserId } from '../api/services/hrService';
import { useAsync } from '../api/hooks/useAsync';
import type { AgentContext } from './agentTypes';

/**
 * Builds the AgentContext for the current signed-in user/company. Every
 * agent call must be given a context built here (or from buildAgentContext
 * below for non-hook call sites) -- never let an agent trust a client-
 * supplied companyId/role, since that's exactly the isolation boundary
 * this system depends on.
 */
export function useAgentContext(
  currentModuleHint?: string,
  extra?: { currentPageLabel?: string; recentErrorMessage?: string | null }
): { context: AgentContext | null; loading: boolean } {
  const { user } = useUser();
  const { activeCompanyId, activeCompany, activeRole } = useTenant();
  const { fullName, organisationName } = useIdentity();
  const currentPageLabel = extra?.currentPageLabel;
  const recentErrorMessage = extra?.recentErrorMessage;

  const { data: employee, loading } = useAsync(async () => {
    if (!activeCompanyId || !user?.id) return null;
    return getHrEmployeeByUserId(activeCompanyId, user.id as string).catch(() => null);
  }, [activeCompanyId, user?.id]);

  const context = useMemo<AgentContext | null>(() => {
    if (!activeCompanyId || !user?.id || !activeRole) return null;
    return {
      companyId: activeCompanyId,
      companyName: activeCompany?.name ?? organisationName,
      userId: user.id as string,
      userFullName: fullName,
      role: activeRole,
      employeeId: employee?.id ?? null,
      redactSensitiveFields: activeRole === 'employee',
      currentModuleHint,
      currentPageLabel,
      recentErrorMessage
    };
  }, [
    activeCompanyId,
    activeCompany,
    organisationName,
    user?.id,
    fullName,
    activeRole,
    employee?.id,
    currentModuleHint,
    currentPageLabel,
    recentErrorMessage
  ]);

  return { context, loading };
}
