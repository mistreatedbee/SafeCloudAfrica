-- Chatbot Logs for Super Admin Support Centre
-- 2026-05-06
-- Stores signed-in support chatbot sessions and message transcripts.

create table if not exists public.chatbot_conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  company_name_snapshot text null,
  user_id uuid null,
  user_name text null,
  user_email text null,
  selected_option text null,
  category text not null default 'general_query',
  status text not null default 'new',
  priority text not null default 'medium',
  support_ticket_id uuid null references public.support_tickets(id) on delete set null,
  escalated boolean not null default false,
  message_preview text null,
  ai_model text null,
  ai_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chatbot_conversations drop constraint if exists chatbot_conversations_category_check;
alter table public.chatbot_conversations drop constraint if exists chatbot_conversations_status_check;
alter table public.chatbot_conversations drop constraint if exists chatbot_conversations_priority_check;

alter table public.chatbot_conversations
  add constraint chatbot_conversations_category_check
  check (category in (
    'technical_issue',
    'license_subscription',
    'module_access',
    'user_organisation_access',
    'document_compliance_help',
    'general_query'
  ));

alter table public.chatbot_conversations
  add constraint chatbot_conversations_status_check
  check (status in (
    'new',
    'open',
    'in_progress',
    'waiting_for_user',
    'escalated',
    'resolved',
    'closed'
  ));

alter table public.chatbot_conversations
  add constraint chatbot_conversations_priority_check
  check (priority in ('low', 'medium', 'high', 'critical'));

create index if not exists idx_chatbot_conversations_company_created
  on public.chatbot_conversations(company_id, created_at desc);
create index if not exists idx_chatbot_conversations_user_created
  on public.chatbot_conversations(user_id, created_at desc);
create index if not exists idx_chatbot_conversations_status
  on public.chatbot_conversations(status);
create index if not exists idx_chatbot_conversations_category
  on public.chatbot_conversations(category);
create index if not exists idx_chatbot_conversations_ticket
  on public.chatbot_conversations(support_ticket_id);

create table if not exists public.chatbot_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chatbot_conversations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid null,
  role text not null,
  body text not null,
  response_source text not null default 'user',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.chatbot_messages drop constraint if exists chatbot_messages_role_check;
alter table public.chatbot_messages drop constraint if exists chatbot_messages_response_source_check;

alter table public.chatbot_messages
  add constraint chatbot_messages_role_check
  check (role in ('user', 'bot', 'assistant', 'system'));

alter table public.chatbot_messages
  add constraint chatbot_messages_response_source_check
  check (response_source in ('user', 'ai', 'fallback', 'guided', 'system'));

create index if not exists idx_chatbot_messages_conversation_created
  on public.chatbot_messages(conversation_id, created_at);
create index if not exists idx_chatbot_messages_company_created
  on public.chatbot_messages(company_id, created_at desc);

alter table public.chatbot_conversations enable row level security;
alter table public.chatbot_messages enable row level security;

drop policy if exists chatbot_conversations_select on public.chatbot_conversations;
create policy chatbot_conversations_select
on public.chatbot_conversations for select
using (
  public.is_platform_admin()
  or (
    user_id = public.request_user_id()
    and public.is_company_member(company_id)
  )
);

drop policy if exists chatbot_conversations_insert on public.chatbot_conversations;
create policy chatbot_conversations_insert
on public.chatbot_conversations for insert
with check (
  public.is_platform_admin()
  or (
    user_id = public.request_user_id()
    and public.is_company_member(company_id)
  )
);

drop policy if exists chatbot_conversations_update on public.chatbot_conversations;
create policy chatbot_conversations_update
on public.chatbot_conversations for update
using (
  public.is_platform_admin()
  or (
    user_id = public.request_user_id()
    and public.is_company_member(company_id)
  )
)
with check (
  public.is_platform_admin()
  or (
    user_id = public.request_user_id()
    and public.is_company_member(company_id)
  )
);

drop policy if exists chatbot_messages_select on public.chatbot_messages;
create policy chatbot_messages_select
on public.chatbot_messages for select
using (
  public.is_platform_admin()
  or exists (
    select 1
    from public.chatbot_conversations c
    where c.id = conversation_id
      and c.user_id = public.request_user_id()
      and public.is_company_member(c.company_id)
  )
);

drop policy if exists chatbot_messages_insert on public.chatbot_messages;
create policy chatbot_messages_insert
on public.chatbot_messages for insert
with check (
  public.is_platform_admin()
  or exists (
    select 1
    from public.chatbot_conversations c
    where c.id = conversation_id
      and c.company_id = company_id
      and c.user_id = public.request_user_id()
      and public.is_company_member(c.company_id)
  )
);

comment on table public.chatbot_conversations is 'Signed-in support chatbot sessions for super-admin visibility and escalation tracking.';
comment on table public.chatbot_messages is 'Support chatbot transcript messages from users, guided bot replies, fallback responses, and AI responses.';
