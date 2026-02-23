-- Operational Inputs Monthly: denominators for Quality/Environment KPIs
-- e.g. total_deliveries, total_items_inspected, production_output, waste, energy

create table if not exists public.operational_inputs_monthly (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  site_id uuid null,
  year smallint not null check (year >= 2000 and year <= 2100),
  month smallint not null check (month >= 1 and month <= 12),
  total_deliveries numeric(14,2) null,
  total_items_inspected numeric(14,2) null,
  production_output numeric(14,2) null,
  total_energy_used numeric(14,2) null,
  recycled_waste numeric(14,2) null,
  total_waste_generated numeric(14,2) null,
  ppe_employees_observed integer null,
  ppe_employees_wearing integer null,
  created_by_user_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_operational_inputs_monthly_org
  on public.operational_inputs_monthly(company_id, year, month)
  where site_id is null;
create index if not exists idx_operational_inputs_monthly_company on public.operational_inputs_monthly(company_id, year desc, month desc);

alter table public.operational_inputs_monthly enable row level security;
drop policy if exists operational_inputs_monthly_select on public.operational_inputs_monthly;
create policy operational_inputs_monthly_select on public.operational_inputs_monthly for select
  using (public.is_company_member(company_id) or public.is_platform_admin());
drop policy if exists operational_inputs_monthly_write on public.operational_inputs_monthly;
create policy operational_inputs_monthly_write on public.operational_inputs_monthly for all
  using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
  with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

comment on table public.operational_inputs_monthly is 'Monthly operational denominators: deliveries, items inspected, production, energy, waste for KPI formulas';
