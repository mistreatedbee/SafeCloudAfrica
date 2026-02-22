-- Super Admin bootstrap: allow-list by email + self-insert into platform_admins.
-- Apply after phase2-schema.sql. Safe to run multiple times.
-- Ensures ashleymashigo013@gmail.com (and any other listed email) becomes Super Admin on first login.

-- ---------------------------------------------------------------------------
-- 1) Table of allowed Super Admin emails (only these can self-bootstrap)
-- ---------------------------------------------------------------------------
create table if not exists public.super_admin_allowed_emails (
  email text not null primary key
);

alter table public.super_admin_allowed_emails enable row level security;

-- Only existing platform admins can read/manage the allow-list
drop policy if exists super_admin_allowed_emails_select on public.super_admin_allowed_emails;
create policy super_admin_allowed_emails_select
  on public.super_admin_allowed_emails for select
  using (public.is_platform_admin());

-- Allow insert/update only by platform admins (for adding more emails later)
drop policy if exists super_admin_allowed_emails_insert on public.super_admin_allowed_emails;
create policy super_admin_allowed_emails_insert
  on public.super_admin_allowed_emails for insert
  with check (public.is_platform_admin());

-- Seed the fixed Super Admin email (ignore if already present)
insert into public.super_admin_allowed_emails (email)
values ('ashleymashigo013@gmail.com')
on conflict (email) do nothing;

-- ---------------------------------------------------------------------------
-- 2) Allow INSERT on platform_admins when request user's email is in allow-list
-- ---------------------------------------------------------------------------
drop policy if exists platform_admins_insert_allowed_email on public.platform_admins;
create policy platform_admins_insert_allowed_email
  on public.platform_admins for insert
  with check (
    exists (
      select 1 from public.super_admin_allowed_emails a
      where lower(a.email) = lower(public.request_user_email())
    )
  );

-- ---------------------------------------------------------------------------
-- 3) RPC: ensure current user is in platform_admins if their email is allowed
-- ---------------------------------------------------------------------------
create or replace function public.ensure_me_as_super_admin()
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.request_user_id() is null then
    return;
  end if;
  -- RLS on platform_admins allows insert only when request_user_email() is in super_admin_allowed_emails
  insert into public.platform_admins (user_id)
  values (public.request_user_id())
  on conflict (user_id) do nothing;
end;
$$;

comment on function public.ensure_me_as_super_admin() is
  'If the current user email is in super_admin_allowed_emails, adds their user_id to platform_admins. No-op otherwise (RLS on platform_admins blocks insert).';

-- Grant to authenticated role so the app can call it after login
-- (service_role is Supabase-only; omit if your DB does not have it)
grant execute on function public.ensure_me_as_super_admin() to authenticated;
