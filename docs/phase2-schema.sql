-- Safe Cloud Africa (IDSMP) - Phase 2 schema (InsForge / Postgres)
-- Multi-tenant (company-isolated) + role-based access.
--
-- Tables implemented in frontend services:
-- - companies
-- - company_memberships
-- - company_invites
-- - activity_logs
-- - incidents
-- - tasks
-- - corrective_actions (Phase 2 core system, can be enabled incrementally)
-- - documents (Phase 2 core system, can be enabled incrementally)
-- - form_templates (Phase 2 core system, manual builder + PDF upload; OCR deferred)
--
-- Notes:
-- - This file assumes UUIDs and `pgcrypto` for `gen_random_uuid()`.
-- - Adjust RLS helper functions to match your auth schema if needed.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Core tenant tables
-- ---------------------------------------------------------------------------

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  license_type text not null check (license_type in ('starter_6m','professional_12m','enterprise_custom')),
  employee_limit integer not null default 4,
  primary_admin_user_id uuid not null,
  metadata jsonb null,
  created_at timestamptz not null default now()
);

-- If `companies` already exists without metadata, apply this migration:
alter table public.companies
  add column if not exists metadata jsonb null;

-- Platform (global) admins (Super Admin):
-- Insert rows here manually for the user(s) who must access ALL companies.
create table if not exists public.platform_admins (
  user_id uuid primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null,
  -- Phase 2 RBAC (expandable)
  role text not null check (role in ('admin','manager','supervisor','consultant','employee','auditor')),
  created_at timestamptz not null default now(),
  unique (company_id, user_id)
);

create index if not exists idx_company_memberships_company on public.company_memberships(company_id);
create index if not exists idx_company_memberships_user on public.company_memberships(user_id);

-- ---------------------------------------------------------------------------
-- Tenant + role helpers
-- (Must be created AFTER `company_memberships` exists)
-- ---------------------------------------------------------------------------

-- Current request user id
-- InsForge uses PostgREST and sets JWT claims in `request.jwt.claim.*` settings.
-- Using this avoids relying on `auth.uid()` implementations that may differ by deployment.
create or replace function public.request_user_id()
returns uuid
language sql
stable
as $$
  with s as (
    select
      nullif(current_setting('request.jwt.claim.sub', true), '') as sub_setting,
      nullif(current_setting('request.jwt.claims', true), '') as claims_json
  ),
  c as (
    select
      sub_setting,
      case when claims_json is null then null else claims_json::jsonb end as claims
    from s
  )
  select coalesce(
    -- Primary: request.jwt.claim.sub
    case
      when sub_setting ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then sub_setting::uuid
      else null
    end,
    -- Fallbacks: request.jwt.claims JSON (varies by PostgREST configuration)
    case
      when (claims->>'sub') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (claims->>'sub')::uuid
      when (claims->>'user_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (claims->>'user_id')::uuid
      when (claims->>'uid') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (claims->>'uid')::uuid
      else null
    end
  )
  from c;
$$;

-- Current request user email (for invite self-acceptance)
create or replace function public.request_user_email()
returns text
language sql
stable
as $$
  with s as (
    select
      nullif(current_setting('request.jwt.claim.email', true), '') as email_setting,
      nullif(current_setting('request.jwt.claims', true), '') as claims_json
  ),
  c as (
    select
      email_setting,
      case when claims_json is null then null else claims_json::jsonb end as claims
    from s
  )
  select coalesce(
    nullif(email_setting, ''),
    nullif(claims->>'email', '')
  )
  from c;
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.platform_admins a
    where a.user_id = public.request_user_id()
  );
$$;

create or replace function public.is_company_primary_admin(p_company_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.companies c
    where c.id = p_company_id
      and c.primary_admin_user_id = public.request_user_id()
  );
$$;

create or replace function public.is_company_member(p_company_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.company_memberships m
    where m.company_id = p_company_id
      and m.user_id = public.request_user_id()
  );
$$;

create or replace function public.company_role(p_company_id uuid)
returns text
language sql
stable
as $$
  select m.role
  from public.company_memberships m
  where m.company_id = p_company_id
    and m.user_id = public.request_user_id()
  limit 1;
$$;

create or replace function public.is_company_admin(p_company_id uuid)
returns boolean
language sql
stable
as $$
  select public.company_role(p_company_id) = 'admin';
$$;

create or replace function public.is_company_manager(p_company_id uuid)
returns boolean
language sql
stable
as $$
  select public.company_role(p_company_id) in ('admin','manager');
$$;

create or replace function public.is_company_supervisor(p_company_id uuid)
returns boolean
language sql
stable
as $$
  select public.company_role(p_company_id) in ('admin','manager','supervisor');
$$;

create or replace function public.is_company_consultant(p_company_id uuid)
returns boolean
language sql
stable
as $$
  select public.company_role(p_company_id) = 'consultant';
$$;

create or replace function public.is_company_auditor(p_company_id uuid)
returns boolean
language sql
stable
as $$
  select public.company_role(p_company_id) = 'auditor';
$$;

create or replace function public.is_company_consultant_or_admin(p_company_id uuid)
returns boolean
language sql
stable
as $$
  -- Backwards-compatible helper name used by existing policies/services.
  -- Phase 2 intent: "management + consultant" can see company-wide data.
  select public.company_role(p_company_id) in ('admin','manager','supervisor','consultant');
$$;

create table if not exists public.company_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin','manager','supervisor','consultant','employee','auditor')),
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz null,
  accepted_user_id uuid null
);

-- ---------------------------------------------------------------------------
-- Phase 2 module tables (replace all mock data)
-- ---------------------------------------------------------------------------

-- Quality: Non-conformance reports (NCRs)
create table if not exists public.quality_ncrs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  module text not null default 'quality' check (module in ('quality')),
  site_id uuid null,
  
  -- NCR Identification
  nc_number text unique not null, -- Auto-generated
  title text not null,
  description text null,
  date_identified date null,
  
  -- NCR Details
  occurrence_date timestamptz not null default now(),
  location text null,
  department_id uuid null,
  process_involved text null,
  project_client text null,
  
  -- Non-Conformance Information
  activity_involved text null,
  responsible_role text null, -- Not blame, but role responsible
  linked_requirement text null, -- ISO/legal/internal
  risk_classification text null, -- 'critical', 'high', 'medium', 'low'
  risk_rating text null,
  ncr_type text null,
  ncr_category text null,
  requirement_reference_type text null,
  requirement_reference_text text null,
  
  -- Evidence (structured)
  evidence_document_url text null,
  evidence_documents jsonb null,
  evidence_photos jsonb null,
  evidence_interviews jsonb null,
  evidence_observations jsonb null,
  
  -- Root Cause & Corrective Actions
  root_cause text null,
  root_cause_categories jsonb null,
  corrective_action text null,
  corrective_action_owner_user_id uuid null,
  corrective_action_due_date timestamptz null,
  corrective_action_completed_date timestamptz null,
  progress_updates jsonb null,
  evidence_uploads jsonb null,
  
  -- Severity & Status
  severity text not null check (severity in ('critical','high','medium','low')) default 'medium',
  status text not null default 'open',
  
  -- Participants
  auditor_user_id uuid null,
  auditee_user_id uuid null,
  department_manager_user_id uuid null,
  
  -- Evidence & Signatures / Verification & Closure
  raised_by_user_id uuid null,
  approved_by_user_id uuid null,
  approved_at timestamptz null,
  signed_by_user_id uuid null,
  signed_at timestamptz null,
  manager_signoff_user_id uuid null,
  manager_signoff_at timestamptz null,
  manager_signoff_comment text null,
  manager_signature_method text null,
  auditor_verify_user_id uuid null,
  auditor_verify_at timestamptz null,
  effectiveness_verified boolean null,
  auditor_comment text null,
  effectiveness_check_date date null,
  closure_comments text null,
  date_closed date null,
  closed_at timestamptz null,
  closed_by_user_id uuid null,
  
  -- Linking to source entities
  source_entity_type text null, -- 'incident', 'audit', 'inspection', 'complaint', 'risk_assessment'
  source_entity_id uuid null,
  
  -- Reporting / computed fields
  linked_audit_score numeric null,
  previous_similar_ncr_ids text[] null,
  repeat_finding boolean null,
  risk_trend jsonb null,
  closure_time_days numeric null,
  auditor_name text null,
  company_representative_ack text null,
  reopen_reason text null,
  reopen_at timestamptz null,
  metadata jsonb null,
  
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ensure columns exist if table was created before
alter table if exists public.quality_ncrs
  add column if not exists site_id uuid,
  add column if not exists nc_number text unique,
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists date_identified date,
  add column if not exists occurrence_date timestamptz default now(),
  add column if not exists location text,
  add column if not exists department_id uuid,
  add column if not exists process_involved text,
  add column if not exists project_client text,
  add column if not exists activity_involved text,
  add column if not exists responsible_role text,
  add column if not exists linked_requirement text,
  add column if not exists risk_classification text,
  add column if not exists risk_rating text,
  add column if not exists ncr_type text,
  add column if not exists ncr_category text,
  add column if not exists requirement_reference_type text,
  add column if not exists requirement_reference_text text,
  add column if not exists evidence_document_url text,
  add column if not exists evidence_documents jsonb,
  add column if not exists evidence_photos jsonb,
  add column if not exists evidence_interviews jsonb,
  add column if not exists evidence_observations jsonb,
  add column if not exists root_cause text,
  add column if not exists root_cause_categories jsonb,
  add column if not exists corrective_action text,
  add column if not exists corrective_action_owner_user_id uuid,
  add column if not exists corrective_action_due_date timestamptz,
  add column if not exists corrective_action_completed_date timestamptz,
  add column if not exists progress_updates jsonb,
  add column if not exists evidence_uploads jsonb,
  add column if not exists severity text default 'medium',
  add column if not exists status text default 'open',
  add column if not exists auditor_user_id uuid,
  add column if not exists auditee_user_id uuid,
  add column if not exists department_manager_user_id uuid,
  add column if not exists raised_by_user_id uuid,
  add column if not exists approved_by_user_id uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists signed_by_user_id uuid,
  add column if not exists signed_at timestamptz,
  add column if not exists manager_signoff_user_id uuid,
  add column if not exists manager_signoff_at timestamptz,
  add column if not exists manager_signoff_comment text,
  add column if not exists manager_signature_method text,
  add column if not exists auditor_verify_user_id uuid,
  add column if not exists auditor_verify_at timestamptz,
  add column if not exists effectiveness_verified boolean,
  add column if not exists auditor_comment text,
  add column if not exists effectiveness_check_date date,
  add column if not exists closure_comments text,
  add column if not exists date_closed date,
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by_user_id uuid,
  add column if not exists source_entity_type text,
  add column if not exists source_entity_id uuid,
  add column if not exists linked_audit_score numeric,
  add column if not exists previous_similar_ncr_ids text[],
  add column if not exists repeat_finding boolean,
  add column if not exists risk_trend jsonb,
  add column if not exists closure_time_days numeric,
  add column if not exists auditor_name text,
  add column if not exists company_representative_ack text,
  add column if not exists reopen_reason text,
  add column if not exists reopen_at timestamptz,
  add column if not exists metadata jsonb,
  add column if not exists created_by_user_id uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create index if not exists idx_quality_ncrs_company on public.quality_ncrs(company_id, occurrence_date desc);
create index if not exists idx_quality_ncrs_number on public.quality_ncrs(nc_number);
create index if not exists idx_quality_ncrs_source on public.quality_ncrs(source_entity_type, source_entity_id);

-- Ensure expanded status lifecycle matches application workflow
alter table if exists public.quality_ncrs
  drop constraint if exists quality_ncrs_status_check;
alter table if exists public.quality_ncrs
  add constraint quality_ncrs_status_check
  check (
    status in (
      'open',
      'in-progress',
      'awaiting-evidence',
      'under-review',
      'approved',
      'overdue',
      'closed'
    )
  );

-- =========================
-- Audits (Phase 2 - Separate from Inspections)
-- =========================

create table if not exists public.audits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  module text not null check (module in ('safety','quality','environment','health','legal','hr','general','security')) default 'safety',
  
  -- Audit Identification
  audit_number text unique not null, -- Auto-generated
  title text not null,
  description text null,
  
  -- Audit Types
  audit_type text not null check (audit_type in ('internal', 'external', 'client', 'supplier', 'certification')),
  
  -- Audit Objectives
  objectives text null, -- compliance, performance, risk control, legal, certification readiness
  
  -- Scheduling
  proposed_dates text[] null, -- JSON array of proposed dates
  selected_date timestamptz null,
  approved_by_user_id uuid null,
  approved_at timestamptz null,
  
  -- Audit Criteria
  audit_criteria text null, -- ISO, legal, client, company procedures
  criteria_standards text[] null, -- e.g. ['ISO 9001', 'ISO 45001', 'Legal', 'Client', 'Other']
  
  -- Audit Team & Scope
  auditor_user_ids text[] null, -- JSON array
  scope_of_audit text null,
  location text null,
  departments_auditee_ids uuid[] null,
  company_representative_user_ids uuid[] null,
  
  -- Planning Inputs
  required_document_list jsonb null, -- required docs (types + custom)
  organogram_document_url text null,
  process_maps_document_url text null,
  procedures_policies_document_url text null,
  risk_assessments_document_url text null,
  legal_register_document_url text null,
  previous_audit_reports_document_url text null,
  incident_reports_document_url text null,
  training_records_document_url text null,
  permits_registers_document_url text null,
  client_requirements_document_url text null,
  
  -- Status
  status text not null check (
    status in (
      'draft',
      'scheduled',
      'awaiting-documents',
      'ready-for-audit',
      'in-progress',
      'report-pending',
      'corrective-actions-open',
      'under-closure-review',
      'completed',
      'archived',
      'reported' -- kept for backward compatibility
    )
  ) default 'draft',
  
  -- Results & Findings
  findings_count integer not null default 0,
  nonconformances_count integer not null default 0,
  observations_count integer not null default 0,
  
  -- Report
  report_document_url text null,
  report_submitted_at timestamptz null,
  
  -- Linking
  related_ncr_ids text[] null, -- JSON array of NCR IDs
  
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_audits_company on public.audits(company_id, selected_date desc);
create index if not exists idx_audits_number on public.audits(audit_number);
create index if not exists idx_audits_status on public.audits(company_id, status);

alter table public.audits enable row level security;

drop policy if exists audits_select_member on public.audits;
create policy audits_select_member
on public.audits for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists audits_write_management on public.audits;
create policy audits_write_management
on public.audits for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Audit questions (checklist items for audit)
create table if not exists public.audit_questions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  audit_id uuid not null references public.audits(id) on delete cascade,
  section text null,
  question text not null,
  expected_evidence text null,
  question_order integer not null,
  allocated_score numeric null,
  achieved_score numeric null,
  
  created_by_user_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_questions_audit on public.audit_questions(audit_id);

alter table public.audit_questions enable row level security;

drop policy if exists audit_questions_select_member on public.audit_questions;
create policy audit_questions_select_member
on public.audit_questions for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists audit_questions_write_management on public.audit_questions;
create policy audit_questions_write_management
on public.audit_questions for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Audit responses (answers to audit questions)
create table if not exists public.audit_responses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  audit_question_id uuid not null references public.audit_questions(id) on delete cascade,
  is_compliant boolean not null default false,
  finding text null,
  evidence_document_url text null,
  risk_rating text check (risk_rating in ('low', 'medium', 'high')),
  deviation_type text null check (
    deviation_type in ('observation','finding','non_conformance','opportunity_for_improvement')
  ),
  
  answered_by_user_id uuid not null,
  answered_at timestamptz not null default now()
);

create index if not exists idx_audit_responses_question on public.audit_responses(audit_question_id);

alter table public.audit_responses enable row level security;

drop policy if exists audit_responses_select_member on public.audit_responses;
create policy audit_responses_select_member
on public.audit_responses for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists audit_responses_write_management on public.audit_responses;
create policy audit_responses_write_management
on public.audit_responses for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- ---------- Audits module extensions (digital audit management) ----------
alter table public.audits
  add column if not exists document_submission_deadline timestamptz null,
  add column if not exists date_approval_status text null check (date_approval_status is null or date_approval_status in ('pending','approved','declined')),
  add column if not exists date_decline_reason text null,
  add column if not exists lead_auditor_user_id uuid null;

create table if not exists public.audit_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source_type text not null default 'googleDoc' check (source_type in ('googleDoc','manual')),
  google_doc_id text null,
  google_doc_url text null,
  name text not null,
  sections jsonb null,
  questions jsonb null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_audit_checklist_templates_company on public.audit_checklist_templates(company_id);
alter table public.audit_checklist_templates enable row level security;
drop policy if exists audit_checklist_templates_select_member on public.audit_checklist_templates;
create policy audit_checklist_templates_select_member on public.audit_checklist_templates for select
  using (public.is_company_member(company_id) or public.is_platform_admin());
drop policy if exists audit_checklist_templates_write_management on public.audit_checklist_templates;
create policy audit_checklist_templates_write_management on public.audit_checklist_templates for all
  using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
  with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

alter table public.audits add column if not exists checklist_template_id uuid null references public.audit_checklist_templates(id) on delete set null;

create table if not exists public.audit_pre_submissions (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  status text not null check (status in ('pending','submitted','late','approved_for_audit')) default 'pending',
  uploaded_docs jsonb null,
  missing_docs jsonb null,
  submitted_at timestamptz null,
  approved_for_audit_at timestamptz null,
  approved_by_user_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (audit_id)
);
create index if not exists idx_audit_pre_submissions_audit on public.audit_pre_submissions(audit_id);
alter table public.audit_pre_submissions enable row level security;
drop policy if exists audit_pre_submissions_select_member on public.audit_pre_submissions;
create policy audit_pre_submissions_select_member on public.audit_pre_submissions for select
  using (public.is_company_member(company_id) or public.is_platform_admin());
drop policy if exists audit_pre_submissions_write_member on public.audit_pre_submissions;
create policy audit_pre_submissions_write_member on public.audit_pre_submissions for all
  using (public.is_company_member(company_id) or public.is_platform_admin())
  with check (public.is_company_member(company_id) or public.is_platform_admin());

alter table public.audit_questions
  add column if not exists checklist_template_id uuid null references public.audit_checklist_templates(id) on delete set null,
  add column if not exists section_id text null,
  add column if not exists subheading_id text null;

alter table public.audit_responses
  add column if not exists allocated_score numeric null,
  add column if not exists achieved_score numeric null,
  add column if not exists evidence_files jsonb null;

create table if not exists public.audit_reports (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  generated_report_data jsonb not null,
  pdf_url text null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_reports_audit on public.audit_reports(audit_id);
alter table public.audit_reports enable row level security;
drop policy if exists audit_reports_select_member on public.audit_reports;
create policy audit_reports_select_member on public.audit_reports for select
  using (public.is_company_member(company_id) or public.is_platform_admin());
drop policy if exists audit_reports_insert_management on public.audit_reports;
create policy audit_reports_insert_management on public.audit_reports for insert
  with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());
-- ---------- end Audits module extensions ----------

create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  module text not null check (module in ('safety','quality','environment','health','legal','hr','general','security')) default 'safety',
  title text not null,
  checklist_name text null,
  status text not null check (status in ('scheduled','in-progress','completed','overdue')) default 'scheduled',
  scheduled_at timestamptz null,
  completed_at timestamptz null,
  -- Location & hierarchy
  location text null,
  site_id uuid null,
  department_id uuid null,
  -- Roles & participants
  inspector_user_id uuid null,
  auditor_user_id uuid null,
  auditee_user_id uuid null,
  -- Inspection method metadata
  inspection_method text null check (inspection_method in ('physical-observation','record-review','interview','other')) default 'physical-observation',
  inspection_date date null,
  findings_count integer not null default 0,
  nonconformances_count integer not null default 0,
  assignee_user_id uuid null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_inspections_company on public.inspections(company_id, scheduled_at desc);

-- Ensure newer metadata columns exist if table was created before
alter table if exists public.inspections
  add column if not exists site_id uuid,
  add column if not exists department_id uuid,
  add column if not exists inspector_user_id uuid,
  add column if not exists auditor_user_id uuid,
  add column if not exists auditee_user_id uuid,
  add column if not exists inspection_method text,
  add column if not exists inspection_date date;

-- Inspection checklist templates (reusable checklists for inspections)
create table if not exists public.inspection_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  module text not null check (module in ('safety','quality','environment','health','legal','hr','general','security')) default 'safety',
  name text not null,
  description text null,
  scope text not null check (scope in ('global','site','department')) default 'global',
  site_id uuid null,
  department_id uuid null,
  is_active boolean not null default true,
  -- Google Docs source & defaults
  google_doc_id text null,
  google_doc_url text null,
  default_sector text null,
  frequency text not null check (frequency in ('ad-hoc','daily','monthly','quarterly')) default 'ad-hoc',
  created_by_user_id uuid not null,
  updated_by_user_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_inspection_checklist_templates_company on public.inspection_checklist_templates(company_id, module, is_active);

alter table if exists public.inspection_checklist_templates
  add column if not exists google_doc_id text,
  add column if not exists google_doc_url text,
  add column if not exists default_sector text,
  add column if not exists frequency text default 'ad-hoc';

-- Individual items/questions within a checklist template
create table if not exists public.inspection_checklist_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  template_id uuid not null references public.inspection_checklist_templates(id) on delete cascade,
  item_order integer not null default 0,
  section text null,
  -- Specification alignment
  audit_section_or_category text null,
  question text not null,
  expected_evidence text null,
  requirement_reference text null,
  risk_area text null,
  default_risk_rating text null,
  default_nc_severity text null,
  inspection_method_default text null check (inspection_method_default in ('physical-observation','record-review','interview','other')),
  evidence_required_default boolean not null default false,
  risk_level_default text null check (risk_level_default in ('low','medium','high')),
  question_fingerprint text null,
  is_mandatory boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_inspection_checklist_items_template on public.inspection_checklist_items(template_id, item_order);

alter table if exists public.inspection_checklist_items
  add column if not exists audit_section_or_category text,
  add column if not exists requirement_reference text,
  add column if not exists inspection_method_default text,
  add column if not exists evidence_required_default boolean default false,
  add column if not exists risk_level_default text,
  add column if not exists question_fingerprint text;

-- Individual inspection runs (each execution of a checklist for an inspection)
create table if not exists public.inspection_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  template_id uuid not null references public.inspection_checklist_templates(id) on delete cascade,
  module text not null check (module in ('safety','quality','environment','health','legal','hr','general','security')) default 'safety',
  site_id uuid null,
  department_id uuid null,
  run_number integer not null default 1,
  started_at timestamptz null,
  completed_at timestamptz null,
  status text not null check (status in ('in-progress','completed','cancelled')) default 'in-progress',
  inspector_user_id uuid null,
   -- Auditee/self-assessment tracking
  auditee_user_id uuid null,
  auditee_submission_status text null check (auditee_submission_status in ('draft','submitted')),
  auditee_submitted_at timestamptz null,
  items_total integer not null default 0,
  items_nc integer not null default 0,
  ncrs_created_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_inspection_runs_inspection on public.inspection_runs(inspection_id, run_number);
create index if not exists idx_inspection_runs_company on public.inspection_runs(company_id, started_at desc);

-- Individual checklist items for a specific inspection run
create table if not exists public.inspection_run_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  run_id uuid not null references public.inspection_runs(id) on delete cascade,
  template_item_id uuid null references public.inspection_checklist_items(id) on delete set null,
  item_order integer not null default 0,
  section text null,
  question text not null,
  expected_evidence text null,
  risk_area text null,
  risk_rating text null,
  nc_severity text null,
  -- Rating & scoring
  compliance_status text not null check (compliance_status in ('C','NC','NA')) default 'C',
  inspection_rating text null check (inspection_rating in ('C','PC','NC')),
  score integer null,
  max_score integer null,
  -- Evidence & comments
  evidence_required boolean not null default false,
  evidence_notes text null,
  comments text null,
  auditor_comments text null,
  inspection_method text null check (inspection_method in ('physical-observation','record-review','interview','other')),
  evidence_document_url text null,
  photo_url text null,
  -- Risk and NC flags
  risk_level text null check (risk_level in ('low','medium','high')),
  nonconformance_flag boolean not null default false,
  corrective_action_required boolean not null default false,
  -- Responsibility & dates
  responsible_person_id uuid null,
  responsible_person_name text null,
  due_date date null,
  status text not null check (status in ('open','in-progress','awaiting-evidence','under-review','approved','closed','overdue')) default 'open',
  -- Linking & fingerprints
  question_fingerprint text null,
  auto_ncr_id uuid null references public.quality_ncrs(id) on delete set null,
  corrective_action_id uuid null references public.corrective_actions(id) on delete set null,
  -- Closure workflow
  closure_requested_at timestamptz null,
  closure_evidence_submitted_at timestamptz null,
  manager_approved_by_user_id uuid null,
  manager_approved_at timestamptz null,
  auditor_verified_by_user_id uuid null,
  auditor_verified_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_inspection_run_items_run on public.inspection_run_items(run_id, item_order);
create index if not exists idx_inspection_run_items_auto_ncr on public.inspection_run_items(auto_ncr_id);

alter table if exists public.inspection_run_items
  add column if not exists inspection_rating text,
  add column if not exists score integer,
  add column if not exists max_score integer,
  add column if not exists evidence_required boolean default false,
  add column if not exists evidence_notes text,
  add column if not exists auditor_comments text,
  add column if not exists inspection_method text,
  add column if not exists risk_level text,
  add column if not exists corrective_action_required boolean default false,
  add column if not exists responsible_person_id uuid,
  add column if not exists responsible_person_name text,
  add column if not exists due_date date,
  add column if not exists status text default 'open',
  add column if not exists question_fingerprint text,
  add column if not exists corrective_action_id uuid,
  add column if not exists closure_requested_at timestamptz,
  add column if not exists closure_evidence_submitted_at timestamptz,
  add column if not exists manager_approved_by_user_id uuid,
  add column if not exists manager_approved_at timestamptz,
  add column if not exists auditor_verified_by_user_id uuid,
  add column if not exists auditor_verified_at timestamptz;

-- Evidence uploads linked to individual checklist items
create table if not exists public.inspection_item_evidence (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  run_item_id uuid not null references public.inspection_run_items(id) on delete cascade,
  evidence_type text not null check (evidence_type in ('initial','closure')),
  file_url text not null,
  original_filename text null,
  mime_type text null,
  size_bytes bigint null,
  uploaded_by_user_id uuid not null,
  uploaded_at timestamptz not null default now(),
  description text null,
  metadata jsonb null
);

create index if not exists idx_inspection_item_evidence_item on public.inspection_item_evidence(run_item_id, uploaded_at desc);

-- Audit trail for checklist item changes
create table if not exists public.inspection_item_audit_trail (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  run_item_id uuid not null references public.inspection_run_items(id) on delete cascade,
  changed_by_user_id uuid not null,
  changed_at timestamptz not null default now(),
  change_type text null,
  from_values jsonb null,
  to_values jsonb null,
  change_reason text null
);

create index if not exists idx_inspection_item_audit_trail_item on public.inspection_item_audit_trail(run_item_id, changed_at desc);

-- Auditee submissions for self-assessments and uploads
create table if not exists public.inspection_auditee_submissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  run_id uuid not null references public.inspection_runs(id) on delete cascade,
  submitted_by_user_id uuid not null,
  submission_type text not null check (submission_type in ('self-assessment','document-upload','inspection-record')),
  status text not null check (status in ('draft','submitted')) default 'draft',
  created_at timestamptz not null default now(),
  submitted_at timestamptz null,
  updated_at timestamptz not null default now(),
  metadata jsonb null
);

create index if not exists idx_inspection_auditee_submissions_run on public.inspection_auditee_submissions(run_id, status);

-- Summaries for reporting/analytics
create table if not exists public.inspection_run_summaries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  run_id uuid not null references public.inspection_runs(id) on delete cascade,
  department_id uuid null,
  site_id uuid null,
  total_score integer not null default 0,
  max_score integer not null default 0,
  compliance_percent numeric(5,2) not null default 0,
  high_risk_count integer not null default 0,
  nc_count integer not null default 0,
  pc_count integer not null default 0,
  run_completed_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_inspection_run_summaries_company_dept on public.inspection_run_summaries(company_id, department_id, run_completed_at desc);

-- Risks: risk register / assessments
create table if not exists public.risks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  module text not null check (module in ('safety','quality','environment','health','legal','hr','general','security')) default 'safety',
  title text not null,
  description text null,
  hazard text null,
  controls text null,
  likelihood integer not null default 1,
  consequence integer not null default 1,
  risk_rating integer not null default 1,
  status text not null check (status in ('open','mitigated','closed')) default 'open',
  reviewed_at timestamptz null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_risks_company on public.risks(company_id, created_at desc);

-- Risk Assessments: Baseline and Task-based
create table if not exists public.risk_assessments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  assessment_type text not null check (assessment_type in ('baseline', 'task-based')),
  assessment_number text not null unique,
  title text not null,
  description text null,
  process_involved text null,
  department_id uuid null,
  location text null,
  scope text null,
  objective text null,
  task_id uuid null,
  task_name text null,
  task_steps text null,
  -- Critical/prework classification flags
  is_critical boolean not null default false,
  is_prework boolean not null default false,
  -- Source linkage (incident / NCR / change)
  source_entity_type text null,
  source_entity_id uuid null,
  status text not null check (status in ('draft', 'in-progress', 'reviewed', 'approved', 'closed')) default 'draft',
  assessment_date date null,
  reviewed_by_user_id uuid null,
  reviewed_at timestamptz null,
  approved_by_user_id uuid null,
  approved_at timestamptz null,
  total_risks integer not null default 0,
  high_risks integer not null default 0,
  medium_risks integer not null default 0,
  low_risks integer not null default 0,
  assessment_document_url text null,
  evidence_document_url text null,
  -- Review scheduling
  review_due_at timestamptz null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ensure new risk assessment columns exist on existing databases
alter table if exists public.risk_assessments
  add column if not exists is_critical boolean not null default false,
  add column if not exists is_prework boolean not null default false,
  add column if not exists source_entity_type text null,
  add column if not exists source_entity_id uuid null,
  add column if not exists review_due_at timestamptz null;

create index if not exists idx_risk_assessments_company on public.risk_assessments(company_id, assessment_date desc);
create index if not exists idx_risk_assessments_source on public.risk_assessments(source_entity_type, source_entity_id);
create index if not exists idx_risk_assessments_review_due on public.risk_assessments(review_due_at);
create index if not exists idx_risk_assessments_number on public.risk_assessments(assessment_number);

-- Risk Assessment Items (Hazards + Controls)
create table if not exists public.risk_assessment_items (
  id uuid primary key default gen_random_uuid(),
  risk_assessment_id uuid not null references public.risk_assessments(id) on delete cascade,
  hazard_description text not null,
  hazard_source text null,
  likelihood integer not null check (likelihood between 1 and 5),
  consequence integer not null check (consequence between 1 and 5),
  risk_rating integer not null,
  risk_level text not null check (risk_level in ('low', 'medium', 'high', 'critical')),
  affected_personnel text null,
  exposure_frequency text null,
  exposure_duration text null,
  existing_controls text null,
  control_effectiveness text null,
  residual_risk_rating integer null,
  residual_risk_level text null,
  improvement_actions text null,
  responsible_user_id uuid null,
  action_due_date date null,
  action_status text not null check (action_status in ('pending', 'in-progress', 'completed')) default 'pending',
  supporting_evidence_url text null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_risk_assessment_items_assessment on public.risk_assessment_items(risk_assessment_id);
create index if not exists idx_risk_assessment_items_level on public.risk_assessment_items(risk_assessment_id, risk_level);

-- RLS Policies for Risk Assessments (use is_company_member so no session variable is required)
alter table risk_assessments enable row level security;
drop policy if exists "risk_assessments_tenant_isolation" on public.risk_assessments;
create policy "risk_assessments_tenant_isolation" on public.risk_assessments
  for all using (public.is_company_member(company_id) or public.is_platform_admin());
alter table risk_assessment_items enable row level security;
drop policy if exists "risk_assessment_items_isolation" on public.risk_assessment_items;
create policy "risk_assessment_items_isolation" on public.risk_assessment_items
  for all using (
    risk_assessment_id in (
      select id from public.risk_assessments ra
      where public.is_company_member(ra.company_id) or public.is_platform_admin()
    )
  );

-- ---------------------------------------------------------------------------
-- Risk Assessment Module (Phase 2 full spec): settings, extended tables, junctions, versioning, signatures
-- ---------------------------------------------------------------------------

-- Risk index thresholds (configurable per company): RR <= low_max -> Low, RR <= medium_max -> Medium, else High
create table if not exists public.risk_assessment_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  key text not null,
  value numeric not null,
  created_at timestamptz not null default now(),
  unique(company_id, key)
);
create index if not exists idx_risk_assessment_settings_company on public.risk_assessment_settings(company_id);

-- Default threshold seeds (optional; app can use 6 and 15 if no row)
-- insert defaults per company on first use or via migration

-- Extend risk_assessments: assessment_type (baseline, task, critical_task, pre_work), status (review_required etc), area/activity, personnel, dates
alter table public.risk_assessments
  add column if not exists area_location text null,
  add column if not exists activity_process_operation text null,
  add column if not exists last_approved_at timestamptz null,
  add column if not exists next_review_date date null,
  add column if not exists reference text null,
  add column if not exists risk_assessor_user_id uuid null,
  add column if not exists risk_assessor_name text null,
  add column if not exists responsible_personnel_user_id uuid null,
  add column if not exists responsible_personnel_name text null,
  add column if not exists target_date date null,
  add column if not exists completion_date date null;

-- Allow new assessment types and statuses (keep task-based for backward compat)
alter table public.risk_assessments drop constraint if exists risk_assessments_assessment_type_check;
alter table public.risk_assessments add constraint risk_assessments_assessment_type_check
  check (assessment_type in ('baseline','task','task-based','critical_task','pre_work'));

alter table public.risk_assessments drop constraint if exists risk_assessments_status_check;
alter table public.risk_assessments add constraint risk_assessments_status_check
  check (status in ('draft','in-progress','reviewed','approved','closed','active','review_required','under_review','archived'));

create index if not exists idx_risk_assessments_status on public.risk_assessments(company_id, status);
create index if not exists idx_risk_assessments_next_review on public.risk_assessments(company_id, next_review_date);

-- Junction: many-to-many risk assessment <-> incidents
create table if not exists public.risk_assessment_incidents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  risk_assessment_id uuid not null references public.risk_assessments(id) on delete cascade,
  incident_id uuid not null references public.incidents(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(risk_assessment_id, incident_id)
);
create index if not exists idx_ra_incidents_ra on public.risk_assessment_incidents(risk_assessment_id);
create index if not exists idx_ra_incidents_incident on public.risk_assessment_incidents(incident_id);

-- Junction: risk assessment <-> NCRs
create table if not exists public.risk_assessment_ncrs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  risk_assessment_id uuid not null references public.risk_assessments(id) on delete cascade,
  ncr_id uuid not null references public.quality_ncrs(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(risk_assessment_id, ncr_id)
);
create index if not exists idx_ra_ncrs_ra on public.risk_assessment_ncrs(risk_assessment_id);
create index if not exists idx_ra_ncrs_ncr on public.risk_assessment_ncrs(ncr_id);

-- Change triggers (manual "change in operation/activity")
create table if not exists public.risk_assessment_change_triggers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  risk_assessment_id uuid null references public.risk_assessments(id) on delete set null,
  area_location text null,
  activity_process_operation text null,
  description text not null,
  requested_by_user_id uuid not null,
  status text not null check (status in ('open','closed')) default 'open',
  created_at timestamptz not null default now()
);
create index if not exists idx_ra_change_triggers_company on public.risk_assessment_change_triggers(company_id);
create index if not exists idx_ra_change_triggers_ra on public.risk_assessment_change_triggers(risk_assessment_id);

-- Signatures / approvals (Pre-work + optional approvals)
create table if not exists public.risk_assessment_signatures (
  id uuid primary key default gen_random_uuid(),
  risk_assessment_id uuid not null references public.risk_assessments(id) on delete cascade,
  pre_work_instance_id uuid null,
  signer_user_id uuid not null,
  signer_name text null,
  role text not null check (role in ('Employee','Supervisor')),
  signed_at timestamptz not null default now(),
  signature_method text null,
  comment text null
);
create index if not exists idx_ra_signatures_ra on public.risk_assessment_signatures(risk_assessment_id);

-- Pre-work daily instances (each instance = one day, one assessment, list of employees + supervisor sign-off)
create table if not exists public.pre_work_instances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  risk_assessment_id uuid not null references public.risk_assessments(id) on delete cascade,
  instance_date date not null,
  supervisor_signed_at timestamptz null,
  supervisor_user_id uuid null,
  created_at timestamptz not null default now(),
  unique(risk_assessment_id, instance_date)
);
create index if not exists idx_pre_work_instances_ra on public.pre_work_instances(risk_assessment_id);
create index if not exists idx_pre_work_instances_date on public.pre_work_instances(company_id, instance_date);

alter table public.risk_assessment_signatures
  add column if not exists pre_work_instance_id uuid null;
alter table public.risk_assessment_signatures
  drop constraint if exists risk_assessment_signatures_pre_work_instance_id_fkey;
alter table public.risk_assessment_signatures
  add constraint risk_assessment_signatures_pre_work_instance_id_fkey
  foreign key (pre_work_instance_id) references public.pre_work_instances(id) on delete set null;

-- Versioning: snapshot of assessment + items when "Review & Update" is done
create table if not exists public.risk_assessment_versions (
  id uuid primary key default gen_random_uuid(),
  risk_assessment_id uuid not null references public.risk_assessments(id) on delete cascade,
  version_number integer not null,
  snapshot jsonb not null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_ra_versions_ra on public.risk_assessment_versions(risk_assessment_id);

-- Extend risk_assessment_items: S/L/RR/risk_index, residual, type_of_risk, spec fields (keep existing columns for backward compat)
alter table public.risk_assessment_items
  add column if not exists hazard text null,
  add column if not exists aspect_hazard_flaw text null,
  add column if not exists potential_risk text null,
  add column if not exists risk text null,
  add column if not exists who_is_at_risk text null,
  add column if not exists type_of_risk text null check (type_of_risk is null or type_of_risk in ('Safety','Health','Environmental','Quality','Operational','Financial')),
  add column if not exists severity_s integer null check (severity_s is null or (severity_s between 1 and 5)),
  add column if not exists likelihood_l integer null check (likelihood_l is null or (likelihood_l between 1 and 5)),
  add column if not exists raw_risk_rating_rr integer null,
  add column if not exists risk_index text null check (risk_index is null or risk_index in ('Low','Medium','High')),
  add column if not exists residual_severity_s integer null check (residual_severity_s is null or (residual_severity_s between 1 and 5)),
  add column if not exists residual_likelihood_l integer null check (residual_likelihood_l is null or (residual_likelihood_l between 1 and 5)),
  add column if not exists residual_rr integer null,
  add column if not exists residual_risk_index text null check (residual_risk_index is null or residual_risk_index in ('Low','Medium','High')),
  add column if not exists additional_controls text null,
  add column if not exists current_year_non_conformances text null,
  add column if not exists current_year_ncr_ids jsonb null,
  add column if not exists by_who text null,
  add column if not exists by_when date null,
  add column if not exists responsible_person text null,
  add column if not exists due_date date null,
  add column if not exists evidence_uploads jsonb null;

-- Incidents: add area and activity for risk assessment matching
alter table public.incidents
  add column if not exists area text null,
  add column if not exists activity text null;

-- RLS for new risk assessment tables
alter table public.risk_assessment_settings enable row level security;
drop policy if exists ra_settings_tenant on public.risk_assessment_settings;
create policy ra_settings_tenant on public.risk_assessment_settings
  for all using (public.is_company_member(company_id) or public.is_platform_admin());

alter table public.risk_assessment_incidents enable row level security;
drop policy if exists ra_incidents_tenant on public.risk_assessment_incidents;
create policy ra_incidents_tenant on public.risk_assessment_incidents
  for all using (public.is_company_member(company_id) or public.is_platform_admin());

alter table public.risk_assessment_ncrs enable row level security;
drop policy if exists ra_ncrs_tenant on public.risk_assessment_ncrs;
create policy ra_ncrs_tenant on public.risk_assessment_ncrs
  for all using (public.is_company_member(company_id) or public.is_platform_admin());

alter table public.risk_assessment_change_triggers enable row level security;
drop policy if exists ra_change_triggers_tenant on public.risk_assessment_change_triggers;
create policy ra_change_triggers_tenant on public.risk_assessment_change_triggers
  for all using (public.is_company_member(company_id) or public.is_platform_admin());

alter table public.risk_assessment_signatures enable row level security;
drop policy if exists ra_signatures_via_ra on public.risk_assessment_signatures;
create policy ra_signatures_via_ra on public.risk_assessment_signatures
  for all using (
    risk_assessment_id in (select id from public.risk_assessments ra where public.is_company_member(ra.company_id) or public.is_platform_admin())
  );

alter table public.pre_work_instances enable row level security;
drop policy if exists pre_work_instances_tenant on public.pre_work_instances;
create policy pre_work_instances_tenant on public.pre_work_instances
  for all using (public.is_company_member(company_id) or public.is_platform_admin());

alter table public.risk_assessment_versions enable row level security;
drop policy if exists ra_versions_via_ra on public.risk_assessment_versions;
create policy ra_versions_via_ra on public.risk_assessment_versions
  for all using (
    risk_assessment_id in (select id from public.risk_assessments ra where public.is_company_member(ra.company_id) or public.is_platform_admin())
  );

-- Corrective Actions: Link NCRs, Risk Assessments, and Incidents to corrective/preventive tasks
create table if not exists public.corrective_actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  action_number text not null unique,
  title text not null,
  description text null,
  action_type text not null check (action_type in ('corrective', 'preventive')) default 'corrective',
  source_type text not null check (source_type in ('ncr', 'risk_assessment', 'incident', 'audit', 'observation','inspection')),
  source_id uuid not null,
  status text not null check (status in ('open', 'assigned', 'in-progress', 'completed', 'verified', 'closed')) default 'open',
  priority text not null check (priority in ('low', 'medium', 'high', 'urgent')) default 'medium',
  assigned_to_user_id uuid null,
  created_date date null,
  due_date date not null,
  completed_date date null,
  verified_date date null,
  verified_by_user_id uuid null,
  root_cause text null,
  proposed_solution text null,
  effectiveness_check text null,
  evidence_url text null,
  linked_task_id uuid null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ensure all columns exist if table was created before
alter table if exists public.corrective_actions
  add column if not exists action_number text unique,
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists action_type text default 'corrective',
  add column if not exists source_type text,
  add column if not exists source_id uuid,
  add column if not exists status text default 'open',
  add column if not exists priority text default 'medium',
  add column if not exists assigned_to_user_id uuid,
  add column if not exists created_date date,
  add column if not exists due_date date,
  add column if not exists completed_date date,
  add column if not exists verified_date date,
  add column if not exists verified_by_user_id uuid,
  add column if not exists root_cause text,
  add column if not exists proposed_solution text,
  add column if not exists effectiveness_check text,
  add column if not exists evidence_url text,
  add column if not exists linked_task_id uuid,
  add column if not exists created_by_user_id uuid,
  add column if not exists updated_at timestamptz default now();

-- Ensure source_type constraint allows inspection linkage
alter table if exists public.corrective_actions
  drop constraint if exists corrective_actions_source_type_check,
  add constraint corrective_actions_source_type_check
    check (source_type in ('ncr', 'risk_assessment', 'incident', 'audit', 'observation','inspection'));

create index if not exists idx_corrective_actions_company on public.corrective_actions(company_id, status);
create index if not exists idx_corrective_actions_number on public.corrective_actions(action_number);
create index if not exists idx_corrective_actions_source on public.corrective_actions(source_type, source_id);
create index if not exists idx_corrective_actions_assigned on public.corrective_actions(assigned_to_user_id, status);
create index if not exists idx_corrective_actions_due on public.corrective_actions(due_date, status);

-- RLS for Corrective Actions (use is_company_member so no session variable is required)
alter table corrective_actions enable row level security;
drop policy if exists "corrective_actions_tenant_isolation" on public.corrective_actions;
create policy "corrective_actions_tenant_isolation" on public.corrective_actions
  for all using (public.is_company_member(company_id) or public.is_platform_admin());

-- PPE: simple register + issue/return tracking
create table if not exists public.ppe_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  category text null,
  unit_cost numeric null,
  created_at timestamptz not null default now()
);
create index if not exists idx_ppe_items_company on public.ppe_items(company_id);

create table if not exists public.ppe_issues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ppe_item_id uuid not null references public.ppe_items(id) on delete cascade,
  issued_to_user_id uuid null,
  issued_by_user_id uuid not null,
  issued_at timestamptz not null default now(),
  next_issue_at timestamptz null,
  return_due_at timestamptz null,
  returned_at timestamptz null,
  notes text null
);
create index if not exists idx_ppe_issues_company on public.ppe_issues(company_id, issued_at desc);

-- PPE Issue Tracker (non-compliance, damaged/expired PPE, incorrect use, etc.)
create table if not exists public.ppe_issue_tracker (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,

  -- General Information
  date_reported timestamptz not null default now(),
  reported_by_user_id uuid not null,
  reported_by_name text null,
  department_id uuid null,
  department_name_text text null,
  site_id uuid null,
  site_name_text text null,
  contractor_or_employee_name text null,
  employee_number text null,
  job_role_or_task text null,
  supervisor_user_id uuid null,
  supervisor_name_text text null,

  -- PPE Issue Details
  ppe_type text not null check (
    ppe_type in (
      'helmet',
      'gloves',
      'safety_boots',
      'eye_protection',
      'hearing_protection',
      'respirator_mask',
      'reflective_vest',
      'chainsaw_ppe',
      'chemical_ppe',
      'other'
    )
  ),
  ppe_type_other text null,
  issue_category text not null check (
    issue_category in (
      'missing_ppe',
      'damaged_ppe',
      'expired_ppe',
      'incorrect_ppe',
      'ppe_not_worn',
      'poor_condition',
      'insufficient_supply',
      'non_approved_ppe'
    )
  ),
  description_of_issue text not null,
  risk_level text not null check (risk_level in ('low','medium','high','critical')),

  -- Immediate Action Taken
  immediate_work_stopped boolean not null default false,
  immediate_ppe_issued boolean not null default false,
  immediate_employee_removed boolean not null default false,
  immediate_toolbox_talk boolean not null default false,
  immediate_supervisor_notified boolean not null default false,
  immediate_action_notes text null,

  -- Evidence & Inspection Links
  inspection_reference_text text null,
  audit_id uuid null references public.audits(id) on delete set null,
  pjo_id uuid null references public.pjo_observations(id) on delete set null,
  checklist_instance_id uuid null,
  checklist_item_id uuid null,
  witness_interview_notes text null,

  -- Corrective Action Management
  corrective_action_required boolean not null default false,
  responsible_user_id uuid null,
  responsible_user_name text null,
  corrective_department_id uuid null,
  corrective_department_name text null,
  target_completion_date date null,
  replacement_ppe_issued boolean not null default false,
  training_required boolean not null default false,
  disciplinary_action text null,

  -- Progress Tracking
  status text not null check (
    status in (
      'open',
      'in_progress',
      'awaiting_ppe',
      'awaiting_training',
      'awaiting_evidence',
      'under_review',
      'closed',
      'overdue'
    )
  ) default 'open',
  progress_updates jsonb not null default '[]'::jsonb,
  follow_up_inspection_date date null,

  -- Closure & Verification
  department_manager_user_id uuid null,
  department_manager_signed_at timestamptz null,
  department_manager_signature_method text null,
  department_manager_comment text null,
  safety_officer_user_id uuid null,
  safety_officer_verified_at timestamptz null,
  safety_officer_comment text null,
  auditor_user_id uuid null,
  auditor_confirmed_at timestamptz null,
  auditor_comment text null,
  closure_date timestamptz null,
  effectiveness_verified boolean null,
  repeat_issue_indicator boolean null,
  source_requires_auditor_confirmation boolean null,

  -- Optional links to PPE inventory / items
  ppe_item_id uuid null references public.ppe_items(id) on delete set null,
  stock_id uuid null references public.ppe_stock(id) on delete set null,

  created_by_user_id uuid not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_ppe_issue_tracker_company_status
on public.ppe_issue_tracker(company_id, status, date_reported desc);

create index if not exists idx_ppe_issue_tracker_location
on public.ppe_issue_tracker(company_id, site_id, department_id, risk_level);

-- PPE stock inventory per site + department
create table if not exists public.ppe_stock (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  site_id uuid null,
  department_id uuid null,
  ppe_item_id uuid not null references public.ppe_items(id) on delete cascade,
  on_hand_qty integer not null default 0,
  reserved_qty integer not null default 0,
  reorder_level integer not null default 0,
  reorder_qty integer not null default 0,
  is_active boolean not null default true,
  created_by_user_id uuid not null,
  updated_by_user_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, site_id, department_id, ppe_item_id)
);

create index if not exists idx_ppe_stock_company_item on public.ppe_stock(company_id, ppe_item_id);
create index if not exists idx_ppe_stock_location on public.ppe_stock(company_id, site_id, department_id);

-- PPE stock movements (in/out/adjust/return)
create table if not exists public.ppe_stock_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  stock_id uuid not null references public.ppe_stock(id) on delete cascade,
  movement_type text not null check (movement_type in ('in','out','adjust','return')),
  quantity integer not null check (quantity > 0),
  reason text null,
  reference_type text null,
  reference_id uuid null,
  ppe_issue_id uuid null references public.ppe_issues(id) on delete set null,
  old_on_hand_qty integer null,
  new_on_hand_qty integer null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ppe_stock_movements_stock on public.ppe_stock_movements(stock_id, created_at desc);
create index if not exists idx_ppe_stock_movements_company on public.ppe_stock_movements(company_id, created_at desc);

-- PPE reorder requests for stock below reorder levels
create table if not exists public.ppe_reorder_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  stock_id uuid not null references public.ppe_stock(id) on delete cascade,
  requested_qty integer not null check (requested_qty > 0),
  reason text null,
  status text not null check (status in ('draft','requested','approved','rejected','ordered','received')) default 'requested',
  requested_by_user_id uuid not null,
  approved_by_user_id uuid null,
  approved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ppe_reorder_requests_company on public.ppe_reorder_requests(company_id, status, created_at desc);
create index if not exists idx_ppe_reorder_requests_stock on public.ppe_reorder_requests(stock_id, created_at desc);

-- Link PPE issues to multiple NCRs (quality_ncrs)
create table if not exists public.ppe_issue_ncr_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ppe_issue_id uuid not null references public.ppe_issues(id) on delete cascade,
  ncr_id uuid not null references public.quality_ncrs(id) on delete cascade,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (company_id, ppe_issue_id, ncr_id)
);

create index if not exists idx_ppe_issue_ncr_links_issue on public.ppe_issue_ncr_links(company_id, ppe_issue_id);
create index if not exists idx_ppe_issue_ncr_links_ncr on public.ppe_issue_ncr_links(company_id, ncr_id);

-- Link PPE issues to multiple CAPA / corrective actions
create table if not exists public.ppe_issue_capa_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ppe_issue_id uuid not null references public.ppe_issues(id) on delete cascade,
  corrective_action_id uuid not null references public.corrective_actions(id) on delete cascade,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (company_id, ppe_issue_id, corrective_action_id)
);

create index if not exists idx_ppe_issue_capa_links_issue on public.ppe_issue_capa_links(company_id, ppe_issue_id);
create index if not exists idx_ppe_issue_capa_links_capa on public.ppe_issue_capa_links(company_id, corrective_action_id);

-- Environment: aspects register
create table if not exists public.environment_aspects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  aspect text not null,
  impact text not null,
  controls text null,
  status text not null check (status in ('active','closed')) default 'active',
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_environment_aspects_company on public.environment_aspects(company_id, created_at desc);

-- Environment: monitoring records (water, air, waste, etc.)
create table if not exists public.environment_monitoring (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  type text not null, -- e.g. Water Monitoring, Air Quality
  location text null,
  result text not null, -- e.g. Within limits / Exceeded
  measured_at timestamptz not null default now(),
  created_by_user_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_environment_monitoring_company on public.environment_monitoring(company_id, measured_at desc);

-- Legal & Compliance: legal requirements register
create table if not exists public.legal_requirements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  module text not null default 'legal' check (module in ('legal')),
  requirement text not null,
  reference text null,
  status text not null check (status in ('compliant','non-compliant','in-progress')) default 'in-progress',
  evidence_bucket text null,
  evidence_key text null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_legal_requirements_company on public.legal_requirements(company_id, created_at desc);

-- Training: courses + records + role requirements
create table if not exists public.training_courses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text null,
  valid_months integer null,
  created_at timestamptz not null default now()
);
create index if not exists idx_training_courses_company on public.training_courses(company_id);

create table if not exists public.training_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null,
  course_id uuid not null references public.training_courses(id) on delete cascade,
  completed_at timestamptz not null default now(),
  expires_at timestamptz null,
  certificate_bucket text null,
  certificate_key text null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_training_records_company on public.training_records(company_id, completed_at desc);
create index if not exists idx_training_records_user on public.training_records(company_id, user_id);

-- Health: medical certificates (fitness/medical schedules baseline)
create table if not exists public.medical_certificates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null,
  certificate_type text not null, -- e.g. Fitness, Medical, Hearing, Vision
  issued_at timestamptz not null default now(),
  expires_at timestamptz null,
  status text not null check (status in ('valid','expiring','expired')) default 'valid',
  certificate_bucket text null,
  certificate_key text null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_medical_certificates_company on public.medical_certificates(company_id, expires_at asc);

-- Notifications (in-app)
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null,
  title text not null,
  message text not null,
  severity text not null check (severity in ('critical','high','medium','low')) default 'medium',
  read_at timestamptz null,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_user on public.notifications(company_id, user_id, created_at desc);

-- Module targets/objectives (drives Safety Objectives, Environmental Targets, etc.)
create table if not exists public.module_targets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  module text not null check (module in ('safety','hr','legal','quality','health','environment','general','security')),
  name text not null,
  current_value numeric not null default 0,
  target_value numeric not null default 0,
  unit text null, -- e.g. %, count, days
  achieved boolean not null default false,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_module_targets_company on public.module_targets(company_id, module, updated_at desc);

-- Planning & performance review: plans + KPIs
create table if not exists public.planning_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  period text not null check (period in ('annual','quarterly','monthly')),
  status text not null check (status in ('draft','active','complete')) default 'draft',
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_planning_plans_company on public.planning_plans(company_id, updated_at desc);

create table if not exists public.planning_kpis (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  plan_id uuid not null references public.planning_plans(id) on delete cascade,
  name text not null,
  current_value numeric not null default 0,
  target_value numeric not null default 0,
  unit text null,
  status text not null check (status in ('on-track','at-risk','behind')) default 'on-track',
  created_at timestamptz not null default now()
);
create index if not exists idx_planning_kpis_company on public.planning_kpis(company_id, plan_id);

-- HR KPIs (employee/project performance with close-out)
create table if not exists public.hr_kpis (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kpi_title text not null,
  assessment_type text not null check (assessment_type in ('employee','project')),
  employee_user_id uuid null,
  project_ref text null,
  manager_user_id uuid not null,
  importance text not null check (importance in ('low','medium','high')) default 'medium',
  target_value_numeric numeric null,
  target_value_text text null,
  actual_value_numeric numeric null,
  actual_value_text text null,
  achieved boolean null,
  employee_self_rating integer null check (employee_self_rating between 1 and 5),
  manager_rating integer null check (manager_rating between 1 and 5),
  manager_remarks text null,
  employee_comments text null,
  period_start date null,
  period_end date null,
  linked_task_id uuid null references public.tasks(id) on delete set null,
  closure_evidence_url text null,
  closed_out_at timestamptz null,
  closed_out_by_user_id uuid null,
  performance_bonus_score numeric null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_hr_kpis_company on public.hr_kpis(company_id, assessment_type, created_at desc);

-- Approvals & signatures (Phase 2 baseline)
create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  entity_type text not null, -- e.g. document, risk, corrective_action, plan
  entity_id uuid not null,
  requested_by_user_id uuid not null,
  approver_user_id uuid not null,
  status text not null check (status in ('pending','approved','rejected')) default 'pending',
  signed_at timestamptz null,
  signature_note text null,
  created_at timestamptz not null default now()
);
create index if not exists idx_approvals_company on public.approvals(company_id, created_at desc);
create index if not exists idx_approvals_approver on public.approvals(company_id, approver_user_id, created_at desc);

-- Continuous improvement actions
create table if not exists public.improvement_actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  module text not null check (module in ('safety','hr','legal','quality','health','environment','general','security')) default 'general',
  title text not null,
  description text null,
  owner_user_id uuid null,
  status text not null check (status in ('planned','active','complete')) default 'planned',
  target_date timestamptz null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_improvement_actions_company on public.improvement_actions(company_id, updated_at desc);

create index if not exists idx_company_invites_company on public.company_invites(company_id);
create index if not exists idx_company_invites_email on public.company_invites(lower(email));

-- ---------------------------------------------------------------------------
-- Global audit trail (CRITICAL for consultant actions)
-- ---------------------------------------------------------------------------

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_user_id uuid not null,
  action text not null,
  entity_type text null,
  entity_id uuid null,
  metadata jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists idx_activity_logs_company on public.activity_logs(company_id, created_at desc);
create index if not exists idx_activity_logs_actor on public.activity_logs(actor_user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Incidents (Phase 2 focus: Safety/HR/Legal)
-- ---------------------------------------------------------------------------

create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  module text not null check (module in ('safety','hr','legal','quality','health','environment','general','security')),
  category text not null,
  subcategory text not null,
  title text not null,
  description text null,
  severity text not null check (severity in ('critical','high','medium','low')),
  status text not null check (status in ('open','investigating','closed')) default 'open',
  occurred_at timestamptz not null default now(),
  location text null,
  
  -- Full incident form fields (Phase 2 enhancement)
  project_client text null,
  nature_of_incident text null,
  cause_of_incident text null,
  affected_person text null,
  loss_type text null, -- 'Production', 'Financial', 'Reputational'
  risk_level text null, -- 'critical', 'high', 'medium', 'low'
  reported_by_user_id uuid null,
  reported_to_user_id uuid null,
  copy_to_user_ids text[] null, -- JSON array of user IDs
  investigation_required boolean not null default false,
  
  -- Investigation fields (expanded when investigation_required = true)
  risk text null,
  risk_profile text null,
  incident_timeline text null,
  unsafe_acts text null,
  unsafe_conditions text null,
  root_cause_human text null,
  root_cause_workplace text null,
  system_failure text null,
  corrective_actions text null,
  lessons_learnt text null,
  investigation_team_user_ids text[] null, -- JSON array
  conclusion text null,
  investigation_document_url text null,
  
  assignee_user_id uuid null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_incidents_company on public.incidents(company_id, occurred_at desc);
create index if not exists idx_incidents_assignee on public.incidents(company_id, assignee_user_id);
create index if not exists idx_incidents_creator on public.incidents(company_id, created_by_user_id);

-- Add new columns for enhanced incident management
alter table public.incidents
  add column if not exists incident_type text null,
  add column if not exists type_of_incident text null,
  add column if not exists category_id uuid null,
  add column if not exists category_name text null,
  add column if not exists subcategory_id uuid null,
  add column if not exists subcategory_name text null,
  add column if not exists subcategory_custom_text text null,
  add column if not exists affected_person_id uuid null,
  add column if not exists affected_person_name text null,
  add column if not exists loss_types text[] null,
  add column if not exists loss_production_value numeric null,
  add column if not exists loss_financial_value numeric null,
  add column if not exists risk_category text null check (risk_category is null or risk_category in ('Low', 'Medium', 'High')),
  add column if not exists reported_to_user_ids uuid[] null,
  add column if not exists copy_to_emails text[] null,
  add column if not exists instruction_breakdown text null,
  add column if not exists task_sequence text null,
  add column if not exists consequence text null,
  add column if not exists incident_event_timelines jsonb null,
  add column if not exists immediate_causes_unsafe_acts jsonb null,
  add column if not exists immediate_causes_unsafe_conditions jsonb null,
  add column if not exists root_cause_human_factors jsonb null,
  add column if not exists root_cause_workplace_factors jsonb null,
  add column if not exists system_failure jsonb null,
  add column if not exists contributing_factors text null,
  add column if not exists contributing_factor_tags text[] null,
  add column if not exists prepared_by_user_id uuid null,
  add column if not exists distributions_to_user_ids uuid[] null,
  add column if not exists distributions_to_emails text[] null;

-- Incident Categories & Subcategories (normalized lookup tables for future admin management)
create table if not exists public.incident_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(company_id, name)
);

create table if not exists public.incident_subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.incident_categories(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(category_id, name)
);

create index if not exists idx_incident_categories_company on public.incident_categories(company_id, display_order);
create index if not exists idx_incident_subcategories_category on public.incident_subcategories(category_id, display_order);

-- Incident Corrective Actions table
create table if not exists public.incident_corrective_actions (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  action_title text not null,
  action_description text null,
  owner_user_id uuid null,
  due_date date null,
  status text not null check (status in ('Open', 'In Progress', 'Awaiting Evidence', 'Under Review', 'Closed')) default 'Open',
  evidence_document_urls text[] null,
  closure_notes text null,
  manager_approval_user_id uuid null,
  manager_approval_at timestamptz null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_incident_corrective_actions_incident on public.incident_corrective_actions(incident_id, created_at desc);
create index if not exists idx_incident_corrective_actions_company on public.incident_corrective_actions(company_id);
create index if not exists idx_incident_corrective_actions_owner on public.incident_corrective_actions(company_id, owner_user_id);

-- ---------------------------------------------------------------------------
-- Tasks (Phase 2 shared system)
-- ---------------------------------------------------------------------------

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  module text not null check (module in ('safety','hr','legal','quality','health','environment','general','security')),
  title text not null,
  description text null,
  category text null check (
    category in (
      'audit_action',
      'capa',
      'inspection',
      'ppe_issue',
      'safety_action',
      'env_action',
      'quality_action',
      'project_task',
      'maintenance',
      'training',
      'kpi_follow_up'
    )
  ),
  risk_level text null check (risk_level in ('low','medium','high','critical')),
  priority text not null check (priority in ('critical','high','medium','low')) default 'medium',
  status text not null check (
    status in (
      'draft',
      'assigned',
      'accepted',
      'in-progress',
      'awaiting-evidence',
      'under-review',
      'approved',
      'closed',
      'reopened',
      'overdue'
    )
  ) default 'draft',
  site_id uuid null,
  department_id uuid null,
  project_ref text null,
  task_owner_user_id uuid null,
  allocated_by_user_id uuid null,
  supporting_team_user_ids uuid[] null,
  source_entity_type text null, -- e.g. 'audit','ncr','incident','inspection','ppe_issue','kpi','risk_assessment'
  source_entity_id uuid null,
  planned_start_date date null,
  planned_completion_date date null,
  estimated_hours numeric null,
  actual_start_at timestamptz null,
  actual_completion_at timestamptz null,
  time_spent_minutes integer null,
  delay_reason text null,
  extension_approved_by_user_id uuid null,
  extension_approved_at timestamptz null,
  due_at timestamptz null,
  assignee_user_id uuid null,
  created_by_user_id uuid not null,
  closure_date timestamptz null,
  final_status text null,
  lessons_learned text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tasks_company on public.tasks(company_id, due_at asc);
create index if not exists idx_tasks_assignee on public.tasks(company_id, assignee_user_id);

-- ---------------------------------------------------------------------------
-- Corrective Actions (CAPA) - core Phase 2 system (enable incrementally)
-- ---------------------------------------------------------------------------

create table if not exists public.corrective_actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  module text not null check (module in ('safety','hr','legal','quality','health','environment','general','security')),
  title text not null,
  description text null,
  status text not null check (status in ('draft','open','approved','closed')) default 'draft',
  due_at timestamptz null,
  owner_user_id uuid null,
  created_by_user_id uuid not null,
  approved_by_user_id uuid null,
  approved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_capa_company on public.corrective_actions(company_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Documents (DMS) - enable incrementally
-- ---------------------------------------------------------------------------

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  module text not null check (module in ('safety','hr','legal','quality','health','environment','general','security')),
  title text not null,
  category text not null,
  version text not null default 'v1',
  status text not null check (status in ('draft','in_review','approved','archived')) default 'draft',
  owner_user_id uuid null,
  review_due_at timestamptz null,
  storage_bucket text null,
  storage_key text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_documents_company on public.documents(company_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- Forms (templates + PDF upload; OCR deferred)
-- ---------------------------------------------------------------------------

create table if not exists public.form_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  module text not null check (module in ('safety','hr','legal','quality','health','environment','general','security')),
  name text not null,
  description text null,
  schema jsonb not null default '{}'::jsonb,
  original_pdf_bucket text null,
  original_pdf_key text null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_form_templates_company on public.form_templates(company_id, updated_at desc);

-- Form submissions
create table if not exists public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.form_templates(id) on delete cascade,
  submitted_by_user_id uuid not null,
  data jsonb not null default '{}'::jsonb,
  status text not null check (status in ('draft','submitted','approved','rejected')) default 'submitted',
  submitted_at timestamptz not null default now(),
  reviewed_by_user_id uuid null,
  reviewed_at timestamptz null,
  review_notes text null
);

create index if not exists idx_form_submissions_template on public.form_submissions(template_id, submitted_at desc);

-- ---------------------------------------------------------------------------
-- Employee limit enforcement (licensing)
-- ---------------------------------------------------------------------------

create or replace function public.enforce_employee_limit()
returns trigger
language plpgsql
as $$
declare
  limit_value integer;
  current_count integer;
begin
  select c.employee_limit into limit_value
  from public.companies c
  where c.id = new.company_id;

  select count(*) into current_count
  from public.company_memberships m
  where m.company_id = new.company_id;

  if current_count >= limit_value then
    raise exception 'Licence user limit reached (% users).', limit_value;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_employee_limit on public.company_memberships;
create trigger trg_enforce_employee_limit
before insert on public.company_memberships
for each row execute function public.enforce_employee_limit();

-- ---------------------------------------------------------------------------
-- RLS (CRITICAL)
-- ---------------------------------------------------------------------------

alter table public.companies enable row level security;
alter table public.company_memberships enable row level security;
alter table public.company_invites enable row level security;
alter table public.platform_admins enable row level security;
alter table public.activity_logs enable row level security;
alter table public.incidents enable row level security;
alter table public.tasks enable row level security;
alter table public.corrective_actions enable row level security;
alter table public.documents enable row level security;
alter table public.form_templates enable row level security;
alter table public.quality_ncrs enable row level security;
alter table public.inspections enable row level security;
alter table public.inspection_checklist_templates enable row level security;
alter table public.inspection_checklist_items enable row level security;
alter table public.inspection_runs enable row level security;
alter table public.inspection_run_items enable row level security;
alter table public.inspection_item_evidence enable row level security;
alter table public.inspection_item_audit_trail enable row level security;
alter table public.inspection_auditee_submissions enable row level security;
alter table public.inspection_run_summaries enable row level security;
alter table public.risks enable row level security;
alter table public.ppe_items enable row level security;
alter table public.ppe_issues enable row level security;
alter table public.ppe_issue_tracker enable row level security;
alter table public.ppe_stock enable row level security;
alter table public.ppe_stock_movements enable row level security;
alter table public.ppe_reorder_requests enable row level security;
alter table public.ppe_issue_ncr_links enable row level security;
alter table public.ppe_issue_capa_links enable row level security;
alter table public.environment_aspects enable row level security;
alter table public.environment_monitoring enable row level security;
alter table public.legal_requirements enable row level security;
alter table public.training_courses enable row level security;
alter table public.training_records enable row level security;
alter table public.medical_certificates enable row level security;
alter table public.notifications enable row level security;
alter table public.module_targets enable row level security;
alter table public.planning_plans enable row level security;
alter table public.planning_kpis enable row level security;
alter table public.approvals enable row level security;
alter table public.improvement_actions enable row level security;

-- Companies: members can read; admins can update
drop policy if exists companies_select_member on public.companies;
create policy companies_select_member
on public.companies for select
-- IMPORTANT:
-- Allow the primary admin user to read their company even before their first
-- membership row exists; otherwise `is_company_primary_admin()` can be blocked
-- by RLS during workspace bootstrap.
using (
  public.is_company_member(id)
  or primary_admin_user_id = public.request_user_id()
  or public.is_platform_admin()
);

drop policy if exists companies_insert_primary_admin on public.companies;
create policy companies_insert_primary_admin
on public.companies for insert
with check (primary_admin_user_id = public.request_user_id() or public.is_platform_admin());

drop policy if exists companies_update_admin on public.companies;
create policy companies_update_admin
on public.companies for update
using (public.is_company_admin(id) or public.is_platform_admin())
with check (public.is_company_admin(id) or public.is_platform_admin());

-- Platform admins table: allow a user to check their own status
drop policy if exists platform_admins_select_self on public.platform_admins;
create policy platform_admins_select_self
on public.platform_admins for select
using (user_id = public.request_user_id());

-- Memberships: user can read own; admins can manage all in company
drop policy if exists memberships_select_member on public.company_memberships;
create policy memberships_select_member
on public.company_memberships for select
using (user_id = public.request_user_id() or public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

drop policy if exists memberships_insert_admin on public.company_memberships;
create policy memberships_insert_admin
on public.company_memberships for insert
with check (public.is_company_primary_admin(company_id) or public.is_company_manager(company_id) or public.is_platform_admin());

drop policy if exists memberships_update_admin on public.company_memberships;
create policy memberships_update_admin
on public.company_memberships for update
using (public.is_company_manager(company_id) or public.is_platform_admin())
with check (public.is_company_manager(company_id) or public.is_platform_admin());

-- Invites:
-- - Admins can create and read invites in their company.
-- - Invited-user self-accept requires email-claim access in RLS. InsForge does not expose `auth.jwt()`.
--   Recommendation: implement invite acceptance via an edge function (server-side) if needed.
drop policy if exists invites_select_admin on public.company_invites;
create policy invites_select_admin
on public.company_invites for select
using (public.is_company_manager(company_id) or public.is_platform_admin() or lower(email) = lower(public.request_user_email()));

drop policy if exists invites_insert_admin on public.company_invites;
create policy invites_insert_admin
on public.company_invites for insert
with check (public.is_company_manager(company_id) or public.is_platform_admin());

drop policy if exists invites_update_admin on public.company_invites;
create policy invites_update_admin
on public.company_invites for update
using (
  public.is_company_manager(company_id)
  or public.is_platform_admin()
  or lower(email) = lower(public.request_user_email())
)
with check (
  public.is_company_manager(company_id)
  or public.is_platform_admin()
  or (
    lower(email) = lower(public.request_user_email())
    and accepted_user_id = public.request_user_id()
  )
);

-- Activity logs: members can read; insert allowed for admin/consultant, and also self for certain actions.
drop policy if exists activity_select_member on public.activity_logs;
create policy activity_select_member
on public.activity_logs for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists activity_insert_member on public.activity_logs;
create policy activity_insert_member
on public.activity_logs for insert
with check (public.is_company_member(company_id));

-- Incidents:
-- - Admin/Consultant: full company visibility
-- - Employee: only incidents they created or are assigned to
drop policy if exists incidents_select_role on public.incidents;
create policy incidents_select_role
on public.incidents for select
using (
  public.is_company_consultant_or_admin(company_id)
  or public.is_company_auditor(company_id)
  or created_by_user_id = public.request_user_id()
  or assignee_user_id = public.request_user_id()
  or public.is_platform_admin()
);

drop policy if exists incidents_insert_member on public.incidents;
create policy incidents_insert_member
on public.incidents for insert
with check (public.is_company_member(company_id));

drop policy if exists incidents_update_admin_consultant on public.incidents;
create policy incidents_update_admin_consultant
on public.incidents for update
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Incident Categories & Subcategories RLS
alter table public.incident_categories enable row level security;
alter table public.incident_subcategories enable row level security;

drop policy if exists incident_categories_select_member on public.incident_categories;
create policy incident_categories_select_member
on public.incident_categories for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists incident_categories_write_admin on public.incident_categories;
create policy incident_categories_write_admin
on public.incident_categories for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

drop policy if exists incident_subcategories_select_member on public.incident_subcategories;
create policy incident_subcategories_select_member
on public.incident_subcategories for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists incident_subcategories_write_admin on public.incident_subcategories;
create policy incident_subcategories_write_admin
on public.incident_subcategories for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Incident Corrective Actions RLS
alter table public.incident_corrective_actions enable row level security;

drop policy if exists incident_corrective_actions_select_role on public.incident_corrective_actions;
create policy incident_corrective_actions_select_role
on public.incident_corrective_actions for select
using (
  public.is_company_consultant_or_admin(company_id)
  or public.is_company_auditor(company_id)
  or owner_user_id = public.request_user_id()
  or created_by_user_id = public.request_user_id()
  or public.is_platform_admin()
);

drop policy if exists incident_corrective_actions_insert_member on public.incident_corrective_actions;
create policy incident_corrective_actions_insert_member
on public.incident_corrective_actions for insert
with check (public.is_company_member(company_id));

drop policy if exists incident_corrective_actions_update_role on public.incident_corrective_actions;
create policy incident_corrective_actions_update_role
on public.incident_corrective_actions for update
using (
  public.is_company_consultant_or_admin(company_id)
  or owner_user_id = public.request_user_id()
  or created_by_user_id = public.request_user_id()
  or public.is_platform_admin()
)
with check (
  public.is_company_consultant_or_admin(company_id)
  or owner_user_id = public.request_user_id()
  or created_by_user_id = public.request_user_id()
  or public.is_platform_admin()
);

-- Tasks:
-- - Admin/Consultant: full company visibility
-- - Employee: only tasks assigned to them
drop policy if exists tasks_select_role on public.tasks;
create policy tasks_select_role
on public.tasks for select
using (
  public.is_company_consultant_or_admin(company_id)
  or public.is_company_auditor(company_id)
  or assignee_user_id = public.request_user_id()
  or public.is_platform_admin()
);

drop policy if exists tasks_insert_admin_consultant on public.tasks;
create policy tasks_insert_admin_consultant
on public.tasks for insert
with check (public.is_company_consultant_or_admin(company_id));

drop policy if exists tasks_update_admin_consultant on public.tasks;
create policy tasks_update_admin_consultant
on public.tasks for update
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Corrective Actions / Documents / Forms:
-- For Phase 2: restrict to admin/consultant for now; widen later as needed.
drop policy if exists capa_select_admin_consultant on public.corrective_actions;
create policy capa_select_admin_consultant
on public.corrective_actions for select
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

drop policy if exists capa_write_admin_consultant on public.corrective_actions;
create policy capa_write_admin_consultant
on public.corrective_actions for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

drop policy if exists docs_select_member on public.documents;
create policy docs_select_member
on public.documents for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists docs_write_admin_consultant on public.documents;
create policy docs_write_admin_consultant
on public.documents for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

drop policy if exists forms_select_member on public.form_templates;
create policy forms_select_member
on public.form_templates for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists forms_write_admin_consultant on public.form_templates;
create policy forms_write_admin_consultant
on public.form_templates for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Form submissions
alter table public.form_submissions enable row level security;

drop policy if exists submissions_select_member on public.form_submissions;
create policy submissions_select_member
on public.form_submissions for select
using (
  submitted_by_user_id = auth.uid() or
  public.is_company_consultant_or_admin((select company_id from form_templates where id = template_id)) or
  public.is_platform_admin()
);

drop policy if exists submissions_insert_member on public.form_submissions;
create policy submissions_insert_member
on public.form_submissions for insert
with check (submitted_by_user_id = auth.uid());

drop policy if exists submissions_update_admin on public.form_submissions;
create policy submissions_update_admin
on public.form_submissions for update
using (public.is_company_consultant_or_admin((select company_id from form_templates where id = template_id)) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin((select company_id from form_templates where id = template_id)) or public.is_platform_admin());

-- Quality NCRs
drop policy if exists ncrs_select_role on public.quality_ncrs;
create policy ncrs_select_role
on public.quality_ncrs for select
using (
  public.is_company_consultant_or_admin(company_id)
  or public.is_company_auditor(company_id)
  or created_by_user_id = public.request_user_id()
  or auditee_user_id = public.request_user_id()
  or auditor_user_id = public.request_user_id()
  or department_manager_user_id = public.request_user_id()
  or public.is_platform_admin()
);

drop policy if exists ncrs_write_management on public.quality_ncrs;
create policy ncrs_write_management
on public.quality_ncrs for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Inspections
drop policy if exists inspections_select_role on public.inspections;
create policy inspections_select_role
on public.inspections for select
using (
  public.is_company_member(company_id)
  or public.is_platform_admin()
);

drop policy if exists inspections_write_management on public.inspections;
create policy inspections_write_management
on public.inspections for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Inspection checklist templates
drop policy if exists inspection_checklist_templates_select_role on public.inspection_checklist_templates;
create policy inspection_checklist_templates_select_role
on public.inspection_checklist_templates for select
using (
  public.is_company_member(company_id)
  or public.is_platform_admin()
);

drop policy if exists inspection_checklist_templates_write_management on public.inspection_checklist_templates;
create policy inspection_checklist_templates_write_management
on public.inspection_checklist_templates for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Inspection checklist items
drop policy if exists inspection_checklist_items_select_role on public.inspection_checklist_items;
create policy inspection_checklist_items_select_role
on public.inspection_checklist_items for select
using (
  public.is_company_member(company_id)
  or public.is_platform_admin()
);

drop policy if exists inspection_checklist_items_write_management on public.inspection_checklist_items;
create policy inspection_checklist_items_write_management
on public.inspection_checklist_items for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Inspection runs
drop policy if exists inspection_runs_select_role on public.inspection_runs;
create policy inspection_runs_select_role
on public.inspection_runs for select
using (
  public.is_company_member(company_id)
  or public.is_platform_admin()
);

drop policy if exists inspection_runs_write_management on public.inspection_runs;
create policy inspection_runs_write_management
on public.inspection_runs for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Inspection run items
drop policy if exists inspection_run_items_select_role on public.inspection_run_items;
create policy inspection_run_items_select_role
on public.inspection_run_items for select
using (
  public.is_company_member(company_id)
  or public.is_platform_admin()
);

drop policy if exists inspection_run_items_write_management on public.inspection_run_items;
create policy inspection_run_items_write_management
on public.inspection_run_items for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Inspection item evidence
drop policy if exists inspection_item_evidence_select_role on public.inspection_item_evidence;
create policy inspection_item_evidence_select_role
on public.inspection_item_evidence for select
using (
  public.is_company_member(company_id)
  or public.is_platform_admin()
);

drop policy if exists inspection_item_evidence_write_management on public.inspection_item_evidence;
create policy inspection_item_evidence_write_management
on public.inspection_item_evidence for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Inspection item audit trail
drop policy if exists inspection_item_audit_trail_select_role on public.inspection_item_audit_trail;
create policy inspection_item_audit_trail_select_role
on public.inspection_item_audit_trail for select
using (
  public.is_company_member(company_id)
  or public.is_platform_admin()
);

drop policy if exists inspection_item_audit_trail_write_management on public.inspection_item_audit_trail;
create policy inspection_item_audit_trail_write_management
on public.inspection_item_audit_trail for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Inspection auditee submissions
drop policy if exists inspection_auditee_submissions_select_role on public.inspection_auditee_submissions;
create policy inspection_auditee_submissions_select_role
on public.inspection_auditee_submissions for select
using (
  public.is_company_member(company_id)
  or public.is_platform_admin()
);

drop policy if exists inspection_auditee_submissions_write_role on public.inspection_auditee_submissions;
create policy inspection_auditee_submissions_write_role
on public.inspection_auditee_submissions for all
using (public.is_company_member(company_id) or public.is_platform_admin())
with check (public.is_company_member(company_id) or public.is_platform_admin());

-- Inspection run summaries
drop policy if exists inspection_run_summaries_select_role on public.inspection_run_summaries;
create policy inspection_run_summaries_select_role
on public.inspection_run_summaries for select
using (
  public.is_company_member(company_id)
  or public.is_platform_admin()
);

drop policy if exists inspection_run_summaries_write_management on public.inspection_run_summaries;
create policy inspection_run_summaries_write_management
on public.inspection_run_summaries for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Risks
drop policy if exists risks_select_member on public.risks;
create policy risks_select_member
on public.risks for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists risks_write_management on public.risks;
create policy risks_write_management
on public.risks for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- PPE
drop policy if exists ppe_items_select_member on public.ppe_items;
create policy ppe_items_select_member
on public.ppe_items for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists ppe_items_write_management on public.ppe_items;
create policy ppe_items_write_management
on public.ppe_items for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

drop policy if exists ppe_issues_select_member on public.ppe_issues;
create policy ppe_issues_select_member
on public.ppe_issues for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists ppe_issues_write_management on public.ppe_issues;
create policy ppe_issues_write_management
on public.ppe_issues for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

drop policy if exists ppe_issue_tracker_select_member on public.ppe_issue_tracker;
create policy ppe_issue_tracker_select_member
on public.ppe_issue_tracker for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists ppe_issue_tracker_write_management on public.ppe_issue_tracker;
create policy ppe_issue_tracker_write_management
on public.ppe_issue_tracker for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

drop policy if exists ppe_stock_select_member on public.ppe_stock;
create policy ppe_stock_select_member
on public.ppe_stock for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists ppe_stock_write_management on public.ppe_stock;
create policy ppe_stock_write_management
on public.ppe_stock for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

drop policy if exists ppe_stock_movements_select_member on public.ppe_stock_movements;
create policy ppe_stock_movements_select_member
on public.ppe_stock_movements for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists ppe_stock_movements_write_management on public.ppe_stock_movements;
create policy ppe_stock_movements_write_management
on public.ppe_stock_movements for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

drop policy if exists ppe_reorder_requests_select_member on public.ppe_reorder_requests;
create policy ppe_reorder_requests_select_member
on public.ppe_reorder_requests for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists ppe_reorder_requests_write_management on public.ppe_reorder_requests;
create policy ppe_reorder_requests_write_management
on public.ppe_reorder_requests for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

drop policy if exists ppe_issue_ncr_links_select_member on public.ppe_issue_ncr_links;
create policy ppe_issue_ncr_links_select_member
on public.ppe_issue_ncr_links for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists ppe_issue_ncr_links_write_management on public.ppe_issue_ncr_links;
create policy ppe_issue_ncr_links_write_management
on public.ppe_issue_ncr_links for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

drop policy if exists ppe_issue_capa_links_select_member on public.ppe_issue_capa_links;
create policy ppe_issue_capa_links_select_member
on public.ppe_issue_capa_links for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists ppe_issue_capa_links_write_management on public.ppe_issue_capa_links;
create policy ppe_issue_capa_links_write_management
on public.ppe_issue_capa_links for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Environment
drop policy if exists env_aspects_select_member on public.environment_aspects;
create policy env_aspects_select_member
on public.environment_aspects for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists env_aspects_write_management on public.environment_aspects;
create policy env_aspects_write_management
on public.environment_aspects for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

drop policy if exists env_monitoring_select_member on public.environment_monitoring;
create policy env_monitoring_select_member
on public.environment_monitoring for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists env_monitoring_write_management on public.environment_monitoring;
create policy env_monitoring_write_management
on public.environment_monitoring for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Legal requirements
drop policy if exists legal_select_member on public.legal_requirements;
create policy legal_select_member
on public.legal_requirements for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists legal_write_management on public.legal_requirements;
create policy legal_write_management
on public.legal_requirements for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Training (members can read their own; management can read/write all)
drop policy if exists training_courses_select_member on public.training_courses;
create policy training_courses_select_member
on public.training_courses for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists training_courses_write_management on public.training_courses;
create policy training_courses_write_management
on public.training_courses for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

drop policy if exists training_records_select_role on public.training_records;
create policy training_records_select_role
on public.training_records for select
using (
  public.is_company_consultant_or_admin(company_id)
  or user_id = public.request_user_id()
  or public.is_platform_admin()
);

drop policy if exists training_records_write_management on public.training_records;
create policy training_records_write_management
on public.training_records for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Health medical certificates (same rule as training records)
drop policy if exists medical_select_role on public.medical_certificates;
create policy medical_select_role
on public.medical_certificates for select
using (
  public.is_company_consultant_or_admin(company_id)
  or user_id = public.request_user_id()
  or public.is_platform_admin()
);

drop policy if exists medical_write_management on public.medical_certificates;
create policy medical_write_management
on public.medical_certificates for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Notifications (user can read own; system/management can write)
drop policy if exists notifications_select_self on public.notifications;
create policy notifications_select_self
on public.notifications for select
using (user_id = public.request_user_id() or public.is_platform_admin());

drop policy if exists notifications_write_management on public.notifications;
create policy notifications_write_management
on public.notifications for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Module targets/objectives
drop policy if exists module_targets_select_member on public.module_targets;
create policy module_targets_select_member
on public.module_targets for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists module_targets_write_management on public.module_targets;
create policy module_targets_write_management
on public.module_targets for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Planning plans + KPIs
drop policy if exists planning_plans_select_member on public.planning_plans;
create policy planning_plans_select_member
on public.planning_plans for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists planning_plans_write_management on public.planning_plans;
create policy planning_plans_write_management
on public.planning_plans for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

drop policy if exists planning_kpis_select_member on public.planning_kpis;
create policy planning_kpis_select_member
on public.planning_kpis for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists planning_kpis_write_management on public.planning_kpis;
create policy planning_kpis_write_management
on public.planning_kpis for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Approvals: members can read; approver/admin can update; management can insert
drop policy if exists approvals_select_member on public.approvals;
create policy approvals_select_member
on public.approvals for select
using (
  public.is_company_member(company_id)
  or approver_user_id = public.request_user_id()
  or requested_by_user_id = public.request_user_id()
  or public.is_platform_admin()
);

drop policy if exists approvals_insert_management on public.approvals;
create policy approvals_insert_management
on public.approvals for insert
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

drop policy if exists approvals_update_approver on public.approvals;
create policy approvals_update_approver
on public.approvals for update
using (
  approver_user_id = public.request_user_id()
  or public.is_company_consultant_or_admin(company_id)
  or public.is_platform_admin()
)
with check (
  approver_user_id = public.request_user_id()
  or public.is_company_consultant_or_admin(company_id)
  or public.is_platform_admin()
);

-- Improvement actions
drop policy if exists improvements_select_member on public.improvement_actions;
create policy improvements_select_member
on public.improvement_actions for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists improvements_write_management on public.improvement_actions;
create policy improvements_write_management
on public.improvement_actions for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- =========================
-- Phase 2 Feature Modules (PJO, BBS, Contractors/Visitors, Emergency, Templates)
-- =========================

-- Planned Job Observations (PJO) - HR / Behavioural safety
create table if not exists public.pjo_observations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  module text not null check (module in ('hr')) default 'hr',

  -- Observation header
  employee_user_id uuid null,
  employee_name text not null,
  conducted_by_user_id uuid not null,
  reason text not null,
  department text null,
  site text null,
  job_observed text not null,
  observed_at date not null,
  next_observation_at date null,

  -- Status
  status text not null check (status in ('open','closed')) default 'open',
  closed_at timestamptz null,
  closed_by_user_id uuid null,

  metadata jsonb null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pjo_observations_company on public.pjo_observations(company_id, observed_at desc);

-- Individual checklist responses per PJO
create table if not exists public.pjo_responses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  pjo_id uuid not null references public.pjo_observations(id) on delete cascade,

  question_no integer not null,
  question_text text not null,

  yes_no boolean null,
  rating integer null check (rating between 1 and 3),
  deviation text null,
  suggested_corrective_action text null,
  responsible_person text null,
  responsible_department text null,

  corrective_action_implemented boolean not null default false,
  implemented_at date null,

  manager_signoff_user_id uuid null,
  manager_signoff_at timestamptz null,

  closed boolean not null default false,
  closed_at timestamptz null,
  closed_by_user_id uuid null,

  -- Links to NCR / CAPA
  ncr_id uuid null references public.quality_ncrs(id) on delete set null,

  -- Template metadata (optional; allows configurable checklists)
  template_id uuid null,
  template_item_id uuid null,
  category text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pjo_responses_pjo on public.pjo_responses(pjo_id, question_no);

-- Optional: company-specific PJO checklist templates
create table if not exists public.pjo_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  module text not null check (module in ('hr')) default 'hr',
  name text not null,
  description text null,
  scope text not null check (scope in ('global','site','department')) default 'global',
  site_id uuid null,
  department_id uuid null,
  is_active boolean not null default true,
  created_by_user_id uuid not null,
  updated_by_user_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pjo_checklist_templates_company on public.pjo_checklist_templates(company_id, module, is_active);

create table if not exists public.pjo_checklist_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  template_id uuid not null references public.pjo_checklist_templates(id) on delete cascade,
  question_no integer not null default 0,
  question_text text not null,
  category text null,
  default_rating_weight integer null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pjo_checklist_items_template on public.pjo_checklist_items(template_id, question_no);

-- RLS and policies for PJO tables
alter table public.pjo_observations enable row level security;
alter table public.pjo_responses enable row level security;
alter table public.pjo_checklist_templates enable row level security;
alter table public.pjo_checklist_items enable row level security;

-- Planned Job Observations (PJO) policies
drop policy if exists pjo_observations_select_role on public.pjo_observations;
create policy pjo_observations_select_role
on public.pjo_observations for select
using (
  public.is_company_member(company_id)
  or public.is_platform_admin()
);

drop policy if exists pjo_observations_write_management on public.pjo_observations;
create policy pjo_observations_write_management
on public.pjo_observations for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

drop policy if exists pjo_responses_select_role on public.pjo_responses;
create policy pjo_responses_select_role
on public.pjo_responses for select
using (
  public.is_company_member(company_id)
  or public.is_platform_admin()
);

drop policy if exists pjo_responses_write_management on public.pjo_responses;
create policy pjo_responses_write_management
on public.pjo_responses for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

drop policy if exists pjo_checklist_templates_select_role on public.pjo_checklist_templates;
create policy pjo_checklist_templates_select_role
on public.pjo_checklist_templates for select
using (
  public.is_company_member(company_id)
  or public.is_platform_admin()
);

drop policy if exists pjo_checklist_templates_write_management on public.pjo_checklist_templates;
create policy pjo_checklist_templates_write_management
on public.pjo_checklist_templates for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

drop policy if exists pjo_checklist_items_select_role on public.pjo_checklist_items;
create policy pjo_checklist_items_select_role
on public.pjo_checklist_items for select
using (
  public.is_company_member(company_id)
  or public.is_platform_admin()
);

drop policy if exists pjo_checklist_items_write_management on public.pjo_checklist_items;
create policy pjo_checklist_items_write_management
on public.pjo_checklist_items for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Behaviour-Based Safety (BBS) observations
create table if not exists public.bbs_observations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  type text not null check (type in ('positive', 'unsafe_act', 'near_miss')),
  title text not null,
  area text,
  status text not null default 'logged' check (status in ('logged','action_required','closed')),
  created_by_user_id uuid not null,
  created_at timestamptz not null default now()
);
alter table public.bbs_observations enable row level security;

drop policy if exists bbs_select_member on public.bbs_observations;
create policy bbs_select_member
on public.bbs_observations for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists bbs_write_member on public.bbs_observations;
create policy bbs_write_member
on public.bbs_observations for insert
with check (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists bbs_update_management on public.bbs_observations;
create policy bbs_update_management
on public.bbs_observations for update
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Contractors
create table if not exists public.contractors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  status text not null default 'pending' check (status in ('pending','approved','suspended')),
  documents_count int not null default 0,
  inductions_count int not null default 0,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.contractors enable row level security;

drop policy if exists contractors_select_member on public.contractors;
create policy contractors_select_member
on public.contractors for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists contractors_write_management on public.contractors;
create policy contractors_write_management
on public.contractors for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Visitors
create table if not exists public.visitors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  status text not null default 'scheduled' check (status in ('scheduled','checked_in','checked_out')),
  briefing text not null default 'pending' check (briefing in ('pending','completed')),
  created_by_user_id uuid not null,
  created_at timestamptz not null default now()
);
alter table public.visitors enable row level security;

drop policy if exists visitors_select_member on public.visitors;
create policy visitors_select_member
on public.visitors for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists visitors_write_management on public.visitors;
create policy visitors_write_management
on public.visitors for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Emergency drills (Phase 2: scheduling + evidence uploads later)
create table if not exists public.emergency_drills (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  drill_date date not null,
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled')),
  notes text,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now()
);
alter table public.emergency_drills enable row level security;

drop policy if exists drills_select_member on public.emergency_drills;
create policy drills_select_member
on public.emergency_drills for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists drills_write_management on public.emergency_drills;
create policy drills_write_management
on public.emergency_drills for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Template library items (Phase 2: client master files)
create table if not exists public.template_library_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  type text not null,
  category text not null,
  storage_bucket text,
  storage_key text,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now()
);
alter table public.template_library_items enable row level security;

drop policy if exists templates_select_member on public.template_library_items;
create policy templates_select_member
on public.template_library_items for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists templates_write_management on public.template_library_items;
create policy templates_write_management
on public.template_library_items for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Company profile updates (settings) - allow admin + manager
drop policy if exists companies_update_admin on public.companies;
drop policy if exists companies_update_management on public.companies;
create policy companies_update_management
on public.companies for update
using (public.is_company_manager(id) or public.is_platform_admin())
with check (public.is_company_manager(id) or public.is_platform_admin());

-- =========================
-- HR + Security + Evidence (Phase 2 completion)
-- =========================

-- Company user profiles (for names/emails/dept/site inside tenant)
create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null,
  full_name text null,
  email text null,
  phone text null,
  department text null,
  site text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id)
);
alter table public.user_profiles enable row level security;

drop policy if exists profiles_select_role on public.user_profiles;
create policy profiles_select_role
on public.user_profiles for select
using (
  public.is_company_manager(company_id)
  or user_id = public.request_user_id()
  or public.is_platform_admin()
);

drop policy if exists profiles_insert_self on public.user_profiles;
create policy profiles_insert_self
on public.user_profiles for insert
with check (
  public.is_company_member(company_id)
  and user_id = public.request_user_id()
);

drop policy if exists profiles_insert_management on public.user_profiles;
create policy profiles_insert_management
on public.user_profiles for insert
with check (public.is_company_manager(company_id) or public.is_platform_admin());

drop policy if exists profiles_update_role on public.user_profiles;
create policy profiles_update_role
on public.user_profiles for update
using (
  public.is_company_manager(company_id)
  or user_id = public.request_user_id()
  or public.is_platform_admin()
)
with check (
  public.is_company_manager(company_id)
  or user_id = public.request_user_id()
  or public.is_platform_admin()
);

-- Evidence attachments (generic: legal, audits, incidents, etc.)
create table if not exists public.evidence_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  title text null,
  storage_bucket text not null,
  storage_key text not null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_evidence_company_entity on public.evidence_attachments(company_id, entity_type, entity_id);
alter table public.evidence_attachments enable row level security;

drop policy if exists evidence_select_member on public.evidence_attachments;
create policy evidence_select_member
on public.evidence_attachments for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists evidence_write_management on public.evidence_attachments;
create policy evidence_write_management
on public.evidence_attachments for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Program Audit Findings (linked to audits, distinct from inspection findings)
create table if not exists public.program_audit_findings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  audit_id uuid not null references public.audits(id) on delete cascade,
  audit_question_id uuid null references public.audit_questions(id) on delete set null,
  title text not null,
  deviation_type text not null check (
    deviation_type in ('observation','finding','non_conformance','opportunity_for_improvement')
  ),
  risk_level text not null check (risk_level in ('low','medium','high','critical')) default 'medium',
  required_action text null,
  responsible_user_id uuid null,
  due_date date null,
  evidence_requirements text null,
  status text not null check (
    status in ('open','in-progress','awaiting-evidence','under-review','approved','closed')
  ) default 'open',
  closure_evidence_url text null,
  manager_signoff_user_id uuid null,
  manager_signoff_at timestamptz null,
  auditor_verify_user_id uuid null,
  auditor_verify_at timestamptz null,
  closed_at timestamptz null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_program_audit_findings_company on public.program_audit_findings(company_id, created_at desc);
create index if not exists idx_program_audit_findings_audit on public.program_audit_findings(audit_id, status);
alter table public.program_audit_findings
  add column if not exists action_plan text null,
  add column if not exists progress_updates jsonb null,
  add column if not exists evidence_uploads jsonb null,
  add column if not exists reopen_reason text null;
alter table public.program_audit_findings enable row level security;

drop policy if exists program_audit_findings_select_member on public.program_audit_findings;
create policy program_audit_findings_select_member
on public.program_audit_findings for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists program_audit_findings_write_management on public.program_audit_findings;
create policy program_audit_findings_write_management
on public.program_audit_findings for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Audit findings (linked to inspections)
create table if not exists public.audit_findings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  title text not null,
  severity text not null check (severity in ('critical','high','medium','low')) default 'medium',
  status text not null check (status in ('open','closed')) default 'open',
  nonconformance boolean not null default false,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_findings_company on public.audit_findings(company_id, created_at desc);
create index if not exists idx_audit_findings_inspection on public.audit_findings(inspection_id);
alter table public.audit_findings enable row level security;

drop policy if exists audit_findings_select_member on public.audit_findings;
create policy audit_findings_select_member
on public.audit_findings for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists audit_findings_write_management on public.audit_findings;
create policy audit_findings_write_management
on public.audit_findings for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Keep inspection counts in sync
create or replace function public.recalc_inspection_counts(p_inspection_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_company_id uuid;
  v_findings int;
  v_nc int;
begin
  select company_id into v_company_id from public.inspections where id = p_inspection_id;
  if v_company_id is null then
    return;
  end if;

  select count(*) into v_findings from public.audit_findings where inspection_id = p_inspection_id;
  select count(*) into v_nc from public.audit_findings where inspection_id = p_inspection_id and nonconformance = true;

  update public.inspections
  set findings_count = v_findings,
      nonconformances_count = v_nc,
      updated_at = now()
  where id = p_inspection_id;
end;
$$;

create or replace function public.trg_recalc_inspection_counts()
returns trigger
language plpgsql
security definer
as $$
begin
  if tg_op = 'INSERT' then
    perform public.recalc_inspection_counts(new.inspection_id);
    return new;
  elsif tg_op = 'UPDATE' then
    perform public.recalc_inspection_counts(new.inspection_id);
    if old.inspection_id is distinct from new.inspection_id then
      perform public.recalc_inspection_counts(old.inspection_id);
    end if;
    return new;
  else
    perform public.recalc_inspection_counts(old.inspection_id);
    return old;
  end if;
end;
$$;

drop trigger if exists trg_audit_findings_recalc on public.audit_findings;
create trigger trg_audit_findings_recalc
after insert or update or delete on public.audit_findings
for each row execute function public.trg_recalc_inspection_counts();

-- =========================
-- Support & User Settings (Phase 2)
-- =========================

-- Support tickets for help & support feature
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null,
  user_email text not null,
  category text not null check (category in ('bug', 'access', 'billing', 'feature-request', 'other')),
  subject text not null,
  description text not null,
  status text not null check (status in ('open', 'in-progress', 'closed')) default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_support_tickets_company on public.support_tickets(company_id, created_at desc);
create index if not exists idx_support_tickets_user on public.support_tickets(company_id, user_id);

alter table public.support_tickets enable row level security;

drop policy if exists support_tickets_select_user on public.support_tickets;
create policy support_tickets_select_user
on public.support_tickets for select
using (
  user_id = public.request_user_id()
  or public.is_company_consultant_or_admin(company_id)
  or public.is_platform_admin()
);

drop policy if exists support_tickets_insert_member on public.support_tickets;
create policy support_tickets_insert_member
on public.support_tickets for insert
with check (public.is_company_member(company_id));

drop policy if exists support_tickets_update_management on public.support_tickets;
create policy support_tickets_update_management
on public.support_tickets for update
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Module Content Library: Knowledge base for 6 modules (Safety, Quality, Environment, Health, Legal, HR)
create table if not exists public.module_content (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  module_key text not null check (module_key in ('safety', 'quality', 'environment', 'health', 'legal', 'hr')),
  content_type text not null check (content_type in ('procedure', 'policy', 'template', 'checklist', 'guideline', 'training_material')),
  title text not null,
  description text null,
  content_url text not null,
  file_size_kb integer null,
  file_type text null,
  version text not null default '1.0',
  is_published boolean not null default false,
  published_date date null,
  published_by_user_id uuid null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_module_content_company on public.module_content(company_id, module_key);
create index if not exists idx_module_content_type on public.module_content(module_key, content_type);
create index if not exists idx_module_content_published on public.module_content(company_id, is_published);

-- RLS for Module Content (use is_company_member so no session variable is required)
alter table module_content enable row level security;
drop policy if exists "module_content_tenant_isolation" on public.module_content;
create policy "module_content_tenant_isolation" on public.module_content
  for all using (public.is_company_member(company_id) or public.is_platform_admin());

-- Compliance Scoring: Real-time compliance score per organization (Phase 3)
create table if not exists public.compliance_scores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  module text not null check (module in ('safety', 'quality', 'environment', 'health', 'legal', 'hr', 'overall')),
  score numeric not null check (score >= 0 and score <= 100),
  percentage_complete numeric not null check (percentage_complete >= 0 and percentage_complete <= 100),
  total_items integer not null default 0,
  completed_items integer not null default 0,
  overdue_items integer not null default 0,
  high_priority_items integer not null default 0,
  last_calculated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_compliance_scores_company on public.compliance_scores(company_id, module);

-- RLS for Compliance Scores (use is_company_member so no session variable is required)
alter table compliance_scores enable row level security;
drop policy if exists "compliance_scores_tenant_isolation" on public.compliance_scores;
create policy "compliance_scores_tenant_isolation" on public.compliance_scores
  for all using (public.is_company_member(company_id) or public.is_platform_admin());

-- User settings (notifications, security, etc.)
create table if not exists public.user_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null,
  email_notifications_enabled boolean not null default true,
  inapp_notifications_enabled boolean not null default true,
  notification_frequency text check (notification_frequency in ('immediate', 'daily', 'weekly')) default 'immediate',
  password_min_length integer not null default 8,
  password_require_uppercase boolean not null default true,
  password_require_numbers boolean not null default true,
  password_require_special boolean not null default false,
  session_timeout_minutes integer not null default 60,
  max_concurrent_sessions integer not null default 5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id)
);
create index if not exists idx_user_settings_company on public.user_settings(company_id);

alter table public.user_settings enable row level security;

drop policy if exists user_settings_select_self on public.user_settings;
create policy user_settings_select_self
on public.user_settings for select
using (
  user_id = public.request_user_id()
  or public.is_company_consultant_or_admin(company_id)
  or public.is_platform_admin()
);

drop policy if exists user_settings_insert_self on public.user_settings;
create policy user_settings_insert_self
on public.user_settings for insert
with check (user_id = public.request_user_id() or public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

drop policy if exists user_settings_update_self on public.user_settings;
create policy user_settings_update_self
on public.user_settings for update
using (
  user_id = public.request_user_id()
  or public.is_company_consultant_or_admin(company_id)
  or public.is_platform_admin()
)
with check (
  user_id = public.request_user_id()
  or public.is_company_consultant_or_admin(company_id)
  or public.is_platform_admin()
);
