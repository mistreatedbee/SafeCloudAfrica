-- HR Wellness Action Sign-Off + CLOSED status
-- Date: 2026-06-25
-- Safe to run multiple times.

alter table public.hr_employee_wellness_actions
  add column if not exists closed_by_user_id uuid null references auth.users(id) on delete set null,
  add column if not exists closed_at timestamptz null;

alter table public.hr_employee_wellness_actions
  drop constraint if exists hr_employee_wellness_actions_status_check;

alter table public.hr_employee_wellness_actions
  add constraint hr_employee_wellness_actions_status_check
  check (status in ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CLOSED'));

create table if not exists public.hr_action_signoff_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,

  entity_type text not null,
  entity_id uuid not null,
  assessment_id uuid null references public.hr_employee_wellness_assessments(id) on delete cascade,
  action_summary text null,

  requested_for_employee_id uuid not null references public.hr_employees(id) on delete cascade,
  requested_for_user_id uuid null references auth.users(id) on delete set null,
  requested_by_user_id uuid not null references auth.users(id) on delete restrict,

  status text not null default 'pending' check (status in ('pending', 'signed_off', 'cancelled')),
  note text null,
  signed_off_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_hr_action_signoff_requests_company
  on public.hr_action_signoff_requests(company_id, status);

create index if not exists idx_hr_action_signoff_requests_employee
  on public.hr_action_signoff_requests(company_id, requested_for_employee_id, status);

create index if not exists idx_hr_action_signoff_requests_entity
  on public.hr_action_signoff_requests(company_id, entity_type, entity_id);

create index if not exists idx_hr_action_signoff_requests_assessment
  on public.hr_action_signoff_requests(company_id, assessment_id);

alter table public.hr_action_signoff_requests enable row level security;

drop policy if exists hr_action_signoff_requests_all on public.hr_action_signoff_requests;
create policy hr_action_signoff_requests_all on public.hr_action_signoff_requests for all
using (public.is_platform_admin() or public.is_company_member(company_id))
with check (public.is_platform_admin() or public.is_company_member(company_id));
