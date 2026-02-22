-- Org licenses / subscriptions for Super Admin: create and track licenses per organisation.
-- Apply after phase2-schema.sql and operating_model_roles_licensing.sql. Safe to run multiple times.

create table if not exists public.org_licenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  plan_name text not null check (plan_name in ('base','growth','professional','hr_only')),
  seat_limit integer not null check (seat_limit >= 1 and seat_limit <= 50),
  start_date date not null,
  end_date date not null,
  status text not null check (status in ('active','expired','suspended')),
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_org_licenses_company_id on public.org_licenses(company_id);
create index if not exists idx_org_licenses_status on public.org_licenses(status);
create index if not exists idx_org_licenses_end_date on public.org_licenses(end_date);

alter table public.org_licenses enable row level security;

-- Only platform admins can read/write org_licenses
drop policy if exists org_licenses_select_platform_admin on public.org_licenses;
create policy org_licenses_select_platform_admin
  on public.org_licenses for select
  using (public.is_platform_admin());

drop policy if exists org_licenses_insert_platform_admin on public.org_licenses;
create policy org_licenses_insert_platform_admin
  on public.org_licenses for insert
  with check (public.is_platform_admin());

drop policy if exists org_licenses_update_platform_admin on public.org_licenses;
create policy org_licenses_update_platform_admin
  on public.org_licenses for update
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

comment on table public.org_licenses is 'License/subscription records per organisation; created by Super Admin.';
