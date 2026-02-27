-- Hotfix: unify RLS helpers/policies for owner + primary-admin access,
-- remove tenant.company_id dependency, and add missing Phase 2 tables.
-- Safe to run multiple times.

-- ---------------------------------------------------------------------------
-- 1) Helper functions: include owner + primary admin fallback
-- ---------------------------------------------------------------------------

create or replace function public.is_company_member(p_company_id uuid)
returns boolean
language sql
stable
as $$
  select (
    exists (
      select 1
      from public.company_memberships m
      where m.company_id = p_company_id
        and m.user_id = public.request_user_id()
        and coalesce(nullif(to_jsonb(m)->>'status', ''), 'ACTIVE') = 'ACTIVE'
    )
    or exists (
      select 1
      from public.companies c
      where c.id = p_company_id
        and c.primary_admin_user_id = public.request_user_id()
    )
  );
$$;

create or replace function public.company_role(p_company_id uuid)
returns text
language sql
stable
as $$
  select coalesce(
    (
      select m.role
      from public.company_memberships m
      where m.company_id = p_company_id
        and m.user_id = public.request_user_id()
        and coalesce(nullif(to_jsonb(m)->>'status', ''), 'ACTIVE') = 'ACTIVE'
      limit 1
    ),
    (
      select 'owner'
      from public.companies c
      where c.id = p_company_id
        and c.primary_admin_user_id = public.request_user_id()
      limit 1
    )
  );
$$;

create or replace function public.is_company_manager(p_company_id uuid)
returns boolean
language sql
stable
as $$
  select public.company_role(p_company_id) in ('owner','admin','manager');
$$;

create or replace function public.is_company_supervisor(p_company_id uuid)
returns boolean
language sql
stable
as $$
  select public.company_role(p_company_id) in ('owner','admin','manager','supervisor');
$$;

create or replace function public.is_company_consultant_or_admin(p_company_id uuid)
returns boolean
language sql
stable
as $$
  select public.company_role(p_company_id) in ('owner','admin','manager','supervisor','consultant');
$$;

-- ---------------------------------------------------------------------------
-- 2) Replace tenant.company_id-based policies
-- ---------------------------------------------------------------------------

drop policy if exists "risk_assessments_tenant_isolation" on public.risk_assessments;
create policy "risk_assessments_tenant_isolation" on public.risk_assessments
  for all
  using (public.is_company_member(company_id) or public.is_platform_admin())
  with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

drop policy if exists "risk_assessment_items_isolation" on public.risk_assessment_items;
create policy "risk_assessment_items_isolation" on public.risk_assessment_items
  for all
  using (
    exists (
      select 1
      from public.risk_assessments ra
      where ra.id = risk_assessment_id
        and (public.is_company_member(ra.company_id) or public.is_platform_admin())
    )
  )
  with check (
    exists (
      select 1
      from public.risk_assessments ra
      where ra.id = risk_assessment_id
        and (public.is_company_consultant_or_admin(ra.company_id) or public.is_platform_admin())
    )
  );

drop policy if exists "corrective_actions_tenant_isolation" on public.corrective_actions;
create policy "corrective_actions_tenant_isolation" on public.corrective_actions
  for all
  using (public.is_company_member(company_id) or public.is_platform_admin())
  with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

do $$
begin
  if to_regclass('public.module_content') is not null then
    execute 'drop policy if exists "module_content_tenant_isolation" on public.module_content';
    execute 'create policy "module_content_tenant_isolation" on public.module_content
      for all
      using (public.is_company_member(company_id) or public.is_platform_admin())
      with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())';
  end if;
end
$$;

do $$
begin
  if to_regclass('public.compliance_scores') is not null then
    execute 'drop policy if exists "compliance_scores_tenant_isolation" on public.compliance_scores';
    execute 'create policy "compliance_scores_tenant_isolation" on public.compliance_scores
      for all
      using (public.is_company_member(company_id) or public.is_platform_admin())
      with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3) Form submissions should use request_user_id() (not auth.uid())
-- ---------------------------------------------------------------------------

drop policy if exists submissions_select_member on public.form_submissions;
create policy submissions_select_member
on public.form_submissions for select
using (
  submitted_by_user_id = public.request_user_id()
  or public.is_company_consultant_or_admin((select company_id from public.form_templates where id = template_id))
  or public.is_platform_admin()
);

drop policy if exists submissions_insert_member on public.form_submissions;
create policy submissions_insert_member
on public.form_submissions for insert
with check (submitted_by_user_id = public.request_user_id() or public.is_platform_admin());

drop policy if exists submissions_update_admin on public.form_submissions;
create policy submissions_update_admin
on public.form_submissions for update
using (
  public.is_company_consultant_or_admin((select company_id from public.form_templates where id = template_id))
  or public.is_platform_admin()
)
with check (
  public.is_company_consultant_or_admin((select company_id from public.form_templates where id = template_id))
  or public.is_platform_admin()
);

-- ---------------------------------------------------------------------------
-- 4) Missing table: review_meetings (+ items)
-- ---------------------------------------------------------------------------

create table if not exists public.review_meetings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text null default 'Management Review Meeting',
  date date not null,
  time text not null,
  place text not null,
  attendee_user_ids uuid[] not null default '{}',
  external_attendees text[] not null default '{}',
  email_list text[] not null default '{}',
  next_meeting_date date null,
  chairperson_user_id uuid null,
  ceo_approval_required boolean not null default false,
  status text not null default 'ACTIVE' check (status in ('DRAFT','ACTIVE','SIGNED','ARCHIVED')),
  signature_status text not null default 'NOT_SIGNED' check (signature_status in ('SIGNED','NOT_SIGNED')),
  signed_by_user_id uuid null,
  signed_at timestamptz null,
  is_locked boolean not null default false,
  auto_email_on_create boolean not null default true,
  auto_email_on_update boolean not null default false,
  auto_create_tasks_from_items boolean not null default false,
  site_id uuid null,
  department_id uuid null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.review_meeting_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  meeting_id uuid not null references public.review_meetings(id) on delete cascade,
  review_item text not null,
  discussion_notes text null,
  action_required text not null,
  responsible_user_id uuid null,
  responsible_name_external text null,
  target_date date null,
  resources_required text null,
  status text not null default 'OUTSTANDING' check (status in ('IN_PROGRESS','OUTSTANDING','COMPLETED')),
  completion_date timestamptz null,
  evidence_file_ids uuid[] not null default '{}',
  linked_document_ids uuid[] not null default '{}',
  linked_task_id uuid null references public.tasks(id) on delete set null,
  updates_log jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_review_meetings_company_date on public.review_meetings(company_id, date desc);
create index if not exists idx_review_meetings_status on public.review_meetings(company_id, status);
create index if not exists idx_review_meetings_next on public.review_meetings(company_id, next_meeting_date);
create index if not exists idx_review_meeting_items_company_meeting on public.review_meeting_items(company_id, meeting_id);
create index if not exists idx_review_meeting_items_status on public.review_meeting_items(company_id, status);

alter table public.review_meetings enable row level security;
alter table public.review_meeting_items enable row level security;

drop policy if exists review_meetings_select on public.review_meetings;
create policy review_meetings_select
on public.review_meetings for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists review_meetings_write on public.review_meetings;
create policy review_meetings_write
on public.review_meetings for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

drop policy if exists review_meeting_items_select on public.review_meeting_items;
create policy review_meeting_items_select
on public.review_meeting_items for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists review_meeting_items_write on public.review_meeting_items;
create policy review_meeting_items_write
on public.review_meeting_items for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 5) Missing table: ppe_issue_tracker
-- ---------------------------------------------------------------------------

create table if not exists public.ppe_issue_tracker (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,

  date_reported timestamptz not null default now(),
  reported_by_user_id uuid not null,
  reported_by_name text null,
  department_id uuid null,
  department_name_text text null,
  site_id uuid null,
  site_name_text text null,
  contractor_or_employee_name text null,
  employee_number text null,
  job_role_or_task text null,
  supervisor_user_id uuid null,
  supervisor_name_text text null,

  ppe_type text not null check (ppe_type in (
    'helmet','gloves','safety_boots','eye_protection','hearing_protection',
    'respirator_mask','reflective_vest','chainsaw_ppe','chemical_ppe','other'
  )),
  ppe_type_other text null,
  issue_category text not null check (issue_category in (
    'missing_ppe','damaged_ppe','expired_ppe','incorrect_ppe',
    'ppe_not_worn','poor_condition','insufficient_supply','non_approved_ppe'
  )),
  description_of_issue text not null,
  risk_level text not null check (risk_level in ('low','medium','high','critical')),

  immediate_work_stopped boolean not null default false,
  immediate_ppe_issued boolean not null default false,
  immediate_employee_removed boolean not null default false,
  immediate_toolbox_talk boolean not null default false,
  immediate_supervisor_notified boolean not null default false,
  immediate_action_notes text null,

  inspection_reference_text text null,
  audit_id uuid null,
  pjo_id uuid null,
  checklist_instance_id uuid null,
  checklist_item_id uuid null,
  witness_interview_notes text null,

  corrective_action_required boolean not null default false,
  responsible_user_id uuid null,
  responsible_user_name text null,
  corrective_department_id uuid null,
  corrective_department_name text null,
  target_completion_date date null,
  replacement_ppe_issued boolean not null default false,
  training_required boolean not null default false,
  disciplinary_action text null,

  status text not null default 'open' check (status in (
    'open','in_progress','awaiting_ppe','awaiting_training','awaiting_evidence','under_review','closed','overdue'
  )),
  progress_updates jsonb not null default '[]'::jsonb,
  follow_up_inspection_date date null,

  department_manager_user_id uuid null,
  department_manager_signed_at timestamptz null,
  department_manager_signature_method text null,
  department_manager_comment text null,
  safety_officer_user_id uuid null,
  safety_officer_verified_at timestamptz null,
  safety_officer_comment text null,
  auditor_user_id uuid null,
  auditor_confirmed_at timestamptz null,
  auditor_comment text null,
  closure_date timestamptz null,
  effectiveness_verified boolean null,
  repeat_issue_indicator boolean null,
  source_requires_auditor_confirmation boolean null,

  ppe_item_id uuid null references public.ppe_items(id) on delete set null,
  stock_id uuid null,

  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ppe_issue_tracker_company_date
  on public.ppe_issue_tracker(company_id, date_reported desc);
create index if not exists idx_ppe_issue_tracker_company_status
  on public.ppe_issue_tracker(company_id, status);
create index if not exists idx_ppe_issue_tracker_responsible
  on public.ppe_issue_tracker(company_id, responsible_user_id);

alter table public.ppe_issue_tracker enable row level security;

drop policy if exists ppe_issue_tracker_select on public.ppe_issue_tracker;
create policy ppe_issue_tracker_select
on public.ppe_issue_tracker for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists ppe_issue_tracker_insert on public.ppe_issue_tracker;
create policy ppe_issue_tracker_insert
on public.ppe_issue_tracker for insert
with check (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists ppe_issue_tracker_update on public.ppe_issue_tracker;
create policy ppe_issue_tracker_update
on public.ppe_issue_tracker for update
using (
  public.is_company_consultant_or_admin(company_id)
  or created_by_user_id = public.request_user_id()
  or reported_by_user_id = public.request_user_id()
  or responsible_user_id = public.request_user_id()
  or public.is_platform_admin()
)
with check (
  public.is_company_member(company_id) or public.is_platform_admin()
);

drop policy if exists ppe_issue_tracker_delete on public.ppe_issue_tracker;
create policy ppe_issue_tracker_delete
on public.ppe_issue_tracker for delete
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());
