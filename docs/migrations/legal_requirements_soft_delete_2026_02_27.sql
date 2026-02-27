-- Ensure legal_requirements supports soft-delete filters used by API.
-- Safe to run multiple times.

alter table if exists public.legal_requirements
  add column if not exists deleted_at timestamptz null;

create index if not exists idx_legal_requirements_company_deleted
  on public.legal_requirements(company_id, deleted_at, updated_at desc);
