-- Inspection checklist builder + audit questionnaire upgrade: HR employee
-- linking, hours/km service tracking, 4-state compliance, audit sections.
-- Apply date: 2026-09-15

-- =========================
-- Inspections: HR employee snapshots + vehicle/machine hours-km tracking
-- =========================
alter table public.inspections
  add column if not exists auditor_hr_employee_id uuid null references public.hr_employees(id) on delete set null,
  add column if not exists auditor_name text null,
  add column if not exists area_manager_hr_employee_id uuid null references public.hr_employees(id) on delete set null,
  add column if not exists area_manager_name text null,
  add column if not exists inspector_hr_employee_id uuid null references public.hr_employees(id) on delete set null,
  add column if not exists inspector_name text null,
  add column if not exists auditee_hr_employee_id uuid null references public.hr_employees(id) on delete set null,
  add column if not exists auditee_name text null,
  add column if not exists sub_title text null,
  add column if not exists opening_hours_km numeric null,
  add column if not exists closing_hours_km numeric null,
  add column if not exists service_interval_hours_km numeric null,
  add column if not exists next_service_hours_km numeric null,
  add column if not exists period_label text null;

-- inspection_runs: auditee self-assessment columns referenced by code but
-- never migrated, plus mirrored HR-employee/area-manager snapshot for the
-- risk-escalation notification path.
alter table public.inspection_runs
  add column if not exists auditee_submission_status text null,
  add column if not exists auditee_submitted_at timestamptz null,
  add column if not exists area_manager_hr_employee_id uuid null references public.hr_employees(id) on delete set null,
  add column if not exists area_manager_name text null;

alter table public.inspection_runs drop constraint if exists inspection_runs_auditee_submission_status_check;
alter table public.inspection_runs
  add constraint inspection_runs_auditee_submission_status_check
  check (auditee_submission_status is null or auditee_submission_status in ('pending', 'submitted'));

-- Bring compliance_status in line with the 3-way rating (C/PC/NC) the app's
-- inspection_rating column already supports, plus NA.
alter table public.inspection_run_items drop constraint if exists inspection_run_items_compliance_status_check;
alter table public.inspection_run_items
  add constraint inspection_run_items_compliance_status_check
  check (compliance_status is null or compliance_status in ('C', 'PC', 'NC', 'NA'));

-- =========================
-- Audits: real section/sub-section model, 4-state compliance, HR employees
-- =========================
create table if not exists public.audit_sections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  audit_id uuid not null references public.audits(id) on delete cascade,
  parent_section_id uuid null references public.audit_sections(id) on delete cascade,
  section_order integer not null default 1,
  iso_clause text null,
  section_title text not null,
  created_by_user_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_audit_sections_audit on public.audit_sections(audit_id, section_order);

-- Note: live `audit_questions.section_id`/`subheading_id` (text, untracked,
-- unused anywhere in app code) are intentionally left alone; this adds a
-- proper typed FK instead of overloading those columns.
alter table public.audit_questions
  add column if not exists section_ref_id uuid null references public.audit_sections(id) on delete set null;

alter table public.audit_responses
  add column if not exists compliance_status text null,
  add column if not exists corrective_action_id uuid null references public.corrective_actions(id) on delete set null;

alter table public.audit_responses drop constraint if exists audit_responses_compliance_status_check;
alter table public.audit_responses
  add constraint audit_responses_compliance_status_check
  check (compliance_status is null or compliance_status in ('C', 'NC', 'Obs', 'N/A'));

alter table public.audits
  add column if not exists auditee_hr_employee_id uuid null references public.hr_employees(id) on delete set null,
  add column if not exists auditee_name text null,
  add column if not exists lead_auditor_hr_employee_id uuid null references public.hr_employees(id) on delete set null,
  add column if not exists lead_auditor_name text null,
  add column if not exists overall_score numeric null,
  add column if not exists max_score numeric null,
  add column if not exists compliance_percent numeric null;
