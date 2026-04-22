-- Manual-link invite alignment
-- 2026-04-22
-- Keep manual-link invites active as PENDING so token validation/acceptance works
-- in environments without /api/invites/* email routes.

comment on column public.company_invites.status is
  'PENDING | SENT | FAILED | ACCEPTED | EXPIRED | CANCELLED. Manual-link fallback invites stay PENDING until accepted, cancelled, or expired.';

create or replace function public.get_invite_id_by_token(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if nullif(trim(p_token), '') is null then
    return null;
  end if;

  update public.company_invites
  set status = 'EXPIRED'
  where token = trim(p_token)
    and status in ('PENDING', 'SENT')
    and expires_at is not null
    and expires_at <= now();

  select id into v_id
  from public.company_invites
  where token = trim(p_token)
    and status in ('PENDING', 'SENT')
    and (expires_at is null or expires_at > now())
  limit 1;

  return v_id;
end;
$$;

grant execute on function public.get_invite_id_by_token(text) to anon;
grant execute on function public.get_invite_id_by_token(text) to authenticated;

create or replace function public.validate_invitation_token(p_token text)
returns table(
  invite_id uuid,
  company_id uuid,
  company_name text,
  email text,
  role text,
  status text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    i.id,
    i.company_id,
    c.name,
    i.email,
    i.role,
    i.status,
    i.expires_at
  from public.company_invites i
  join public.companies c on c.id = i.company_id
  where i.token = trim(p_token)
    and i.status in ('PENDING', 'SENT')
    and (i.expires_at is null or i.expires_at > now())
  limit 1;
end;
$$;

grant execute on function public.validate_invitation_token(text) to anon;
grant execute on function public.validate_invitation_token(text) to authenticated;
