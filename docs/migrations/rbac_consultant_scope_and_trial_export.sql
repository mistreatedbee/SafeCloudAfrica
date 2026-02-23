-- RBAC: consultant/auditor scope helper and trial/export check.
-- Apply after organization_member_scope_seats.sql.
-- Safe to run multiple times.

-- ---------------------------------------------------------------------------
-- 1) Consultant/auditor scope: check if current user has access to module/dept/site (and not expired)
-- ---------------------------------------------------------------------------
create or replace function public.consultant_scope_permits(
  p_company_id uuid,
  p_module text default null,
  p_department_id uuid default null,
  p_site_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m record;
  scope jsonb;
  expires_at timestamptz;
  allowed_modules text[];
  allowed_departments uuid[];
  allowed_sites uuid[];
begin
  select role, consultant_scope into m
  from public.company_memberships
  where company_id = p_company_id
    and user_id = public.request_user_id()
    and status = 'ACTIVE'
  limit 1;
  if not found then
    return false;
  end if;
  if m.role not in ('consultant','auditor') then
    return true;
  end if;
  scope := m.consultant_scope;
  if scope is null then
    return false;
  end if;
  expires_at := (scope->>'expiresAt')::timestamptz;
  if expires_at is not null and now() > expires_at then
    return false;
  end if;
  if p_module is not null then
    allowed_modules := array(select jsonb_array_elements_text(scope->'allowedModules'));
    if allowed_modules is not null and array_length(allowed_modules, 1) > 0
       and not (p_module = any(allowed_modules)) then
      return false;
    end if;
  end if;
  if p_department_id is not null then
    allowed_departments := array(select (x->>0)::uuid from jsonb_array_elements(scope->'allowedDepartments') x);
    if allowed_departments is not null and array_length(allowed_departments, 1) > 0
       and not (p_department_id = any(allowed_departments)) then
      return false;
    end if;
  end if;
  if p_site_id is not null then
    allowed_sites := array(select (x->>0)::uuid from jsonb_array_elements(scope->'allowedSites') x);
    if allowed_sites is not null and array_length(allowed_sites, 1) > 0
       and not (p_site_id = any(allowed_sites)) then
      return false;
    end if;
  end if;
  return true;
end;
$$;

comment on function public.consultant_scope_permits(uuid, text, uuid, uuid) is 'True if current user is active in company and (not consultant/auditor or scope allows module/dept/site and not expired).';

grant execute on function public.consultant_scope_permits(uuid, text, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Can company export (download)? Trial = view only, no export.
-- ---------------------------------------------------------------------------
create or replace function public.can_company_export(p_company_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  in_trial boolean;
begin
  if public.is_platform_admin() then
    return true;
  end if;
  if not exists (
    select 1 from public.company_memberships m
    where m.company_id = p_company_id and m.user_id = public.request_user_id() and m.status = 'ACTIVE'
  ) then
    return false;
  end if;
  select (ol.is_trial = true and (ol.trial_ends_at is null or ol.trial_ends_at >= current_date))
  into in_trial
  from public.org_licenses ol
  where ol.company_id = p_company_id and ol.status = 'active'
  order by ol.end_date desc
  limit 1;
  return coalesce(in_trial, false) = false;
end;
$$;

comment on function public.can_company_export(uuid) is 'True if current user can export (download) for this company; false when subscription is in trial.';

grant execute on function public.can_company_export(uuid) to authenticated;
