-- Improvement module (CAPA + process improvement) register schema
-- Safe to run multiple times.

create table if not exists public.improvement_reference_counter (
  company_id uuid not null references public.companies(id) on delete cascade,
  year integer not null,
  last_number integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (company_id, year)
);

create table if not exists public.improvements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  reference_number text not null,
  date_raised timestamptz not null default now(),
  raised_by_user_id uuid not null,
  department_site text null,
  improvement_type text not null check (
    improvement_type in (
      'corrective_action',
      'preventive_action',
      'audit_finding',
      'management_review_decision',
      'employee_suggestion',
      'process_improvement',
      'client_complaint',
      'other'
    )
  ),
  improvement_type_other_text text null,
  description text null,
  risk_level text not null default 'medium' check (risk_level in ('low', 'medium', 'high', 'critical')),
  action_required text null,
  responsible_user_id uuid null,
  resources_needed text null,
  target_date date null,
  status text not null default 'open' check (
    status in (
      'draft',
      'open',
      'in_progress',
      'awaiting_evidence',
      'awaiting_verification',
      'under_management_review',
      'closed',
      'monitoring_required',
      'escalated'
    )
  ),
  evidence_file_ids uuid[] null,
  verification_methods text[] null,
  verification_method_other_text text null,
  verified_by_user_id uuid null,
  date_verified date null,
  was_action_effective boolean null,
  management_reviewed_by_user_id uuid null,
  management_review_date date null,
  management_recommendations text null,
  management_decision text null check (
    management_decision is null or management_decision in ('approve', 'monitor', 'escalate', 'rework')
  ),
  closed_by_user_id uuid null,
  closure_date timestamptz null,
  closure_status text null check (
    closure_status is null or closure_status in ('closed', 'monitoring_required', 'escalated')
  ),
  lessons_learned text null,
  source_type text not null default 'other' check (
    source_type in ('incident', 'ncr', 'audit', 'risk', 'management_review', 'other')
  ),
  source_id uuid null,
  source_other_text text null,
  created_by_user_id uuid not null,
  updated_by_user_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, reference_number)
);

create index if not exists idx_improvements_company_status on public.improvements(company_id, status, updated_at desc);
create index if not exists idx_improvements_company_target on public.improvements(company_id, target_date);
create index if not exists idx_improvements_company_source on public.improvements(company_id, source_type, source_id);
create index if not exists idx_improvements_company_raised on public.improvements(company_id, date_raised desc);

create table if not exists public.improvement_comments (
  id uuid primary key default gen_random_uuid(),
  improvement_id uuid not null references public.improvements(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null,
  message text not null,
  parent_comment_id uuid null references public.improvement_comments(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_improvement_comments_improvement on public.improvement_comments(improvement_id, created_at asc);
create index if not exists idx_improvement_comments_company on public.improvement_comments(company_id, created_at desc);

alter table public.improvement_reference_counter enable row level security;
alter table public.improvements enable row level security;
alter table public.improvement_comments enable row level security;

drop policy if exists improvement_ref_counter_select_member on public.improvement_reference_counter;
create policy improvement_ref_counter_select_member
on public.improvement_reference_counter for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists improvement_ref_counter_write_management on public.improvement_reference_counter;
create policy improvement_ref_counter_write_management
on public.improvement_reference_counter for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

drop policy if exists improvements_select_member_v2 on public.improvements;
create policy improvements_select_member_v2
on public.improvements for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists improvements_write_management_v2 on public.improvements;
create policy improvements_write_management_v2
on public.improvements for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

drop policy if exists improvement_comments_select_member on public.improvement_comments;
create policy improvement_comments_select_member
on public.improvement_comments for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists improvement_comments_insert_member on public.improvement_comments;
create policy improvement_comments_insert_member
on public.improvement_comments for insert
with check (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists improvement_comments_update_management on public.improvement_comments;
create policy improvement_comments_update_management
on public.improvement_comments for update
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());
