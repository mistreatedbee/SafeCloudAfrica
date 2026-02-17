-- Task Manager Module: Task Master Register extensions and task_time_logs
-- Apply after phase2-schema.sql. Safe to run multiple times (add column if not exists).

-- New columns on tasks
alter table public.tasks
  add column if not exists time_status_indicator text null check (time_status_indicator in ('on_schedule','at_risk','delayed','overdue','completed_early')),
  add column if not exists time_delay_minutes integer null,
  add column if not exists extension_new_due_at timestamptz null,
  add column if not exists extension_reason text null,
  add column if not exists progress_percent numeric null,
  add column if not exists comments jsonb null,
  add column if not exists progress_updates jsonb null,
  add column if not exists follow_up_inspection_ids uuid[] null,
  add column if not exists blocked_by_task_ids uuid[] null,
  add column if not exists effectiveness_checked boolean null,
  add column if not exists effectiveness_notes text null,
  add column if not exists effectiveness_check_date date null,
  add column if not exists site_name_text text null,
  add column if not exists department_name_text text null;

create index if not exists idx_tasks_time_status on public.tasks(company_id, time_status_indicator);
create index if not exists idx_tasks_status_due on public.tasks(company_id, status, due_at);

-- Task time logs (manual time entries)
create table if not exists public.task_time_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  started_at timestamptz null,
  ended_at timestamptz null,
  minutes integer null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_task_time_logs_task on public.task_time_logs(company_id, task_id);
create index if not exists idx_task_time_logs_company on public.task_time_logs(company_id);

-- RLS for task_time_logs: company members can select/insert/update; delete only own rows
alter table public.task_time_logs enable row level security;

drop policy if exists task_time_logs_select on public.task_time_logs;
create policy task_time_logs_select on public.task_time_logs for select
using (public.is_company_member(company_id));

drop policy if exists task_time_logs_insert on public.task_time_logs;
create policy task_time_logs_insert on public.task_time_logs for insert
with check (public.is_company_member(company_id));

drop policy if exists task_time_logs_update on public.task_time_logs;
create policy task_time_logs_update on public.task_time_logs for update
using (public.is_company_member(company_id));

drop policy if exists task_time_logs_delete on public.task_time_logs;
create policy task_time_logs_delete on public.task_time_logs for delete
using (public.is_company_member(company_id));
