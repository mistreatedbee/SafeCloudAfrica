-- Fix: notification pipeline (email + in-app) silently no-ops for any user
-- who isn't a manager/admin/owner/consultant.
--
-- docs/migrations/user_profiles_rls_email_notifications_2026_07_30.sql already
-- fixed the user_profiles SELECT policy, but three more role-gated policies
-- sit in the same notification pipeline and independently block regular
-- employees, auditors, and consultants from ever triggering (or receiving) a
-- notification:
--
--   1. user_profiles SELECT   -- recipient email lookup (re-applied here so
--                                 this migration is the single source of
--                                 truth; also reconciles docs/phase2-schema.sql
--                                 drift, see below)
--   2. company_memberships SELECT -- role-based recipient resolution
--                                    (listRelevantNotificationRecipientIds)
--   3. notification_events INSERT/UPDATE -- the dedupe/log table every
--                                             notification (email + in-app)
--                                             must write to before it sends
--   4. notifications INSERT   -- in-app notifications table; the existing
--                                 ALL policy also blocks a user from marking
--                                 their OWN notification read, since it has
--                                 no self-referential clause on writes
--
-- None of these role restrictions were a deliberate product decision -- they
-- are an accidental side effect of policies written for admin-console-style
-- data protection (companies/memberships/billing) being reused verbatim on
-- tables that are actually part of the everyday notification path used by
-- every role.
--
-- This migration makes all four company-scoped by is_company_member()
-- (any ACTIVE membership row, any role, or the company's primary admin --
-- already role-agnostic) or is_platform_admin(), and standardizes on
-- request_user_id() instead of raw auth.uid() to match the rest of the
-- schema (final_feature_pass_2026_05_04.sql used auth.uid() directly for
-- notification_events, which was inconsistent).

-- (1) user_profiles SELECT -- any active company member (or platform admin)
-- can read profiles in their company, not just managers+.
drop policy if exists profiles_select_role on public.user_profiles;
drop policy if exists profiles_select_company_member on public.user_profiles;
create policy profiles_select_company_member
on public.user_profiles for select
using (
  public.is_company_member(company_id)
  or public.is_platform_admin()
);

-- (2) company_memberships SELECT -- any active member can resolve role-based
-- recipient lists (e.g. "notify all managers/owners of this event"), not
-- just consultant/admin+.
drop policy if exists memberships_select_member on public.company_memberships;
create policy memberships_select_member
on public.company_memberships for select
using (
  public.is_company_member(company_id)
  or public.is_platform_admin()
);
-- memberships_insert_admin / memberships_update_admin are intentionally left
-- untouched -- write access to membership rows is a separate privilege
-- escalation concern, not part of the notification-pipeline fix.

-- (3) notification_events INSERT/UPDATE -- any active company member can log
-- a notification event they triggered, not just owner/admin/manager/supervisor.
--
-- This table is normally created by docs/migrations/final_feature_pass_2026_05_04.sql.
-- If that migration was never applied to this database, `create table if not
-- exists` below brings it into existence here so this migration is safe to
-- run standalone, on a database at any prior migration state.
create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  recipient_user_id uuid not null,
  channel text not null check (channel in ('in_app', 'email')),
  event_key text not null,
  event_type text not null,
  title text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, recipient_user_id, channel, event_key)
);

create index if not exists idx_notification_events_company_created
  on public.notification_events(company_id, created_at desc);

create index if not exists idx_notification_events_recipient
  on public.notification_events(recipient_user_id, created_at desc);

alter table public.notification_events enable row level security;

drop policy if exists notification_events_company_read on public.notification_events;
create policy notification_events_company_read on public.notification_events
  for select
  using (
    recipient_user_id = public.request_user_id()
    or public.is_company_member(notification_events.company_id)
    or public.is_platform_admin()
  );

drop policy if exists notification_events_company_insert on public.notification_events;
create policy notification_events_company_insert on public.notification_events
  for insert
  with check (
    public.is_company_member(notification_events.company_id)
    or public.is_platform_admin()
  );

drop policy if exists notification_events_company_update on public.notification_events;
create policy notification_events_company_update on public.notification_events
  for update
  using (
    public.is_company_member(notification_events.company_id)
    or public.is_platform_admin()
  )
  with check (
    public.is_company_member(notification_events.company_id)
    or public.is_platform_admin()
  );
-- notification_events_company_read was also broadened above (recipient, or
-- any company member, or platform admin) for consistency with the rest of
-- this migration -- read-side visibility for non-recipients is an audit-log
-- concern, not a send-path blocker, so this is a low-risk, optional change.

-- (4) notifications (in-app) -- split the single management-only ALL policy
-- into two policies with different predicates: any active company member
-- can create a notification for a peer, but only the notification's own
-- recipient can update it (e.g. mark read).
drop policy if exists notifications_write_management on public.notifications;

drop policy if exists notifications_insert_member on public.notifications;
create policy notifications_insert_member on public.notifications
  for insert
  with check (
    public.is_company_member(company_id)
    or public.is_platform_admin()
  );

drop policy if exists notifications_update_self on public.notifications;
create policy notifications_update_self on public.notifications
  for update
  using (
    user_id = public.request_user_id()
    or public.is_platform_admin()
  )
  with check (
    user_id = public.request_user_id()
    or public.is_platform_admin()
  );
-- notifications_select_self is intentionally left untouched -- it already
-- allows a user to read only their own notifications, which is correct.
