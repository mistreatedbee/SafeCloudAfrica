-- LOTO workflow upgrade: times, responsible/authorised persons, safety checks, status workflow
-- Apply date: 2026-08-27

alter table public.loto_records
  add column if not exists start_time timestamptz,
  add column if not exists end_time timestamptz,
  add column if not exists responsible_person_user_id uuid references auth.users(id),
  add column if not exists authorised_loto_person_user_id uuid references auth.users(id),
  add column if not exists affected_employees_count integer,
  add column if not exists zero_energy_verified boolean,
  add column if not exists shift_handover boolean,
  add column if not exists loto_risk_assessment_completed boolean,
  add column if not exists emergency_removal_requested boolean not null default false,
  add column if not exists emergency_removal_notify_user_id uuid references auth.users(id),
  add column if not exists emergency_removal_comment text,
  add column if not exists status_comment text,
  add column if not exists restoration_verified boolean,
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by_user_id uuid references auth.users(id);

alter table public.loto_records drop constraint if exists loto_records_status_check;

update public.loto_records set status = 'ACTIVE' where status = 'LOCKED';
update public.loto_records set status = 'CLOSED' where status = 'RELEASED';

alter table public.loto_records
  add constraint loto_records_status_check
  check (status in ('PENDING', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'REJECTED', 'CLOSED'));

create index if not exists idx_loto_records_company_status
  on public.loto_records(company_id, status, created_at desc);
