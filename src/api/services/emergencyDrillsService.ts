import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import type { EmergencyDrill, UUID } from '../models/entities';
import { createActivityLog } from './activityLogService';
import { requireSellableFeatureAccess } from './sellableFeaturesService';

export async function listEmergencyDrills(companyId: UUID, limit = 200): Promise<EmergencyDrill[]> {
  await requireSellableFeatureAccess(companyId, 'emergencyPreparedness');
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
  planDocumentId?: UUID | null;
  status?: EmergencyDrill['status'];
  notes?: string;
  performanceScore?: number | null;
  participantsCount?: number;
  actionsOpen?: number;
  alertChannel?: string | null;
  actionNotes?: string | null;
  createdByUserId: UUID;
}): Promise<EmergencyDrill> {
  await requireSellableFeatureAccess(input.companyId, 'emergencyPreparedness');
  const { data, error } = await insforge.database
    .from('emergency_drills')
    .insert({
      company_id: input.companyId,
      name: input.name,
      drill_date: input.drillDate,
      plan_document_id: input.planDocumentId ?? null,
      status: input.status ?? 'scheduled',
      notes: input.notes ?? null,
      performance_score: input.performanceScore ?? null,
      participants_count: input.participantsCount ?? 0,
      actions_open: input.actionsOpen ?? 0,
      alert_channel: input.alertChannel ?? null,
      action_notes: input.actionNotes ?? null,
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

export async function getEmergencyPreparednessSummary(companyId: UUID): Promise<{
  totalDrills: number;
  scheduled: number;
  completed: number;
  averagePerformanceScore: number;
}> {
  const rows = await listEmergencyDrills(companyId, 500);
  const completedRows = rows.filter((row) => row.status === 'completed' && row.performance_score != null);
  return {
    totalDrills: rows.length,
    scheduled: rows.filter((row) => row.status === 'scheduled').length,
    completed: rows.filter((row) => row.status === 'completed').length,
    averagePerformanceScore:
      completedRows.length > 0
        ? Number(
            (
              completedRows.reduce((sum, row) => sum + Number(row.performance_score || 0), 0) /
              completedRows.length
            ).toFixed(2)
          )
        : 0
  };
}

