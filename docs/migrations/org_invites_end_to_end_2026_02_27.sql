-- End-to-end organization invite hardening
-- Date: 2026-02-27
-- Safe to run multiple times.

-- 1) Optional assignment fields on invites
alter table public.company_invites
  add column if not exists department_id uuid null references public.departments(id) on delete set null;

alter table public.company_invites
  add column if not exists site_id uuid null references public.sites(id) on delete set null;

create index if not exists idx_company_invites_department on public.company_invites(department_id) where department_id is not null;
create index if not exists idx_company_invites_site on public.company_invites(site_id) where site_id is not null;

-- 2) Status lifecycle includes CANCELLED
alter table public.company_invites drop constraint if exists company_invites_status_check;
alter table public.company_invites
  add constraint company_invites_status_check
  check (status in ('PENDING', 'SENT', 'FAILED', 'ACCEPTED', 'EXPIRED', 'CANCELLED'));

comment on column public.company_invites.status is 'PENDING | SENT | FAILED | ACCEPTED | EXPIRED | CANCELLED.';

-- 3) Only one active invite per org/email at a time
-- De-duplicate historical active invites so unique index creation cannot fail.
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
  error_message = coalesce(i.error_message, 'Auto-cancelled during invite dedupe migration.')
from ranked r
where i.id = r.id
  and r.rn > 1;

create unique index if not exists idx_company_invites_active_unique
on public.company_invites (company_id, lower(email))
where status in ('PENDING', 'SENT');

-- 4) Token resolver: only active, non-expired invites
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

-- 5) Public-safe validation payload for /accept-invite?token=...
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
