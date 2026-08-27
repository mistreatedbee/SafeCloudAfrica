-- Permit to Work: permit types, mandatory requirements, approval workflow comments, closure tracking
-- Apply date: 2026-08-27

alter table public.permits_to_work
  add column if not exists permit_type text,
  add column if not exists mandatory_requirements text,
  add column if not exists status_comment text,
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by_user_id uuid references auth.users(id);

-- Expand status workflow: awaiting approval, suspended, rejected, approved, closed
alter table public.permits_to_work drop constraint if exists permits_to_work_status_check;

alter table public.permits_to_work
  add constraint permits_to_work_status_check
  check (status in ('PENDING', 'APPROVED', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'CLOSED', 'CANCELLED'));

alter table public.permits_to_work drop constraint if exists permits_to_work_permit_type_check;

alter table public.permits_to_work
  add constraint permits_to_work_permit_type_check
  check (
    permit_type is null
    or permit_type in (
      'working_at_heights',
      'hot_work',
      'electrical_work',
      'loto',
      'confined_space',
      'excavation',
      'lifting',
      'chemical_work',
      'demolition',
      'radiation',
      'general'
    )
  );

create index if not exists idx_permits_to_work_company_status
  on public.permits_to_work(company_id, status, created_at desc);
