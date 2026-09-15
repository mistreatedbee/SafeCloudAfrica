-- Objectives & Targets: proper review history + status propagation.
-- Apply date: 2026-09-15
--
-- module_targets only ever carried a single "current review" snapshot
-- (review_reason, review_corrective_action, ...), overwritten on every
-- save -- there was no history of past reviews to show a review trail,
-- and no per-review status independent of module_targets.status. This
-- adds a proper append-only review-history table; each review also still
-- updates module_targets.status so the objective's badge reflects the
-- latest review (until it reaches 'achieved', which is locked in the app).

create table if not exists public.module_target_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  module_target_id uuid not null references public.module_targets(id) on delete cascade,
  reviewer_user_id uuid null,
  reviewer_employee_id uuid null references public.hr_employees(id) on delete set null,
  reviewer_name text null,
  review_date date not null default current_date,
  status text not null check (
    status in ('not_started', 'in_progress', 'completed', 'not_achieved', 'on_hold', 'achieved', 'closed')
  ),
  notes text null,
  not_achieved_reason text null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now()
);

-- A reason is required whenever a review marks the objective not achieved.
alter table public.module_target_reviews drop constraint if exists module_target_reviews_not_achieved_reason_check;
alter table public.module_target_reviews
  add constraint module_target_reviews_not_achieved_reason_check
  check (status <> 'not_achieved' or (not_achieved_reason is not null and length(trim(not_achieved_reason)) > 0));

create index if not exists idx_module_target_reviews_target on public.module_target_reviews(module_target_id, review_date desc);
