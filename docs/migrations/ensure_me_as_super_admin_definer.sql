-- Fix 403 on ensure_me_as_super_admin: RLS on super_admin_allowed_emails only allows
-- platform admins to SELECT, so the invoker (not yet a platform admin) could not pass
-- the platform_admins insert policy. This migration replaces the RPC with SECURITY DEFINER
-- so the function runs with definer rights and can read the allow list and insert.
-- Apply after super_admin_bootstrap.sql. Safe to run multiple times.

create or replace function public.ensure_me_as_super_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_email text;
  v_allowed boolean;
begin
  v_uid := public.request_user_id();
  v_email := lower(trim(public.request_user_email()));
  if v_uid is null or v_email is null then
    return;
  end if;
  select exists (
    select 1 from public.super_admin_allowed_emails a
    where lower(trim(a.email)) = v_email
    limit 1
  ) into v_allowed;
  if not v_allowed then
    return;
  end if;
  insert into public.platform_admins (user_id)
  values (v_uid)
  on conflict (user_id) do nothing;
end;
$$;

comment on function public.ensure_me_as_super_admin() is
  'If the current user email is in super_admin_allowed_emails, adds their user_id to platform_admins. Runs as definer so it can read the allow list. No-op otherwise.';

grant execute on function public.ensure_me_as_super_admin() to authenticated;
