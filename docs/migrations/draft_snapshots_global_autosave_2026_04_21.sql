-- Global autosave draft model upgrade
-- Mirrors docs/draft-snapshots.sql so draft persistence can carry richer metadata.

create table if not exists public.draft_snapshots (
  user_id uuid not null,
  organization_id uuid null,
  draft_key text not null,
  module_name text null,
  form_type text null,
  linked_record_id uuid null,
  draft_status text not null default 'active',
  payload jsonb not null,
  version integer not null default 1,
  route text null,
  client_updated_at_ms bigint not null,
  last_saved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, draft_key),
  constraint draft_snapshots_status_check check (draft_status in ('active', 'submitted', 'discarded'))
);

alter table public.draft_snapshots
  add column if not exists organization_id uuid null,
  add column if not exists module_name text null,
  add column if not exists form_type text null,
  add column if not exists linked_record_id uuid null,
  add column if not exists draft_status text not null default 'active',
  add column if not exists version integer not null default 1,
  add column if not exists route text null,
  add column if not exists client_updated_at_ms bigint not null default 0,
  add column if not exists last_saved_at timestamptz not null default now(),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists draft_snapshots_user_updated_at_idx
  on public.draft_snapshots (user_id, last_saved_at desc);

create index if not exists draft_snapshots_org_module_idx
  on public.draft_snapshots (organization_id, module_name, form_type);

alter table public.draft_snapshots enable row level security;

drop policy if exists draft_snapshots_select_own on public.draft_snapshots;
create policy draft_snapshots_select_own
  on public.draft_snapshots
  for select
  using (auth.uid() = user_id);

drop policy if exists draft_snapshots_insert_own on public.draft_snapshots;
create policy draft_snapshots_insert_own
  on public.draft_snapshots
  for insert
  with check (auth.uid() = user_id);

drop policy if exists draft_snapshots_update_own on public.draft_snapshots;
create policy draft_snapshots_update_own
  on public.draft_snapshots
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists draft_snapshots_delete_own on public.draft_snapshots;
create policy draft_snapshots_delete_own
  on public.draft_snapshots
  for delete
  using (auth.uid() = user_id);
