-- Invite feedback + owner/admin invite enforcement + token acceptance compatibility.
-- Apply after phase2-schema.sql, license_activation_schema.sql, operating_model_roles_licensing.sql.
-- Safe to run multiple times.

-- 1) Invite delivery fields
alter table public.company_invites
  add column if not exists sent_at timestamptz null;

alter table public.company_invites
  add column if not exists error_message text null;

-- 2) Normalize status values to uppercase lifecycle states
update public.company_invites
set status = case
  when upper(coalesce(status, '')) in ('PENDING') then 'PENDING'
  when upper(coalesce(status, '')) in ('SENT') then 'SENT'
  when upper(coalesce(status, '')) in ('FAILED') then 'FAILED'
  when upper(coalesce(status, '')) in ('ACCEPTED') then 'ACCEPTED'
  when upper(coalesce(status, '')) in ('EXPIRED') then 'EXPIRED'
  when accepted_at is not null then 'ACCEPTED'
  when expires_at is not null and expires_at <= now() then 'EXPIRED'
  else 'PENDING'
end;

alter table public.company_invites
  alter column status set default 'PENDING';

alter table public.company_invites drop constraint if exists company_invites_status_check;
alter table public.company_invites
  add constraint company_invites_status_check
  check (status in ('PENDING', 'SENT', 'FAILED', 'ACCEPTED', 'EXPIRED'));

-- Backfill sent_at for historical pending/sent rows
update public.company_invites
set sent_at = coalesce(sent_at, created_at)
where status in ('PENDING', 'SENT') and sent_at is null;

comment on column public.company_invites.status is 'PENDING | SENT | FAILED | ACCEPTED | EXPIRED.';
comment on column public.company_invites.sent_at is 'When invite delivery was queued/sent.';
comment on column public.company_invites.error_message is 'Delivery error details when status = FAILED.';

-- 3) Token resolution should accept both PENDING and SENT invites
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

-- 4) Enforce Owner/Admin invite writes in RLS
-- Read policy can still include manager for visibility if needed.
drop policy if exists invites_insert_admin on public.company_invites;
create policy invites_insert_admin
on public.company_invites for insert
with check (
  public.company_role(company_id) in ('owner', 'admin')
  or public.is_platform_admin()
);

drop policy if exists invites_update_admin on public.company_invites;
create policy invites_update_admin
on public.company_invites for update
using (
  public.company_role(company_id) in ('owner', 'admin')
  or public.is_platform_admin()
  or lower(email) = lower(public.request_user_email())
)
with check (
  public.company_role(company_id) in ('owner', 'admin')
  or public.is_platform_admin()
  or (
    lower(email) = lower(public.request_user_email())
    and accepted_user_id = public.request_user_id()
    and accepted_at is not null
  )
);
