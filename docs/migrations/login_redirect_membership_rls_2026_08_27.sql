-- Fix post-login redirect to /activate for users who already have memberships.
-- Root cause: company_memberships SELECT used is_company_member(), which queries
-- the same table and can fail during bootstrap (empty result -> no_org).

drop policy if exists memberships_select_own on public.company_memberships;
create policy memberships_select_own
on public.company_memberships for select
using (user_id = public.request_user_id());

create or replace function public.get_my_login_redirect(p_preferred_company_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.request_user_id();
  v_company_id uuid;
  v_role text;
  v_company_status text;
  v_license_status text;
  v_license_end timestamptz;
  v_role_rank int;
  v_best_rank int := 999;
  v_best_company_id uuid;
  v_best_role text;
begin
  if v_uid is null then
    return jsonb_build_object('path', '/activate', 'reason', 'no_org');
  end if;

  for v_company_id, v_role in
    select m.company_id, m.role
    from public.company_memberships m
    where m.user_id = v_uid
      and coalesce(m.status, 'ACTIVE') = 'ACTIVE'
  loop
    if p_preferred_company_id is not null and v_company_id = p_preferred_company_id then
      v_best_company_id := v_company_id;
      v_best_role := v_role;
      exit;
    end if;

    v_role_rank := case lower(v_role)
      when 'owner' then 1
      when 'admin' then 2
      when 'manager' then 3
      when 'supervisor' then 4
      when 'consultant' then 5
      when 'employee' then 6
      when 'auditor' then 7
      else 999
    end;

    if v_role_rank < v_best_rank then
      v_best_rank := v_role_rank;
      v_best_company_id := v_company_id;
      v_best_role := v_role;
    end if;
  end loop;

  if v_best_company_id is null then
    select c.id, 'owner'
    into v_best_company_id, v_best_role
    from public.companies c
    where c.primary_admin_user_id = v_uid
    limit 1;
  end if;

  if v_best_company_id is null then
    return jsonb_build_object('path', '/activate', 'reason', 'no_org');
  end if;

  select c.status
  into v_company_status
  from public.companies c
  where c.id = v_best_company_id;

  if lower(coalesce(v_company_status, 'active')) = 'suspended' then
    return jsonb_build_object(
      'path', '/billing/status',
      'organizationId', v_best_company_id,
      'reason', 'suspended'
    );
  end if;

  select l.status, l.end_date
  into v_license_status, v_license_end
  from public.org_licenses l
  where l.company_id = v_best_company_id
  order by l.end_date desc nulls last
  limit 1;

  if found then
    if lower(coalesce(v_license_status, 'active')) in ('suspended', 'expired')
      or (v_license_end is not null and v_license_end < now()) then
      return jsonb_build_object(
        'path', '/billing/status',
        'organizationId', v_best_company_id,
        'reason', case when lower(coalesce(v_license_status, '')) = 'suspended' then 'suspended' else 'expired' end
      );
    end if;
  end if;

  return jsonb_build_object(
    'path', case lower(coalesce(v_best_role, ''))
      when 'owner' then '/org/dashboard'
      when 'admin' then '/admin/dashboard'
      when 'manager' then '/manager/dashboard'
      when 'supervisor' then '/supervisor/dashboard'
      when 'consultant' then '/consultant/dashboard'
      when 'employee' then '/employee/dashboard'
      when 'auditor' then '/auditor/dashboard'
      else '/app'
    end,
    'organizationId', v_best_company_id
  );
end;
$$;

grant execute on function public.get_my_login_redirect(uuid) to authenticated;

NOTIFY pgrst, 'reload schema';
