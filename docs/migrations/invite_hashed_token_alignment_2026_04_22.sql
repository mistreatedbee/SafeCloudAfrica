-- Invite hashed-token alignment
-- 2026-04-22
-- Standardize modern invite flow around token_hash while preserving legacy token lookup.

alter table if exists public.company_invites
  alter column token drop not null;

alter table if exists public.company_invites
  alter column expires_at set not null;

alter table if exists public.company_invites
  alter column status set not null;

alter table if exists public.company_invites
  drop constraint if exists company_invites_status_check;

alter table if exists public.company_invites
  add constraint company_invites_status_check
  check (status in ('PENDING', 'SENT', 'FAILED', 'ACCEPTED', 'EXPIRED', 'CANCELLED'));

create unique index if not exists idx_company_invites_token_hash
  on public.company_invites(token_hash)
  where token_hash is not null;

drop index if exists idx_company_invites_company_email_pending;
create index if not exists idx_company_invites_company_email_active
  on public.company_invites(company_id, lower(email))
  where status in ('PENDING', 'SENT');

create unique index if not exists idx_company_invites_active_unique
  on public.company_invites(company_id, lower(email))
  where status in ('PENDING', 'SENT');
