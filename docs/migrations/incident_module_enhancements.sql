-- Incident Module Enhancements: evidence metadata, risk rating 1-5×1-5, affected persons, corrective action linking
-- Apply after phase2-schema.sql. Safe to run multiple times (add column if not exists / create table if not exists).

-- ---------------------------------------------------------------------------
-- 1. Evidence attachments: original filename, display title, file kind
-- ---------------------------------------------------------------------------
alter table public.evidence_attachments
  add column if not exists original_filename text null,
  add column if not exists display_title text null,
  add column if not exists file_kind text null;

comment on column public.evidence_attachments.original_filename is 'Filename at upload';
comment on column public.evidence_attachments.display_title is 'User-renamed title for reports';
comment on column public.evidence_attachments.file_kind is 'image | document for report rendering';

-- ---------------------------------------------------------------------------
-- 2. Incidents: risk rating 1-5 × 1-5, required_behaviour
-- ---------------------------------------------------------------------------
alter table public.incidents
  add column if not exists risk_severity_1_5 smallint null check (risk_severity_1_5 is null or (risk_severity_1_5 >= 1 and risk_severity_1_5 <= 5)),
  add column if not exists risk_likelihood_1_5 smallint null check (risk_likelihood_1_5 is null or (risk_likelihood_1_5 >= 1 and risk_likelihood_1_5 <= 5)),
  add column if not exists risk_rating_product smallint null,
  add column if not exists risk_classification text null check (risk_classification is null or risk_classification in ('Low', 'Medium', 'High')),
  add column if not exists required_behaviour text null;

comment on column public.incidents.risk_rating_product is 'Severity 1-5 × Likelihood 1-5, read-only';
comment on column public.incidents.risk_classification is '1-5 Low, 6-12 Medium, 13-25 High';

-- ---------------------------------------------------------------------------
-- 3. Incident affected persons (multiple per incident, task/machinery)
-- ---------------------------------------------------------------------------
create table if not exists public.incident_affected_persons (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid null,
  display_name text null,
  task_operation text null,
  machinery_equipment_tools text null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_incident_affected_persons_incident on public.incident_affected_persons(incident_id);
create index if not exists idx_incident_affected_persons_company on public.incident_affected_persons(company_id);
create index if not exists idx_incident_affected_persons_task_op on public.incident_affected_persons(company_id, task_operation) where task_operation is not null and task_operation != '';

alter table public.incident_affected_persons enable row level security;
drop policy if exists incident_affected_persons_select on public.incident_affected_persons;
create policy incident_affected_persons_select on public.incident_affected_persons for select
  using (public.is_company_member(company_id) or public.is_platform_admin());
drop policy if exists incident_affected_persons_write on public.incident_affected_persons;
create policy incident_affected_persons_write on public.incident_affected_persons for all
  using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
  with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 4. Incident corrective actions: link to task, NCR, source cause
-- ---------------------------------------------------------------------------
alter table public.incident_corrective_actions
  add column if not exists task_id uuid null references public.tasks(id) on delete set null,
  add column if not exists ncr_id uuid null references public.quality_ncrs(id) on delete set null,
  add column if not exists source_cause_type text null check (source_cause_type is null or source_cause_type in ('unsafe_act', 'unsafe_condition', 'root_cause', 'system_failure')),
  add column if not exists source_cause_text text null;

create index if not exists idx_incident_corrective_actions_task on public.incident_corrective_actions(task_id);
create index if not exists idx_incident_corrective_actions_ncr on public.incident_corrective_actions(ncr_id);
