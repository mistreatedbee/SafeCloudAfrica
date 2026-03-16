import type { CompanyRole, IncidentCategory, IncidentStatus, LicenseType, ModuleKey, Severity, UUID } from './core';

/** DynamicOptions: user-typed dropdown values for Select OR Type (company-scoped). */
export type DynamicOption = {
  id: UUID;
  company_id: UUID;
  module_key: string;
  field_key: string;
  value: string;
  status: 'pending' | 'approved';
  created_by_user_id: UUID | null;
  created_at: string;
  usage_count: number;
};

export type CompanyStatus = 'active' | 'suspended';

export type Company = {
  id: UUID;
  name: string;
  code?: string | null;
  license_type: LicenseType;
  employee_limit: number;
  industry?: string | null;
  country?: string | null;
  status?: CompanyStatus | null;
  logo_bucket?: string | null;
  logo_key?: string | null;
  modules_enabled?: Record<string, boolean> | null;
  license_user_limit?: number;
  trial_start?: string | null;
  trial_end?: string | null;
  subscription_status?: 'trial' | 'active' | 'past_due' | 'cancelled';
  primary_admin_user_id: UUID;
  metadata?: Record<string, unknown> | null;
  subscription_duration_months?: number | null; // 3, 6, 9, 12 (Operating Model)
  created_at: string;
  updated_at?: string | null;
};

export type OrganizationMemberStatus = 'INVITED' | 'ACTIVE' | 'DISABLED';

export type ConsultantScope = {
  allowedModules?: string[];
  allowedDepartments?: UUID[];
  allowedSites?: UUID[];
  auditIds?: UUID[];
  expiresAt?: string;
};

export type CompanyMembership = {
  id: UUID;
  company_id: UUID;
  user_id: UUID;
  role: CompanyRole;
  status?: OrganizationMemberStatus;
  department_id?: UUID | null;
  site_id?: UUID | null;
  invited_by_user_id?: UUID | null;
  consultant_scope?: ConsultantScope | null;
  seat_exempt?: boolean;
  created_at: string;
};

export type CompanyInviteStatus = 'PENDING' | 'SENT' | 'FAILED' | 'ACCEPTED' | 'EXPIRED' | 'CANCELLED';

export type CompanyInvite = {
  id: UUID;
  company_id: UUID;
  organization_name?: string | null;
  email: string;
  role: CompanyRole;
  created_by_user_id: UUID;
  created_at: string;
  accepted_at: string | null;
  accepted_user_id: UUID | null;
  department_id?: UUID | null;
  site_id?: UUID | null;
  consultant_scope?: ConsultantScope | null;
  token: string;
  expires_at: string;
  status: CompanyInviteStatus;
  sent_at?: string | null;
  error_message?: string | null;
};

export type LicenseKeyStatus = 'unused' | 'used' | 'revoked';

export type LicenseKey = {
  id: UUID;
  key: string;
  plan_name: 'base' | 'growth' | 'professional' | 'hr_only';
  billing_cycle_months: number;
  seat_limit: number;
  modules_enabled: string[];
  status: LicenseKeyStatus;
  issued_to: string | null;
  expires_at: string | null;
  created_by_super_admin_id: UUID;
  created_at: string;
  used_at: string | null;
  used_by_organization_id: UUID | null;
};

export type Site = {
  id: UUID;
  company_id: UUID;
  name: string;
  address: string | null;
  is_active: boolean;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type Department = {
  id: UUID;
  company_id: UUID;
  site_id: UUID | null;
  name: string;
  is_active: boolean;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type WorkHoursMonthly = {
  id: UUID;
  company_id: UUID;
  site_id: UUID | null;
  department_id: UUID | null;
  project_id: UUID | null;
  year: number;
  month: number;
  total_employees: number;
  salaried_employees: number;
  wage_employees: number;
  standard_hours_per_day: number;
  days_worked: number;
  salaried_hours_calculated: number | null;
  wage_hours_calculated: number | null;
  overtime_hours_week_or_sat: number;
  overtime_hours_sunday: number;
  overtime_factor_week_or_sat: number;
  overtime_factor_sunday: number;
  employee_absent_days: number;
  employee_absent_hours: number | null;
  employee_transport_hours: number | null;
  contractors_included: boolean;
  contractor_ids: UUID[] | null;
  total_hours_worked_final: number;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type KPISettings = {
  company_id: UUID;
  rate_multiplier_mode: 'SMALL_BUSINESS' | 'CORPORATE';
  default_days_worked: number;
  default_standard_hours_per_day: number;
  include_contractors_in_stats: boolean;
  rolling_window_months: number;
  lti_reset_triggers: string[];
  created_at: string;
  updated_at: string;
};

export type OperationalInputsMonthly = {
  id: UUID;
  company_id: UUID;
  site_id: UUID | null;
  year: number;
  month: number;
  total_deliveries: number | null;
  total_items_inspected: number | null;
  production_output: number | null;
  total_energy_used: number | null;
  recycled_waste: number | null;
  total_waste_generated: number | null;
  ppe_employees_observed: number | null;
  ppe_employees_wearing: number | null;
  created_by_user_id: UUID | null;
  created_at: string;
  updated_at: string;
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
  site_id?: UUID | null;
  department_id?: UUID | null;
  category: IncidentCategory;
  subcategory: string;
  title: string;
  // Base fields
  incident_type?: string | null;
  type_of_incident?: string | null;
  category_id?: UUID | null;
  category_name?: string | null;
  subcategory_id?: UUID | null;
  subcategory_name?: string | null;
  subcategory_custom_text?: string | null;
  cause?: string | null;
  cause_of_incident?: string | null;
  affected_person?: string | null;
  affected_person_id?: UUID | null;
  affected_person_name?: string | null;
  affected_user_id?: UUID | null;
  affected_external_name?: string | null;
  reported_by?: string | null;
  reported_to?: string | null;
  reported_by_user_id?: UUID | null;
  reported_to_user_id?: UUID | null;
  reported_to_user_ids?: UUID[] | null;
  copy_to?: string[] | null;
  copy_to_user_ids?: UUID[] | null;
  copy_to_emails?: string[] | null;
  loss_types?: string[] | null;
  loss_production_value?: number | null;
  loss_financial_value?: number | null;
  loss_reputational_value?: number | null;
  loss_damage_asset_value?: number | null;
  loss_illness_injury_value?: number | null;
  loss_illness_value?: number | null;
  loss_injury_value?: number | null;
  loss_civil_liability_value?: number | null;
  loss_criminal_liability_value?: number | null;
  loss_vicarious_liability_value?: number | null;
  loss_substandard_quality_value?: number | null;
  loss_other_text?: string | null;
  loss_notes?: string | null;
  nature_of_incident?: string | null;
  risk_likelihood?: number | null;
  risk_consequence?: number | null;
  risk_score?: number | null;
  risk_rating?: string | null;
  risk_category?: string | null;
  risk_level?: string | null;
  risk_severity_1_5?: number | null;
  risk_likelihood_1_5?: number | null;
  risk_rating_product?: number | null;
  risk_classification?: string | null;
  investigation_required?: boolean;
  description: string | null;
  metadata?: Record<string, unknown> | null;
  severity: Severity;
  status: IncidentStatus;
  occurred_at: string;
  location: string | null;
  assignee_user_id: UUID | null;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
  // Investigation fields
  project_client?: string | null;
  instruction_breakdown?: string | null;
  task_sequence?: string | null;
  risk?: string | null;
  risk_profile?: string | null;
  consequence?: string | null;
  incident_event_timelines?: Array<{ timestamp: string; notes: string }> | null;
  incident_timeline?: string | null;
  immediate_causes_unsafe_acts?: Record<string, Array<string | { other: string }>> | null;
  immediate_causes_unsafe_conditions?: Record<string, Array<string | { other: string }>> | null;
  unsafe_acts?: string | null;
  unsafe_conditions?: string | null;
  root_cause_human_factors?: Record<string, Array<string | { other: string }>> | null;
  root_cause_workplace_factors?: Record<string, Array<string | { other: string }>> | null;
  root_cause_human?: string | null;
  root_cause_workplace?: string | null;
  system_failure?: Array<string | { other: string }> | null;
  contributing_factors?: string | null;
  contributing_factor_tags?: string[] | null;
  corrective_actions?: string | null;
  lessons_learnt?: string | null;
  investigation_team_user_ids?: UUID[] | null;
  investigation_team?: string | null;
  conclusion?: string | null;
  investigation_document_url?: string | null;
  prepared_by_user_id?: UUID | null;
  distributions_to_user_ids?: UUID[] | null;
  distributions_to_emails?: string[] | null;
  required_behaviour?: string | null;
  // KPI classification (for TRIR, LTIFR, Severity, etc.)
  lost_days?: number | null;
  is_recordable_injury?: boolean | null;
  is_lost_time_injury?: boolean | null;
  is_fatality?: boolean | null;
  is_near_miss?: boolean | null;
  is_accident?: boolean | null;
  is_environmental_incident?: boolean | null;
  is_spill?: boolean | null;
  project_id?: UUID | null;
  client_id?: UUID | null;
};

export type IncidentAffectedPerson = {
  id: UUID;
  incident_id: UUID;
  company_id: UUID;
  user_id: UUID | null;
  display_name: string | null;
  task_operation: string | null;
  machinery_equipment_tools: string | null;
  sort_order: number;
  created_at: string;
};

export type IncidentInvestigation = {
  id: UUID;
  company_id: UUID;
  incident_id: UUID;
  notes: string | null;
  instruction_breakdown: string | null;
  task_sequence: string | null;
  risk: string | null;
  risk_profile: string | null;
  potential_consequence: string | null;
  event_timeline: string | null;
  immediate_causes: any | null;
  root_causes_human: any | null;
  root_causes_workplace: any | null;
  system_failures: any | null;
  contributing_factors: string | null;
  lessons_learnt: string | null;
  investigation_team: any | null;
  conclusion: string | null;
  prepared_by: string | null;
  distributions: any | null;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type IncidentCorrectiveActionSourceCauseType = 'unsafe_act' | 'unsafe_condition' | 'root_cause' | 'system_failure';

export type IncidentCorrectiveAction = {
  id: UUID;
  incident_id: UUID;
  company_id: UUID;
  action_title: string;
  action_description: string | null;
  owner_user_id: UUID | null;
  due_date: string | null;
  status: 'Open' | 'In Progress' | 'Awaiting Evidence' | 'Under Review' | 'Closed';
  evidence_document_urls: string[] | null;
  closure_notes: string | null;
  manager_approval_user_id: UUID | null;
  manager_approval_at: string | null;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
  task_id?: UUID | null;
  ncr_id?: UUID | null;
  source_cause_type?: IncidentCorrectiveActionSourceCauseType | null;
  source_cause_text?: string | null;
};

export type TaskStatus =
  | 'draft'
  | 'assigned'
  | 'accepted'
  | 'in-progress'
  | 'awaiting-evidence'
  | 'under-review'
  | 'approved'
  | 'closed'
  | 'reopened'
  | 'overdue';
export type TaskPriority = Severity;

/** Task category enum per Task Master Register spec */
export type TaskCategory =
  | 'audit_action'
  | 'capa'
  | 'inspection'
  | 'ppe_issue'
  | 'safety_action'
  | 'env_action'
  | 'quality_action'
  | 'project_task'
  | 'maintenance'
  | 'training'
  | 'kpi_follow_up';

/** Time status indicator (computed) */
export type TaskTimeStatusIndicator =
  | 'on_schedule'
  | 'at_risk'
  | 'delayed'
  | 'overdue'
  | 'completed_early';

/** Canonical source types for task linking */
export type TaskSourceEntityType =
  | 'ncr'
  | 'inspection_run_item'
  | 'ppe_issue_tracker'
  | 'incident'
  | 'audit_finding'
  | 'audit'
  | 'quality_ncr'
  | 'customer_complaint'
  | 'program_audit_finding';

export type TaskRiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** Extension approval object */
export type TaskExtensionApproval = {
  approved_by_user_id: UUID | null;
  approved_at: string | null;
  new_due_at: string | null;
  reason: string | null;
};

/** Single comment entry (stored in task comments JSON) */
export type TaskComment = {
  timestamp: string;
  user_id: UUID;
  text: string;
};

/** Single progress update (stored in task progress_updates JSON) */
export type TaskProgressUpdate = {
  timestamp: string;
  user_id: UUID;
  note: string;
  percent_complete?: number | null;
};

export type Task = {
  id: UUID;
  company_id: UUID;
  module: ModuleKey;
  title: string;
  description: string | null;
  category?: TaskCategory | null;
  risk_level?: TaskRiskLevel | null;
  priority: TaskPriority;
  status: TaskStatus;
  site_id?: UUID | null;
  department_id?: UUID | null;
  site_name_text?: string | null;
  department_name_text?: string | null;
  project_ref?: string | null;
  task_owner_user_id?: UUID | null;
  allocated_by_user_id?: UUID | null;
  supporting_team_user_ids?: UUID[] | null;
  source_entity_type?: TaskSourceEntityType | string | null;
  source_entity_id?: UUID | null;
  planned_start_date?: string | null;
  planned_completion_date?: string | null;
  estimated_hours?: number | null;
  actual_start_at?: string | null;
  actual_completion_at?: string | null;
  time_spent_minutes?: number | null;
  time_delay_minutes?: number | null;
  delay_reason?: string | null;
  extension_approved_by_user_id?: UUID | null;
  extension_approved_at?: string | null;
  extension_new_due_at?: string | null;
  extension_reason?: string | null;
  extension_approval_json?: TaskExtensionApproval | null;
  due_at: string | null;
  assignee_user_id: UUID | null;
  created_by_user_id: UUID;
  /** Computed time status indicator */
  time_status_indicator?: TaskTimeStatusIndicator | null;
  progress_percent?: number | null;
  comments?: TaskComment[] | null;
  progress_updates?: TaskProgressUpdate[] | null;
  follow_up_inspection_ids?: UUID[] | null;
  blocked_by_task_ids?: UUID[] | null;
  effectiveness_checked?: boolean | null;
  effectiveness_notes?: string | null;
  effectiveness_check_date?: string | null;
  closure_date?: string | null;
  final_status?: string | null;
  lessons_learned?: string | null;
  created_at: string;
  updated_at: string;
};

/** Manual time log for a task */
export type TaskTimeLog = {
  id: UUID;
  company_id: UUID;
  task_id: UUID;
  started_at: string | null;
  ended_at: string | null;
  minutes: number | null;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type CorrectiveActionStatus = 'draft' | 'open' | 'approved' | 'closed';

export type CorrectiveAction = {
  id: UUID;
  company_id: UUID;
  module: ModuleKey;
  site_id?: UUID | null;
  department_id?: UUID | null;
  title: string;
  description: string | null;
  status: CorrectiveActionStatus;
  due_at: string | null;
  owner_user_id: UUID | null;
  created_by_user_id: UUID;
  approved_by_user_id: UUID | null;
  approved_at: string | null;
  source_entity_type?: string | null;
  source_entity_id?: UUID | null;
  reviewer_user_id?: UUID | null;
  authoriser_user_id?: UUID | null;
  effectiveness_verified_at?: string | null;
  effectiveness_verified_by_user_id?: UUID | null;
  closed_at?: string | null;
  closed_by_user_id?: UUID | null;
  escalation_level?: number | null;
  escalation_at?: string | null;
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

export type ReviewMeetingStatus = 'DRAFT' | 'ACTIVE' | 'SIGNED' | 'ARCHIVED';
export type ReviewMeetingSignatureStatus = 'SIGNED' | 'NOT_SIGNED';
export type ReviewMeetingItemStatus = 'IN_PROGRESS' | 'OUTSTANDING' | 'COMPLETED';

export type ReviewMeeting = {
  id: UUID;
  company_id: UUID;
  title: string | null;
  date: string;
  time: string;
  place: string;
  attendee_user_ids: UUID[] | null;
  external_attendees: string[] | null;
  email_list: string[] | null;
  next_meeting_date: string | null;
  chairperson_user_id: UUID | null;
  ceo_approval_required: boolean;
  status: ReviewMeetingStatus;
  signature_status: ReviewMeetingSignatureStatus;
  signed_by_user_id: UUID | null;
  signed_at: string | null;
  is_locked: boolean;
  auto_email_on_create: boolean;
  auto_email_on_update: boolean;
  auto_create_tasks_from_items: boolean;
  site_id: UUID | null;
  department_id: UUID | null;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type ReviewItemUpdateLog = {
  timestamp: string;
  note: string;
  user_id: UUID | null;
};

export type ReviewMeetingItem = {
  id: UUID;
  company_id: UUID;
  meeting_id: UUID;
  review_item: string;
  discussion_notes: string | null;
  action_required: string;
  responsible_user_id: UUID | null;
  responsible_name_external: string | null;
  target_date: string | null;
  resources_required: string | null;
  status: ReviewMeetingItemStatus;
  completion_date: string | null;
  evidence_file_ids: UUID[] | null;
  linked_document_ids: UUID[] | null;
  linked_task_id: UUID | null;
  updates_log: ReviewItemUpdateLog[] | null;
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

export type QualityNcrStatus =
  | 'open'
  | 'in-progress'
  | 'awaiting-evidence'
  | 'under-review'
  | 'approved'
  | 'overdue'
  | 'closed';

export type LinkedRequirementType = 'STANDARD' | 'POLICY' | 'PROCEDURE';

export type CustomerComplaintStatus =
  | 'CLOSED'
  | 'MONITORING_REQUIRED'
  | 'ESCALATED_TO_MANAGEMENT';

export type InternalExternalIssueStatus = 'Open' | 'In Progress' | 'Closed';
export type InternalExternalIssueNature = 'Low' | 'Medium' | 'Serious' | 'Critical' | string;

export type QualityInternalExternalIssuesRegister = {
  id: UUID;
  company_id: UUID;
  doc_no: string;
  issue_no: string;
  assessment_year: number;
  assessment_done_by_user_id: UUID | null;
  assessment_done_by_name_snapshot: string;
  assessment_done_on: string;
  assessment_updated_on: string;
  approved_by_user_id: UUID | null;
  approved_at: string | null;
  approval_signature: string | null;
  revision_number: number;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type QualityInternalExternalIssue = {
  id: UUID;
  register_id: UUID;
  company_id: UUID;
  ref_no: number;
  scope: string;
  issue_identification: string;
  risk_or_opp: string;
  likelihood: number;
  severity: number;
  risk_rating: number;
  nature: InternalExternalIssueNature;
  nature_override: boolean;
  control_measure: string | null;
  responsible_user_id: UUID | null;
  responsible_name_snapshot: string;
  target_date: string | null;
  status: InternalExternalIssueStatus;
  closure_date: string | null;
  closure_evidence_file_ids: UUID[] | null;
  linked_risk_assessment_id: UUID | null;
  linked_ncr_id: UUID | null;
  created_by_user_id: UUID;
  updated_by_user_id: UUID | null;
  created_at: string;
  updated_at: string;
};

export type QualityCustomerComplaint = {
  id: UUID;
  company_id: UUID;
  site_id: UUID | null;
  department_id: UUID | null;
  complaint_ref_no: string;
  customer_name: string;
  person_handling_user_id: UUID | null;
  person_handling_name_snapshot: string;
  date_received: string;
  description: string;
  action_taken: string | null;
  status: CustomerComplaintStatus;
  customer_feedback: string | null;
  evidence_file_ids: UUID[] | null;
  linked_ncr_id: UUID | null;
  linked_task_id: UUID | null;
  closed_at: string | null;
  closed_by_user_id: UUID | null;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type CalibrationCriticality = 'HIGH' | 'MEDIUM' | 'LOW';
export type CalibrationEquipmentStatus = 'IN_SERVICE' | 'OUT_OF_SERVICE' | 'REQUIRES_ADJUSTMENT_REPAIR';
export type CalibrationResult = 'PASS' | 'FAIL';
export type CalibrationModuleTag = 'Quality' | 'Health' | 'Safety' | 'Environment' | 'General';

export type CalibrationRecord = {
  id: UUID;
  company_id: UUID;
  site_id: UUID | null;
  department_id: UUID | null;
  sr_no: number;
  equipment_name: string;
  equipment_id: string;
  location: string;
  criticality: CalibrationCriticality;
  equipment_status: CalibrationEquipmentStatus;
  measuring_range: string | null;
  calibration_type: string | null;
  calibration_frequency: string | null;
  calibration_date: string;
  result: CalibrationResult;
  next_calibration_date: string;
  responsible_user_id: UUID | null;
  responsible_name_snapshot: string;
  item_picture_file_id: UUID | null;
  certificate_file_ids: UUID[];
  module_tags: CalibrationModuleTag[];
  notes: string | null;
  failure_notes: string | null;
  action_required: boolean;
  linked_ncr_id: UUID | null;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type NcrEvidenceReference = {
  fileId: UUID;
  url: string;
  name: string;
  uploadedAt: string;
  uploadedBy: UUID;
  storageBucket?: string;
  storageKey?: string;
};

export type QualityNcr = {
  id: UUID;
  company_id: UUID;
  module: ModuleKey;
  site_id?: UUID | null;
  site_id?: UUID | null;
  department_id?: UUID | null;
  nc_number: string | null;
  date_identified?: string | null;
  date_identified?: string | null;
  ncr_type?: string | null;
  ncr_category?: string | null;
  requirement_reference_type?: string | null;
  requirement_reference_text?: string | null;
  project_client?: string | null;
  auditor_user_id?: UUID | null;
  auditee_user_id?: UUID | null;
  department_manager_user_id?: UUID | null;
  title: string;
  description: string | null;
  location: string | null;
  process_involved: string | null;
  activity_involved: string | null;
  responsible_role: string | null;
  linked_requirement_type?: LinkedRequirementType | null;
  linked_requirement: string | null;
  risk_classification: string | null;
  risk_rating?: string | null;
  root_cause: string | null;
  root_cause_categories?: Record<string, unknown>[] | null;
  corrective_action: string | null;
  corrective_action_due_date: string | null;
  corrective_action_owner_user_id?: UUID | null;
  corrective_action_completed_date?: string | null;
  progress_updates?: Record<string, unknown>[] | null;
  evidence_uploads?: Record<string, unknown>[] | null;
  evidence_before?: NcrEvidenceReference[] | null;
  evidence_after?: NcrEvidenceReference[] | null;
  evidence_documents?: Record<string, unknown>[] | null;
  evidence_photos?: Record<string, unknown>[] | null;
  evidence_interviews?: Record<string, unknown>[] | null;
  evidence_observations?: Record<string, unknown>[] | null;
  source_entity_type: string | null;
  source_entity_id: UUID | null;
  manager_signoff_user_id?: UUID | null;
  manager_signoff_at?: string | null;
  manager_signoff_comment?: string | null;
  manager_signature_method?: string | null;
  auditor_verify_user_id?: UUID | null;
  auditor_verify_at?: string | null;
  effectiveness_verified?: boolean | null;
  auditor_comment?: string | null;
  effectiveness_check_date?: string | null;
  closure_comments?: string | null;
  date_closed?: string | null;
  closed_at: string | null;
  closed_by_user_id: UUID | null;
  linked_audit_score?: number | null;
  previous_similar_ncr_ids?: string[] | null;
  repeat_finding?: boolean | null;
  risk_trend?: Record<string, unknown> | null;
  closure_time_days?: number | null;
  auditor_name?: string | null;
  company_representative_ack?: string | null;
  reopen_reason?: string | null;
  reopen_at?: string | null;
  metadata?: Record<string, unknown> | null;
  severity: Severity;
  status: QualityNcrStatus;
  occurrence_date: string;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type PjoStatus = 'open' | 'closed';

export type PjoTemplateScope = 'global' | 'site' | 'department';

export type PjoChecklistTemplate = {
  id: UUID;
  company_id: UUID;
  module: ModuleKey;
  name: string;
  description: string | null;
  scope: PjoTemplateScope;
  site_id?: UUID | null;
  department_id?: UUID | null;
  is_active: boolean;
  created_by_user_id: UUID;
  updated_by_user_id?: UUID | null;
  created_at: string;
  updated_at: string;
};

export type PjoChecklistItem = {
  id: UUID;
  company_id: UUID;
  template_id: UUID;
  question_no: number;
  question_text: string;
  category: string | null;
  default_rating_weight: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PjoObservation = {
  id: UUID;
  company_id: UUID;
  module: 'hr';
  employee_user_id: UUID | null;
  employee_name: string;
  conducted_by_user_id: UUID;
  reason: string;
  department: string | null;
  site: string | null;
  job_observed: string;
  observed_at: string; // date
  next_observation_at: string | null; // date
  status: PjoStatus;
  closed_at: string | null;
  closed_by_user_id: UUID | null;
  metadata?: Record<string, unknown> | null;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type PjoResponse = {
  id: UUID;
  company_id: UUID;
  pjo_id: UUID;
  question_no: number;
  question_text: string;
  yes_no: boolean | null;
  rating: 1 | 2 | 3 | null;
  deviation: string | null;
  suggested_corrective_action: string | null;
  responsible_person: string | null;
  responsible_department: string | null;
  corrective_action_implemented: boolean;
  implemented_at: string | null; // date
  manager_signoff_user_id: UUID | null;
  manager_signoff_at: string | null;
  closed: boolean;
  closed_at: string | null;
  closed_by_user_id: UUID | null;
  ncr_id: UUID | null;
   template_id?: UUID | null;
   template_item_id?: UUID | null;
   category?: string | null;
  created_at: string;
  updated_at: string;
};

export type InspectionStatus = 'scheduled' | 'in-progress' | 'completed' | 'overdue';

export type Inspection = {
  id: UUID;
  company_id: UUID;
  module: ModuleKey;
  site_id?: UUID | null;
  department_id?: UUID | null;
  title: string;
  checklist_name: string | null;
  status: InspectionStatus;
  scheduled_at: string | null;
  completed_at: string | null;
  inspection_date?: string | null;
  completion_date_stamp?: string | null;
  sector?: string | null;
  frequency?: 'daily' | 'monthly' | 'audit-linked' | null;
  inspector_user_id?: UUID | null;
  auditor_user_id?: UUID | null;
  auditee_user_id?: UUID | null;
  audit_id?: UUID | null;
  location: string | null;
  findings_count: number;
  nonconformances_count: number;
  assignee_user_id: UUID | null;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type InspectionChecklistTemplateScope = 'global' | 'site' | 'department';

export type InspectionChecklistTemplate = {
  id: UUID;
  company_id: UUID;
  module: ModuleKey;
  name: string;
  description: string | null;
  scope: InspectionChecklistTemplateScope;
  site_id?: UUID | null;
  department_id?: UUID | null;
  is_active: boolean;
  source_type?: 'google-doc' | 'manual' | null;
  google_doc_id?: string | null;
  google_doc_url?: string | null;
  default_sector?: string | null;
  frequency?: 'daily' | 'monthly' | 'audit-linked' | null;
  default_inspection_method?: 'physical-inspection' | 'observation' | 'record-review' | null;
  created_by_user_id: UUID;
  updated_by_user_id?: UUID | null;
  created_at: string;
  updated_at: string;
};

export type InspectionChecklistItem = {
  id: UUID;
  company_id: UUID;
  template_id: UUID;
  item_order: number;
  section: string | null;
  audit_section_or_category?: string | null;
  requirement_reference?: string | null;
  question: string;
  expected_evidence: string | null;
  risk_area: string | null;
  default_risk_rating: string | null;
  default_nc_severity: string | null;
  evidence_required_default?: boolean;
  risk_level_default?: 'low' | 'medium' | 'high' | null;
  inspection_method_default?: 'physical-inspection' | 'observation' | 'record-review' | null;
  question_source_type?: 'google-doc-template' | 'manual' | null;
  is_mandatory: boolean;
  created_at: string;
  updated_at: string;
};

export type InspectionRunStatus = 'in-progress' | 'completed' | 'cancelled';

export type InspectionRun = {
  id: UUID;
  company_id: UUID;
  inspection_id: UUID;
  template_id: UUID;
  module: ModuleKey;
  site_id?: UUID | null;
  department_id?: UUID | null;
  run_number: number;
  started_at: string | null;
  completed_at: string | null;
  status: InspectionRunStatus;
  inspector_user_id?: UUID | null;
  auditor_user_id?: UUID | null;
  auditee_user_id?: UUID | null;
  auditee_submission_status?: 'draft' | 'submitted' | null;
  auditee_submitted_at?: string | null;
  sector?: string | null;
  location?: string | null;
  frequency?: 'daily' | 'monthly' | 'audit-linked' | null;
  inspection_date_stamp?: string | null;
  items_total: number;
  items_nc: number;
  ncrs_created_count: number;
  created_at: string;
  updated_at: string;
};

export type InspectionRunComplianceStatus = 'C' | 'NC' | 'NA';

export type InspectionRunItem = {
  id: UUID;
  company_id: UUID;
  run_id: UUID;
  template_item_id?: UUID | null;
  item_order: number;
  section: string | null;
  audit_section_or_category?: string | null;
  requirement_reference?: string | null;
  question: string;
  expected_evidence: string | null;
  risk_area: string | null;
  risk_rating: string | null;
  nc_severity: string | null;
  compliance_status: InspectionRunComplianceStatus;
  inspection_rating?: 'C' | 'PC' | 'NC' | null;
  score?: number | null;
  max_score?: number | null;
  evidence_required: boolean;
  evidence_notes: string | null;
  comments: string | null;
  auditor_comments: string | null;
  inspection_method?: 'physical-inspection' | 'observation' | 'record-review' | null;
  evidence_document_url: string | null;
  photo_url: string | null;
  risk_level?: 'low' | 'medium' | 'high' | null;
  nonconformance_flag: boolean;
  corrective_action_required: boolean;
  responsible_person_id?: UUID | null;
  responsible_person_name?: string | null;
  due_date?: string | null;
  status: 'open' | 'in-progress' | 'awaiting-evidence' | 'closed' | 'overdue';
  question_fingerprint?: string | null;
  auto_ncr_id?: UUID | null;
  corrective_action_id?: UUID | null;
  closure_requested_at?: string | null;
  closure_evidence_submitted_at?: string | null;
  manager_approved_by_user_id?: UUID | null;
  manager_approved_at?: string | null;
  auditor_verified_by_user_id?: UUID | null;
  auditor_verified_at?: string | null;
  ncr_closed_at?: string | null;
  ncr_closed_by_user_id?: UUID | null;
  manager_approved_by_user_id?: UUID | null;
  manager_approved_at?: string | null;
  auditor_verified_by_user_id?: UUID | null;
  auditor_verified_at?: string | null;
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

/** PPE category (Head/Eye/Hearing/Respiratory/Hand/Foot/Chemical/Chainsaw/Fall protection/Other) */
export type PpeCategory =
  | 'Head'
  | 'Eye'
  | 'Hearing'
  | 'Respiratory'
  | 'Hand'
  | 'Foot'
  | 'Chemical'
  | 'Chainsaw'
  | 'Fall protection'
  | 'Other';

/** Reason for issue (dropdown + typeable Other) */
export type PpeReasonForIssue =
  | 'New Issue'
  | 'Replacement (Torn)'
  | 'Replacement (Lost)'
  | 'Replacement (Expired)'
  | 'Replacement (Incorrect Size)'
  | 'Damage'
  | 'Non-compliance Correction'
  | 'Other';

export const PPE_REASON_FOR_ISSUE_OPTIONS: { value: PpeReasonForIssue; label: string }[] = [
  { value: 'New Issue', label: 'New Issue' },
  { value: 'Replacement (Torn)', label: 'Replacement (Torn)' },
  { value: 'Replacement (Lost)', label: 'Replacement (Lost)' },
  { value: 'Replacement (Expired)', label: 'Replacement (Expired)' },
  { value: 'Replacement (Incorrect Size)', label: 'Replacement (Incorrect Size)' },
  { value: 'Damage', label: 'Damage' },
  { value: 'Non-compliance Correction', label: 'Non-compliance Correction' },
  { value: 'Other', label: 'Other (type)' }
];

export const PPE_CATEGORY_OPTIONS: { value: PpeCategory; label: string }[] = [
  { value: 'Head', label: 'Head' },
  { value: 'Eye', label: 'Eye' },
  { value: 'Hearing', label: 'Hearing' },
  { value: 'Respiratory', label: 'Respiratory' },
  { value: 'Hand', label: 'Hand' },
  { value: 'Foot', label: 'Foot' },
  { value: 'Chemical', label: 'Chemical' },
  { value: 'Chainsaw', label: 'Chainsaw' },
  { value: 'Fall protection', label: 'Fall protection' },
  { value: 'Other', label: 'Other' }
];

export type PPEItem = {
  id: UUID;
  company_id: UUID;
  name: string;
  category: string | null;
  unit_cost: number | null;
  description?: string | null;
  sizes_available?: string[] | null;
  supplier_name?: string | null;
  stock_location?: string | null;
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
  // PPE Module Comments 2
  site_id?: UUID | null;
  department_id?: UUID | null;
  issue_date?: string | null;
  issued_to_employee_number?: string | null;
  job_role?: string | null;
  job_description?: string | null;
  ppe_item_name?: string | null;
  ppe_category?: string | null;
  size?: string | null;
  quantity_issued?: number;
  reason_for_issue?: string | null;
  issued_by_name?: string | null;
  issued_by_role?: string | null;
  unit_cost_at_issue?: number | null;
  total_cost_at_issue?: number | null;
  issuer_signature?: string | null;
  receiver_signature?: string | null;
};

export type PpeIssueTrackerStatus =
  | 'open'
  | 'in_progress'
  | 'awaiting_ppe'
  | 'awaiting_training'
  | 'awaiting_evidence'
  | 'under_review'
  | 'closed'
  | 'overdue';

export type PpeIssueTrackerRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type PpeIssueTracker = {
  id: UUID;
  company_id: UUID;

  // General Information
  date_reported: string;
  reported_by_user_id: UUID;
  reported_by_name: string | null;
  department_id: UUID | null;
  department_name_text: string | null;
  site_id: UUID | null;
  site_name_text: string | null;
  contractor_or_employee_name: string | null;
  employee_number: string | null;
  job_role_or_task: string | null;
  supervisor_user_id: UUID | null;
  supervisor_name_text: string | null;

  // PPE Issue Details
  ppe_type:
    | 'helmet'
    | 'gloves'
    | 'safety_boots'
    | 'eye_protection'
    | 'hearing_protection'
    | 'respirator_mask'
    | 'reflective_vest'
    | 'chainsaw_ppe'
    | 'chemical_ppe'
    | 'other';
  ppe_type_other: string | null;
  issue_category:
    | 'missing_ppe'
    | 'damaged_ppe'
    | 'expired_ppe'
    | 'incorrect_ppe'
    | 'ppe_not_worn'
    | 'poor_condition'
    | 'insufficient_supply'
    | 'non_approved_ppe';
  description_of_issue: string;
  risk_level: PpeIssueTrackerRiskLevel;

  // Immediate Action Taken
  immediate_work_stopped: boolean;
  immediate_ppe_issued: boolean;
  immediate_employee_removed: boolean;
  immediate_toolbox_talk: boolean;
  immediate_supervisor_notified: boolean;
  immediate_action_notes: string | null;

  // Evidence & Inspection Links
  inspection_reference_text: string | null;
  audit_id: UUID | null;
  pjo_id: UUID | null;
  checklist_instance_id: UUID | null;
  checklist_item_id: UUID | null;
  witness_interview_notes: string | null;

  // Corrective Action Management
  corrective_action_required: boolean;
  responsible_user_id: UUID | null;
  responsible_user_name: string | null;
  corrective_department_id: UUID | null;
  corrective_department_name: string | null;
  target_completion_date: string | null; // date
  replacement_ppe_issued: boolean;
  training_required: boolean;
  disciplinary_action: string | null;

  // Progress Tracking
  status: PpeIssueTrackerStatus;
  progress_updates: { timestamp: string; user_id: UUID; note: string }[];
  follow_up_inspection_date: string | null; // date

  // Closure & Verification
  department_manager_user_id: UUID | null;
  department_manager_signed_at: string | null;
  department_manager_signature_method: string | null;
  department_manager_comment: string | null;
  safety_officer_user_id: UUID | null;
  safety_officer_verified_at: string | null;
  safety_officer_comment: string | null;
  auditor_user_id: UUID | null;
  auditor_confirmed_at: string | null;
  auditor_comment: string | null;
  closure_date: string | null;
  effectiveness_verified: boolean | null;
  repeat_issue_indicator: boolean | null;
  source_requires_auditor_confirmation: boolean | null;

  // Optional links to PPE inventory / items
  ppe_item_id: UUID | null;
  stock_id: UUID | null;

  created_by_user_id: UUID;
  updated_at: string;
};

// PPE inventory: stock, movements & reorder requests
export type PpeStock = {
  id: UUID;
  company_id: UUID;
  site_id: UUID | null;
  department_id: UUID | null;
  ppe_item_id: UUID;
  on_hand_qty: number;
  reserved_qty: number;
  reorder_level: number;
  reorder_qty: number;
  is_active: boolean;
  created_by_user_id: UUID;
  updated_by_user_id: UUID | null;
  created_at: string;
  updated_at: string;
  captured_by_user_id?: UUID | null;
  captured_by_name?: string | null;
  date_ordered?: string | null;
  date_stock_received?: string | null;
  opening_stock_qty?: number | null;
  qty_ordered?: number | null;
  qty_received?: number | null;
};

export type PpeStockMovementType = 'in' | 'out' | 'adjust' | 'return' | 'ordered';

export type PpeStockMovement = {
  id: UUID;
  company_id: UUID;
  stock_id: UUID;
  movement_type: PpeStockMovementType;
  quantity: number;
  reason: string | null;
  reference_type: string | null;
  reference_id: UUID | null;
  ppe_issue_id: UUID | null;
  old_on_hand_qty: number | null;
  new_on_hand_qty: number | null;
  created_by_user_id: UUID;
  created_at: string;
  transaction_date?: string | null;
};

export type PpeReorderRequestStatus =
  | 'draft'
  | 'requested'
  | 'approved'
  | 'rejected'
  | 'ordered'
  | 'received';

export type PpeReorderRequest = {
  id: UUID;
  company_id: UUID;
  stock_id: UUID;
  requested_qty: number;
  reason: string | null;
  status: PpeReorderRequestStatus;
  requested_by_user_id: UUID;
  approved_by_user_id: UUID | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PpeIssueNcrLink = {
  id: UUID;
  company_id: UUID;
  ppe_issue_id: UUID;
  ncr_id: UUID;
  created_by_user_id: UUID;
  created_at: string;
};

export type PpeIssueCapaLink = {
  id: UUID;
  company_id: UUID;
  ppe_issue_id: UUID;
  corrective_action_id: UUID;
  created_by_user_id: UUID;
  created_at: string;
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

export type LegalComplianceStatus = 'NON_COMPLIANT' | 'PARTIALLY_COMPLIANT' | 'COMPLIANT';
export type LegalUpdateCompletionStatus = 'OPEN' | 'CLOSED';

export type LegalRequirementLinkedModuleType = 'document' | 'risk_assessment' | 'ncr';

export type LegalRequirementLink = {
  id: UUID;
  company_id: UUID;
  legal_requirement_id: UUID;
  linked_module_type: LegalRequirementLinkedModuleType;
  linked_record_id: UUID;
  created_by_user_id: UUID;
  created_at: string;
};

export type LegalRequirementReference = {
  referenceText: string;
};

export type LegalRequirementEvidenceLink = {
  documentId: UUID;
  documentTitleSnapshot: string;
};

export type LegalRequirement = {
  id: UUID;
  company_id: UUID;
  module: 'legal';
  requirement_standard: string;
  applicability: string | null;
  actions_needed: string | null;
  compliance_status: LegalComplianceStatus;
  finding?: string | null;
  target_date?: string | null;
  responsible_user_id: UUID | null;
  responsible_employee_id?: UUID | null;
  responsible_external_name: string | null;
  references: LegalRequirementReference[] | null;
  evidence_links: LegalRequirementEvidenceLink[] | null;
  created_by_user_id: UUID;
  updated_by_user_id: UUID | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  links?: LegalRequirementLink[] | null;
};

export type LegalUpdate = {
  id: UUID;
  company_id: UUID;
  legal_requirement_id: UUID;
  date_amended: string | null;
  law_updated_date: string | null;
  summary_of_change: string | null;
  impact_on_business: string | null;
  action_required: string | null;
  responsible_user_id: UUID | null;
  responsible_external_name: string | null;
  deadline: string | null;
  completion_status: LegalUpdateCompletionStatus;
  closure_note: string | null;
  closed_at: string | null;
  closed_by_user_id: UUID | null;
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
  unit_standard_required: string | null;
  credits: number | null;
  default_frequency_months: number | null;
  default_validity_months: number | null;
  created_at: string;
  updated_at?: string | null;
};

export type TrainingRecordStatus = 'REQUIRED' | 'SCHEDULED' | 'COMPLETED' | 'EXPIRED' | 'OVERDUE' | 'CANCELLED';

export type TrainingRecord = {
  id: UUID;
  company_id: UUID;
  user_id: UUID;
  course_id: UUID;
  job_description_id: UUID | null;
  provider_id: UUID | null;
  provider_type: string | null;
  arranged_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
  certificate_bucket: string | null;
  certificate_key: string | null;
  cost: number | null;
  status: TrainingRecordStatus;
  created_by_user_id: UUID;
  created_at: string;
  updated_at?: string | null;
};

export type JobDescription = {
  id: UUID;
  company_id: UUID;
  title: string;
  department_id: UUID | null;
  created_at: string;
  updated_at: string;
};

export type TrainingProviderType = 'INTERNAL' | 'EXTERNAL';

export type TrainingProvider = {
  id: UUID;
  company_id: UUID;
  name: string;
  provider_type: TrainingProviderType;
  contact_info: string | null;
  created_at: string;
  updated_at: string;
};

export type CourseProviderPrice = {
  id: UUID;
  company_id: UUID;
  course_id: UUID;
  provider_id: UUID;
  price: number | null;
  currency: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type JobTrainingRequirement = {
  id: UUID;
  company_id: UUID;
  job_description_id: UUID;
  course_id: UUID;
  frequency_months: number | null;
  is_mandatory: boolean;
  created_at: string;
  updated_at: string;
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

export type HealthMedicalType = 'PRE_EMPLOYMENT' | 'PERIODIC' | 'EXIT';
export type HealthFitnessStatus = 'FIT' | 'RESTRICTED' | 'UNFIT';

export type HealthMedical = {
  id: UUID;
  company_id: UUID;
  employee_user_id: UUID | null;
  employee_name: string | null;
  employee_number: string | null;
  medical_type: HealthMedicalType;
  medical_date: string;
  expiry_date: string | null;
  conducted_by: string | null;
  fitness_status: HealthFitnessStatus;
  fitness_certificate_file_ids: UUID[] | null;
  chronic_illness_disclosed: boolean;
  chronic_illness_notes: string | null;
  restricted_duty_required: boolean;
  restricted_duty_details: string | null;
  notes: string | null;
  created_by_user_id: UUID;
  closed_by_user_id: UUID | null;
  closed_at: string | null;
  date_closed: string | null;
  created_at: string;
  updated_at: string;
};

export type HealthRestrictedDutyStatus = 'Active' | 'Ended';

export type HealthRestrictedDuty = {
  id: UUID;
  company_id: UUID;
  medical_id: UUID | null;
  employee_user_id: UUID | null;
  employee_name: string | null;
  restriction_reason: string;
  restriction_details: string | null;
  start_date: string;
  end_date: string | null;
  status: HealthRestrictedDutyStatus;
  approved_by_user_id: UUID | null;
  attachment_file_ids: UUID[] | null;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type HealthHygieneComplianceStatus = 'COMPLIANT' | 'NON_COMPLIANT' | 'PARTIAL' | 'UNKNOWN';

export type HealthHygieneRecord = {
  id: UUID;
  company_id: UUID;
  monitoring_type: string;
  site_location: string | null;
  department: string | null;
  monitored_on: string;
  conducted_by: string | null;
  method_or_standard: string | null;
  results_summary: string | null;
  result_details: Record<string, unknown> | null;
  compliance_status: HealthHygieneComplianceStatus;
  non_compliance_reason: string | null;
  lab_certificate_file_ids: UUID[] | null;
  linked_risk_assessment_ids: UUID[] | null;
  action_plan_id: UUID | null;
  responsible_user_id: UUID | null;
  action_due_date: string | null;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type HealthWellnessCampaignType = 'Mental health' | 'EAP' | 'Stress management' | 'Awareness';

export type HealthWellnessCampaign = {
  id: UUID;
  company_id: UUID;
  title: string;
  campaign_type: HealthWellnessCampaignType;
  date_from: string | null;
  date_to: string | null;
  description: string | null;
  attachment_file_ids: UUID[] | null;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type HealthSubstanceCaseType =
  | 'Reasonable Suspicion'
  | 'Random Test'
  | 'Post-Incident'
  | 'Return-to-Work'
  | 'Follow-up Test';

export type HealthSubstanceTestType = 'Breathalyser' | 'Urine' | 'Saliva' | 'Blood';
export type HealthSubstanceTestResult = 'Negative' | 'Positive' | 'Refused';
export type HealthSubstanceOutcome = 'Verbal Warning' | 'Written Warning' | 'Final Warning' | 'Dismissal' | 'Referral to Rehab';

export type HealthSubstanceCase = {
  id: UUID;
  company_id: UUID;
  employee_user_id: UUID | null;
  employee_name: string | null;
  date_of_report: string;
  test_conducted_by: string | null;
  type_of_case: HealthSubstanceCaseType;
  substance_suspected: string[] | null;
  substance_suspected_other: string | null;
  observed_behaviour_symptoms: string | null;
  witness_names: string[] | null;
  type_of_test: HealthSubstanceTestType;
  test_result: HealthSubstanceTestResult;
  bac_level: number | null;
  drug_panel_result: string | null;
  removed_from_duty: boolean;
  immediate_action_taken: string | null;
  outcome: HealthSubstanceOutcome | null;
  employee_comments: string | null;
  hr_manager_comments: string | null;
  attachment_file_ids: UUID[] | null;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type HealthVaccination = {
  id: UUID;
  company_id: UUID;
  employee_user_id: UUID | null;
  employee_name: string | null;
  vaccine_name: string;
  dose_no: number | null;
  date_administered: string | null;
  batch_no: string | null;
  administered_by: string | null;
  next_due_date: string | null;
  proof_attached_file_ids: UUID[] | null;
  validity: string | null;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
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

export type ImprovementWorkflowStatus =
  | 'draft'
  | 'open'
  | 'in_progress'
  | 'awaiting_evidence'
  | 'awaiting_verification'
  | 'under_management_review'
  | 'closed'
  | 'monitoring_required'
  | 'escalated';

export type ImprovementRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type ImprovementType =
  | 'corrective_action'
  | 'preventive_action'
  | 'audit_finding'
  | 'management_review_decision'
  | 'employee_suggestion'
  | 'process_improvement'
  | 'client_complaint'
  | 'other';

export type ImprovementSourceType =
  | 'incident'
  | 'ncr'
  | 'audit'
  | 'risk'
  | 'management_review'
  | 'other';

export type ImprovementClosureStatus = 'closed' | 'monitoring_required' | 'escalated';

export type ImprovementVerificationMethod =
  | 'follow_up_audit'
  | 'inspection'
  | 'observation'
  | 'kpi_monitoring'
  | 'training_assessment'
  | 'client_feedback'
  | 'other';

export type ImprovementRecord = {
  id: UUID;
  company_id: UUID;
  reference_number: string;
  date_raised: string;
  raised_by_user_id: UUID;
  department_site: string | null;
  improvement_type: ImprovementType;
  improvement_type_other_text: string | null;
  description: string | null;
  risk_level: ImprovementRiskLevel;
  action_required: string | null;
  responsible_user_id: UUID | null;
  resources_needed: string | null;
  target_date: string | null;
  status: ImprovementWorkflowStatus;
  evidence_file_ids: UUID[] | null;
  verification_methods: ImprovementVerificationMethod[] | null;
  verification_method_other_text: string | null;
  verified_by_user_id: UUID | null;
  date_verified: string | null;
  was_action_effective: boolean | null;
  management_reviewed_by_user_id: UUID | null;
  management_review_date: string | null;
  management_recommendations: string | null;
  management_decision: 'approve' | 'monitor' | 'escalate' | 'rework' | null;
  closed_by_user_id: UUID | null;
  closure_date: string | null;
  closure_status: ImprovementClosureStatus | null;
  lessons_learned: string | null;
  source_type: ImprovementSourceType;
  source_id: UUID | null;
  source_other_text: string | null;
  created_by_user_id: UUID;
  updated_by_user_id: UUID | null;
  created_at: string;
  updated_at: string;
};

export type ImprovementComment = {
  id: UUID;
  improvement_id: UUID;
  company_id: UUID;
  user_id: UUID;
  message: string;
  parent_comment_id: UUID | null;
  created_at: string;
};

export type ImprovementReferenceCounter = {
  company_id: UUID;
  year: number;
  last_number: number;
  updated_at: string;
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
  site_id?: UUID | null;
  department_id?: UUID | null;
  department: string | null;
  site: string | null;
  job_description_id?: UUID | null;
  employee_number?: string | null;
  supervisor_user_id?: UUID | null;
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
  original_filename?: string | null;
  display_title?: string | null;
  file_kind?: string | null;
};

export type ProgramAuditFindingStatus =
  | 'open'
  | 'in-progress'
  | 'awaiting-evidence'
  | 'under-review'
  | 'approved'
  | 'closed';

export type ProgramAuditFinding = {
  id: UUID;
  company_id: UUID;
  audit_id: UUID;
  audit_question_id?: UUID | null;
  title: string;
  deviation_type: 'observation' | 'finding' | 'non_conformance' | 'opportunity_for_improvement';
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  required_action: string | null;
  responsible_user_id: UUID | null;
  due_date: string | null;
  evidence_requirements: string | null;
  status: ProgramAuditFindingStatus;
  closure_evidence_url: string | null;
  manager_signoff_user_id: UUID | null;
  manager_signoff_at: string | null;
  auditor_verify_user_id: UUID | null;
  auditor_verify_at: string | null;
  closed_at: string | null;
  action_plan: string | null;
  progress_updates: unknown;
  evidence_uploads: unknown;
  reopen_reason: string | null;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type HrKpiImportance = 'low' | 'medium' | 'high';
export type HrKpiAssessmentType = 'employee' | 'project';

export type HrKpi = {
  id: UUID;
  company_id: UUID;
  kpi_title: string;
  assessment_type: HrKpiAssessmentType;
  employee_user_id: UUID | null;
  project_ref: string | null;
  manager_user_id: UUID;
  importance: HrKpiImportance;
  target_value_numeric: number | null;
  target_value_text: string | null;
  actual_value_numeric: number | null;
  actual_value_text: string | null;
  achieved: boolean | null;
  employee_self_rating: number | null;
  manager_rating: number | null;
  manager_remarks: string | null;
  employee_comments: string | null;
  period_start: string | null;
  period_end: string | null;
  linked_task_id: UUID | null;
  closure_evidence_url: string | null;
  closed_out_at: string | null;
  closed_out_by_user_id: UUID | null;
  performance_bonus_score: number | null;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

// --- KPI Performance Module (HR) ---
export type KpiImportance = 'low' | 'medium' | 'high';
export type KpiAssessmentType = 'employee' | 'project';
export type KpiPeriodType = 'monthly' | 'quarterly' | 'annual';
export type KpiAssessmentStatus = 'draft' | 'in_progress' | 'under_review' | 'completed' | 'closed' | 'submitted' | 'finalized';
export type KpiFindingStatus = 'open' | 'in_progress' | 'awaiting_evidence' | 'under_review' | 'closed' | 'overdue';

export type KPIItem = {
  kpi_item_id: UUID;
  organization_id: UUID | null;
  title: string;
  description: string | null;
  default_importance: KpiImportance;
  category: string | null;
  tags: unknown;
  active: boolean;
  created_by: UUID;
  created_at: string;
  updated_at: string;
};

export type KPIAssessment = {
  assessment_id: UUID;
  organization_id: UUID;
  assessment_name: string | null;
  assessment_type: KpiAssessmentType;
  employee_id: UUID | null;
  employee_name_snapshot: string | null;
  manager_id: UUID;
  manager_name_snapshot: string | null;
  project_id: UUID | null;
  project_name: string | null;
  department_id: UUID | null;
  site_id: UUID | null;
  period_type: KpiPeriodType;
  period_start_date: string;
  period_end_date: string;
  status: KpiAssessmentStatus;
  employee_comments: string | null;
  manager_remarks: string | null;
  overall_score: number | null;
  achievement_percentage: number | null;
  employee_overall_performance_score: number | null;
  weighted_score_total: number | null;
  overall_rating_band: string | null;
  bonus_score: number | null;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type KPIAssessmentLine = {
  line_id: UUID;
  assessment_id: UUID;
  kpi_item_id: UUID | null;
  custom_kpi_title: string | null;
  kpi_questionnaire: string | null;
  kpi_title: string;
  importance_rating: KpiImportance;
  employee_own_rating: number | null;
  manager_rating: number | null;
  achievement_status: 'not_achieved' | 'partially_achieved' | 'achieved' | null;
  weighted_score: number | null;
  achieved: boolean | null;
  not_achieved: boolean | null;
  notes: string | null;
  finding_generated: boolean;
  finding_id: UUID | null;
  created_at: string;
  updated_at: string;
};

export type KPIFindingProofUpload = {
  storage_bucket: string;
  storage_key: string;
  url: string;
  filename?: string;
  uploaded_at?: string;
};

export type KPIFinding = {
  finding_id: UUID;
  organization_id: UUID;
  assessment_id: UUID;
  line_id: UUID;
  employee_id: UUID | null;
  project_id: UUID | null;
  description: string;
  assigned_line_manager_id: UUID;
  due_date: string;
  status: KpiFindingStatus;
  proof_uploads: KPIFindingProofUpload[] | null;
  manager_sign_off_user_id: UUID | null;
  manager_sign_off_signed_at: string | null;
  manager_sign_off_comment: string | null;
  manager_sign_off_signature_method: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Program audit record
 *
 * This type mirrors the `audits` table in the Phase 2 schema and is used
 * across services (auditsService) and exports (exportService).
 */
export type Audit = {
  id: UUID;
  company_id: UUID;
  module: ModuleKey;

  // Identification
  audit_number: string;
  title: string;
  description: string | null;

  // Type & objectives
  audit_type: 'internal' | 'external' | 'client' | 'supplier' | 'certification';
  objectives: string | null;

  // Scheduling & approvals
  proposed_dates: string[] | null;
  selected_date: string | null;
  approved_by_user_id: UUID | null;
  approved_at: string | null;

  // Criteria, team & scope
  audit_criteria: string | null;
  auditor_user_ids: UUID[] | null;
  scope_of_audit: string | null;
  location: string | null;
  departments_auditee_ids: UUID[] | null;
  company_representative_user_ids: UUID[] | null;
  lead_auditor_user_id: UUID | null;
  required_document_list: { key: string; label: string }[] | null;
  document_submission_deadline: string | null;
  date_approval_status: 'pending' | 'approved' | 'declined' | null;
  date_decline_reason: string | null;
  checklist_template_id: UUID | null;

  // Planning inputs (document URLs or references)
  organogram_document_url: string | null;
  process_maps_document_url: string | null;
  procedures_policies_document_url: string | null;
  risk_assessments_document_url: string | null;
  legal_register_document_url: string | null;
  previous_audit_reports_document_url: string | null;
  incident_reports_document_url: string | null;
  training_records_document_url: string | null;
  permits_registers_document_url: string | null;
  client_requirements_document_url: string | null;

  // Status & results (lifecycle)
  status:
    | 'draft'
    | 'scheduled'
    | 'awaiting-documents'
    | 'ready-for-audit'
    | 'in-progress'
    | 'report-pending'
    | 'corrective-actions-open'
    | 'under-closure-review'
    | 'completed'
    | 'archived';
  findings_count: number;
  nonconformances_count: number;
  observations_count: number;

  // Report
  report_document_url: string | null;
  report_submitted_at: string | null;

  // Linking
  related_ncr_ids: UUID[] | null;

  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type AuditChecklistTemplate = {
  id: UUID;
  company_id: UUID;
  source_type: 'googleDoc' | 'manual';
  google_doc_id: string | null;
  google_doc_url: string | null;
  name: string;
  sections: unknown;
  questions: unknown;
  created_by_user_id: UUID;
  created_at: string;
  updated_at: string;
};

export type PreAuditSubmissionStatus = 'pending' | 'submitted' | 'late' | 'approved_for_audit';

export type PreAuditSubmission = {
  id: UUID;
  audit_id: UUID;
  company_id: UUID;
  status: PreAuditSubmissionStatus;
  uploaded_docs: { documentId?: string; requirementKey: string; uploadedAt: string; storageKey: string }[] | null;
  missing_docs: string[] | null;
  submitted_at: string | null;
  approved_for_audit_at: string | null;
  approved_by_user_id: UUID | null;
  created_at: string;
  updated_at: string;
};

export type AuditReport = {
  id: UUID;
  audit_id: UUID;
  company_id: UUID;
  generated_report_data: Record<string, unknown>;
  pdf_url: string | null;
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
