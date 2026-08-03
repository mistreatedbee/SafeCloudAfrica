-- AI platform foundation (Phase 1 of the AI roadmap).
-- Additive only -- no existing table is touched. Adds:
--   1. pgvector extension + document_embeddings (RAG index)
--   2. ai_generated_documents (AI-drafted HIRA/JSA/SOP/Toolbox Talk/permits, versioned)
--   3. ai_conversations + ai_messages (generalises the existing chatbot_logs
--      pattern used by supportAssistantAiService.ts beyond customer support)
--   4. ai_actions (agentic action queue with approval workflow)
--   5. ai_predictions (Predictive Risk Engine output, with reasoning)
--
-- RLS mirrors the existing helper functions (is_company_member,
-- is_company_supervisor, is_company_manager, is_platform_admin) already
-- defined in phase2-schema.sql -- no new access-control model introduced.
--
-- match_document_embeddings() is a Postgres RPC (called via
-- insforge.database.rpc(...) from src/ai/retrieval.ts) because pgvector's
-- cosine-distance operator (<=>) is not expressible through the standard
-- PostgREST filter grammar the rest of this app's query builder uses.

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- 1. document_embeddings -- the RAG index
-- ---------------------------------------------------------------------------

create table if not exists public.document_embeddings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  chunk_index integer not null default 0,
  chunk_text text not null,
  embedding vector(1536) not null,
  metadata jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, entity_type, entity_id, chunk_index)
);

create index if not exists idx_document_embeddings_company_entity
  on public.document_embeddings(company_id, entity_type, entity_id);

-- IVFFlat index for approximate nearest-neighbour search at scale. Safe to
-- create before rows exist; Postgres will just skip clustering until ANALYZE.
create index if not exists idx_document_embeddings_ivfflat
  on public.document_embeddings using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

alter table public.document_embeddings enable row level security;

drop policy if exists document_embeddings_select on public.document_embeddings;
create policy document_embeddings_select
on public.document_embeddings for select
using (public.is_platform_admin() or public.is_company_member(company_id));

drop policy if exists document_embeddings_write on public.document_embeddings;
create policy document_embeddings_write
on public.document_embeddings for insert
with check (public.is_platform_admin() or public.is_company_member(company_id));

drop policy if exists document_embeddings_update on public.document_embeddings;
create policy document_embeddings_update
on public.document_embeddings for update
using (public.is_platform_admin() or public.is_company_member(company_id))
with check (public.is_platform_admin() or public.is_company_member(company_id));

drop policy if exists document_embeddings_delete on public.document_embeddings;
create policy document_embeddings_delete
on public.document_embeddings for delete
using (public.is_platform_admin() or public.is_company_member(company_id));

-- RPC: cosine-similarity search scoped to one company. Returns the top
-- match_count chunks ordered by similarity (1 - cosine distance), highest
-- first, along with the source entity reference so callers can cite it.
create or replace function public.match_document_embeddings(
  query_embedding vector(1536),
  match_company_id uuid,
  match_entity_types text[] default null,
  match_count int default 8
)
returns table (
  id uuid,
  entity_type text,
  entity_id uuid,
  chunk_text text,
  metadata jsonb,
  similarity float
)
language sql
stable
as $$
  select
    e.id,
    e.entity_type,
    e.entity_id,
    e.chunk_text,
    e.metadata,
    1 - (e.embedding <=> query_embedding) as similarity
  from public.document_embeddings e
  where e.company_id = match_company_id
    and (match_entity_types is null or e.entity_type = any(match_entity_types))
    and public.is_company_member(match_company_id)
  order by e.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

-- ---------------------------------------------------------------------------
-- 2. ai_generated_documents -- every AI-drafted document, versioned
-- ---------------------------------------------------------------------------

create table if not exists public.ai_generated_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  doc_type text not null check (doc_type in (
    'hira','jsa','sop','swp','toolbox_talk','permit','emergency_plan',
    'policy','method_statement','environmental_plan','checklist','inspection_form'
  )),
  title text not null,
  prompt text not null,
  content jsonb not null,
  entity_type text null,
  entity_id uuid null,
  model text not null,
  confidence numeric(4,3) null,
  cited_sources jsonb null,
  status text not null default 'draft' check (status in ('draft','approved','published','discarded')),
  version integer not null default 1,
  created_by_user_id uuid not null,
  approved_by_user_id uuid null,
  approved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_generated_documents_company
  on public.ai_generated_documents(company_id, doc_type, status);
create index if not exists idx_ai_generated_documents_entity
  on public.ai_generated_documents(company_id, entity_type, entity_id);

alter table public.ai_generated_documents enable row level security;

drop policy if exists ai_generated_documents_select on public.ai_generated_documents;
create policy ai_generated_documents_select
on public.ai_generated_documents for select
using (public.is_platform_admin() or public.is_company_member(company_id));

drop policy if exists ai_generated_documents_insert on public.ai_generated_documents;
create policy ai_generated_documents_insert
on public.ai_generated_documents for insert
with check (public.is_platform_admin() or public.is_company_member(company_id));

-- Any member can edit their own draft; approving/publishing requires
-- supervisor+ (mirrors the approval tier used elsewhere in this app, e.g.
-- NCR close / manager sign-off).
drop policy if exists ai_generated_documents_update on public.ai_generated_documents;
create policy ai_generated_documents_update
on public.ai_generated_documents for update
using (
  public.is_platform_admin()
  or (public.is_company_member(company_id) and created_by_user_id = public.request_user_id())
  or public.is_company_supervisor(company_id)
)
with check (public.is_platform_admin() or public.is_company_member(company_id));

drop policy if exists ai_generated_documents_delete on public.ai_generated_documents;
create policy ai_generated_documents_delete
on public.ai_generated_documents for delete
using (
  public.is_platform_admin()
  or (public.is_company_member(company_id) and created_by_user_id = public.request_user_id())
  or public.is_company_supervisor(company_id)
);

-- ---------------------------------------------------------------------------
-- 3. ai_conversations / ai_messages -- generalises chatbot_logs beyond support
-- ---------------------------------------------------------------------------

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null,
  agent_key text not null,
  title text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_conversations_company_user
  on public.ai_conversations(company_id, user_id, agent_key);

alter table public.ai_conversations enable row level security;

drop policy if exists ai_conversations_select on public.ai_conversations;
create policy ai_conversations_select
on public.ai_conversations for select
using (
  public.is_platform_admin()
  or (public.is_company_member(company_id) and user_id = public.request_user_id())
  or public.is_company_supervisor(company_id)
);

drop policy if exists ai_conversations_write on public.ai_conversations;
create policy ai_conversations_write
on public.ai_conversations for insert
with check (public.is_company_member(company_id) and user_id = public.request_user_id());

drop policy if exists ai_conversations_update on public.ai_conversations;
create policy ai_conversations_update
on public.ai_conversations for update
using (public.is_company_member(company_id) and user_id = public.request_user_id())
with check (public.is_company_member(company_id) and user_id = public.request_user_id());

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  cited_sources jsonb null,
  model text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_messages_conversation
  on public.ai_messages(conversation_id, created_at);

alter table public.ai_messages enable row level security;

drop policy if exists ai_messages_select on public.ai_messages;
create policy ai_messages_select
on public.ai_messages for select
using (
  public.is_platform_admin()
  or public.is_company_supervisor(company_id)
  or exists (
    select 1 from public.ai_conversations c
    where c.id = ai_messages.conversation_id
      and c.user_id = public.request_user_id()
  )
);

drop policy if exists ai_messages_insert on public.ai_messages;
create policy ai_messages_insert
on public.ai_messages for insert
with check (
  public.is_company_member(company_id)
  and exists (
    select 1 from public.ai_conversations c
    where c.id = ai_messages.conversation_id
      and c.user_id = public.request_user_id()
  )
);

-- ---------------------------------------------------------------------------
-- 4. ai_actions -- agentic action queue with approval workflow
-- ---------------------------------------------------------------------------

create table if not exists public.ai_actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  action_type text not null,
  entity_type text null,
  entity_id uuid null,
  payload jsonb not null,
  reasoning text null,
  confidence numeric(4,3) null,
  requires_approval boolean not null default true,
  status text not null default 'proposed' check (status in ('proposed','approved','rejected','executed','failed')),
  proposed_by text not null default 'ai',
  approved_by_user_id uuid null,
  approved_at timestamptz null,
  executed_at timestamptz null,
  result jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_actions_company_status
  on public.ai_actions(company_id, status);

alter table public.ai_actions enable row level security;

drop policy if exists ai_actions_select on public.ai_actions;
create policy ai_actions_select
on public.ai_actions for select
using (public.is_platform_admin() or public.is_company_supervisor(company_id));

-- Inserted by the AI layer acting on behalf of a signed-in supervisor+ user
-- (background jobs run under a platform-admin-scoped service context).
drop policy if exists ai_actions_insert on public.ai_actions;
create policy ai_actions_insert
on public.ai_actions for insert
with check (public.is_platform_admin() or public.is_company_supervisor(company_id));

-- Approve/reject/execute requires manager+ (owner/admin/manager) -- one tier
-- above proposal, matching "Manager approval required" in the automation
-- workflow table of the roadmap.
drop policy if exists ai_actions_update on public.ai_actions;
create policy ai_actions_update
on public.ai_actions for update
using (public.is_platform_admin() or public.is_company_manager(company_id))
with check (public.is_platform_admin() or public.is_company_manager(company_id));

-- ---------------------------------------------------------------------------
-- 5. ai_predictions -- Predictive Risk Engine output
-- ---------------------------------------------------------------------------

create table if not exists public.ai_predictions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  scope text not null check (scope in ('company','site','department')),
  scope_id uuid null,
  prediction_type text not null,
  probability numeric(5,4) null,
  confidence numeric(4,3) null,
  reasoning text not null,
  contributing_factors jsonb null,
  recommended_actions jsonb null,
  model text not null,
  valid_from timestamptz not null default now(),
  valid_until timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_predictions_company_scope
  on public.ai_predictions(company_id, scope, scope_id, prediction_type);

alter table public.ai_predictions enable row level security;

drop policy if exists ai_predictions_select on public.ai_predictions;
create policy ai_predictions_select
on public.ai_predictions for select
using (public.is_platform_admin() or public.is_company_member(company_id));

drop policy if exists ai_predictions_insert on public.ai_predictions;
create policy ai_predictions_insert
on public.ai_predictions for insert
with check (public.is_platform_admin() or public.is_company_supervisor(company_id));
