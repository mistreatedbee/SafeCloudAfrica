export type UUID = string;

// Phase 2 RBAC (company-scoped)
export type CompanyRole = 'admin' | 'manager' | 'supervisor' | 'consultant' | 'employee' | 'auditor';

export type LicenseType = 'starter_6m' | 'professional_12m' | 'enterprise_custom';

export type ModuleKey = 'safety' | 'hr' | 'legal' | 'quality' | 'health' | 'environment' | 'general' | 'security' | 'hcs';

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type IncidentStatus = 'open' | 'investigating' | 'closed';

// Updated Incident Categories (Top-Level)
export const INCIDENT_CATEGORIES = [
  'Near Miss',
  'Injury (LTI / NLTI)',
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

// Comprehensive Subcategories for each incident category
export const INCIDENT_SUBCATEGORIES: Record<IncidentCategory, string[]> = {
  'Near Miss': [
    'Falling objects (near impact)',
    'Slips without injury',
    'Equipment malfunction without injury',
    'Vehicle near-collisions',
    'Structural failure (near miss)',
    'Electrical near contact',
    'Chemical near exposure',
    'Working-at-height near falls',
    'Other (specify)'
  ],
  'Injury (LTI / NLTI)': [
    'Fatalities',
    'Lost Time Injuries (LTI)',
    'Medical Treatment Cases (MTC)',
    'First Aid Cases (FAC)',
    'Minor injuries (cuts, bruises, strains)',
    'Occupational diseases',
    'Heat stress / dehydration',
    'Fatigue-related incidents',
    'Ergonomic injuries (RSI, back injuries)',
    'Psychological harm (stress, burnout, trauma)',
    'Other (specify)'
  ],
  'Vehicle Incident': [
    'Vehicle accidents',
    'Reversing incidents',
    'Rollovers',
    'Load shifting',
    'Pedestrian strikes',
    'Fleet collisions',
    'Interface incidents',
    'Other (specify)'
  ],
  'Environmental': [
    'Chemical spills',
    'Fuel/oil spills',
    'Water contamination',
    'Soil contamination',
    'Illegal dumping',
    'Air pollution (dust, fumes)',
    'Noise exceedances',
    'Biodiversity disturbance',
    'Hazardous waste mismanagement',
    'Other (specify)'
  ],
  'Property Damage': [
    'Building damage',
    'Infrastructure damage',
    'Fire damage',
    'Water damage',
    'Storm damage',
    'Vandalism damage',
    'Other (specify)'
  ],
  'Equipment Damage': [
    'Plant breakdowns',
    'Tool failures',
    'Defective equipment use',
    'Ladder failures',
    'Scaffold collapses',
    'Structural failures',
    'Conveyor incidents',
    'Crane incidents',
    'Lifting equipment failures',
    'Other (specify)'
  ],
  'Security': [
    'Trespassing',
    'Theft',
    'Vandalism',
    'Armed robbery',
    'Public injury incidents',
    'Workplace violence',
    'Civil unrest impact',
    'Threats / intimidation',
    'Other (specify)'
  ],
  'Quality': [
    'Product defects',
    'Process deviations',
    'Non-conformance',
    'Customer complaints',
    'Supplier quality issues',
    'Documentation errors',
    'Calibration failures',
    'Other (specify)'
  ],
  'Production': [
    'Production delays',
    'Equipment downtime',
    'Material shortages',
    'Process interruptions',
    'Quality hold',
    'Other (specify)'
  ],
  'Compliance': [
    'Legal non-compliance',
    'Audit findings',
    'Permit violations',
    'License breaches',
    'Policy violations',
    'Training non-compliance',
    'Contractor non-compliance',
    'ISO / certification breaches',
    'Other (specify)'
  ],
  'Health': [
    'Chemical exposure',
    'Biological exposure',
    'Noise exceedances',
    'Radiation exposure',
    'Dust inhalation',
    'Asbestos exposure',
    'Silica exposure',
    'Heat stress',
    'Other (specify)'
  ],
  'Behavioural': [
    'Unsafe acts',
    'Unsafe conditions',
    'Procedure violations',
    'Permit-to-work breaches',
    'Bypassing safety controls',
    'PPE non-compliance',
    'Unauthorized work',
    'Alcohol / drug related',
    'Workplace bullying',
    'Harassment',
    'Discrimination',
    'Other (specify)'
  ],
  'Emergency': [
    'Fires',
    'Explosions',
    'Gas leaks',
    'Electrical faults',
    'Arc flash',
    'Pressure vessel failures',
    'Hot work incidents',
    'Floods',
    'Storms',
    'Lightning',
    'Earthquakes',
    'Evacuation failures',
    'Emergency response failures',
    'Communication failures',
    'Alarm system failures',
    'Other (specify)'
  ]
};

// Risk Matrix Configuration
export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';

export type RiskMatrixConfig = {
  severity: Severity;
  likelihood: 1 | 2 | 3 | 4 | 5; // 1 = Rare, 5 = Almost Certain
  riskLevel: RiskLevel;
};

// Risk Matrix: Severity × Likelihood = Risk Level
export const RISK_MATRIX: RiskMatrixConfig[] = [
  // Low Risk
  { severity: 'low', likelihood: 1, riskLevel: 'Low' },
  { severity: 'low', likelihood: 2, riskLevel: 'Low' },
  { severity: 'medium', likelihood: 1, riskLevel: 'Low' },
  
  // Medium Risk
  { severity: 'low', likelihood: 3, riskLevel: 'Medium' },
  { severity: 'low', likelihood: 4, riskLevel: 'Medium' },
  { severity: 'medium', likelihood: 2, riskLevel: 'Medium' },
  { severity: 'medium', likelihood: 3, riskLevel: 'Medium' },
  { severity: 'high', likelihood: 1, riskLevel: 'Medium' },
  { severity: 'high', likelihood: 2, riskLevel: 'Medium' },
  
  // High Risk
  { severity: 'low', likelihood: 5, riskLevel: 'High' },
  { severity: 'medium', likelihood: 4, riskLevel: 'High' },
  { severity: 'medium', likelihood: 5, riskLevel: 'High' },
  { severity: 'high', likelihood: 3, riskLevel: 'High' },
  { severity: 'high', likelihood: 4, riskLevel: 'High' },
  { severity: 'critical', likelihood: 1, riskLevel: 'High' },
  { severity: 'critical', likelihood: 2, riskLevel: 'High' },
  { severity: 'critical', likelihood: 3, riskLevel: 'High' },
  
  // Critical Risk
  { severity: 'high', likelihood: 5, riskLevel: 'Critical' },
  { severity: 'critical', likelihood: 4, riskLevel: 'Critical' },
  { severity: 'critical', likelihood: 5, riskLevel: 'Critical' }
];

export function calculateRiskLevel(severity: Severity, likelihood: number): RiskLevel {
  const config = RISK_MATRIX.find(
    r => r.severity === severity && r.likelihood === (likelihood as 1 | 2 | 3 | 4 | 5)
  );
  return config?.riskLevel || 'Medium';
}

// Audit Types
export type AuditType = 'Internal' | 'External' | 'Client' | 'Supplier' | 'Certification (ISO 9001)' | 'Certification (ISO 14001)' | 'Certification (ISO 45001)';// Inspection Frequency
export type InspectionFrequency = 'Daily' | 'Monthly' | 'Quarterly' | 'Other';
