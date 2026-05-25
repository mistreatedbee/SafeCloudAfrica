-- Migration: Extend safety objectives with new statuses and progress notes history
-- Date: 2026-05-25

-- 1. Widen the status check constraint to include on_hold, achieved, closed
alter table public.module_targets
  drop constraint if exists module_targets_status_check;

alter table public.module_targets
  add constraint module_targets_status_check
  check (status in (
    'not_started',
    'in_progress',
    'completed',
    'not_achieved',
    'on_hold',
    'achieved',
    'closed'
  ));

-- 2. Progress notes / update history table
create table if not exists public.module_target_notes (
  id                 uuid        primary key default gen_random_uuid(),
  company_id         uuid        not null references public.companies(id) on delete cascade,
  module_target_id   uuid        not null references public.module_targets(id) on delete cascade,
  note               text        not null,
  created_by_user_id uuid        not null,
  created_by_name    text        null,
  created_at         timestamptz not null default now()
);

create index if not exists idx_module_target_notes_target
  on public.module_target_notes(module_target_id, created_at desc);

alter table public.module_target_notes enable row level security;

-- RLS: scoped to company members via app.company_id context variable
create policy "company_rls" on public.module_target_notes
  for all
  using (company_id = current_setting('app.company_id', true)::uuid);
