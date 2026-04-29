
-- Invite validation alignment patch
-- 2026-04-29
-- Ensures invite schema, canonical resolver functions, and legacy compatibility wrappers exist.

create extension if not exists pgcrypto;

alter table if exists public.company_invites
  add column if not exists token text null,
  add column if not exists token_hash text null,
  add column if not exists accepted_at timestamptz null,
  add column if not exists accepted_user_id uuid null,
  add column if not exists created_by_user_id uuid null,
  add column if not exists expires_at timestamptz null,
  add column if not exists error_message text null;

alter table if exists public.company_invites
  drop constraint if exists company_invites_status_check;

update public.company_invites
set status = case
  when upper(coalesce(status, '')) = 'PENDING' then 'PENDING'
  when upper(coalesce(status, '')) = 'SENT' then 'SENT'
  when upper(coalesce(status, '')) = 'FAILED' then 'FAILED'
  when upper(coalesce(status, '')) = 'ACCEPTED' then 'ACCEPTED'
  when upper(coalesce(status, '')) = 'EXPIRED' then 'EXPIRED'
  when upper(coalesce(status, '')) = 'CANCELLED' then 'CANCELLED'
  when accepted_at is not null then 'ACCEPTED'
  when expires_at is not null and expires_at <= now() then 'EXPIRED'
  else 'PENDING'
end;

update public.company_invites
set token_hash = encode(digest(token, 'sha256'), 'hex')
where token_hash is null
  and nullif(trim(token), '') is not null;

alter table if exists public.company_invites
  add constraint company_invites_status_check
  check (status in ('PENDING', 'SENT', 'FAILED', 'ACCEPTED', 'EXPIRED', 'CANCELLED'));

create unique index if not exists idx_company_invites_token_hash
  on public.company_invites(token_hash)
  where token_hash is not null;

with ranked as (
  select
    id,
    row_number() over (
      partition by company_id, lower(email)
      order by coalesce(sent_at, created_at) desc, created_at desc, id desc
    ) as rn
  from public.company_invites
  where status in ('PENDING', 'SENT')
)
update public.company_invites i
set
  status = 'CANCELLED',
  error_message = coalesce(i.error_message, 'Auto-cancelled during invite validation alignment.')
from ranked r
where i.id = r.id
  and r.rn > 1;

drop index if exists idx_company_invites_active_unique;
create unique index idx_company_invites_active_unique
  on public.company_invites(company_id, lower(email))
  where status in ('PENDING', 'SENT');

create or replace function public.resolve_invitation_token(p_token text)
returns table(
  resolution_code text,
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
declare
  v_token text;
  v_token_hash text;
  v_row record;
begin
  v_token := nullif(trim(p_token), '');
  if v_token is null then
    return query
    select 'not_found'::text, null::uuid, null::uuid, null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');

  update public.company_invites
  set status = 'EXPIRED'
  where (
      token_hash = v_token_hash
      or token = v_token
    )
    and status in ('PENDING', 'SENT')
    and expires_at is not null
    and expires_at <= now();

  select
    i.id,
    i.company_id,
    c.name as company_name,
    i.email,
    i.role,
    i.status,
    i.expires_at
  into v_row
  from public.company_invites i
  join public.companies c on c.id = i.company_id
  where i.token_hash = v_token_hash
     or i.token = v_token
  order by i.created_at desc
  limit 1;

  if not found then
    return query
    select 'not_found'::text, null::uuid, null::uuid, null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  if v_row.status = 'ACCEPTED' then
    return query
    select 'accepted'::text, v_row.id, v_row.company_id, v_row.company_name, v_row.email, v_row.role, v_row.status, v_row.expires_at;
    return;
  end if;

  if v_row.status = 'CANCELLED' then
    return query
    select 'cancelled'::text, v_row.id, v_row.company_id, v_row.company_name, v_row.email, v_row.role, v_row.status, v_row.expires_at;
    return;
  end if;

  if v_row.status = 'EXPIRED' or (v_row.expires_at is not null and v_row.expires_at <= now()) then
    return query
    select 'expired'::text, v_row.id, v_row.company_id, v_row.company_name, v_row.email, v_row.role, 'EXPIRED'::text, v_row.expires_at;
    return;
  end if;

  if v_row.status in ('PENDING', 'SENT') then
    return query
    select 'ok'::text, v_row.id, v_row.company_id, v_row.company_name, v_row.email, v_row.role, v_row.status, v_row.expires_at;
    return;
  end if;

  return query
  select 'not_found'::text, v_row.id, v_row.company_id, v_row.company_name, v_row.email, v_row.role, v_row.status, v_row.expires_at;
end;
$$;

grant execute on function public.resolve_invitation_token(text) to anon;
grant execute on function public.resolve_invitation_token(text) to authenticated;

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
    r.invite_id,
    r.company_id,
    r.company_name,
    r.email,
    r.role,
    r.status,
    r.expires_at
  from public.resolve_invitation_token(p_token) r
  where r.resolution_code = 'ok'
  limit 1;
end;
$$;

grant execute on function public.validate_invitation_token(text) to anon;
grant execute on function public.validate_invitation_token(text) to authenticated;

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

create or replace function public.check_invitation_token(p_token text)
returns table(
  invite_id uuid,
  company_id uuid,
  company_name text,
  email text,
  role text,
  status text,
  expires_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select *
  from public.validate_invitation_token(p_token);
$$;

grant execute on function public.check_invitation_token(text) to anon;
grant execute on function public.check_invitation_token(text) to authenticated;

create or replace function public.invite_id_by_token(p_token text)
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.get_invite_id_by_token(p_token);
$$;

grant execute on function public.invite_id_by_token(text) to anon;
grant execute on function public.invite_id_by_token(text) to authenticated;
