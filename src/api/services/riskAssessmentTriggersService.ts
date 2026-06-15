/**
 * Review triggers: when an incident, NCR, or change trigger is created/updated,
 * find related risk assessments and set them to Review Required + notify responsible personnel.
 */

import { insforge } from '../insforge/client';
import type { UUID } from '../models/entities';
import { createNotification } from './notificationsService';

export type IncidentPayload = {
  id: UUID;
  company_id: UUID;
  area?: string | null;
  activity?: string | null;
  location?: string | null;
  category?: string | null;
  project_client?: string | null;
};

export type NcrPayload = {
  id: UUID;
  company_id: UUID;
  process_involved?: string | null;
  activity_involved?: string | null;
  department_id?: UUID | null;
  location?: string | null;
  nc_number?: string | null;
};

function normalizeForMatch(s: string | null | undefined): string {
  if (s == null || typeof s !== 'string') return '';
  return s.trim().toLowerCase();
}

function textOverlap(a: string, b: string): boolean {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

/** Find risk assessment IDs that should be flagged for review due to this incident. */
export async function findRiskAssessmentsForIncident(companyId: UUID, incident: IncidentPayload): Promise<UUID[]> {
  const ids = new Set<UUID>();

  // 1) Explicitly linked in risk_assessment_incidents
  const { data: linked } = await insforge.database
    .from('risk_assessment_incidents')
    .select('risk_assessment_id')
    .eq('company_id', companyId)
    .eq('incident_id', incident.id);
  for (const row of linked ?? []) {
    ids.add((row as { risk_assessment_id: UUID }).risk_assessment_id);
  }

  // 2) Match by area/activity/location (non-archived assessments)
  const { data: assessments } = await insforge.database
    .from('risk_assessments')
    .select('id, area_location, activity_process_operation, status')
    .eq('company_id', companyId);

  const area = normalizeForMatch(incident.area);
  const activity = normalizeForMatch(incident.activity);
  const location = normalizeForMatch(incident.location);
  const project = normalizeForMatch(incident.project_client);

  for (const ra of assessments ?? []) {
    const r = ra as { id: UUID; area_location: string | null; activity_process_operation: string | null; status: string | null };
    if (r.status === 'archived' || r.status === 'closed') continue;
    if (ids.has(r.id)) continue;
    const raArea = normalizeForMatch(r.area_location);
    const raActivity = normalizeForMatch(r.activity_process_operation);
    const matchArea = (area && raArea && (raArea === area || raArea.includes(area) || area.includes(raArea))) || (location && raArea && textOverlap(location, raArea));
    const matchActivity = (activity && raActivity && (raActivity === activity || raActivity.includes(activity) || activity.includes(raActivity))) || (project && raActivity && textOverlap(project, raActivity));
    if (matchArea || matchActivity) ids.add(r.id);
  }

  return Array.from(ids);
}

/** Find risk assessment IDs that should be flagged for review due to this NCR. */
export async function findRiskAssessmentsForNcr(companyId: UUID, ncr: NcrPayload): Promise<UUID[]> {
  const ids = new Set<UUID>();

  const { data: linked } = await insforge.database
    .from('risk_assessment_ncrs')
    .select('risk_assessment_id')
    .eq('company_id', companyId)
    .eq('ncr_id', ncr.id);
  for (const row of linked ?? []) {
    ids.add((row as { risk_assessment_id: UUID }).risk_assessment_id);
  }

  const { data: assessments } = await insforge.database
    .from('risk_assessments')
    .select('id, area_location, activity_process_operation, status')
    .eq('company_id', companyId);

  const process = normalizeForMatch(ncr.process_involved);
  const activity = normalizeForMatch(ncr.activity_involved);
  const location = normalizeForMatch(ncr.location);

  for (const ra of assessments ?? []) {
    const r = ra as { id: UUID; area_location: string | null; activity_process_operation: string | null; status: string | null };
    if (r.status === 'archived' || r.status === 'closed') continue;
    if (ids.has(r.id)) continue;
    const raArea = normalizeForMatch(r.area_location);
    const raActivity = normalizeForMatch(r.activity_process_operation);
    const matchProcess = process && raActivity && textOverlap(process, raActivity);
    const matchActivity = activity && raActivity && textOverlap(activity, raActivity);
    const matchLocation = location && raArea && textOverlap(location, raArea);
    if (matchProcess || matchActivity || matchLocation) ids.add(r.id);
  }

  return Array.from(ids);
}

/** Set assessments to review_required and create notifications. */
export async function setAssessmentsReviewRequiredAndNotify(params: {
  assessmentIds: UUID[];
  companyId: UUID;
  reason: string;
  severity?: 'critical' | 'high' | 'medium' | 'low';
}): Promise<void> {
  if (params.assessmentIds.length === 0) return;
  const severity = params.severity ?? 'high';

  const { data: rows } = await insforge.database
    .from('risk_assessments')
    .select('id, title, assessment_number, responsible_personnel_user_id')
    .in('id', params.assessmentIds);

  const userIdsToNotify = new Set<UUID>();
  for (const r of rows ?? []) {
    const row = r as { id: UUID; title: string; assessment_number: string; responsible_personnel_user_id: UUID | null };
    if (row.responsible_personnel_user_id) userIdsToNotify.add(row.responsible_personnel_user_id);
  }

  const { data: managers } = await insforge.database
    .from('company_memberships')
    .select('user_id')
    .eq('company_id', params.companyId)
    .in('role', ['admin', 'manager', 'supervisor']);
  for (const m of managers ?? []) {
    userIdsToNotify.add((m as { user_id: UUID }).user_id);
  }

  await insforge.database
    .from('risk_assessments')
    .update({
      status: 'review_required',
      updated_at: new Date().toISOString()
    })
    .in('id', params.assessmentIds);

  const notificationType: 'error' | 'warning' | 'info' =
    severity === 'critical' ? 'error' : severity === 'high' ? 'warning' : 'info';
  const message = `Risk assessment requires review: ${params.reason}`;
  for (const userId of userIdsToNotify) {
    try {
      await createNotification(params.companyId, userId, notificationType, 'Risk assessment review required', message);
    } catch (_) {
      // ignore per-user notification failures
    }
  }
}

/** Call after incident create/update. */
export async function evaluateIncidentTrigger(companyId: UUID, incident: IncidentPayload): Promise<void> {
  const assessmentIds = await findRiskAssessmentsForIncident(companyId, incident);
  await setAssessmentsReviewRequiredAndNotify({
    assessmentIds,
    companyId,
    reason: `Linked to Incident`,
    severity: 'high'
  });
}

/** Call after NCR create. */
export async function evaluateNcrTrigger(companyId: UUID, ncr: NcrPayload): Promise<void> {
  const assessmentIds = await findRiskAssessmentsForNcr(companyId, ncr);
  await setAssessmentsReviewRequiredAndNotify({
    assessmentIds,
    companyId,
    reason: `Linked to NCR ${ncr.nc_number ?? ncr.id.slice(0, 8)}`,
    severity: 'high'
  });
}

/** Call after change trigger create when risk_assessment_id is set. */
export async function evaluateChangeTriggerForAssessment(companyId: UUID, riskAssessmentId: UUID): Promise<void> {
  await setAssessmentsReviewRequiredAndNotify({
    assessmentIds: [riskAssessmentId],
    companyId,
    reason: 'Change in operation/activity recorded',
    severity: 'high'
  });
}
