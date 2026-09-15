-- PJO customization + HR employee linking + evidence upload.
-- Apply date: 2026-09-15
--
-- Note: the base pjo_observations/pjo_responses/pjo_checklist_templates/
-- pjo_checklist_items tables already exist live but their original CREATE
-- TABLE statements were never committed to this repo's migration history
-- (only later ALTERs were, in final_feature_pass_2026_05_04.sql). The
-- `create table if not exists` blocks below document the live shape as a
-- safety net (no-ops if the tables already exist) before adding new columns.

create table if not exists public.pjo_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  module text not null check (module = 'hr') default 'hr',
  name text not null,
  description text null,
  scope text not null check (scope in ('global', 'site', 'department')) default 'global',
  site_id uuid null,
  department_id uuid null,
  is_active boolean not null default true,
  created_by_user_id uuid not null,
  updated_by_user_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pjo_checklist_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  template_id uuid not null references public.pjo_checklist_templates(id) on delete cascade,
  question_no integer not null,
  question_text text not null,
  category text null,
  default_rating_weight integer null,
  is_active boolean not null default true,
  answer_type text not null default 'yes_no' check (answer_type in ('yes_no', 'text', 'rating')),
  evidence_required boolean not null default false,
  allocated_score numeric null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pjo_observations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  module text not null default 'hr',
  employee_user_id uuid null,
  employee_name text not null,
  conducted_by_user_id uuid not null,
  reason text not null,
  department text null,
  site text null,
  job_observed text not null,
  observed_at date not null,
  next_observation_at date null,
  status text not null default 'open',
  closed_at timestamptz null,
  closed_by_user_id uuid null,
  metadata jsonb null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pjo_responses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  pjo_id uuid not null references public.pjo_observations(id) on delete cascade,
  question_no integer not null,
  question_text text not null,
  yes_no boolean null,
  rating integer null,
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
  ncr_id uuid null,
  template_id uuid null,
  template_item_id uuid null,
  category text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ensure exactly one "default" template per company (used to seed and
-- render the company's customizable PJO question list).
alter table public.pjo_checklist_templates
  add column if not exists is_default boolean not null default false;

drop index if exists idx_pjo_checklist_templates_one_default_per_company;
create unique index idx_pjo_checklist_templates_one_default_per_company
  on public.pjo_checklist_templates (company_id)
  where is_default;

-- HR employee linking on the PJO header (employee + observer), plus a
-- denormalized job_title/department_id for filtering without a join.
alter table public.pjo_observations
  add column if not exists employee_hr_employee_id uuid null references public.hr_employees(id) on delete set null,
  add column if not exists employee_number text null,
  add column if not exists job_title text null,
  add column if not exists department_id uuid null references public.departments(id) on delete set null,
  add column if not exists observer_hr_employee_id uuid null references public.hr_employees(id) on delete set null,
  add column if not exists observer_name text null;

create index if not exists idx_pjo_observations_employee_hr on public.pjo_observations(employee_hr_employee_id);
create index if not exists idx_pjo_observations_department on public.pjo_observations(department_id);

-- Per-question evidence upload (bucket+key, matching the storage pattern
-- used elsewhere in the app rather than storing a raw public URL).
alter table public.pjo_responses
  add column if not exists evidence_bucket text null,
  add column if not exists evidence_key text null,
  add column if not exists evidence_file_name text null;
