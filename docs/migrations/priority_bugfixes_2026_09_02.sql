-- Priority production bugfixes (2026-09-02)
-- 1) Risk assessment approve blocked by stale status_v2 check (no 'active')
-- 2) Inspection runs missing tracking_period_key / tracking_period_label
-- 3) Audits create failing on missing planning columns

alter table public.risk_assessments
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by_user_id uuid references auth.users(id);

update public.risk_assessments
set status_v2 = 'active'
where status_v2 = 'closed';

update public.risk_assessments
set status_v2 = 'archived'
where lower(coalesce(status, '')) = 'archived' and status_v2 is distinct from 'archived';

alter table public.risk_assessments drop constraint if exists risk_assessments_status_v2_check;

alter table public.risk_assessments
  add constraint risk_assessments_status_v2_check
  check (status_v2 in ('draft', 'submitted', 'active', 'archived'));

alter table if exists public.inspection_runs
  add column if not exists tracking_period_key text null,
  add column if not exists tracking_period_label text null;

alter table if exists public.audits
  add column if not exists departments_auditee_ids uuid[] null,
  add column if not exists company_representative_user_ids uuid[] null,
  add column if not exists required_document_list jsonb null;

NOTIFY pgrst, 'reload schema';
