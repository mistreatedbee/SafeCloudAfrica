-- RPC: validate_license_key (anon/authenticated) and activate_license_key (authenticated).
-- Apply after license_activation_schema.sql. Safe to run multiple times.

-- ---------------------------------------------------------------------------
-- 1) Validate key: returns plan info for display; does not consume the key.
-- Allowed by anon + authenticated. Runs as definer to read license_keys.
-- ---------------------------------------------------------------------------
create or replace function public.validate_license_key(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if nullif(trim(p_key), '') is null then
    return null;
  end if;
  select id, plan_name, billing_cycle_months, seat_limit, modules_enabled, status, expires_at
  into r
  from public.license_keys
  where key = trim(p_key)
  limit 1;
  if not found then
    return null;
  end if;
  if r.status != 'unused' then
    return null;
  end if;
  if r.expires_at is not null and r.expires_at < now() then
    return null;
  end if;
  return jsonb_build_object(
    'plan_name', r.plan_name,
    'billing_cycle_months', r.billing_cycle_months,
    'seat_limit', r.seat_limit,
    'modules_enabled', coalesce(r.modules_enabled, '[]'::jsonb)
  );
end;
$$;

comment on function public.validate_license_key(text) is 'Returns plan details for a valid unused license key; used on activation page before submit.';

grant execute on function public.validate_license_key(text) to anon;
grant execute on function public.validate_license_key(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Activate license key: create company, owner membership, org_license; mark key used.
-- Caller must be authenticated; request_user_email() must match primary_contact_email.
-- ---------------------------------------------------------------------------
create or replace function public.activate_license_key(
  p_key text,
  p_company_name text,
  p_industry text,
  p_country text,
  p_primary_contact_name text,
  p_primary_contact_email text,
  p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_email text;
  v_key_id uuid;
  v_plan_name text;
  v_billing_cycle integer;
  v_seat_limit integer;
  v_modules jsonb;
  v_company_id uuid;
  v_start_date date;
  v_end_date date;
  v_license_id uuid;
begin
  v_uid := public.request_user_id();
  v_email := lower(trim(public.request_user_email()));
  if v_uid is null or v_email is null then
    raise exception 'Not authenticated';
  end if;
  if lower(trim(p_primary_contact_email)) != v_email then
    raise exception 'Primary contact email must match your account email';
  end if;

  -- Check user does not already belong to another org
  if exists (select 1 from public.company_memberships where user_id = v_uid) then
    raise exception 'Email already used in another organisation';
  end if;

  -- Validate key
  select id, plan_name, billing_cycle_months, seat_limit, coalesce(modules_enabled, '[]'::jsonb)
  into v_key_id, v_plan_name, v_billing_cycle, v_seat_limit, v_modules
  from public.license_keys
  where key = trim(p_key) and status = 'unused'
  limit 1;
  if not found then
    raise exception 'This license has already been activated or is no longer valid. Please contact support.';
  end if;
  if exists (select 1 from public.license_keys where id = v_key_id and expires_at is not null and expires_at < now()) then
    raise exception 'This license is no longer valid. Please contact support.';
  end if;

  v_start_date := current_date;
  v_end_date := v_start_date + (v_billing_cycle * interval '1 month');

  -- Create company
  insert into public.companies (
    name, license_type, employee_limit, primary_admin_user_id,
    industry, country, status, subscription_duration_months, metadata
  )
  values (
    trim(p_company_name),
    v_plan_name,
    v_seat_limit,
    v_uid,
    nullif(trim(p_industry), ''),
    nullif(trim(p_country), ''),
    'active',
    v_billing_cycle,
    jsonb_build_object('primary_contact_name', nullif(trim(p_primary_contact_name), ''), 'primary_contact_phone', nullif(trim(p_phone), ''))
  )
  returning id into v_company_id;

  -- Owner membership
  insert into public.company_memberships (company_id, user_id, role)
  values (v_company_id, v_uid, 'owner');

  -- Org license (subscription)
  insert into public.org_licenses (
    company_id, plan_name, seat_limit, start_date, end_date, status,
    billing_cycle_months, modules_enabled, license_key_id, activated_at, activated_by_user_id, created_by_user_id
  )
  values (
    v_company_id, v_plan_name, v_seat_limit,
    v_start_date, v_end_date, 'active',
    v_billing_cycle, v_modules, v_key_id, now(), v_uid, v_uid
  )
  returning id into v_license_id;

  -- Mark key used
  update public.license_keys
  set status = 'used', used_at = now(), used_by_organization_id = v_company_id
  where id = v_key_id;

  -- Audit (platform_admin_audit_logs allows insert by platform admin; we're definer so we can insert as system)
  begin
    insert into public.platform_admin_audit_logs (actor_user_id, action, target_company_id, details)
    values (v_uid, 'license_activated', v_company_id, jsonb_build_object(
      'license_key_id', v_key_id, 'plan_name', v_plan_name, 'seat_limit', v_seat_limit
    ));
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'organizationId', v_company_id,
    'userId', v_uid,
    'success', true
  );
end;
$$;

comment on function public.activate_license_key(text, text, text, text, text, text, text) is
  'Activates a license key: creates company, owner membership, org_license; marks key used. Caller must be authenticated and email must match primary_contact_email.';

grant execute on function public.activate_license_key(text, text, text, text, text, text, text) to authenticated;
