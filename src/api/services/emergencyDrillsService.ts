import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import type { EmergencyDrill, UUID } from '../models/entities';
import { createActivityLog } from './activityLogService';

export async function listEmergencyDrills(companyId: UUID, limit = 200): Promise<EmergencyDrill[]> {
  const { data, error } = await insforge.database
    .from('emergency_drills')
    .select('*')
    .eq('company_id', companyId)
    .order('drill_date', { ascending: false })
    .limit(limit);
  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as EmergencyDrill[];
}

export async function createEmergencyDrill(input: {
  companyId: UUID;
  name: string;
  drillDate: string;
  status?: EmergencyDrill['status'];
  notes?: string;
  createdByUserId: UUID;
}): Promise<EmergencyDrill> {
  const { data, error } = await insforge.database
    .from('emergency_drills')
    .insert({
      company_id: input.companyId,
      name: input.name,
      drill_date: input.drillDate,
      status: input.status ?? 'scheduled',
      notes: input.notes ?? null,
      created_by_user_id: input.createdByUserId
    })
    .select('*')
    .single();
  if (error) throw new Error(getErrorMessage(error));
  if (!data) throw new Error('Failed to create emergency drill.');

  await createActivityLog({
    companyId: input.companyId,
    actorUserId: input.createdByUserId,
    action: 'emergency_drills.create',
    entityType: 'emergency_drill',
    entityId: (data as any).id as UUID
  });

  return data as EmergencyDrill;
}

