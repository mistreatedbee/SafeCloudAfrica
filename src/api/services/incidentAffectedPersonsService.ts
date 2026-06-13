import { insforge } from '../insforge/client';
import type { IncidentAffectedPerson, UUID } from '../models/entities';
import { getErrorMessage } from '../insforge/errors';

export type UpsertIncidentAffectedPersonInput = {
  incidentId: UUID;
  companyId: UUID;
  userId?: UUID | null;
  displayName?: string | null;
  taskOperation?: string | null;
  machineryEquipmentTools?: string | null;
  sortOrder?: number;
};

export async function listIncidentAffectedPersons(incidentId: UUID): Promise<IncidentAffectedPerson[]> {
  const { data, error } = await insforge.database
    .from('incident_affected_persons')
    .select('*')
    .eq('incident_id', incidentId)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(getErrorMessage(error));
  return (data ?? []) as IncidentAffectedPerson[];
}

export async function upsertIncidentAffectedPersons(
  incidentId: UUID,
  companyId: UUID,
  persons: Array<{
    userId?: UUID | null;
    displayName?: string | null;
    taskOperation?: string | null;
    machineryEquipmentTools?: string | null;
  }>
): Promise<IncidentAffectedPerson[]> {
  // Validate before any DB operation
  for (const p of persons) {
    if ((p.userId === null || p.userId === undefined) && !p.displayName?.trim()) {
      throw new Error('Affected person must have a name when not linked to a user account.');
    }
  }

  const { error: deleteError } = await insforge.database
    .from('incident_affected_persons')
    .delete()
    .eq('incident_id', incidentId);

  if (deleteError) throw new Error(getErrorMessage(deleteError));

  if (persons.length === 0) return [];

  const rows = persons.map((p, i) => ({
    incident_id: incidentId,
    company_id: companyId,
    user_id: p.userId ?? null,
    display_name: p.displayName ?? null,
    task_operation: p.taskOperation ?? null,
    machinery_equipment_tools: p.machineryEquipmentTools ?? null,
    sort_order: i
  }));

  try {
    const { data: inserted, error: insertError } = await insforge.database
      .from('incident_affected_persons')
      .insert(rows)
      .select('*');

    if (insertError) throw new Error(getErrorMessage(insertError));
    return (inserted ?? []) as IncidentAffectedPerson[];
  } catch (err) {
    console.error('[incidents.affected] insert failed after delete — data may be incomplete', err);
    throw new Error('Failed to update affected persons. Please retry.');
  }
}
