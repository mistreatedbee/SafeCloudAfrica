-- Work Hours Monthly: manual monthly hours capture for KPI denominators (Option 2)
-- One row per org (and optional site/department/project) per month.

create table if not exists public.work_hours_monthly (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  site_id uuid null,
  department_id uuid null,
  project_id uuid null,
  year smallint not null check (year >= 2000 and year <= 2100),
  month smallint not null check (month >= 1 and month <= 12),
  total_employees integer not null default 0,
  salaried_employees integer not null default 0,
  wage_employees integer not null default 0,
  standard_hours_per_day numeric(5,2) not null default 8,
  days_worked numeric(5,2) not null default 21,
  salaried_hours_calculated numeric(12,2) null,
  wage_hours_calculated numeric(12,2) null,
  overtime_hours_week_or_sat numeric(12,2) not null default 0,
  overtime_hours_sunday numeric(12,2) not null default 0,
  overtime_factor_week_or_sat numeric(4,2) not null default 1.5,
  overtime_factor_sunday numeric(4,2) not null default 2.0,
  employee_absent_days numeric(10,2) not null default 0,
  employee_absent_hours numeric(12,2) null,
  employee_transport_hours numeric(12,2) null,
  contractors_included boolean not null default false,
  contractor_ids uuid[] null,
  total_hours_worked_final numeric(14,2) not null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_work_hours_monthly_org_month
  on public.work_hours_monthly(company_id, year, month)
  where site_id is null and department_id is null and project_id is null;

create index if not exists idx_work_hours_monthly_company on public.work_hours_monthly(company_id, year desc, month desc);
create index if not exists idx_work_hours_monthly_scope on public.work_hours_monthly(company_id, site_id, department_id, project_id);

alter table public.work_hours_monthly enable row level security;
drop policy if exists work_hours_monthly_select on public.work_hours_monthly;
create policy work_hours_monthly_select on public.work_hours_monthly for select
  using (public.is_company_member(company_id) or public.is_platform_admin());
drop policy if exists work_hours_monthly_write on public.work_hours_monthly;
create policy work_hours_monthly_write on public.work_hours_monthly for all
  using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
  with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

comment on table public.work_hours_monthly is 'Monthly hours worked per org/site/department for KPI formulas (TRIR, LTIFR, etc.)';
