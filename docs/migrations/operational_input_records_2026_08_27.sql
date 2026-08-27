-- Operational input records: full operational tracking per area
-- Apply date: 2026-08-27

create table if not exists public.operational_input_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  site_id uuid null,
  record_date date not null,
  area text not null check (area in ('safety', 'health', 'environment', 'quality', 'risk', 'compliance')),
  operational_output text not null,
  planned text null,
  done text null,
  findings_challenges text null,
  action_required text null,
  resources_needed text null,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  start_date date null,
  end_date date null,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed', 'delayed', 'overdue')),
  responsible_person_user_id uuid null references auth.users(id),
  responsible_person_name text null,
  completion_date date null,
  objective_achieved boolean null,
  objective_achieved_comments text null,
  created_by_user_id uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_operational_input_records_company_date
  on public.operational_input_records(company_id, record_date desc, created_at desc);

create index if not exists idx_operational_input_records_company_area
  on public.operational_input_records(company_id, area, status);

alter table public.operational_input_records enable row level security;

drop policy if exists operational_input_records_select on public.operational_input_records;
create policy operational_input_records_select on public.operational_input_records for select
  using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists operational_input_records_write on public.operational_input_records;
create policy operational_input_records_write on public.operational_input_records for all
  using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
  with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

comment on table public.operational_input_records is 'Operational input records by SHEQ area with planning, actions, and completion tracking';

NOTIFY pgrst, 'reload schema';
