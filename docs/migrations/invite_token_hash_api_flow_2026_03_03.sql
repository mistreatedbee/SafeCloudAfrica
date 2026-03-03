-- Invite token hash + lifecycle metadata hardening for API invite flow
-- Date: 2026-03-03
-- Safe to run multiple times.

alter table if exists public.company_invites
  add column if not exists token_hash text null,
  add column if not exists invited_by_user_id uuid null,
  add column if not exists last_sent_at timestamptz null,
  add column if not exists send_count integer not null default 0,
  add column if not exists audit_log_id uuid null;

update public.company_invites
set token_hash = encode(digest(coalesce(token, ''), 'sha256'), 'hex')
where token_hash is null
  and token is not null;

create unique index if not exists idx_company_invites_token_hash
  on public.company_invites(token_hash)
  where token_hash is not null;

create index if not exists idx_company_invites_company_email_pending
  on public.company_invites(company_id, lower(email))
  where status in ('PENDING', 'SENT', 'FAILED');

create index if not exists idx_company_invites_status_expires
  on public.company_invites(status, expires_at desc);

comment on column public.company_invites.token_hash is 'SHA-256 hash of raw invite token (raw token is never stored for new invites).';
comment on column public.company_invites.send_count is 'Number of send attempts for this invite.';
comment on column public.company_invites.last_sent_at is 'Last successful/attempted invite send timestamp.';
