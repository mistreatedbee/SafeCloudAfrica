import { insforge } from '../insforge/client';
import type { CorrectiveAction, UUID } from '../models/entities';
import type { ModuleKey } from '../models/core';
import { getErrorMessage } from '../insforge/errors';

export async function countOpenCorrectiveActions(companyId: UUID, input?: { module?: ModuleKey }): Promise<number> {
  const base = insforge.database
    .from('corrective_actions')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .neq('status', 'closed');
  const q = input?.module ? base.eq('module', input.module) : base;
  const { count, error } = await q;
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
}

export async function countOverdueCorrectiveActions(companyId: UUID, input?: { module?: ModuleKey }): Promise<number> {
  const base = insforge.database
    .from('corrective_actions')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .neq('status', 'closed')
    .lt('due_at', new Date().toISOString());
  const q = input?.module ? base.eq('module', input.module) : base;
  const { count, error } = await q;
  if (error) throw new Error(getErrorMessage(error));
  return count ?? 0;
}

