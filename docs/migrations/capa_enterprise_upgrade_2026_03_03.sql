-- CAPA enterprise upgrade: expanded source mapping, lifecycle states, and closure tracking.
-- Date: 2026-03-03
-- Safe to run multiple times.

alter table public.corrective_actions
  add column if not exists closure_date timestamptz null;

update public.corrective_actions
set closure_date = coalesce(closure_date, now())
where status = 'closed'
  and closure_date is null;

do $$
declare
  rec record;
begin
  for rec in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'corrective_actions'
      and c.contype = 'c'
      and (
        pg_get_constraintdef(c.oid) ilike '%status%'
        or pg_get_constraintdef(c.oid) ilike '%source_type%'
      )
  loop
    execute format('alter table public.corrective_actions drop constraint if exists %I', rec.conname);
  end loop;
end $$;

alter table public.corrective_actions
  add constraint corrective_actions_status_check
  check (
    status in (
      'open',
      'assigned',
      'in-progress',
      'awaiting-evidence',
      'under-review',
      'completed',
      'verified',
      'closed'
    )
  );

alter table public.corrective_actions
  add constraint corrective_actions_source_type_check
  check (
    source_type in (
      'ncr',
      'risk_assessment',
      'incident',
      'audit',
      'audit_finding',
      'complaint',
      'pjo',
      'kpi',
      'observation'
    )
  );

create index if not exists idx_corrective_actions_closure_date
  on public.corrective_actions(company_id, closure_date desc);
