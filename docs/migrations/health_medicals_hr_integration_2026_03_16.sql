-- Health medicals HR integration and cost tracking (2026-03-16)
-- Adds HR employee linkage, medical cost, and uploaded document metadata.

alter table if exists public.health_medicals
  add column if not exists employee_id uuid null references public.hr_employees(id) on delete set null,
  add column if not exists medical_cost numeric(12, 2) null,
  add column if not exists uploaded_documents jsonb not null default '[]'::jsonb;

create index if not exists idx_health_medicals_company_employee_hr
  on public.health_medicals(company_id, employee_id);

