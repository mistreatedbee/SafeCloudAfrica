-- Support & Admin Contact System
-- 2026-05-05
-- Extends the existing Phase 2 support_tickets table into a ticket-based
-- support centre with threaded replies, attachments, event history, and
-- platform-admin notifications. Safe to run multiple times.

-- ---------------------------------------------------------------------------
-- Support ticket reference counter
-- ---------------------------------------------------------------------------
create table if not exists public.support_ticket_reference_counter (
  year integer primary key,
  last_number integer not null default 0,
  updated_at timestamptz not null default now()
);

create or replace function public.next_support_ticket_reference()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer := extract(year from now())::integer;
  v_next integer;
begin
  insert into public.support_ticket_reference_counter(year, last_number)
  values (v_year, 1)
  on conflict (year)
  do update set
    last_number = public.support_ticket_reference_counter.last_number + 1,
    updated_at = now()
  returning last_number into v_next;

  return 'SCA-' || v_year::text || '-' || lpad(v_next::text, 6, '0');
end;
$$;

grant execute on function public.next_support_ticket_reference() to authenticated;

-- ---------------------------------------------------------------------------
-- Tickets
-- ---------------------------------------------------------------------------
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid null,
  user_email text null,
  category text not null default 'general_query',
  subject text not null,
  description text not null,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.support_tickets add column if not exists reference_number text;
alter table public.support_tickets add column if not exists company_name_snapshot text null;
alter table public.support_tickets add column if not exists created_by_user_id uuid null;
alter table public.support_tickets add column if not exists created_by_name text null;
alter table public.support_tickets add column if not exists created_by_email text null;
alter table public.support_tickets add column if not exists subcategory text null;
alter table public.support_tickets add column if not exists priority text not null default 'medium';
alter table public.support_tickets add column if not exists assigned_to_user_id uuid null;
alter table public.support_tickets add column if not exists resolved_at timestamptz null;
alter table public.support_tickets add column if not exists closed_at timestamptz null;
alter table public.support_tickets add column if not exists closed_by_user_id uuid null;
alter table public.support_tickets add column if not exists source text not null default 'manual';

alter table public.support_tickets drop constraint if exists support_tickets_category_check;
alter table public.support_tickets drop constraint if exists support_tickets_status_check;
alter table public.support_tickets drop constraint if exists support_tickets_priority_check;
alter table public.support_tickets drop constraint if exists support_tickets_source_check;

update public.support_tickets
set
  created_by_user_id = coalesce(created_by_user_id, user_id),
  created_by_email = coalesce(created_by_email, user_email),
  status = case status
    when 'in-progress' then 'in_progress'
    when 'open' then 'open'
    when 'closed' then 'closed'
    else coalesce(status, 'new')
  end,
  category = case category
    when 'bug' then 'technical_issue'
    when 'access' then 'user_organisation_access'
    when 'billing' then 'license_subscription'
    when 'feature-request' then 'module_access'
    when 'other' then 'general_query'
    else coalesce(category, 'general_query')
  end;

do $$
declare
  r record;
begin
  for r in
    select id, created_at
    from public.support_tickets
    where reference_number is null
    order by created_at, id
  loop
    update public.support_tickets
    set reference_number = public.next_support_ticket_reference()
    where id = r.id;
  end loop;
end;
$$;

alter table public.support_tickets alter column reference_number set not null;
alter table public.support_tickets alter column user_id drop not null;
alter table public.support_tickets alter column user_email drop not null;

do $$
begin
  alter table public.support_tickets drop constraint if exists support_tickets_category_check;
  alter table public.support_tickets drop constraint if exists support_tickets_status_check;
  alter table public.support_tickets drop constraint if exists support_tickets_priority_check;
  alter table public.support_tickets drop constraint if exists support_tickets_source_check;

  alter table public.support_tickets
    add constraint support_tickets_category_check
    check (category in (
      'technical_issue',
      'license_subscription',
      'module_access',
      'user_organisation_access',
      'document_compliance_help',
      'general_query'
    ));

  alter table public.support_tickets
    add constraint support_tickets_status_check
    check (status in (
      'new',
      'open',
      'in_progress',
      'waiting_for_user',
      'escalated',
      'resolved',
      'closed'
    ));

  alter table public.support_tickets
    add constraint support_tickets_priority_check
    check (priority in ('low', 'medium', 'high', 'critical'));

  alter table public.support_tickets
    add constraint support_tickets_source_check
    check (source in ('manual', 'assistant', 'admin'));
exception
  when duplicate_object then null;
end;
$$;

create unique index if not exists support_tickets_reference_number_key
  on public.support_tickets(reference_number);
create index if not exists idx_support_tickets_company on public.support_tickets(company_id, created_at desc);
create index if not exists idx_support_tickets_company_created_at on public.support_tickets(company_id, created_at desc);
create index if not exists idx_support_tickets_created_by on public.support_tickets(created_by_user_id);
create index if not exists idx_support_tickets_status on public.support_tickets(status);
create index if not exists idx_support_tickets_priority on public.support_tickets(priority);
create index if not exists idx_support_tickets_category on public.support_tickets(category);
create index if not exists idx_support_tickets_assigned_to on public.support_tickets(assigned_to_user_id);

-- ---------------------------------------------------------------------------
-- Conversation, attachments, and ticket event history
-- ---------------------------------------------------------------------------
create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  sender_user_id uuid null,
  sender_name text null,
  sender_email text null,
  sender_role text not null default 'user',
  body text not null,
  is_internal_note boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_support_ticket_messages_ticket
  on public.support_ticket_messages(ticket_id, created_at);
create index if not exists idx_support_ticket_messages_company
  on public.support_ticket_messages(company_id, created_at desc);

create table if not exists public.support_ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  message_id uuid null references public.support_ticket_messages(id) on delete set null,
  company_id uuid not null references public.companies(id) on delete cascade,
  storage_bucket text not null,
  storage_key text not null,
  original_filename text null,
  mime_type text null,
  file_size bigint null,
  uploaded_by_user_id uuid null,
  created_at timestamptz not null default now()
);

create index if not exists idx_support_ticket_attachments_ticket
  on public.support_ticket_attachments(ticket_id, created_at desc);
create index if not exists idx_support_ticket_attachments_company
  on public.support_ticket_attachments(company_id, created_at desc);

create table if not exists public.support_ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_user_id uuid null,
  actor_name text null,
  event_type text not null,
  from_value text null,
  to_value text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_support_ticket_events_ticket
  on public.support_ticket_events(ticket_id, created_at desc);
create index if not exists idx_support_ticket_events_company
  on public.support_ticket_events(company_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Notification helpers
-- ---------------------------------------------------------------------------
create or replace function public.notify_platform_admins_support_ticket(
  p_company_id uuid,
  p_ticket_id uuid,
  p_reference_number text,
  p_category text,
  p_priority text,
  p_subject text,
  p_requested_by_user_id uuid,
  p_requested_by_email text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender text;
  v_inserted integer := 0;
  v_severity text;
begin
  v_sender := coalesce(nullif(trim(p_requested_by_email), ''), p_requested_by_user_id::text, 'A user');
  v_severity := case
    when p_priority = 'critical' then 'critical'
    when p_priority = 'high' then 'high'
    else 'medium'
  end;

  insert into public.notifications (
    company_id,
    user_id,
    title,
    message,
    severity,
    read_at,
    metadata
  )
  select
    p_company_id,
    a.user_id,
    case
      when p_category = 'license_subscription' then 'License Support Request'
      when p_category = 'module_access' then 'Module Access Request'
      when p_priority = 'critical' then 'Critical Support Ticket'
      else 'New Support Ticket'
    end,
    (v_sender || ' created support ticket ' || p_reference_number || ': ' || coalesce(nullif(trim(p_subject), ''), p_category) || '.'),
    v_severity,
    null,
    jsonb_build_object(
      'ticket_id', p_ticket_id,
      'reference_number', p_reference_number,
      'category', p_category,
      'priority', p_priority,
      'requested_by_user_id', p_requested_by_user_id,
      'requested_by_email', p_requested_by_email,
      'notification_type', 'info',
      'action', 'support_ticket_created'
    )
  from public.platform_admins a;

  get diagnostics v_inserted = row_count;
  return coalesce(v_inserted, 0);
end;
$$;

grant execute on function public.notify_platform_admins_support_ticket(uuid, uuid, text, text, text, text, uuid, text)
to authenticated;

create or replace function public.create_support_ticket_with_message(
  p_company_id uuid,
  p_company_name_snapshot text,
  p_created_by_user_id uuid,
  p_created_by_name text,
  p_created_by_email text,
  p_category text,
  p_subcategory text,
  p_subject text,
  p_description text,
  p_priority text,
  p_source text
)
returns public.support_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.support_tickets;
begin
  if not public.is_company_member(p_company_id) and not public.is_platform_admin() then
    raise exception 'Not allowed to create support tickets for this organisation';
  end if;

  insert into public.support_tickets (
    company_id,
    user_id,
    user_email,
    reference_number,
    company_name_snapshot,
    created_by_user_id,
    created_by_name,
    created_by_email,
    category,
    subcategory,
    subject,
    description,
    priority,
    status,
    source
  )
  values (
    p_company_id,
    p_created_by_user_id,
    p_created_by_email,
    public.next_support_ticket_reference(),
    nullif(trim(p_company_name_snapshot), ''),
    p_created_by_user_id,
    nullif(trim(p_created_by_name), ''),
    nullif(trim(p_created_by_email), ''),
    p_category,
    nullif(trim(p_subcategory), ''),
    nullif(trim(p_subject), ''),
    nullif(trim(p_description), ''),
    coalesce(nullif(trim(p_priority), ''), 'medium'),
    'new',
    coalesce(nullif(trim(p_source), ''), 'manual')
  )
  returning * into v_ticket;

  insert into public.support_ticket_messages (
    ticket_id,
    company_id,
    sender_user_id,
    sender_name,
    sender_email,
    sender_role,
    body,
    is_internal_note
  )
  values (
    v_ticket.id,
    v_ticket.company_id,
    p_created_by_user_id,
    nullif(trim(p_created_by_name), ''),
    nullif(trim(p_created_by_email), ''),
    'user',
    nullif(trim(p_description), ''),
    false
  );

  insert into public.support_ticket_events (
    ticket_id,
    company_id,
    actor_user_id,
    actor_name,
    event_type,
    to_value,
    metadata
  )
  values (
    v_ticket.id,
    v_ticket.company_id,
    p_created_by_user_id,
    nullif(trim(p_created_by_name), ''),
    'ticket_created',
    v_ticket.status,
    jsonb_build_object('reference_number', v_ticket.reference_number, 'source', v_ticket.source)
  );

  perform public.notify_platform_admins_support_ticket(
    v_ticket.company_id,
    v_ticket.id,
    v_ticket.reference_number,
    v_ticket.category,
    v_ticket.priority,
    v_ticket.subject,
    v_ticket.created_by_user_id,
    v_ticket.created_by_email
  );

  return v_ticket;
end;
$$;

grant execute on function public.create_support_ticket_with_message(uuid, text, uuid, text, text, text, text, text, text, text, text)
to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;
alter table public.support_ticket_attachments enable row level security;
alter table public.support_ticket_events enable row level security;

drop policy if exists support_tickets_select_user on public.support_tickets;
create policy support_tickets_select_user
on public.support_tickets for select
using (
  created_by_user_id = public.request_user_id()
  or user_id = public.request_user_id()
  or public.is_company_admin(company_id)
  or public.is_platform_admin()
);

drop policy if exists support_tickets_insert_member on public.support_tickets;
create policy support_tickets_insert_member
on public.support_tickets for insert
with check (
  (created_by_user_id = public.request_user_id() and public.is_company_member(company_id))
  or public.is_platform_admin()
);

drop policy if exists support_tickets_update_management on public.support_tickets;
create policy support_tickets_update_management
on public.support_tickets for update
using (public.is_company_admin(company_id) or public.is_platform_admin())
with check (public.is_company_admin(company_id) or public.is_platform_admin());

drop policy if exists support_ticket_messages_select on public.support_ticket_messages;
create policy support_ticket_messages_select
on public.support_ticket_messages for select
using (
  (
    not is_internal_note
    and exists (
      select 1
      from public.support_tickets t
      where t.id = ticket_id
        and (
          t.created_by_user_id = public.request_user_id()
          or t.user_id = public.request_user_id()
          or public.is_company_admin(t.company_id)
          or public.is_platform_admin()
        )
    )
  )
  or public.is_platform_admin()
);

drop policy if exists support_ticket_messages_insert on public.support_ticket_messages;
create policy support_ticket_messages_insert
on public.support_ticket_messages for insert
with check (
  (
    is_internal_note = false
    and exists (
      select 1
      from public.support_tickets t
      where t.id = ticket_id
        and t.company_id = company_id
        and (
          t.created_by_user_id = public.request_user_id()
          or t.user_id = public.request_user_id()
          or public.is_company_admin(t.company_id)
          or public.is_platform_admin()
        )
    )
  )
  or public.is_platform_admin()
);

drop policy if exists support_ticket_attachments_select on public.support_ticket_attachments;
create policy support_ticket_attachments_select
on public.support_ticket_attachments for select
using (
  exists (
    select 1
    from public.support_tickets t
    where t.id = ticket_id
      and (
        t.created_by_user_id = public.request_user_id()
        or t.user_id = public.request_user_id()
        or public.is_company_admin(t.company_id)
        or public.is_platform_admin()
      )
  )
);

drop policy if exists support_ticket_attachments_insert on public.support_ticket_attachments;
create policy support_ticket_attachments_insert
on public.support_ticket_attachments for insert
with check (
  exists (
    select 1
    from public.support_tickets t
    where t.id = ticket_id
      and t.company_id = company_id
      and (
        t.created_by_user_id = public.request_user_id()
        or t.user_id = public.request_user_id()
        or public.is_company_admin(t.company_id)
        or public.is_platform_admin()
      )
  )
);

drop policy if exists support_ticket_events_select on public.support_ticket_events;
create policy support_ticket_events_select
on public.support_ticket_events for select
using (
  exists (
    select 1
    from public.support_tickets t
    where t.id = ticket_id
      and (
        t.created_by_user_id = public.request_user_id()
        or t.user_id = public.request_user_id()
        or public.is_company_admin(t.company_id)
        or public.is_platform_admin()
      )
  )
);

drop policy if exists support_ticket_events_insert on public.support_ticket_events;
create policy support_ticket_events_insert
on public.support_ticket_events for insert
with check (
  public.is_platform_admin()
  or actor_user_id = public.request_user_id()
);

comment on table public.support_tickets is 'Support centre tickets for users, organisation admins, and platform super admins.';
comment on table public.support_ticket_messages is 'Conversation thread and internal notes for support tickets.';
comment on table public.support_ticket_attachments is 'InsForge Storage attachments linked to support tickets and messages.';
comment on table public.support_ticket_events is 'Immutable support ticket event history.';
