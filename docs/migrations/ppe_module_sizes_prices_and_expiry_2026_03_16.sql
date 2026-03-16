-- PPE Module extension: sizes+prices, HR linkage, and expiry tracking
-- Run after phase2 base schema and `ppe_module_comments2.sql`.

-- 1) PPE items: sizes + prices JSON structure
alter table if exists public.ppe_items
  add column if not exists sizes_with_prices jsonb null;

comment on column public.ppe_items.sizes_with_prices is
  'JSON array of {size, price} objects, e.g. [{\"size\":\"Small\",\"price\":120.0}]';

-- 2) PPE issues: link to HR employees (optional, alongside existing issued_to_user_id)
alter table if exists public.ppe_issues
  add column if not exists issued_to_employee_id uuid null;

comment on column public.ppe_issues.issued_to_employee_id is
  'Optional reference to hr_employees.id for the person the PPE was issued to';

-- 3) PPE stock: link to HR employees for captured-by and basic expiry tracking
alter table if exists public.ppe_stock
  add column if not exists captured_by_employee_id uuid null,
  add column if not exists expiry_date date null;

comment on column public.ppe_stock.captured_by_employee_id is
  'Optional reference to hr_employees.id for the person who captured this stock record';

comment on column public.ppe_stock.expiry_date is
  'Expiry date for this PPE stock batch (if applicable)';

