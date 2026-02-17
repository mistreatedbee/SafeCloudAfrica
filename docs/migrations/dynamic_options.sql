-- DynamicOptions: reusable store for "Select OR Type" dropdown values (org/company-scoped).
-- Apply after phase2-schema.sql and incident_module_enhancements.sql.
-- Safe to run multiple times (create table if not exists, drop policy if exists).

-- ---------------------------------------------------------------------------
-- dynamic_options table
-- ---------------------------------------------------------------------------
create table if not exists public.dynamic_options (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  module_key text not null,
  field_key text not null,
  value text not null,
  status text not null default 'approved' check (status in ('pending', 'approved')),
  created_by_user_id uuid null,
  created_at timestamptz not null default now(),
  usage_count integer not null default 0
);

-- Case-insensitive unique: one option value per (company, module, field)
create unique index if not exists idx_dynamic_options_company_module_field_value_lower
  on public.dynamic_options(company_id, module_key, field_key, lower(trim(value)));

comment on table public.dynamic_options is 'User-typed dropdown values for Select OR Type pattern; company-scoped for reuse.';
comment on column public.dynamic_options.module_key is 'e.g. incidents, ppe, ncrs, risk, audits, training, kpi';
comment on column public.dynamic_options.field_key is 'e.g. incidentSubcategory, ppeIssueReason, ncrSource';
comment on column public.dynamic_options.value is 'Display string (trimmed)';
comment on column public.dynamic_options.status is 'pending = needs admin approval; approved = shown in dropdown';
comment on column public.dynamic_options.usage_count is 'Optional: for sorting by popularity';

create index if not exists idx_dynamic_options_company_module_field
  on public.dynamic_options(company_id, module_key, field_key);
create index if not exists idx_dynamic_options_approved
  on public.dynamic_options(company_id, module_key, field_key, status)
  where status = 'approved';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.dynamic_options enable row level security;

-- SELECT: any company member can read options for their company
drop policy if exists dynamic_options_select_member on public.dynamic_options;
create policy dynamic_options_select_member on public.dynamic_options
  for select
  using (public.is_company_member(company_id) or public.is_platform_admin());

-- INSERT: any company member can add a new typed value (for "Other")
drop policy if exists dynamic_options_insert_member on public.dynamic_options;
create policy dynamic_options_insert_member on public.dynamic_options
  for insert
  with check (public.is_company_member(company_id) or public.is_platform_admin());

-- UPDATE/DELETE: only admin/manager (consultant_or_admin) can approve, merge, or delete
drop policy if exists dynamic_options_update_admin on public.dynamic_options;
create policy dynamic_options_update_admin on public.dynamic_options
  for update
  using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
  with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

drop policy if exists dynamic_options_delete_admin on public.dynamic_options;
create policy dynamic_options_delete_admin on public.dynamic_options
  for delete
  using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());
