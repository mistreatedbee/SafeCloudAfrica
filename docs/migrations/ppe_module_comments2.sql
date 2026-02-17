-- PPE Module Comments 2: extend ppe_issues, ppe_items, ppe_stock, ppe_stock_movements
-- Run after phase2 base schema (ppe_issues, ppe_items, ppe_stock, ppe_stock_movements exist).

-- 1.1 PPE Issuing (ppe_issues) – extend in place
alter table public.ppe_issues
  add column if not exists site_id uuid null,
  add column if not exists department_id uuid null,
  add column if not exists issue_date date null,
  add column if not exists issued_to_employee_number text null,
  add column if not exists job_role text null,
  add column if not exists job_description text null,
  add column if not exists ppe_item_name text null,
  add column if not exists ppe_category text null,
  add column if not exists size text null,
  add column if not exists quantity_issued integer not null default 1,
  add column if not exists reason_for_issue text null,
  add column if not exists issued_by_name text null,
  add column if not exists issued_by_role text null,
  add column if not exists unit_cost_at_issue numeric null,
  add column if not exists total_cost_at_issue numeric null,
  add column if not exists issuer_signature text null,
  add column if not exists receiver_signature text null;

-- Backfill issue_date from issued_at for existing rows
update public.ppe_issues
set issue_date = (issued_at at time zone 'UTC')::date
where issue_date is null and issued_at is not null;

-- Optional: make issue_date required for new rows (leave nullable for backfill)
comment on column public.ppe_issues.issue_date is 'Date of issue (required for new records)';
comment on column public.ppe_issues.size is 'Size issued (required for new records)';
comment on column public.ppe_issues.reason_for_issue is 'Reason for issue (required for new records)';

create index if not exists idx_ppe_issues_company_issue_date
  on public.ppe_issues(company_id, issue_date desc nulls last);
create index if not exists idx_ppe_issues_site_department
  on public.ppe_issues(company_id, site_id, department_id);

-- 1.2 PPE Items (ppe_items) – extend
alter table public.ppe_items
  add column if not exists description text null,
  add column if not exists sizes_available jsonb null,
  add column if not exists supplier_name text null,
  add column if not exists stock_location text null;

comment on column public.ppe_items.sizes_available is 'JSON array of size strings e.g. ["S","M","L"]';

-- 1.3 PPE Stock (ppe_stock) – extend
alter table public.ppe_stock
  add column if not exists captured_by_user_id uuid null,
  add column if not exists captured_by_name text null,
  add column if not exists date_ordered date null,
  add column if not exists date_stock_received date null,
  add column if not exists opening_stock_qty integer null,
  add column if not exists qty_ordered integer null,
  add column if not exists qty_received integer null;

-- 1.4 PPE stock movements – add 'ordered' type and reference_id
-- Drop existing check and recreate with 'ordered'
alter table public.ppe_stock_movements
  drop constraint if exists ppe_stock_movements_movement_type_check;

alter table public.ppe_stock_movements
  add constraint ppe_stock_movements_movement_type_check
  check (movement_type in ('in','out','adjust','return','ordered'));

alter table public.ppe_stock_movements
  add column if not exists reference_id uuid null,
  add column if not exists transaction_date date null;

comment on column public.ppe_stock_movements.reference_id is 'For type out: ppe_issue_id; for other types optional reference';
comment on column public.ppe_stock_movements.transaction_date is 'Business date for ordered/received';
