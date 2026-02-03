/**
 * ISO Standard Mapping & Compliance Framework
 * 
 * Supports:
 * - ISO 45001:2023 (Occupational Health & Safety)
 * - ISO 14001:2015 (Environmental Management)
 * - ISO 9001:2015 (Quality Management)
 * 
 * Maps system entities (incidents, NCRs, risks, audits) to ISO clauses
 */

import type { UUID } from '../models/core';

export type ISOStandard = 'iso45001' | 'iso14001' | 'iso9001';
export type ComplianceStatus = 'compliant' | 'non-compliant' | 'not-applicable' | 'under-review';

export interface ISOClause {
  id: string;
  standard: ISOStandard;
  clauseNumber: string;
  title: string;
  description: string;
  requirements: string[];
  relatedModules: string[]; // Which SafeCloud modules address this clause
  evidenceTypes: string[]; // What documents/evidence can prove compliance
}

export interface ISOComplianceMapping {
  id: UUID;
  companyId: UUID;
  standard: ISOStandard;
  clauseId: string;
  status: ComplianceStatus;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  linkedIncidents: UUID[];
  linkedNcrs: UUID[];
  linkedRisks: UUID[];
  linkedAudits: UUID[];
  linkedDocuments: UUID[];
  lastEvaluatedDate: string;
  nextEvaluationDate: string;
  evidenceUrl?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * ISO 45001:2023 Occupational Health & Safety Clauses
 */
export const ISO45001_CLAUSES: Record<string, ISOClause> = {
  '4': {
    id: '4',
    standard: 'iso45001',
    clauseNumber: '4',
    title: 'Context of the Organization',
    description:
      'Understanding the organizational context including relevant issues and requirements of interested parties',
    requirements: [
      'Understand internal and external issues',
      'Understand requirements of interested parties',
      'Determine scope of OH&S management system',
      'Maintain documented information on organizational context',
    ],
    relatedModules: ['planning', 'audit', 'documents'],
    evidenceTypes: ['SWOT analysis', 'Stakeholder assessment', 'Scope document', 'Organizational structure'],
  },
  '5': {
    id: '5',
    standard: 'iso45001',
    clauseNumber: '5',
    title: 'Leadership and Worker Participation',
    description: 'Leadership responsibility and worker participation in OH&S management system',
    requirements: [
      'Demonstrate commitment of top management',
      'Define OH&S policy',
      'Allocate roles and responsibilities',
      'Ensure worker participation and consultation',
    ],
    relatedModules: ['users', 'documents', 'planning'],
    evidenceTypes: ['OH&S policy', 'Role definitions', 'Consultation records', 'Meeting minutes'],
  },
  '6': {
    id: '6',
    standard: 'iso45001',
    clauseNumber: '6',
    title: 'Planning',
    description: 'Determine and address actions for managing OH&S risks and opportunities',
    requirements: [
      'Determine OH&S risks and opportunities',
      'Establish OH&S objectives',
      'Plan actions to achieve objectives',
      'Plan how to handle changes',
    ],
    relatedModules: ['risks', 'planning', 'tasks'],
    evidenceTypes: ['Risk register', 'Objectives document', 'Action plans', 'Change logs'],
  },
  '7': {
    id: '7',
    standard: 'iso45001',
    clauseNumber: '7',
    title: 'Support',
    description: 'Ensure adequate resources, competence, and communication for OH&S system',
    requirements: [
      'Allocate necessary resources',
      'Determine and ensure competence',
      'Promote awareness',
      'Ensure internal and external communication',
      'Maintain documented information',
    ],
    relatedModules: ['training', 'users', 'documents'],
    evidenceTypes: ['Resource allocation', 'Training records', 'Competency assessments', 'Communication logs'],
  },
  '8': {
    id: '8',
    standard: 'iso45001',
    clauseNumber: '8',
    title: 'Operation',
    description: 'Implement processes to achieve OH&S objectives',
    requirements: [
      'Plan and control processes',
      'Manage contractor and visitor activities',
      'Ensure emergency preparedness',
      'Control hazardous substances and equipment',
    ],
    relatedModules: ['incidents', 'tasks', 'documents', 'visitors'],
    evidenceTypes: [
      'Process procedures',
      'Contractor agreements',
      'Emergency plans',
      'Equipment maintenance logs',
    ],
  },
  '9': {
    id: '9',
    standard: 'iso45001',
    clauseNumber: '9',
    title: 'Performance Evaluation',
    description: 'Monitor, measure, analyze and evaluate OH&S performance',
    requirements: [
      'Determine monitoring and measurement needs',
      'Analyze OH&S data',
      'Conduct internal audits',
      'Conduct management review',
    ],
    relatedModules: ['audit', 'incidents', 'quality'],
    evidenceTypes: ['Audit reports', 'Performance metrics', 'Incident statistics', 'Management review minutes'],
  },
  '10': {
    id: '10',
    standard: 'iso45001',
    clauseNumber: '10',
    title: 'Improvement',
    description: 'Continually improve OH&S management system',
    requirements: [
      'Implement corrective actions',
      'Continually improve relevant processes',
      'Retain relevant documented information',
      'Address nonconformities',
    ],
    relatedModules: ['quality', 'tasks', 'improvement'],
    evidenceTypes: ['NCR records', 'Corrective action plans', 'Improvement logs', 'Follow-up audits'],
  },
};

/**
 * ISO 14001:2015 Environmental Management Clauses
 */
export const ISO14001_CLAUSES: Record<string, ISOClause> = {
  '4': {
    id: '4',
    standard: 'iso14001',
    clauseNumber: '4',
    title: 'Context of the Organization',
    description: 'Understanding the environmental context of the organization',
    requirements: [
      'Identify environmental issues',
      'Identify requirements of interested parties',
      'Determine scope of EMS',
    ],
    relatedModules: ['environment', 'audit', 'documents'],
    evidenceTypes: ['Environmental aspects inventory', 'Stakeholder analysis', 'Scope document'],
  },
  '5': {
    id: '5',
    standard: 'iso14001',
    clauseNumber: '5',
    title: 'Leadership',
    description: 'Leadership responsibility for environmental management',
    requirements: [
      'Demonstrate management commitment',
      'Establish environmental policy',
      'Allocate environmental responsibilities',
      'Ensure communication and participation',
    ],
    relatedModules: ['environment', 'documents', 'users'],
    evidenceTypes: [
      'Environmental policy',
      'Role definitions',
      'Environmental committee records',
      'Communication materials',
    ],
  },
  '6': {
    id: '6',
    standard: 'iso14001',
    clauseNumber: '6',
    title: 'Planning',
    description: 'Plan actions for environmental compliance',
    requirements: [
      'Determine environmental aspects',
      'Identify legal obligations',
      'Establish environmental objectives',
      'Plan process changes',
    ],
    relatedModules: ['environment', 'planning', 'legal'],
    evidenceTypes: [
      'Aspects assessment',
      'Legal register',
      'Environmental objectives',
      'Implementation plans',
    ],
  },
  '7': {
    id: '7',
    standard: 'iso14001',
    clauseNumber: '7',
    title: 'Support',
    description: 'Ensure resources and communication for EMS',
    requirements: [
      'Allocate resources',
      'Develop competence',
      'Increase awareness',
      'Manage communications',
      'Control documented information',
    ],
    relatedModules: ['training', 'documents', 'environment'],
    evidenceTypes: [
      'Resource allocation',
      'Training records',
      'Competency records',
      'Environmental awareness materials',
    ],
  },
  '8': {
    id: '8',
    standard: 'iso14001',
    clauseNumber: '8',
    title: 'Operation',
    description: 'Plan and control operations to achieve environmental objectives',
    requirements: [
      'Plan and control operations',
      'Design new processes environmentally',
      'Manage procurement',
      'Manage services and product provision',
    ],
    relatedModules: ['environment', 'documents', 'planning'],
    evidenceTypes: [
      'Operating procedures',
      'Environmental specs',
      'Supplier assessments',
      'Process flow diagrams',
    ],
  },
  '9': {
    id: '9',
    standard: 'iso14001',
    clauseNumber: '9',
    title: 'Performance Evaluation',
    description: 'Monitor and measure environmental performance',
    requirements: [
      'Monitor and measure',
      'Evaluate compliance',
      'Conduct internal audits',
      'Conduct management review',
    ],
    relatedModules: ['environment', 'audit', 'quality'],
    evidenceTypes: [
      'Monitoring data',
      'Compliance assessments',
      'Internal audit reports',
      'Review documentation',
    ],
  },
  '10': {
    id: '10',
    standard: 'iso14001',
    clauseNumber: '10',
    title: 'Improvement',
    description: 'Continually improve environmental management',
    requirements: [
      'Address nonconformities',
      'Take corrective actions',
      'Continually improve',
    ],
    relatedModules: ['environment', 'quality', 'improvement'],
    evidenceTypes: ['NCR records', 'CAP records', 'Improvement initiatives'],
  },
};

/**
 * ISO 9001:2015 Quality Management Clauses
 */
export const ISO9001_CLAUSES: Record<string, ISOClause> = {
  '4': {
    id: '4',
    standard: 'iso9001',
    clauseNumber: '4',
    title: 'Context of the Organization',
    description: 'Understanding the organization and its context',
    requirements: [
      'Understand internal and external context',
      'Understand needs and expectations of relevant parties',
      'Determine scope of QMS',
      'Manage QMS processes',
    ],
    relatedModules: ['quality', 'documents', 'planning'],
    evidenceTypes: ['Organizational analysis', 'Stakeholder assessment', 'QMS scope document'],
  },
  '5': {
    id: '5',
    standard: 'iso9001',
    clauseNumber: '5',
    title: 'Leadership',
    description: 'Leadership commitment and quality policy',
    requirements: [
      'Demonstrate leadership commitment',
      'Establish quality policy',
      'Distribute roles and responsibilities',
      'Promote process approach',
    ],
    relatedModules: ['quality', 'documents', 'users'],
    evidenceTypes: ['Quality policy', 'Role definitions', 'Organizational structure', 'Management statements'],
  },
  '6': {
    id: '6',
    standard: 'iso9001',
    clauseNumber: '6',
    title: 'Planning',
    description: 'Plan to achieve quality objectives',
    requirements: [
      'Establish quality objectives',
      'Determine processes needed',
      'Plan actions to achieve objectives',
      'Plan how to handle changes',
    ],
    relatedModules: ['quality', 'planning', 'tasks'],
    evidenceTypes: ['Quality objectives', 'Process maps', 'Action plans', 'Change control procedures'],
  },
  '7': {
    id: '7',
    standard: 'iso9001',
    clauseNumber: '7',
    title: 'Support',
    description: 'Provide necessary support to QMS',
    requirements: [
      'Allocate resources',
      'Develop competence',
      'Ensure awareness of quality objectives',
      'Manage internal and external communication',
      'Control documented information',
    ],
    relatedModules: ['training', 'documents', 'quality'],
    evidenceTypes: [
      'Resource plans',
      'Training records',
      'Competency assessments',
      'Communication logs',
      'Document control procedures',
    ],
  },
  '8': {
    id: '8',
    standard: 'iso9001',
    clauseNumber: '8',
    title: 'Operation',
    description: 'Plan and control operations',
    requirements: [
      'Plan and implement production/service delivery',
      'Design and develop products/services',
      'Control external provision',
      'Control production and service provision',
      'Release products and services',
      'Control nonconforming outputs',
    ],
    relatedModules: ['quality', 'documents', 'forms'],
    evidenceTypes: [
      'Process procedures',
      'Design specifications',
      'Supplier agreements',
      'Production records',
      'Quality records',
      'NCR documentation',
    ],
  },
  '9': {
    id: '9',
    standard: 'iso9001',
    clauseNumber: '9',
    title: 'Performance Evaluation',
    description: 'Monitor and measure QMS effectiveness',
    requirements: [
      'Determine monitoring and measurement needs',
      'Analyze and evaluate performance',
      'Conduct internal audits',
      'Conduct management reviews',
    ],
    relatedModules: ['quality', 'audit', 'health'],
    evidenceTypes: [
      'Quality metrics',
      'Customer feedback',
      'Audit reports',
      'Performance data',
      'Review minutes',
    ],
  },
  '10': {
    id: '10',
    standard: 'iso9001',
    clauseNumber: '10',
    title: 'Improvement',
    description: 'Continually improve quality',
    requirements: [
      'Determine improvement opportunities',
      'Implement corrective actions',
      'Continually improve',
    ],
    relatedModules: ['quality', 'improvement', 'tasks'],
    evidenceTypes: [
      'Improvement logs',
      'NCR records',
      'Corrective action plans',
      'Follow-up documentation',
    ],
  },
};

/**
 * Get all clauses for a standard
 */
export function getISOClauses(standard: ISOStandard): Record<string, ISOClause> {
  switch (standard) {
    case 'iso45001':
      return ISO45001_CLAUSES;
    case 'iso14001':
      return ISO14001_CLAUSES;
    case 'iso9001':
      return ISO9001_CLAUSES;
    default:
      return {};
  }
}

/**
 * Get a specific clause
 */
export function getISOClause(standard: ISOStandard, clauseId: string): ISOClause | undefined {
  const clauses = getISOClauses(standard);
  return clauses[clauseId];
}

/**
 * Calculate compliance score for an organization across all standards
 * Score = (compliant + under-review * 0.5) / total * 100
 */
export function calculateComplianceScore(
  mappings: ISOComplianceMapping[],
  standard?: ISOStandard
): number {
  let filtered = mappings;

  if (standard) {
    filtered = mappings.filter((m) => m.standard === standard);
  }

  if (filtered.length === 0) return 0;

  const compliantCount = filtered.filter((m) => m.status === 'compliant').length;
  const underReviewCount = filtered.filter((m) => m.status === 'under-review').length;

  const score = ((compliantCount + underReviewCount * 0.5) / filtered.length) * 100;
  return Math.round(score);
}

/**
 * Get compliance status summary
 */
export function getComplianceSummary(
  mappings: ISOComplianceMapping[],
  standard?: ISOStandard
) {
  let filtered = mappings;

  if (standard) {
    filtered = mappings.filter((m) => m.standard === standard);
  }

  return {
    total: filtered.length,
    compliant: filtered.filter((m) => m.status === 'compliant').length,
    nonCompliant: filtered.filter((m) => m.status === 'non-compliant').length,
    underReview: filtered.filter((m) => m.status === 'under-review').length,
    notApplicable: filtered.filter((m) => m.status === 'not-applicable').length,
    highRiskItems: filtered.filter((m) => m.riskLevel === 'high' || m.riskLevel === 'critical').length,
  };
}
