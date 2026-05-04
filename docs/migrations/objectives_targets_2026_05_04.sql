-- Objectives & Targets: practical cross-module objective tracking.
-- Run against InsForge/Postgres after the Phase 2 base schema.

alter table public.module_targets
  add column if not exists description text null,
  add column if not exists target_text text null,
  add column if not exists category text null check (category is null or category in ('Safety','Health','Environment','Quality')),
  add column if not exists start_date date null,
  add column if not exists target_date date null,
  add column if not exists status text not null default 'not_started',
  add column if not exists responsible_employee_id uuid null,
  add column if not exists responsible_user_id uuid null,
  add column if not exists responsible_name text null,
  add column if not exists completed_at timestamptz null,
  add column if not exists closed_at timestamptz null,
  add column if not exists review_reason text null,
  add column if not exists review_corrective_action text null,
  add column if not exists review_responsible_employee_id uuid null,
  add column if not exists review_responsible_user_id uuid null,
  add column if not exists review_responsible_name text null,
  add column if not exists review_resources_required text null,
  add column if not exists review_start_date date null,
  add column if not exists review_action_status text null,
  add column if not exists review_close_date date null;

alter table public.module_targets
  drop constraint if exists module_targets_status_check;

alter table public.module_targets
  add constraint module_targets_status_check
  check (status in ('not_started','in_progress','completed','not_achieved'));

alter table public.module_targets
  drop constraint if exists module_targets_review_action_status_check;

alter table public.module_targets
  add constraint module_targets_review_action_status_check
  check (
    review_action_status is null
    or review_action_status in ('not_started','in_progress','completed')
  );

create index if not exists idx_module_targets_company_status
  on public.module_targets(company_id, module, status, target_date);

create index if not exists idx_module_targets_responsible_employee
  on public.module_targets(company_id, responsible_employee_id);
