-- Risk assessments: replace closed with active; add archived for unused records
-- Apply date: 2026-08-27

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

NOTIFY pgrst, 'reload schema';
