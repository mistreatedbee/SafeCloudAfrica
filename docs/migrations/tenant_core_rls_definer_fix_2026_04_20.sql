-- Fix tenant-core RLS helper recursion / hanging reads on public.companies and
-- public.company_memberships.
--
-- Symptoms:
-- - GET /api/database/records/companies hangs or returns intermittent upstream errors
-- - GET /api/database/records/company_memberships hangs
-- - Other lightweight tables such as public.platform_admins still respond
--
-- Root cause:
-- Core RLS policies on companies and company_memberships call helper functions
-- that query those same RLS-protected tables. Under some tenant states this
-- creates self-referential policy evaluation and stalls tenant bootstrap/core
-- reads.
--
-- Repair strategy:
-- Replace the tenant access helper functions with SECURITY DEFINER versions so
-- they execute with table-owner privileges and do not recurse through RLS.
--
-- Safe to run multiple times.

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins a
    where a.user_id = public.request_user_id()
  );
$$;

create or replace function public.is_company_primary_admin(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.companies c
    where c.id = p_company_id
      and c.primary_admin_user_id = public.request_user_id()
  );
$$;

create or replace function public.is_company_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (
    exists (
      select 1
      from public.company_memberships m
      where m.company_id = p_company_id
        and m.user_id = public.request_user_id()
        and coalesce(nullif(to_jsonb(m)->>'status', ''), 'ACTIVE') = 'ACTIVE'
    )
    or exists (
      select 1
      from public.companies c
      where c.id = p_company_id
        and c.primary_admin_user_id = public.request_user_id()
    )
  );
$$;

create or replace function public.company_role(p_company_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select m.role
      from public.company_memberships m
      where m.company_id = p_company_id
        and m.user_id = public.request_user_id()
        and coalesce(nullif(to_jsonb(m)->>'status', ''), 'ACTIVE') = 'ACTIVE'
      limit 1
    ),
    (
      select 'owner'
      from public.companies c
      where c.id = p_company_id
        and c.primary_admin_user_id = public.request_user_id()
      limit 1
    )
  );
$$;

create or replace function public.is_company_admin(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.company_role(p_company_id) = 'admin';
$$;

create or replace function public.is_company_manager(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.company_role(p_company_id) in ('owner', 'admin', 'manager');
$$;

create or replace function public.is_company_supervisor(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.company_role(p_company_id) in ('owner', 'admin', 'manager', 'supervisor');
$$;

create or replace function public.is_company_consultant(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.company_role(p_company_id) = 'consultant';
$$;

create or replace function public.is_company_consultant_or_admin(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.company_role(p_company_id) in ('owner', 'admin', 'manager', 'supervisor', 'consultant');
$$;

create or replace function public.is_company_owner(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.company_role(p_company_id) = 'owner';
$$;

create or replace function public.is_company_owner_or_admin(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.company_role(p_company_id) in ('owner', 'admin');
$$;

grant execute on function public.is_platform_admin() to anon, authenticated;
grant execute on function public.is_company_primary_admin(uuid) to anon, authenticated;
grant execute on function public.is_company_member(uuid) to anon, authenticated;
grant execute on function public.company_role(uuid) to anon, authenticated;
grant execute on function public.is_company_admin(uuid) to anon, authenticated;
grant execute on function public.is_company_manager(uuid) to anon, authenticated;
grant execute on function public.is_company_supervisor(uuid) to anon, authenticated;
grant execute on function public.is_company_consultant(uuid) to anon, authenticated;
grant execute on function public.is_company_consultant_or_admin(uuid) to anon, authenticated;
grant execute on function public.is_company_owner(uuid) to anon, authenticated;
grant execute on function public.is_company_owner_or_admin(uuid) to anon, authenticated;
