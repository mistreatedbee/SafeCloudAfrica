-- Environment Waste Disposal: disposal status and custom waste type (2026-03-16)
-- Adds disposal_status lifecycle, custom_waste_type, and date_disposed tracking.

alter table public.env_waste_disposal
  add column if not exists custom_waste_type text null;

alter table public.env_waste_disposal
  add column if not exists disposal_status text not null default 'Open'
  check (disposal_status in ('Open', 'Pending Disposal', 'Correctly Disposed'));

alter table public.env_waste_disposal
  add column if not exists date_disposed date null;

create index if not exists idx_env_waste_disposal_company_disposal_status
  on public.env_waste_disposal(company_id, disposal_status);

