-- Inspections module upgrade: frequency periods, template metadata, section scoring
-- Date: 2026-08-27

-- Widen frequency constraints (drop old checks if present, re-add unified set)
alter table if exists public.inspections
  drop constraint if exists inspections_frequency_check;

alter table if exists public.inspections
  add constraint inspections_frequency_check
  check (frequency is null or frequency in ('daily', 'weekly', 'monthly', 'quarterly', 'annually', 'audit-linked', 'ad_hoc'));

alter table if exists public.inspection_checklist_templates
  drop constraint if exists inspection_checklist_templates_frequency_check;

alter table if exists public.inspection_checklist_templates
  add column if not exists subtitle text null,
  add column if not exists default_area text null,
  add column if not exists default_auditor_user_id uuid null,
  add column if not exists default_area_manager_user_id uuid null;

alter table if exists public.inspection_checklist_templates
  add constraint inspection_checklist_templates_frequency_check
  check (frequency is null or frequency in ('daily', 'weekly', 'monthly', 'quarterly', 'annually', 'audit-linked', 'ad_hoc'));

alter table if exists public.inspection_runs
  drop constraint if exists inspection_runs_frequency_check;

alter table if exists public.inspection_runs
  add column if not exists tracking_period_key text null,
  add column if not exists tracking_period_label text null;

alter table if exists public.inspection_runs
  add constraint inspection_runs_frequency_check
  check (frequency is null or frequency in ('daily', 'weekly', 'monthly', 'quarterly', 'annually', 'audit-linked', 'ad_hoc'));

alter table if exists public.inspection_checklist_items
  add column if not exists allocated_score numeric null;

comment on column public.inspection_runs.tracking_period_key is 'Stable key for grouping runs by frequency period (e.g. 2026-W34, 2026-Q3).';
comment on column public.inspection_runs.tracking_period_label is 'Human-readable period label shown in the UI.';
