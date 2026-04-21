-- Environmental HR employee snapshots and IDs (2026-04-21)
-- Supports Environmental forms selecting HR employees that may not have linked auth user accounts.

alter table if exists public.env_impact_assessments
  add column if not exists responsible_employee_id uuid null references public.hr_employees(id) on delete set null,
  add column if not exists responsible_name_snapshot text null;

alter table if exists public.env_risk_opportunity
  add column if not exists responsible_employee_id uuid null references public.hr_employees(id) on delete set null,
  add column if not exists responsible_name_snapshot text null;

alter table if exists public.env_waste_disposal
  add column if not exists responsible_employee_id uuid null references public.hr_employees(id) on delete set null,
  add column if not exists responsible_name_snapshot text null,
  add column if not exists reviewed_by_employee_id uuid null references public.hr_employees(id) on delete set null,
  add column if not exists reviewed_by_name_snapshot text null,
  add column if not exists approved_by_employee_id uuid null references public.hr_employees(id) on delete set null,
  add column if not exists approved_by_name_snapshot text null;

alter table if exists public.env_water_monitoring
  add column if not exists reviewed_by_employee_id uuid null references public.hr_employees(id) on delete set null,
  add column if not exists reviewed_by_name_snapshot text null,
  add column if not exists approved_by_employee_id uuid null references public.hr_employees(id) on delete set null,
  add column if not exists approved_by_name_snapshot text null;

alter table if exists public.env_air_quality
  add column if not exists reviewed_by_employee_id uuid null references public.hr_employees(id) on delete set null,
  add column if not exists reviewed_by_name_snapshot text null,
  add column if not exists approved_by_employee_id uuid null references public.hr_employees(id) on delete set null,
  add column if not exists approved_by_name_snapshot text null;

create index if not exists idx_env_impact_assessments_responsible_employee
  on public.env_impact_assessments(company_id, responsible_employee_id);

create index if not exists idx_env_risk_opportunity_responsible_employee
  on public.env_risk_opportunity(company_id, responsible_employee_id);

create index if not exists idx_env_waste_disposal_responsible_employee
  on public.env_waste_disposal(company_id, responsible_employee_id);
