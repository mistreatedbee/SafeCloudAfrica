import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import type { IncidentInvestigation, UUID } from '../models/entities';
import { createActivityLog } from './activityLogService';

export async function getIncidentInvestigation(companyId: UUID, incidentId: UUID): Promise<IncidentInvestigation | null> {
  const { data, error } = await insforge.database
    .from('incident_investigations')
    .select('*')
    .eq('company_id', companyId)
    .eq('incident_id', incidentId)
    .maybeSingle();
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? null) as IncidentInvestigation | null;
}

export async function upsertIncidentInvestigation(input: {
  companyId: UUID;
  incidentId: UUID;
  actorUserId: UUID;
  patch: Partial<Omit<IncidentInvestigation, 'id' | 'company_id' | 'incident_id' | 'created_by_user_id' | 'created_at' | 'updated_at'>>;
}): Promise<IncidentInvestigation> {
  if (!input.incidentId) throw new Error('incidentId is required to upsert an investigation.');
  if (!input.actorUserId) throw new Error('actorUserId is required to upsert an investigation.');

  const { data, error } = await insforge.database
    .from('incident_investigations')
    .upsert(
      {
        company_id: input.companyId,
        incident_id: input.incidentId,
        created_by_user_id: input.actorUserId,
        updated_at: new Date().toISOString(),
        ...(input.patch as any)
      },
      { onConflict: 'company_id,incident_id' }
    )
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to save investigation.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: 'incident_investigations.upsert',
    entityType: 'incident_investigation',
    entityId: (data as any).id as UUID,
    metadata: { incidentId: input.incidentId }
  });

  return data as IncidentInvestigation;
}

export async function listIncidentInvestigationsForIncidents(
  companyId: UUID,
  incidentIds: UUID[]
): Promise<IncidentInvestigation[]> {
  if (incidentIds.length === 0) {
    console.warn('[incidents.investigations] listIncidentInvestigationsForIncidents called with empty incidents array');
    return [];
  }
  const { data, error } = await insforge.database
    .from('incident_investigations')
    .select('*')
    .eq('company_id', companyId)
    .in('incident_id', incidentIds);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as IncidentInvestigation[];
}
