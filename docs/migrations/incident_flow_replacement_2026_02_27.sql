-- Incident flow replacement support columns
-- Date: 2026-02-27

alter table public.incidents
  add column if not exists loss_illness_value numeric null,
  add column if not exists loss_injury_value numeric null,
  add column if not exists loss_civil_liability_value numeric null,
  add column if not exists loss_criminal_liability_value numeric null,
  add column if not exists loss_vicarious_liability_value numeric null,
  add column if not exists loss_substandard_quality_value numeric null,
  add column if not exists loss_types text[] null;

alter table public.incidents
  add column if not exists risk_category text null;

alter table public.incidents
  drop constraint if exists incidents_risk_category_check;

alter table public.incidents
  add constraint incidents_risk_category_check
  check (risk_category is null or risk_category in ('Low', 'Medium', 'High'));

create index if not exists idx_incidents_risk_category_simple
  on public.incidents(company_id, risk_category);
