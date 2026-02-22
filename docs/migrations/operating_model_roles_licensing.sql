-- Operating Model: add Organisation Owner role + new license tiers and payment durations.
-- Apply after phase2-schema.sql. Safe to run multiple times.

-- ---------------------------------------------------------------------------
-- 1) Add 'owner' to company_memberships role
-- ---------------------------------------------------------------------------
alter table public.company_memberships
  drop constraint if exists company_memberships_role_check;

alter table public.company_memberships
  add constraint company_memberships_role_check
  check (role in ('owner','admin','manager','supervisor','consultant','employee','auditor'));

-- ---------------------------------------------------------------------------
-- 2) Add 'owner' to company_invites role
-- ---------------------------------------------------------------------------
alter table public.company_invites
  drop constraint if exists company_invites_role_check;

alter table public.company_invites
  add constraint company_invites_role_check
  check (role in ('owner','admin','manager','supervisor','consultant','employee','auditor'));

-- ---------------------------------------------------------------------------
-- 3) Extend companies.license_type to include new tiers (keep legacy for compat)
-- Base (1-5), Growth (6-20), Professional (21-50), HR-only (1-5)
-- ---------------------------------------------------------------------------
alter table public.companies
  drop constraint if exists companies_license_type_check;

alter table public.companies
  add constraint companies_license_type_check
  check (license_type in (
    'starter_6m','professional_12m','enterprise_custom',
    'base','growth','professional','hr_only'
  ));

-- ---------------------------------------------------------------------------
-- 4) Payment duration (months): 3, 6, 9, 12 - store in metadata or column
-- ---------------------------------------------------------------------------
alter table public.companies
  add column if not exists subscription_duration_months integer null
  check (subscription_duration_months is null or subscription_duration_months in (3, 6, 9, 12));

comment on column public.companies.subscription_duration_months is 'Payment plan duration in months (3, 6, 9, 12). Null = legacy/one-off.';

-- ---------------------------------------------------------------------------
-- 5) RLS helper: is_company_owner (Organisation Owner = executive)
-- ---------------------------------------------------------------------------
create or replace function public.is_company_owner(p_company_id uuid)
returns boolean
language sql
stable
as $$
  select public.company_role(p_company_id) = 'owner';
$$;

-- Owner can do everything admin can for their org
create or replace function public.is_company_owner_or_admin(p_company_id uuid)
returns boolean
language sql
stable
as $$
  select public.company_role(p_company_id) in ('owner','admin');
$$;

-- ---------------------------------------------------------------------------
-- 6) Update RLS policies that currently allow only admin to allow owner or admin
-- (company_memberships insert/update: owner can appoint admins)
-- ---------------------------------------------------------------------------
drop policy if exists memberships_insert_admin on public.company_memberships;
create policy memberships_insert_admin on public.company_memberships
  for insert
  with check (
    public.is_company_owner_or_admin(company_id)
    or public.is_company_primary_admin(company_id)
    or public.is_platform_admin()
  );

drop policy if exists memberships_update_admin on public.company_memberships;
create policy memberships_update_admin on public.company_memberships
  for update
  using (public.is_company_owner_or_admin(company_id) or public.is_platform_admin())
  with check (public.is_company_owner_or_admin(company_id) or public.is_platform_admin());
