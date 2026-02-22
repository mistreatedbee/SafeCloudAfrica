export type UUID = string;

// Phase 2 RBAC (company-scoped) + Operating Model (owner = Organisation Owner)
export type CompanyRole = 'owner' | 'admin' | 'manager' | 'supervisor' | 'consultant' | 'employee' | 'auditor';

// Legacy + Operating Model tiers (base, growth, professional, hr_only)
export type LicenseType = 'starter_6m' | 'professional_12m' | 'enterprise_custom' | 'base' | 'growth' | 'professional' | 'hr_only';

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

export const RISK_CATEGORIES = ['Low', 'Medium', 'High'] as const;
export type RiskCategory = (typeof RISK_CATEGORIES)[number];

export const LOSS_TYPES = [
  'production loss',
  'financial loss',
  'reputational loss',
  'damage',
  'illness',
  'injury',
  'asset loss',
  'civil liability',
  'criminal liability',
  'vicarious liability',
  'sub-standard quality product/service'
] as const;

export type LossType = (typeof LOSS_TYPES)[number];

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

// Immediate Causes: Unsafe Acts/Conditions - grouped multi-select options
export const IMMEDIATE_CAUSES_UNSAFE_ACTS_GROUPS = {
  'Following procedures/practices/rules/regulations': [
    'No stop and think implementation',
    'No hazard reporting',
    'Deviation by individual',
    'Deviation by group',
    'Deviation by supervisor',
    'Operating equipment without authority',
    'Improper position or posture for task',
    'Overexertion of physical capability',
    'Work or motion in improper speed',
    'Improper lifting',
    'Improper loading',
    'Shortcuts',
    'Other'
  ],
  'Use of equipment': [
    'Improper use of equipment',
    'Improper use of tools',
    'Use of defective equipment (aware)',
    'Use of defective tools (aware)',
    'Improper placement of tools, equipment or materials',
    'Operation of equipment at improper speed',
    'Other'
  ],
  'Use of protective methods': [
    'Lack of knowledge of hazards present',
    'PPE not used',
    'Improper use of PPE',
    'Servicing of energized equipment',
    'Equipment or material not secured',
    'Disabled guards/warning systems/safety devices',
    'Removal of guards/warning systems/safety devices',
    'PPE not available',
    'Other'
  ],
  'Lack of awareness / inattention': [
    'Improper decision making / lack of judgement',
    'Distracted by other concerns',
    'Inattention to footing and surroundings',
    'Horseplay',
    'Failure to warn / make safe',
    'Use of drugs or alcohol',
    'Routine activity without thought',
    'Other'
  ],
  'Protective systems': [
    'Inadequate guards/protective devices',
    'Defective guards/protective devices',
    'Inadequate PPE',
    'Defective PPE',
    'Inadequate warning system',
    'Defective warning system',
    'Inadequate isolation of process/equipment',
    'Inadequate safety devices',
    'Defective safety devices',
    'Other'
  ],
  'Transportation, equipment and tools': [
    'Defective vehicles/vessels/aircraft/rolling stock',
    'Inadequate vehicles/vessels/aircraft/rolling stock',
    'Improperly prepared vehicles/vessels/aircraft/rolling stock',
    'Defective equipment',
    'Inadequate equipment for purpose',
    'Improperly prepared equipment',
    'Improperly prepared tools',
    'Defective tools',
    'Inadequate tools',
    'Other'
  ],
  'Work exposure': [
    'Fire or explosion',
    'Noise',
    'Energised electrical system',
    'Energised systems other than electricity',
    'Radiation',
    'Temperature extreme',
    'Hazardous chemicals',
    'Mechanical hazards',
    'Clutter or debris',
    'Storms/acts of nature',
    'Slippery floor/walkways',
    'Other'
  ],
  'Workplace environment/layout': [
    'Congestion or restricted motion',
    'Inadequate/excessive illumination',
    'Inadequate ventilation',
    'Unprotected heights',
    'Demarcation less than adequate',
    'Controls less than adequate',
    'Displays less than adequate',
    'Labels less than adequate',
    'Location out of reach or sight',
    'Conflicting information',
    'Other'
  ]
} as const;

export const IMMEDIATE_CAUSES_UNSAFE_CONDITIONS_GROUPS = IMMEDIATE_CAUSES_UNSAFE_ACTS_GROUPS;

// Root Cause (Human factors) - categories and items
export const ROOT_CAUSE_HUMAN_FACTORS_CATEGORIES = {
  'Risk normalisation, authority gradient, assumption-based decision making': [
    'Risk normalisation',
    'Authority gradient',
    'Assumption-based decision making',
    'Lack of hazard perception',
    'Poor leadership',
    'Unsafe behavioural conditioning',
    'Normalization of deviance',
    'Risk tolerance culture',
    'Informal work practices',
    'Complacency',
    'Other'
  ],
  'Physical capability': [
    'Vision deficiency',
    'Hearing deficiency',
    'Sensory deficiency',
    'Reduced respiratory capacity',
    'Permanent disability',
    'Temporary disability',
    'Inability to sustain body position',
    'Restricted range of motion',
    'Sensitivities/allergies',
    'Inadequate size/strength',
    'Diminished capacity due to medication',
    'Other'
  ],
  'Physical conditions': [
    'Previous injury/illness',
    'Fatigue due to workload/lack of rest/sensory overload',
    'Diminished performance due to extremes/oxygen deficiency/pressure variation',
    'Blood sugar insufficiency',
    'Impairment due to drug/alcohol',
    'Other'
  ],
  'Mental state': [
    'Poor judgement',
    'Memory failure',
    'Poor coordination/reaction time',
    'Emotional disturbance',
    'Fear/phobia',
    'Low mechanical aptitude',
    'Low learning aptitude',
    'Influenced by medicine',
    'Other'
  ],
  'Mental stress': [
    'Preoccupation with problems',
    'Frustration',
    'Confusing demands',
    'Conflicting demands',
    'Degrading activities',
    'Emotional overload',
    'Extreme judgement demands',
    'Extreme concentration demands',
    'Extreme boredom',
    'Other'
  ],
  'Behaviour': [
    'Improper performance rewarded',
    'Improper supervisory example',
    'Inadequate identification of critical safe behaviour',
    'Proper performance criticized',
    'Inappropriate peer pressure',
    'Inadequate feedback',
    'Inadequate disciplinary process',
    'Inappropriate aggression',
    'Inappropriate incentives',
    'Supervisor implied haste',
    'Employee perceived haste',
    'Habit/personal performance',
    'Vandalism',
    'Other'
  ],
  'Skill level': [
    'Inadequate assessment of required skills',
    'Inadequate practice',
    'Infrequent performance',
    'Lack of coaching',
    'Insufficient review to establish skill',
    'Other'
  ]
} as const;

// Root Cause (Workplace factors) - categories and items
export const ROOT_CAUSE_WORKPLACE_FACTORS_CATEGORIES = {
  'Management/supervision/oversight': [
    'Lack of supervision',
    'No equipment availability',
    'No job planning',
    'No safe work systems',
    'Conflicting activities',
    'Lack of communication',
    'Absence of systems',
    'Poor contractor',
    'Weak leadership control',
    'Lack of procedural discipline',
    'No competency verification',
    'No high risk work controls',
    'Conflicting roles',
    'Under/conflicting reporting relationships',
    'Unclear/conflicting responsibility assignment',
    'Insufficient delegation',
    'Inadequate leadership',
    'Standard missing/not enforced',
    'Inadequate accountability',
    'Incorrect feedback',
    'Inadequate walk-through',
    'Inadequate safety promotion',
    'Inadequate correction of prior hazards',
    'Inadequate hazard identification',
    'Inadequate MOC',
    'Inadequate incident systems',
    'Lack of safety meetings',
    'Inadequate performance measurement',
    'Other'
  ],
  'Purchasing/material handling/control': [
    'Incorrect item received',
    'Inadequate vendor spec',
    'Inadequate requisition spec',
    'Inadequate change control',
    'Unauthorized substitution',
    'Inadequate acceptance requirements',
    'No acceptance verification',
    'Inadequate research',
    'Inadequate shipment route',
    'Improper handling',
    'Improper storage',
    'Inadequate packaging',
    'Shelf life exceeded',
    'Improper hazardous material ID',
    'Improper salvage/waste disposal',
    'Inadequate use of safety/health data',
    'Other'
  ],
  'Tools/equipment': [
    'Inadequate needs/risk assessment',
    'Inadequate ergonomics',
    'Inadequate standard/spec',
    'Inadequate availability',
    'Inadequate repairs/maintenance',
    'Inadequate salvage/reclamation',
    'Inadequate removal/replacement of unsuitable items',
    'No equipment record history',
    'Inadequate record history',
    'Other'
  ],
  'Work/rule/policy/standard/procedure': [
    'Lack of PSP',
    'Lack of task/JSA',
    'Inadequate coordination with design',
    'Inadequate involvement',
    'Inadequate definition of corrective measures',
    'Inadequate format',
    'Inadequate implementation',
    'Confusing format',
    'Confusing instructions',
    'Technical errors/missing steps',
    'Excessive references',
    'Solutions not covered',
    'Inadequate enforcement',
    'Inadequate supervisory knowledge',
    'Inadequate reinforcement',
    'Non-compliance not corrected',
    'Inadequate communication',
    'Incomplete distribution',
    'Inadequate translation',
    'Out-of-date revision in use',
    'Inadequate observation',
    'Other'
  ],
  'Engineering/design': [
    'Inadequate standard/spec/criteria',
    'Inadequate assessment of failures',
    'Inadequate ergonomic design',
    'Inadequate monitoring of construction',
    'Inadequate operational readiness assessment',
    'Inadequate monitoring of initial operations',
    'Inadequate evaluation/documentation change',
    'Other'
  ],
  'Work planning': [
    'Inadequate planning',
    'Inadequate PM',
    'Inadequate repairs',
    'Excessive wear/tear',
    'Used by untrained people',
    'Improper loading',
    'Wrong purpose',
    'Inadequate reference materials',
    'Inadequate audit/inspection/monitoring',
    'Inadequate job placement',
    'Other'
  ],
  'Communication': [
    'Inadequate horizontal',
    'Inadequate vertical',
    'Inadequate inter-organization',
    'Inadequate between work groups',
    'Inadequate shift communication',
    'Inadequate methods',
    'No methods available',
    'Incorrect instruction',
    'Job turnover gaps',
    'Inadequate safety/health data communication',
    'Terminology not used',
    'Repeat-back not used',
    'Message too long',
    'Speech interference',
    'Cultural/ethical barriers',
    'Other'
  ],
  'Contractor selection/oversight': [
    'Lack of pre-qualifications',
    'Inadequate pre-qualifications',
    'Inadequate selection',
    'Non-approved selection',
    'Lack of job oversight',
    'Inadequate oversight',
    'Other'
  ],
  'Engineering design (detailed)': [
    'Inadequate technical design',
    'Design input obsolete/incorrect/unavailable',
    'Design output inadequate/unclear/incorrect/inconsistent',
    'No dependent design review',
    'Other'
  ],
  'Training/knowledge transfer': [
    'Inadequate knowledge transfer',
    'Inability to comprehend',
    'Inadequate instructor qualification',
    'Inadequate training equipment',
    'Misunderstood instruction',
    'Inadequate recall',
    'Not reinforced on job',
    'Inadequate refresher frequency',
    'Inadequate training efforts',
    'Inadequate program design',
    'Inadequate goals/objectives',
    'Inadequate orientation',
    'Inadequate initial training',
    'Inadequate qualification checks',
    'No training provided',
    'Need not identified',
    'Records incorrect/out of date',
    'New work methods introduced without training',
    'Decision made not to train',
    'Other'
  ]
} as const;

// System failure - flat list
export const SYSTEM_FAILURE_OPTIONS = [
  'No permit to work system',
  'Legal non-compliance',
  'Management system failure',
  'Client duty failure',
  'Planning and leadership',
  'Competency, training and communication',
  'Job and operational analysis and control',
  'Change management',
  'Purchase system',
  'Work process and operational rules',
  'Inspections',
  'Legal requirements and document control',
  'Occupational health system',
  'PPE',
  'Incident investigation and analysis',
  'Emergency preparedness',
  'Measuring, monitoring and audits',
  'Corrective and preventative action systems',
  'Supplier and contractor management',
  'Product steward',
  'Other'
] as const;

