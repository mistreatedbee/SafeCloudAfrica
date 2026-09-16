-- SHEQ permit-number and datetime compatibility update
-- Apply date: 2026-09-16

alter table public.permits_to_work
  add column if not exists permit_number text;

alter table public.loto_records
  add column if not exists permit_number text;

-- Preserve existing date-only values while ensuring the columns are stored as timestamps.
-- This safely upgrades legacy YYYY-MM-DD values to midnight UTC timestamps without dropping data.
alter table public.permits_to_work
  alter column valid_from type timestamptz
  using (
    case
      when valid_from is null then null
      when valid_from::text ~ '^\d{4}-\d{2}-\d{2}$' then (valid_from::date + time '00:00')::timestamptz
      else valid_from::timestamptz
    end
  ),
  alter column valid_to type timestamptz
  using (
    case
      when valid_to is null then null
      when valid_to::text ~ '^\d{4}-\d{2}-\d{2}$' then (valid_to::date + time '00:00')::timestamptz
      else valid_to::timestamptz
    end
  );

create index if not exists idx_permits_to_work_company_permit_number
  on public.permits_to_work(company_id, permit_number);

create index if not exists idx_loto_records_company_permit_number
  on public.loto_records(company_id, permit_number);
