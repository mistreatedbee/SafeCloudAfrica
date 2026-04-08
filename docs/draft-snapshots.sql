-- Draft snapshots (autosave) backend persistence
--
-- Used by `src/api/services/draftSnapshotsService.ts` to upsert a user's latest
-- draft payloads so they can survive localStorage failures and be available
-- across devices (optional).
--
-- Run this in your InsForge Postgres (SQL editor / migrations).

create table if not exists public.draft_snapshots (
  user_id uuid not null,
  draft_key text not null,
  client_updated_at_ms bigint not null,
  updated_at timestamptz not null default now(),
  route text,
  payload jsonb not null,
  primary key (user_id, draft_key)
);

create index if not exists draft_snapshots_user_updated_at_idx
  on public.draft_snapshots (user_id, client_updated_at_ms desc);

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

