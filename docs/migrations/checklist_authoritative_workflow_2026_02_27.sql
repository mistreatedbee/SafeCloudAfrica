-- Updated authoritative checklist and inspection workflow
-- Date: 2026-02-27

alter table if exists public.inspections
  add column if not exists sector text null,
  add column if not exists frequency text null check (frequency in ('daily', 'monthly', 'audit-linked')),
  add column if not exists inspection_date date null,
  add column if not exists completion_date_stamp timestamptz null,
  add column if not exists inspector_user_id uuid null,
  add column if not exists auditor_user_id uuid null,
  add column if not exists auditee_user_id uuid null,
  add column if not exists audit_id uuid null;

alter table if exists public.inspection_checklist_templates
  add column if not exists source_type text not null default 'manual' check (source_type in ('google-doc', 'manual')),
  add column if not exists google_doc_id text null,
  add column if not exists google_doc_url text null,
  add column if not exists default_sector text null,
  add column if not exists frequency text null check (frequency in ('daily', 'monthly', 'audit-linked')),
  add column if not exists default_inspection_method text null check (default_inspection_method in ('physical-inspection', 'observation', 'record-review'));

alter table if exists public.inspection_checklist_items
  add column if not exists audit_section_or_category text null,
  add column if not exists requirement_reference text null,
  add column if not exists evidence_required_default boolean not null default false,
  add column if not exists risk_level_default text null check (risk_level_default in ('low', 'medium', 'high')),
  add column if not exists inspection_method_default text null check (inspection_method_default in ('physical-inspection', 'observation', 'record-review')),
  add column if not exists question_source_type text not null default 'manual' check (question_source_type in ('google-doc-template', 'manual'));

alter table if exists public.inspection_runs
  add column if not exists auditor_user_id uuid null,
  add column if not exists sector text null,
  add column if not exists location text null,
  add column if not exists frequency text null check (frequency in ('daily', 'monthly', 'audit-linked')),
  add column if not exists inspection_date_stamp date null;

alter table if exists public.inspection_run_items
  add column if not exists audit_section_or_category text null,
  add column if not exists requirement_reference text null,
  add column if not exists manager_approved_by_user_id uuid null,
  add column if not exists manager_approved_at timestamptz null,
  add column if not exists auditor_verified_by_user_id uuid null,
  add column if not exists auditor_verified_at timestamptz null,
  add column if not exists ncr_closed_at timestamptz null,
  add column if not exists ncr_closed_by_user_id uuid null;

alter table if exists public.inspection_run_items
  drop constraint if exists inspection_run_items_status_check;

alter table if exists public.inspection_run_items
  add constraint inspection_run_items_status_check
  check (status in ('open', 'in-progress', 'awaiting-evidence', 'closed', 'overdue'));

alter table if exists public.inspection_run_items
  drop constraint if exists inspection_run_items_inspection_method_check;

alter table if exists public.inspection_run_items
  add constraint inspection_run_items_inspection_method_check
  check (inspection_method in ('physical-inspection', 'observation', 'record-review'));

create unique index if not exists uq_quality_ncr_inspection_item_source
  on public.quality_ncrs(source_entity_type, source_entity_id)
  where source_entity_type = 'inspection_item' and source_entity_id is not null;

create or replace function public.trg_sync_checklist_item_on_ncr_close()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.status = 'closed' and (old.status is distinct from new.status) then
    update public.inspection_run_items
    set status = 'closed',
        ncr_closed_at = coalesce(new.closed_at, now()),
        ncr_closed_by_user_id = new.closed_by_user_id,
        updated_at = now()
    where company_id = new.company_id
      and auto_ncr_id = new.id
      and status <> 'closed';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_quality_ncr_sync_checklist_item_close on public.quality_ncrs;
create trigger trg_quality_ncr_sync_checklist_item_close
after update on public.quality_ncrs
for each row
execute function public.trg_sync_checklist_item_on_ncr_close();

comment on table public.inspection_run_items is 'Authoritative checklist workflow items with scoring, evidence, NCR and CAPA links.';
