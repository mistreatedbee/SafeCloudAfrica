-- Fix: the incident_investigations table referenced by
-- src/api/services/incidentInvestigationsService.ts (and used by both
-- IncidentCreateModal.tsx and IncidentDetailModal.tsx) was never actually
-- created by any migration in this repo. Every upsertIncidentInvestigation()
-- call has been throwing "relation does not exist" whenever an incident's
-- investigation was saved -- the entire Investigation feature has been
-- broken from day one, independent of the investigationRequired-gate and
-- list-sort-order bugs fixed separately in IncidentCreateModal.tsx and
-- incidentsService.ts.
--
-- Schema mirrors the IncidentInvestigation type in src/api/models/entities.ts
-- exactly. RLS mirrors the existing incidents_select_role policy (any user
-- who can see the parent incident can see its investigation); insert/update
-- follow the same is_company_member pattern used elsewhere in this app for
-- content any active company member can submit.

create table if not exists public.incident_investigations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  incident_id uuid not null references public.incidents(id) on delete cascade,
  notes text null,
  instruction_breakdown text null,
  task_sequence text null,
  risk text null,
  risk_profile text null,
  potential_consequence text null,
  event_timeline text null,
  immediate_causes jsonb null,
  root_causes_human jsonb null,
  root_causes_workplace jsonb null,
  system_failures jsonb null,
  contributing_factors text null,
  lessons_learnt text null,
  investigation_team jsonb null,
  conclusion text null,
  prepared_by text null,
  distributions jsonb null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, incident_id)
);

create index if not exists idx_incident_investigations_company_incident
  on public.incident_investigations(company_id, incident_id);

alter table public.incident_investigations enable row level security;

drop policy if exists incident_investigations_select on public.incident_investigations;
create policy incident_investigations_select
on public.incident_investigations for select
using (
  public.is_platform_admin()
  or exists (
    select 1 from public.incidents i
    where i.id = incident_investigations.incident_id
      and i.company_id = incident_investigations.company_id
      and (
        public.is_company_consultant_or_admin(i.company_id)
        or public.is_company_auditor(i.company_id)
        or i.created_by_user_id = public.request_user_id()
        or i.assignee_user_id = public.request_user_id()
      )
  )
);

drop policy if exists incident_investigations_insert on public.incident_investigations;
create policy incident_investigations_insert
on public.incident_investigations for insert
with check (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists incident_investigations_update on public.incident_investigations;
create policy incident_investigations_update
on public.incident_investigations for update
using (public.is_company_member(company_id) or public.is_platform_admin())
with check (public.is_company_member(company_id) or public.is_platform_admin());
