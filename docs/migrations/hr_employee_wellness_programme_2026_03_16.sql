-- HR Employee Wellness Programme
-- Date: 2026-03-16
-- Safe to run multiple times.

create table if not exists public.hr_employee_wellness_assessments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  department_id uuid null references public.departments(id) on delete set null,

  assessment_date date not null default current_date,

  company_name text null,
  employee_number text null,
  job_title text null,
  line_manager_name text null,

  wellness_assessment_answers jsonb not null default '{}'::jsonb,
  health_lifestyle_assessment jsonb not null default '{}'::jsonb,
  workplace_wellness_needs jsonb not null default '{}'::jsonb,
  programme_participation jsonb not null default '{}'::jsonb,

  employee_signature text null,
  wellness_officer_signature text null,
  approval_date date null,

  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  updated_by_user_id uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_employee_wellness_actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  assessment_id uuid not null references public.hr_employee_wellness_assessments(id) on delete cascade,

  identified_issue text not null,
  action_required text not null,
  responsible_employee_id uuid null references public.hr_employees(id) on delete set null,
  target_date date null,
  status text not null default 'OPEN' check (status in ('OPEN', 'IN_PROGRESS', 'COMPLETED')),
  completed_date date null,

  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  updated_by_user_id uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_hr_employee_wellness_assessments_company
  on public.hr_employee_wellness_assessments(company_id, assessment_date desc);

create index if not exists idx_hr_employee_wellness_assessments_employee
  on public.hr_employee_wellness_assessments(company_id, employee_id, assessment_date desc);

create index if not exists idx_hr_employee_wellness_actions_assessment
  on public.hr_employee_wellness_actions(company_id, assessment_id, target_date);

alter table public.hr_employee_wellness_assessments enable row level security;
alter table public.hr_employee_wellness_actions enable row level security;

drop policy if exists hr_wellness_assessments_all on public.hr_employee_wellness_assessments;
create policy hr_wellness_assessments_all on public.hr_employee_wellness_assessments for all
using (public.is_platform_admin() or public.is_company_member(company_id))
with check (public.is_platform_admin() or public.is_company_member(company_id));

drop policy if exists hr_wellness_actions_all on public.hr_employee_wellness_actions;
create policy hr_wellness_actions_all on public.hr_employee_wellness_actions for all
using (public.is_platform_admin() or public.is_company_member(company_id))
with check (public.is_platform_admin() or public.is_company_member(company_id));

