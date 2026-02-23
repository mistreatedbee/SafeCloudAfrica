-- KPI Settings: per-organisation formula options (multiplier, defaults, LTI reset)
-- One row per company.

create table if not exists public.kpi_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  rate_multiplier_mode text not null check (rate_multiplier_mode in ('SMALL_BUSINESS', 'CORPORATE')) default 'SMALL_BUSINESS',
  default_days_worked numeric(5,2) not null default 21,
  default_standard_hours_per_day numeric(5,2) not null default 8,
  include_contractors_in_stats boolean not null default false,
  rolling_window_months integer not null default 12 check (rolling_window_months >= 1 and rolling_window_months <= 60),
  lti_reset_triggers text[] not null default array['LTI', 'FATALITY'],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.kpi_settings enable row level security;
drop policy if exists kpi_settings_select on public.kpi_settings;
create policy kpi_settings_select on public.kpi_settings for select
  using (public.is_company_member(company_id) or public.is_platform_admin());
drop policy if exists kpi_settings_write on public.kpi_settings;
create policy kpi_settings_write on public.kpi_settings for all
  using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
  with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

comment on table public.kpi_settings is 'Per-org KPI formula settings: 200k vs 1M multiplier, default days/hours, LTI reset triggers';
