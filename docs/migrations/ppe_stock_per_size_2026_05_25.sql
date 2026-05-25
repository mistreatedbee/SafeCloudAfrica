-- Migration: Add per-size stock tracking to ppe_stock
-- Date: 2026-05-25
-- Strategy: add optional `size` column to ppe_stock.
-- Existing rows retain size = null (unsized items) and continue to work unchanged.
-- New stock records for sized items store one row per size, each with its own
-- ppe_stock_movements chain — no changes required to the movements or issues tables.

alter table public.ppe_stock
  add column if not exists size text null;

comment on column public.ppe_stock.size is
  'Size variant for this stock record (e.g. Small, Medium, Large). NULL means the item has no size variants.';

create index if not exists idx_ppe_stock_item_site_size
  on public.ppe_stock(company_id, ppe_item_id, site_id, size);
