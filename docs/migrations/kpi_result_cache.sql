-- KPI Result Cache: optional cache for computed KPI values (performance)
-- Invalidate when hours or incidents change in period, or use TTL.

create table if not exists public.kpi_result_cache (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  scope text not null check (scope in ('ORG', 'SITE', 'DEPARTMENT', 'PROJECT')),
  scope_id uuid null,
  period_start date not null,
  period_end date not null,
  kpi_key text not null,
  value numeric null,
  inputs_snapshot jsonb null,
  calculated_at timestamptz not null default now()
);

create unique index if not exists idx_kpi_result_cache_unique
  on public.kpi_result_cache(company_id, scope, coalesce(scope_id::text, ''), period_start, period_end, kpi_key);
create index if not exists idx_kpi_result_cache_company on public.kpi_result_cache(company_id, calculated_at desc);

alter table public.kpi_result_cache enable row level security;
drop policy if exists kpi_result_cache_select on public.kpi_result_cache;
create policy kpi_result_cache_select on public.kpi_result_cache for select
  using (public.is_company_member(company_id) or public.is_platform_admin());
drop policy if exists kpi_result_cache_write on public.kpi_result_cache;
create policy kpi_result_cache_write on public.kpi_result_cache for all
  using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
  with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

comment on table public.kpi_result_cache is 'Cached KPI values per period; invalidate when source data changes';
