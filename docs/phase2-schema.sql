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
  title text not null,
  description text null,
  severity text not null check (severity in ('critical','high','medium','low')) default 'medium',
  status text not null check (status in ('open','in-progress','closed')) default 'open',
  occurred_at timestamptz not null default now(),
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_quality_ncrs_company on public.quality_ncrs(company_id, occurred_at desc);

-- Safety/General: Inspections (safety inspections, site checks, etc.)
create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  module text not null check (module in ('safety','quality','environment','health','legal','hr','general','security')) default 'safety',
  title text not null,
  checklist_name text null,
  status text not null check (status in ('scheduled','in-progress','completed','overdue')) default 'scheduled',
  scheduled_at timestamptz null,
  completed_at timestamptz null,
  location text null,
  findings_count integer not null default 0,
  nonconformances_count integer not null default 0,
  assignee_user_id uuid null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_inspections_company on public.inspections(company_id, scheduled_at desc);

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
  assignee_user_id uuid null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_incidents_company on public.incidents(company_id, occurred_at desc);
create index if not exists idx_incidents_assignee on public.incidents(company_id, assignee_user_id);
create index if not exists idx_incidents_creator on public.incidents(company_id, created_by_user_id);

-- ---------------------------------------------------------------------------
-- Tasks (Phase 2 shared system)
-- ---------------------------------------------------------------------------

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  module text not null check (module in ('safety','hr','legal','quality','health','environment','general','security')),
  title text not null,
  description text null,
  priority text not null check (priority in ('critical','high','medium','low')) default 'medium',
  status text not null check (status in ('pending','in-progress','completed','overdue')) default 'pending',
  due_at timestamptz null,
  assignee_user_id uuid null,
  created_by_user_id uuid not null,
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
alter table public.risks enable row level security;
alter table public.ppe_items enable row level security;
alter table public.ppe_issues enable row level security;
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
-- Phase 2 Feature Modules (BBS, Contractors/Visitors, Emergency, Templates)
-- =========================

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

