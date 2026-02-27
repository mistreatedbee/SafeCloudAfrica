-- Risk assessment updated forms and review workflow hardening
-- Date: 2026-02-27
-- Safe to run multiple times.

-- 1) Extend risk assessment types and flags for updated forms.
alter table public.risk_assessments
  add column if not exists is_critical boolean not null default false;

alter table public.risk_assessments
  add column if not exists is_prework boolean not null default false;

alter table public.risk_assessments
  add column if not exists review_due_at timestamptz null;

alter table public.risk_assessments
  add column if not exists source_entity_type text null;

alter table public.risk_assessments
  add column if not exists source_entity_id uuid null;

alter table public.risk_assessments
  add column if not exists site_id uuid null references public.sites(id) on delete set null;

alter table public.risk_assessments
  drop constraint if exists risk_assessments_assessment_type_check;

alter table public.risk_assessments
  add constraint risk_assessments_assessment_type_check
  check (assessment_type in ('baseline', 'task-based', 'task', 'critical_task', 'pre_work'));

create index if not exists idx_risk_assessments_type on public.risk_assessments(company_id, assessment_type);
create index if not exists idx_risk_assessments_review_due on public.risk_assessments(company_id, review_due_at) where review_due_at is not null;
create index if not exists idx_risk_assessments_source on public.risk_assessments(company_id, source_entity_type, source_entity_id);

-- 2) Version history snapshots for auditability.
create table if not exists public.risk_assessment_versions (
  id uuid primary key default gen_random_uuid(),
  risk_assessment_id uuid not null references public.risk_assessments(id) on delete cascade,
  version_number integer not null,
  snapshot jsonb not null default '{}'::jsonb,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_risk_assessment_versions_unique
  on public.risk_assessment_versions(risk_assessment_id, version_number);

-- 3) Operational/incident/NCR change triggers linked to risk assessments.
create table if not exists public.risk_assessment_change_triggers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  risk_assessment_id uuid not null references public.risk_assessments(id) on delete cascade,
  source_entity_type text not null,
  source_entity_id uuid null,
  description text not null,
  status text not null default 'open' check (status in ('open', 'resolved', 'ignored')),
  created_by_user_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_risk_assessment_change_triggers_assessment
  on public.risk_assessment_change_triggers(company_id, risk_assessment_id, status);

-- 4) Pre-work daily instances with supervisor sign-off.
create table if not exists public.risk_assessment_prework_instances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  risk_assessment_id uuid not null references public.risk_assessments(id) on delete cascade,
  instance_date date not null,
  employee_signatures jsonb not null default '[]'::jsonb,
  supervisor_user_id uuid null,
  supervisor_signed_at timestamptz null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_prework_instance_unique
  on public.risk_assessment_prework_instances(risk_assessment_id, instance_date);

-- 5) Definer RPC to flag linked assessments for review.
create or replace function public.flag_linked_risk_assessments_for_review(
  p_company_id uuid,
  p_source_entity_type text,
  p_source_entity_id uuid,
  p_reason text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := coalesce(nullif(trim(p_reason), ''), 'Review triggered by linked record update.');
  v_count integer := 0;
begin
  update public.risk_assessments
  set
    status = case when status in ('approved', 'reviewed') then 'review_required' else status end,
    review_due_at = coalesce(review_due_at, now()),
    updated_at = now()
  where company_id = p_company_id
    and source_entity_type = p_source_entity_type
    and source_entity_id = p_source_entity_id;

  get diagnostics v_count = row_count;

  insert into public.risk_assessment_change_triggers (
    company_id,
    risk_assessment_id,
    source_entity_type,
    source_entity_id,
    description,
    status
  )
  select
    ra.company_id,
    ra.id,
    p_source_entity_type,
    p_source_entity_id,
    v_reason,
    'open'
  from public.risk_assessments ra
  where ra.company_id = p_company_id
    and ra.source_entity_type = p_source_entity_type
    and ra.source_entity_id = p_source_entity_id;

  return v_count;
end;
$$;

grant execute on function public.flag_linked_risk_assessments_for_review(uuid, text, uuid, text) to authenticated;
