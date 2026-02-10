import type { Incident } from '../models/entities';

/**
 * Near miss is modeled as Incident.metadata.incidentType === 'Near Miss'.
 * Backwards compatibility: older data may still have category === 'Near Miss'.
 */
export function isNearMiss(incident: Incident): boolean {
  const metaType = String((incident as any)?.metadata?.incidentType ?? '').trim();
  const typeCol = String((incident as any)?.incident_type ?? '').trim();
  return metaType === 'Near Miss' || typeCol === 'Near Miss' || String((incident as any)?.category ?? '').trim() === 'Near Miss';
}

