-- Simple free-text asset/equipment identifier on inspections, so a checklist
-- can be linked to a specific asset (vehicle reg, machine tag, extinguisher
-- number, etc.) and filtered/tracked per-asset. Deliberately not a separate
-- asset registry table yet -- keep it simple, upgrade later if needed.
-- Apply date: 2026-10-07

alter table public.inspections
  add column if not exists asset_number text null;

create index if not exists idx_inspections_asset_number on public.inspections(company_id, asset_number);
