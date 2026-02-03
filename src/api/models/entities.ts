import type { CompanyRole, IncidentCategory, IncidentStatus, LicenseType, ModuleKey, Severity, UUID } from './core';

export type Company = {
  id: UUID;
  name: string;
  license_type: LicenseType;
  employee_limit: number;
  primary_admin_user_id: UUID;
  metadata?: Record<string, unknown> | null;
  created_at: string;
};

export type CompanyMembership = {
  id: UUID;
  company_id: UUID;
  user_id: UUID;
  role: CompanyRole;
  created_at: string;
};

export type CompanyInvite = {
  id: UUID;
  company_id: UUID;
  email: string;
  role: CompanyRole;
  created_by_user_id: UUID;
  created_at: string;
  accepted_at: string | null;
  accepted_user_id: UUID | null;
};

export type ActivityLog = {
  id: UUID;
  company_id: UUID;
  actor_user_id: UUID;
  action: string;
  entity_type: string | null;
  entity_id: UUID | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type Incident = {
  id: UUID;
  company_id: UUID;
  module: ModuleKey;
  category: IncidentCategory;
  subcategory: string;
  title: string;
  description: string | null;
  severity: Severity;
  status: IncidentStatus;
  occurred_at: string;
  location: string | null;
  assignee_user_id: UUID | null;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'overdue';
export type TaskPriority = Severity;

export type Task = {
  id: UUID;
  company_id: UUID;
  module: ModuleKey;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_at: string | null;
  assignee_user_id: UUID | null;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type CorrectiveActionStatus = 'draft' | 'open' | 'approved' | 'closed';

export type CorrectiveAction = {
  id: UUID;
  company_id: UUID;
  module: ModuleKey;
  title: string;
  description: string | null;
  status: CorrectiveActionStatus;
  due_at: string | null;
  owner_user_id: UUID | null;
  created_by_user_id: UUID;
  approved_by_user_id: UUID | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Document = {
  id: UUID;
  company_id: UUID;
  module: ModuleKey;
  title: string;
  category: string;
  version: string;
  status: 'draft' | 'in_review' | 'approved' | 'archived';
  owner_user_id: UUID | null;
  review_due_at: string | null;
  storage_bucket: string | null;
  storage_key: string | null;
  created_at: string;
  updated_at: string;
};

export type FormTemplate = {
  id: UUID;
  company_id: UUID;
  module: ModuleKey;
  name: string;
  description: string | null;
  schema: Record<string, unknown>;
  original_pdf_bucket: string | null;
  original_pdf_key: string | null;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

// ---------------------------
// Phase 2 module tables
// ---------------------------

export type QualityNcrStatus = 'open' | 'in-progress' | 'closed';

export type QualityNcr = {
  id: UUID;
  company_id: UUID;
  module: 'quality';
  title: string;
  description: string | null;
  severity: Severity;
  status: QualityNcrStatus;
  occurred_at: string;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type InspectionStatus = 'scheduled' | 'in-progress' | 'completed' | 'overdue';

export type Inspection = {
  id: UUID;
  company_id: UUID;
  module: ModuleKey;
  title: string;
  checklist_name: string | null;
  status: InspectionStatus;
  scheduled_at: string | null;
  completed_at: string | null;
  location: string | null;
  findings_count: number;
  nonconformances_count: number;
  assignee_user_id: UUID | null;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type RiskStatus = 'open' | 'mitigated' | 'closed';

export type Risk = {
  id: UUID;
  company_id: UUID;
  module: ModuleKey;
  title: string;
  description: string | null;
  hazard: string | null;
  controls: string | null;
  likelihood: number;
  consequence: number;
  risk_rating: number;
  status: RiskStatus;
  reviewed_at: string | null;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type PPEItem = {
  id: UUID;
  company_id: UUID;
  name: string;
  category: string | null;
  unit_cost: number | null;
  created_at: string;
};

export type PPEIssue = {
  id: UUID;
  company_id: UUID;
  ppe_item_id: UUID;
  issued_to_user_id: UUID | null;
  issued_by_user_id: UUID;
  issued_at: string;
  next_issue_at: string | null;
  return_due_at: string | null;
  returned_at: string | null;
  notes: string | null;
};

export type EnvironmentAspectStatus = 'active' | 'closed';

export type EnvironmentAspect = {
  id: UUID;
  company_id: UUID;
  aspect: string;
  impact: string;
  controls: string | null;
  status: EnvironmentAspectStatus;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type EnvironmentMonitoring = {
  id: UUID;
  company_id: UUID;
  type: string;
  location: string | null;
  result: string;
  measured_at: string;
  created_by_user_id: UUID;
  created_at: string;
};

export type LegalRequirementStatus = 'compliant' | 'non-compliant' | 'in-progress';

export type LegalRequirement = {
  id: UUID;
  company_id: UUID;
  module: 'legal';
  requirement: string;
  reference: string | null;
  status: LegalRequirementStatus;
  evidence_bucket: string | null;
  evidence_key: string | null;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type TrainingCourse = {
  id: UUID;
  company_id: UUID;
  name: string;
  description: string | null;
  valid_months: number | null;
  created_at: string;
};

export type TrainingRecord = {
  id: UUID;
  company_id: UUID;
  user_id: UUID;
  course_id: UUID;
  completed_at: string;
  expires_at: string | null;
  certificate_bucket: string | null;
  certificate_key: string | null;
  created_by_user_id: UUID;
  created_at: string;
};

export type MedicalCertificateStatus = 'valid' | 'expiring' | 'expired';

export type MedicalCertificate = {
  id: UUID;
  company_id: UUID;
  user_id: UUID;
  certificate_type: string;
  issued_at: string;
  expires_at: string | null;
  status: MedicalCertificateStatus;
  certificate_bucket: string | null;
  certificate_key: string | null;
  created_by_user_id: UUID;
  created_at: string;
};

export type Notification = {
  id: UUID;
  company_id: UUID;
  user_id: UUID;
  title: string;
  message: string;
  severity: Severity;
  read_at: string | null;
  created_at: string;
};

export type ModuleTarget = {
  id: UUID;
  company_id: UUID;
  module: ModuleKey;
  name: string;
  current_value: number;
  target_value: number;
  unit: string | null;
  achieved: boolean;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type PlanningPlanPeriod = 'annual' | 'quarterly' | 'monthly';
export type PlanningPlanStatus = 'draft' | 'active' | 'complete';

export type PlanningPlan = {
  id: UUID;
  company_id: UUID;
  name: string;
  period: PlanningPlanPeriod;
  status: PlanningPlanStatus;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type PlanningKpiStatus = 'on-track' | 'at-risk' | 'behind';

export type PlanningKpi = {
  id: UUID;
  company_id: UUID;
  plan_id: UUID;
  name: string;
  current_value: number;
  target_value: number;
  unit: string | null;
  status: PlanningKpiStatus;
  created_at: string;
};

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export type Approval = {
  id: UUID;
  company_id: UUID;
  entity_type: string;
  entity_id: UUID;
  requested_by_user_id: UUID;
  approver_user_id: UUID;
  status: ApprovalStatus;
  signed_at: string | null;
  signature_note: string | null;
  created_at: string;
};

export type ImprovementStatus = 'planned' | 'active' | 'complete';

export type ImprovementAction = {
  id: UUID;
  company_id: UUID;
  module: ModuleKey;
  title: string;
  description: string | null;
  owner_user_id: UUID | null;
  status: ImprovementStatus;
  target_date: string | null;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

// Feature modules (Phase 2)
export type BbsObservationType = 'positive' | 'unsafe_act' | 'near_miss';
export type BbsObservationStatus = 'logged' | 'action_required' | 'closed';

export type BbsObservation = {
  id: UUID;
  company_id: UUID;
  type: BbsObservationType;
  title: string;
  area: string | null;
  status: BbsObservationStatus;
  created_by_user_id: UUID;
  created_at: string;
};

export type ContractorStatus = 'pending' | 'approved' | 'suspended';
export type Contractor = {
  id: UUID;
  company_id: UUID;
  name: string;
  status: ContractorStatus;
  documents_count: number;
  inductions_count: number;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type VisitorStatus = 'scheduled' | 'checked_in' | 'checked_out';
export type VisitorBriefingStatus = 'pending' | 'completed';
export type Visitor = {
  id: UUID;
  company_id: UUID;
  name: string;
  status: VisitorStatus;
  briefing: VisitorBriefingStatus;
  created_by_user_id: UUID;
  created_at: string;
};

export type EmergencyDrillStatus = 'scheduled' | 'completed' | 'cancelled';
export type EmergencyDrill = {
  id: UUID;
  company_id: UUID;
  name: string;
  drill_date: string;
  status: EmergencyDrillStatus;
  notes: string | null;
  created_by_user_id: UUID;
  created_at: string;
};

export type TemplateLibraryItem = {
  id: UUID;
  company_id: UUID;
  name: string;
  type: string;
  category: string;
  storage_bucket: string | null;
  storage_key: string | null;
  created_by_user_id: UUID;
  created_at: string;
};

export type UserProfile = {
  id: UUID;
  company_id: UUID;
  user_id: UUID;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  department: string | null;
  site: string | null;
  created_at: string;
  updated_at: string;
};

export type EvidenceAttachment = {
  id: UUID;
  company_id: UUID;
  entity_type: string;
  entity_id: UUID;
  title: string | null;
  storage_bucket: string;
  storage_key: string;
  created_by_user_id: UUID;
  created_at: string;
};

export type AuditFindingStatus = 'open' | 'closed';
export type AuditFinding = {
  id: UUID;
  company_id: UUID;
  inspection_id: UUID;
  title: string;
  severity: Severity;
  status: AuditFindingStatus;
  nonconformance: boolean;
  created_by_user_id: UUID;
  created_at: string;
};

