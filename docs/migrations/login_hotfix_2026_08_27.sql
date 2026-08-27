-- Login hotfix: restore invite token resolver + safe super-admin bootstrap RPC.
-- license_activation_schema.sql overwrote get_invite_id_by_token with lowercase status checks.

create or replace function public.get_invite_id_by_token(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  select * into v_row
  from public.resolve_invitation_token(p_token)
  limit 1;

  if v_row.resolution_code = 'ok' then
    return v_row.invite_id;
  end if;

  return null;
end;
$$;

grant execute on function public.get_invite_id_by_token(text) to anon;
grant execute on function public.get_invite_id_by_token(text) to authenticated;

create or replace function public.ensure_me_as_super_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.request_user_id() is null then
    return;
  end if;

  if not exists (
    select 1
    from public.super_admin_allowed_emails a
    where lower(a.email) = lower(coalesce(public.request_user_email(), ''))
  ) then
    return;
  end if;

  insert into public.platform_admins (user_id)
  values (public.request_user_id())
  on conflict (user_id) do nothing;
end;
$$;

grant execute on function public.ensure_me_as_super_admin() to authenticated;

NOTIFY pgrst, 'reload schema';
