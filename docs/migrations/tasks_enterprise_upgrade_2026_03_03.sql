-- Tasks enterprise upgrade: align schema with task services and dashboard filters.
-- Date: 2026-03-03
-- Safe to run multiple times.

alter table public.tasks
  add column if not exists category text null,
  add column if not exists risk_level text null,
  add column if not exists site_id uuid null,
  add column if not exists department_id uuid null,
  add column if not exists task_owner_user_id uuid null,
  add column if not exists allocated_by_user_id uuid null,
  add column if not exists supporting_team_user_ids uuid[] null,
  add column if not exists source_entity_type text null,
  add column if not exists source_entity_id uuid null,
  add column if not exists planned_start_date date null,
  add column if not exists planned_completion_date date null,
  add column if not exists estimated_hours numeric null,
  add column if not exists actual_start_at timestamptz null,
  add column if not exists actual_completion_at timestamptz null,
  add column if not exists time_spent_minutes integer null,
  add column if not exists delay_reason text null,
  add column if not exists extension_approved_by_user_id uuid null,
  add column if not exists extension_approved_at timestamptz null,
  add column if not exists extension_approval_json jsonb null,
  add column if not exists closure_date timestamptz null,
  add column if not exists final_status text null,
  add column if not exists lessons_learned text null;

-- Drop any existing status check before normalization so legacy constraints
-- do not block the status update step below.
do $$
declare
  rec record;
begin
  for rec in
    select distinct c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = t.oid and a.attnum = any(c.conkey)
    where n.nspname = 'public'
      and t.relname = 'tasks'
      and c.contype = 'c'
      and a.attname = 'status'
  loop
    execute format('alter table public.tasks drop constraint if exists %I', rec.conname);
  end loop;
end $$;

-- Normalize legacy statuses before enforcing the enterprise workflow check.
update public.tasks
set status = case
  when lower(replace(replace(trim(coalesce(status, '')), '_', '-'), ' ', '-')) = 'pending' and assignee_user_id is not null then 'assigned'
  when lower(replace(replace(trim(coalesce(status, '')), '_', '-'), ' ', '-')) = 'pending' then 'draft'
  when lower(replace(replace(trim(coalesce(status, '')), '_', '-'), ' ', '-')) in ('open') then 'assigned'
  when lower(replace(replace(trim(coalesce(status, '')), '_', '-'), ' ', '-')) in ('completed', 'complete', 'done') then 'closed'
  when lower(replace(replace(trim(coalesce(status, '')), '_', '-'), ' ', '-')) in ('reviewed', 'in-review', 'under-review') then 'under-review'
  when lower(replace(replace(trim(coalesce(status, '')), '_', '-'), ' ', '-')) in ('awaiting-evidence') then 'awaiting-evidence'
  when lower(replace(replace(trim(coalesce(status, '')), '_', '-'), ' ', '-')) in ('in-progress', 'inprogress') then 'in-progress'
  when lower(replace(replace(trim(coalesce(status, '')), '_', '-'), ' ', '-')) in ('draft', 'assigned', 'accepted', 'approved', 'closed', 'reopened', 'overdue') then lower(replace(replace(trim(coalesce(status, '')), '_', '-'), ' ', '-'))
  else 'draft'
end
where status is null
   or lower(replace(replace(trim(coalesce(status, '')), '_', '-'), ' ', '-')) not in (
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
   );

create or replace function public.normalize_task_status_before_write()
returns trigger
language plpgsql
as $$
begin
  -- Canonicalize common variants: case, spaces, and underscores.
  -- Example: "In Progress", "in_progress", and "IN-PROGRESS" -> "in-progress".
  new.status := lower(replace(replace(trim(coalesce(new.status, '')), '_', '-'), ' ', '-'));

  if new.status is null then
    new.status := 'draft';
  else
    new.status := case
      when new.status = '' then 'draft'
      when new.status = 'pending' and new.assignee_user_id is not null then 'assigned'
      when new.status = 'pending' then 'draft'
      when new.status in ('open') then 'assigned'
      when new.status in ('completed', 'complete', 'done') then 'closed'
      when new.status in ('reviewed', 'in-review', 'under-review') then 'under-review'
      when new.status in ('awaiting-evidence') then 'awaiting-evidence'
      when new.status in ('awaiting-ppe', 'awaiting-training') then 'awaiting-evidence'
      when new.status in ('in-progress', 'inprogress') then 'in-progress'
      when new.status in ('draft', 'assigned', 'accepted', 'approved', 'closed', 'reopened', 'overdue') then new.status
      else 'draft'
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tasks_normalize_status_before_write on public.tasks;
create trigger trg_tasks_normalize_status_before_write
before insert or update on public.tasks
for each row execute function public.normalize_task_status_before_write();

alter table public.tasks
  alter column status set default 'draft';

alter table public.tasks
  drop constraint if exists tasks_status_check;

alter table public.tasks
  add constraint tasks_status_check
  check (
    lower(replace(replace(trim(coalesce(status, '')), '_', '-'), ' ', '-')) in (
      'draft',
      'assigned',
      'accepted',
      'in-progress',
      'awaiting-evidence',
      'under-review',
      'approved',
      'closed',
      'reopened',
      'overdue',
      'pending',
      'open',
      'completed',
      'complete',
      'done',
      'reviewed',
      'in-review',
      'inprogress',
      'awaiting-ppe',
      'awaiting-training'
    )
  );

alter table public.tasks
  drop constraint if exists tasks_risk_level_check;

alter table public.tasks
  add constraint tasks_risk_level_check
  check (
    risk_level is null
    or risk_level in ('low', 'medium', 'high', 'critical')
  );

create index if not exists idx_tasks_company_category_status
  on public.tasks(company_id, category, status);

create index if not exists idx_tasks_company_source
  on public.tasks(company_id, source_entity_type, source_entity_id);
