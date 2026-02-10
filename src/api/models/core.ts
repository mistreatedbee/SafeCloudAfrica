export type UUID = string;

// Phase 2 RBAC (company-scoped)
export type CompanyRole = 'admin' | 'manager' | 'supervisor' | 'consultant' | 'employee' | 'auditor';

export type LicenseType = 'starter_6m' | 'professional_12m' | 'enterprise_custom';

export type ModuleKey = 'safety' | 'hr' | 'legal' | 'quality' | 'health' | 'environment' | 'general' | 'security';

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type IncidentStatus = 'open' | 'investigating' | 'closed';

export const INCIDENT_CATEGORIES = [
  'Injury',
  'Vehicle Incident',
  'Environmental',
  'Property Damage',
  'Equipment Damage',
  'Security',
  'Quality',
  'Production',
  'Compliance',
  'Health',
  'Behavioural',
  'Emergency'
] as const;

export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

// Suggestion lists for linked subcategories (user can still type custom values).
export const INCIDENT_CATEGORY_SUBCATEGORIES: Record<IncidentCategory, readonly string[]> = {
  Injury: ['Fatality', 'LTI', 'NLTI', 'First Aid Case', 'Occupational Disease', 'Other'],
  'Vehicle Incident': ['Collision', 'Reversing incident', 'Vehicle damage', 'Pedestrian incident', 'Other'],
  Environmental: ['Chemical Spill', 'Fuel/Oil Spill', 'Water Contamination', 'Waste Mismanagement', 'Dust', 'Noise', 'Other'],
  'Property Damage': ['Building/structure', 'Site infrastructure', 'Third-party property', 'Other'],
  'Equipment Damage': ['Tool damage', 'Machine damage', 'Vehicle damage', 'Other'],
  Security: ['Theft', 'Intrusion', 'Assault', 'Vandalism', 'Other'],
  Quality: ['Non-conformance', 'Rework', 'Defect', 'Customer complaint', 'Other'],
  Production: ['Downtime', 'Product interruption', 'Resource wastage', 'Other'],
  Compliance: ['Legal non-compliance', 'Procedure not followed', 'Permit issue', 'Other'],
  Health: ['IOD', 'Exposure', 'Illness', 'Fitness/medical', 'Other'],
  Behavioural: ['Unsafe Act', 'Procedure Violation', 'PPE Non-Compliance', 'Other'],
  Emergency: ['Fire', 'Explosion', 'Natural Disaster', 'Evacuation Failure', 'Medical emergency', 'Other']
} as const;

export const INCIDENT_TYPES = [
  'Near Miss',
  'Accident',
  'Crime',
  'Environmental impact',
  'Equipment failure',
  'Financial',
  'Human resource occurrence',
  'Industry specific incident',
  'Natural event',
  'Non conformance',
  'Product interruption',
  'Resource wastage',
  'Other'
] as const;

export type IncidentType = (typeof INCIDENT_TYPES)[number];

export const RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

// Simple helper to derive a qualitative risk level from severity + likelihood (1–5).
export function calculateRiskLevel(severity: Severity, likelihood: number): RiskLevel {
  const sevScore =
    severity === 'critical' ? 4 :
    severity === 'high' ? 3 :
    severity === 'medium' ? 2 :
    1;
  const score = sevScore * Math.max(1, Math.min(5, Number(likelihood) || 1));

  if (score >= 16) return 'critical';
  if (score >= 9) return 'high';
  if (score >= 4) return 'medium';
  return 'low';
}

