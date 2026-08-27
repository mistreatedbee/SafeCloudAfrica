-- License Activation schema: companies status/country, license_keys, org_licenses extensions, invites token/expiry.
-- Apply after phase2-schema.sql, operating_model_roles_licensing.sql, org_licenses.sql, platform_admin_audit_logs.sql, super_admin_bootstrap.sql.
-- Safe to run multiple times (idempotent).

-- ---------------------------------------------------------------------------
-- 1) Companies: status, country, industry, updated_at
-- ---------------------------------------------------------------------------
alter table public.companies
  add column if not exists status text not null default 'active'
  check (status in ('active','suspended'));

alter table public.companies
  add column if not exists country text null;

-- Default existing rows to South Africa
update public.companies set country = 'South Africa' where country is null;
alter table public.companies alter column country set default 'South Africa';

alter table public.companies
  add column if not exists industry text null;

alter table public.companies
  add column if not exists updated_at timestamptz null;

update public.companies set updated_at = created_at where updated_at is null;
alter table public.companies alter column updated_at set default now();
alter table public.companies alter column updated_at set not null;

comment on column public.companies.status is 'Tenant status: active or suspended.';
comment on column public.companies.country is 'Country (default South Africa).';
comment on column public.companies.updated_at is 'Last updated timestamp.';

-- ---------------------------------------------------------------------------
-- 2) License keys (key-based activation; created by Super Admin before org exists)
-- ---------------------------------------------------------------------------
create table if not exists public.license_keys (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  plan_name text not null check (plan_name in ('base','growth','professional','hr_only')),
  billing_cycle_months integer not null check (billing_cycle_months in (3, 6, 9, 12)),
  seat_limit integer not null check (seat_limit >= 1 and seat_limit <= 50),
  modules_enabled jsonb not null default '[]'::jsonb,
  status text not null default 'unused' check (status in ('unused','used','revoked')),
  issued_to text null,
  expires_at timestamptz null,
  created_by_super_admin_id uuid not null,
  created_at timestamptz not null default now(),
  used_at timestamptz null,
  used_by_organization_id uuid null references public.companies(id) on delete set null
);

create index if not exists idx_license_keys_key on public.license_keys(key);
create index if not exists idx_license_keys_status on public.license_keys(status);
create index if not exists idx_license_keys_created_at on public.license_keys(created_at desc);

alter table public.license_keys enable row level security;

-- Only platform admins can read/write license_keys
drop policy if exists license_keys_select_platform_admin on public.license_keys;
create policy license_keys_select_platform_admin
  on public.license_keys for select
  using (public.is_platform_admin());

drop policy if exists license_keys_insert_platform_admin on public.license_keys;
create policy license_keys_insert_platform_admin
  on public.license_keys for insert
  with check (public.is_platform_admin());

drop policy if exists license_keys_update_platform_admin on public.license_keys;
create policy license_keys_update_platform_admin
  on public.license_keys for update
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

comment on table public.license_keys is 'License keys issued by Super Admin for client activation; one key creates one org + subscription.';

-- ---------------------------------------------------------------------------
-- 3) org_licenses: add billing_cycle_months, modules_enabled, license_key_id, activated_at, activated_by_user_id; status include 'pending'
-- ---------------------------------------------------------------------------
alter table public.org_licenses
  add column if not exists billing_cycle_months integer null
  check (billing_cycle_months is null or billing_cycle_months in (3, 6, 9, 12));

alter table public.org_licenses
  add column if not exists modules_enabled jsonb null default '[]'::jsonb;

alter table public.org_licenses
  add column if not exists license_key_id uuid null references public.license_keys(id) on delete set null;

alter table public.org_licenses
  add column if not exists activated_at timestamptz null;

alter table public.org_licenses
  add column if not exists activated_by_user_id uuid null;

-- Allow pending status (license created from key, not yet activated)
alter table public.org_licenses drop constraint if exists org_licenses_status_check;
alter table public.org_licenses
  add constraint org_licenses_status_check
  check (status in ('pending','active','expired','suspended'));

create index if not exists idx_org_licenses_license_key_id on public.org_licenses(license_key_id);

comment on column public.org_licenses.license_key_id is 'Set when subscription was activated from a license key.';
comment on column public.org_licenses.activated_at is 'When the subscription was activated (key-based flow).';
comment on column public.org_licenses.activated_by_user_id is 'User (owner) who activated the license.';

-- ---------------------------------------------------------------------------
-- 4) company_invites: token, expires_at, status
-- ---------------------------------------------------------------------------
alter table public.company_invites
  add column if not exists token text null;

alter table public.company_invites
  add column if not exists expires_at timestamptz null;

alter table public.company_invites
  add column if not exists status text null;

-- Backfill: generate token and expires_at for existing rows
-- De-duplicate active invites first (aligns with org_invites_end_to_end / invite_validation)
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
  error_message = coalesce(i.error_message, 'Auto-cancelled during license activation backfill.')
from ranked r
where i.id = r.id
  and r.rn > 1;

update public.company_invites
set
  token = coalesce(token, gen_random_uuid()::text),
  expires_at = coalesce(expires_at, created_at + interval '7 days'),
  status = case
    when accepted_at is not null then 'ACCEPTED'
    when expires_at is not null and expires_at <= now() then 'EXPIRED'
    else coalesce(nullif(upper(status), ''), 'PENDING')
  end
where token is null or expires_at is null or status is null;

alter table public.company_invites alter column token set not null;
alter table public.company_invites alter column expires_at set not null;
alter table public.company_invites alter column status set not null;

alter table public.company_invites drop constraint if exists company_invites_status_check;
alter table public.company_invites
  add constraint company_invites_status_check
  check (status in ('PENDING','SENT','FAILED','ACCEPTED','EXPIRED','CANCELLED'));

create unique index if not exists idx_company_invites_token on public.company_invites(token);

comment on column public.company_invites.token is 'Unique token for invite link (e.g. /invite/accept?token=...).';
comment on column public.company_invites.expires_at is 'Invite expiry.';
comment on column public.company_invites.status is 'PENDING | SENT | FAILED | ACCEPTED | EXPIRED | CANCELLED.';

-- ---------------------------------------------------------------------------
-- 5) RPC: resolve invite id by token (for /invite/accept?token=...)
-- Delegates to resolve_invitation_token (uppercase status lifecycle).
-- ---------------------------------------------------------------------------
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

comment on function public.get_invite_id_by_token(text) is 'Returns invite id for a valid token; used for token-based invite links.';

grant execute on function public.get_invite_id_by_token(text) to anon;
grant execute on function public.get_invite_id_by_token(text) to authenticated;
