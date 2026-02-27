-- Authoritative NCR unification
-- Date: 2026-02-27

alter table if exists public.quality_ncrs
  add column if not exists source_type text null,
  add column if not exists source_reference_id uuid null,
  add column if not exists date_identified timestamptz null default now(),
  add column if not exists ncr_type text null,
  add column if not exists ncr_category text null,
  add column if not exists requirement_reference_type text null,
  add column if not exists requirement_reference_text text null,
  add column if not exists risk_rating text null,
  add column if not exists root_cause_categories jsonb not null default '[]'::jsonb,
  add column if not exists source_reference_text text null;

update public.quality_ncrs
set source_type = case
  when lower(coalesce(source_entity_type, '')) in ('inspection_item', 'inspection') then 'inspection'
  when lower(coalesce(source_entity_type, '')) in ('customer_complaint', 'complaint') then 'complaint'
  when lower(coalesce(source_entity_type, '')) in ('risk_assessment', 'risk') then 'risk'
  when lower(coalesce(source_entity_type, '')) in ('audit', 'audit_finding', 'program_audit_finding') then 'audit'
  when lower(coalesce(source_entity_type, '')) = 'incident' then 'incident'
  when lower(coalesce(source_entity_type, '')) = 'pjo' then 'pjo'
  else source_type
end,
source_reference_id = coalesce(source_reference_id, source_entity_id)
where source_type is null or source_reference_id is null;

alter table if exists public.quality_ncrs
  drop constraint if exists quality_ncrs_status_check;
alter table if exists public.quality_ncrs
  add constraint quality_ncrs_status_check
  check (status in ('open', 'in-progress', 'awaiting-evidence', 'under-review', 'approved', 'closed', 'overdue'));

alter table if exists public.quality_ncrs
  drop constraint if exists quality_ncrs_source_type_check;
alter table if exists public.quality_ncrs
  add constraint quality_ncrs_source_type_check
  check (source_type is null or source_type in ('audit', 'incident', 'inspection', 'pjo', 'complaint', 'risk'));

alter table if exists public.quality_ncrs
  drop constraint if exists quality_ncrs_ncr_type_check;
alter table if exists public.quality_ncrs
  add constraint quality_ncrs_ncr_type_check
  check (
    ncr_type is null
    or ncr_type in ('major', 'minor', 'observation', 'repeat-finding', 'legal-non-compliance')
  );

alter table if exists public.quality_ncrs
  drop constraint if exists quality_ncrs_ncr_category_check;
alter table if exists public.quality_ncrs
  add constraint quality_ncrs_ncr_category_check
  check (
    ncr_category is null
    or ncr_category in (
      'safety', 'quality', 'environmental', 'operational', 'documentation',
      'training', 'equipment', 'contractor-compliance'
    )
  );

alter table if exists public.quality_ncrs
  drop constraint if exists quality_ncrs_risk_rating_check;
alter table if exists public.quality_ncrs
  add constraint quality_ncrs_risk_rating_check
  check (risk_rating is null or risk_rating in ('low', 'medium', 'high', 'critical'));

create index if not exists idx_quality_ncrs_source_type_reference
  on public.quality_ncrs(company_id, source_type, source_reference_id);

create index if not exists idx_quality_ncrs_status_risk
  on public.quality_ncrs(company_id, status, risk_rating, updated_at desc);

comment on table public.quality_ncrs is 'Authoritative NCR register shared by audit, inspection, incident, PJO, complaints, and risk modules.';
