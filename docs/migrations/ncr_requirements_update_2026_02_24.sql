-- NCR requirements update (2026-02-24)
-- Adds linked requirement type and split evidence fields for before/after closure workflows.

alter table if exists public.quality_ncrs
  add column if not exists linked_requirement_type text,
  add column if not exists evidence_before jsonb,
  add column if not exists evidence_after jsonb,
  add column if not exists closed_by_user_id uuid,
  add column if not exists closed_at timestamptz,
  add column if not exists date_closed timestamptz;

-- Normalize defaults for JSON evidence arrays.
update public.quality_ncrs
set evidence_before = coalesce(evidence_before, '[]'::jsonb),
    evidence_after = coalesce(evidence_after, '[]'::jsonb)
where evidence_before is null or evidence_after is null;

alter table if exists public.quality_ncrs
  alter column evidence_before set default '[]'::jsonb,
  alter column evidence_after set default '[]'::jsonb;

-- Constrain linked requirement type to the approved values.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'quality_ncrs_linked_requirement_type_check'
  ) then
    alter table public.quality_ncrs
      add constraint quality_ncrs_linked_requirement_type_check
      check (
        linked_requirement_type is null
        or linked_requirement_type in ('STANDARD', 'POLICY', 'PROCEDURE')
      );
  end if;
end
$$;

create index if not exists idx_quality_ncrs_company_linked_requirement_type
  on public.quality_ncrs(company_id, linked_requirement_type);
