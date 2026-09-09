-- Lightweight Super Admin reads: one RPC round-trip instead of wide table scans via PostgREST.
-- Reduces load on nano instances where PostgREST schema cache + multiple requests are costly.

create or replace function public.list_platform_companies_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return (
    select coalesce(jsonb_agg(row_to_json(s)), '[]'::jsonb)
    from (
      select
        c.id,
        c.name,
        c.code,
        c.license_type,
        c.employee_limit,
        c.metadata,
        c.status,
        c.created_at,
        coalesce(mc.member_count, 0)::int as user_count
      from public.companies c
      left join (
        select company_id, count(*)::int as member_count
        from public.company_memberships
        group by company_id
      ) mc on mc.company_id = c.id
      order by c.created_at desc
      limit 500
    ) s
  );
end;
$$;

grant execute on function public.list_platform_companies_summary() to authenticated;

create or replace function public.get_platform_overview_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orgs int;
  v_users int;
  v_active_licenses int;
  v_expiring_soon int;
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select count(*)::int into v_orgs from public.companies;
  select count(*)::int into v_users from public.company_memberships;

  if to_regclass('public.org_licenses') is not null then
    select count(*)::int into v_active_licenses
    from public.org_licenses
    where status = 'active';

    select count(*)::int into v_expiring_soon
    from public.org_licenses
    where status = 'active'
      and end_date is not null
      and end_date <= (now() + interval '30 days')
      and end_date >= now();
  else
    v_active_licenses := 0;
    v_expiring_soon := 0;
  end if;

  return jsonb_build_object(
    'totalOrgs', v_orgs,
    'totalUsers', v_users,
    'activeLicenses', v_active_licenses,
    'expiringSoon', v_expiring_soon
  );
end;
$$;

grant execute on function public.get_platform_overview_stats() to authenticated;

create or replace function public.ping_database()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('ok', true, 'at', now());
$$;

grant execute on function public.ping_database() to anon;
grant execute on function public.ping_database() to authenticated;

NOTIFY pgrst, 'reload schema';

create or replace function public.list_platform_license_keys()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return (
    select coalesce(jsonb_agg(row_to_json(k)), '[]'::jsonb)
    from (
      select
        id,
        key,
        plan_name,
        billing_cycle_months,
        seat_limit,
        modules_enabled,
        status,
        issued_to,
        expires_at,
        created_by_super_admin_id,
        created_at,
        used_at,
        used_by_organization_id
      from public.license_keys
      order by created_at desc
      limit 200
    ) k
  );
end;
$$;

grant execute on function public.list_platform_license_keys() to authenticated;

create or replace function public.list_platform_org_licenses()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return (
    select coalesce(jsonb_agg(row_to_json(l)), '[]'::jsonb)
    from (
      select *
      from public.org_licenses
      order by created_at desc
      limit 200
    ) l
  );
end;
$$;

grant execute on function public.list_platform_org_licenses() to authenticated;

NOTIFY pgrst, 'reload schema';
