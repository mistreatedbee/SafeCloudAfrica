import { insforge } from '../insforge/client';
import { withInsforgeSession } from '../insforge/ensureSession';
import type { KPIItem, KpiImportance, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';

export type CreateKPIItemInput = {
  organizationId: UUID | null;
  title: string;
  description?: string | null;
  defaultImportance?: KpiImportance;
  category?: string | null;
  tags?: unknown;
  createdBy: UUID;
};

export async function listKpiItems(input: {
  organizationId: UUID | null;
  activeOnly?: boolean;
}): Promise<KPIItem[]> {
  return withInsforgeSession('kpi_items:list', async () => {
    let query = insforge.database.from('kpi_items').select('*');

    if (input.organizationId != null) {
      query = query.or(`organization_id.eq.${input.organizationId},organization_id.is.null`);
    } else {
      query = query.is('organization_id', null);
    }
    if (input.activeOnly !== false) {
      query = query.eq('active', true);
    }

    const { data, error } = await query.order('updated_at', { ascending: false });
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? []) as KPIItem[];
  });
}

export async function createKpiItem(input: CreateKPIItemInput, actorUserId: UUID): Promise<KPIItem> {
  return withInsforgeSession('kpi_items:create', async () => {
    const { data, error } = await insforge.database
      .from('kpi_items')
      .insert({
        organization_id: input.organizationId ?? null,
        title: input.title,
        description: input.description ?? null,
        default_importance: input.defaultImportance ?? 'medium',
        category: input.category ?? null,
        tags: input.tags ?? null,
        active: true,
        created_by: input.createdBy
      })
      .select('*')
      .single();

    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to create KPI item.');

    const orgId = input.organizationId;
    if (orgId) {
      await createActivityLog({
        companyId: orgId,
        actorUserId,
        action: 'kpi_items.create',
        entityType: 'kpi_item',
        entityId: (data as KPIItem).kpi_item_id
      });
    }

    return data as KPIItem;
  });
}

export async function updateKpiItem(
  itemId: UUID,
  patch: Partial<Pick<KPIItem, 'title' | 'description' | 'default_importance' | 'category' | 'tags' | 'active'>>,
  organizationId: UUID,
  actorUserId: UUID
): Promise<KPIItem> {
  return withInsforgeSession('kpi_items:update', async () => {
    const { data, error } = await insforge.database
      .from('kpi_items')
      .update({
        ...patch,
        updated_at: new Date().toISOString()
      })
      .eq('kpi_item_id', itemId)
      .or(`organization_id.eq.${organizationId},organization_id.is.null`)
      .select('*')
      .single();

    if (error) throw new Error(getErrorMessage(error));
    if (!data) throw new Error('Failed to update KPI item.');

    await createActivityLog({
      companyId: organizationId,
      actorUserId,
      action: 'kpi_items.update',
      entityType: 'kpi_item',
      entityId: itemId
    });

    return data as KPIItem;
  });
}

export async function getKpiItem(itemId: UUID, organizationId: UUID | null): Promise<KPIItem | null> {
  return withInsforgeSession('kpi_items:get', async () => {
    let query = insforge.database.from('kpi_items').select('*').eq('kpi_item_id', itemId);
    if (organizationId != null) {
      query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`);
    }
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(getErrorMessage(error));
    return data as KPIItem | null;
  });
}

export async function deleteKpiItem(input: {
  itemId: UUID;
  organizationId: UUID;
  actorUserId: UUID;
}): Promise<void> {
  return withInsforgeSession('kpi_items:delete', async () => {
    const { data: existing, error: existingError } = await insforge.database
      .from('kpi_items')
      .select('kpi_item_id,organization_id')
      .eq('kpi_item_id', input.itemId)
      .maybeSingle();
    if (existingError) throw new Error(getErrorMessage(existingError));
    if (!existing) throw new Error('KPI item not found.');

    const existingRow = existing as { kpi_item_id: string; organization_id: string | null };

    // Never hard-delete global templates. Deactivate instead.
    if (existingRow.organization_id == null) {
      throw new Error('This is a global KPI template and cannot be deleted. Deactivate it instead.');
    }
    if (String(existingRow.organization_id) !== String(input.organizationId)) {
      throw new Error('KPI item does not belong to this organization.');
    }

    const { error } = await insforge.database
      .from('kpi_items')
      .delete()
      .eq('kpi_item_id', input.itemId)
      .eq('organization_id', input.organizationId);
    if (error) throw new Error(getErrorMessage(error));

    await createActivityLog({
      companyId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'kpi_items.delete',
      entityType: 'kpi_item',
      entityId: input.itemId
    }).catch(() => undefined);
  });
}
