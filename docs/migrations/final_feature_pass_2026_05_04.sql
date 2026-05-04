-- Safe Cloud Africa final feature pass
-- Additive schema refinements for notifications, archive workflows, questionnaires, exports, and HR performance KPAs.

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  recipient_user_id uuid not null,
  channel text not null check (channel in ('in_app', 'email')),
  event_key text not null,
  event_type text not null,
  title text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, recipient_user_id, channel, event_key)
);

create index if not exists idx_notification_events_company_created
  on public.notification_events(company_id, created_at desc);

create index if not exists idx_notification_events_recipient
  on public.notification_events(recipient_user_id, created_at desc);

alter table public.notification_events enable row level security;

drop policy if exists notification_events_company_read on public.notification_events;
create policy notification_events_company_read on public.notification_events
  for select
  using (
    recipient_user_id = auth.uid()
    or exists (
      select 1 from public.company_memberships cm
      where cm.company_id = notification_events.company_id
        and cm.user_id = auth.uid()
        and cm.status = 'ACTIVE'
        and cm.role in ('owner', 'admin')
    )
  );

drop policy if exists notification_events_company_insert on public.notification_events;
create policy notification_events_company_insert on public.notification_events
  for insert
  with check (
    exists (
      select 1 from public.company_memberships cm
      where cm.company_id = notification_events.company_id
        and cm.user_id = auth.uid()
        and cm.status = 'ACTIVE'
        and cm.role in ('owner', 'admin', 'manager', 'supervisor')
    )
  );

drop policy if exists notification_events_company_update on public.notification_events;
create policy notification_events_company_update on public.notification_events
  for update
  using (
    exists (
      select 1 from public.company_memberships cm
      where cm.company_id = notification_events.company_id
        and cm.user_id = auth.uid()
        and cm.status = 'ACTIVE'
        and cm.role in ('owner', 'admin', 'manager', 'supervisor')
    )
  )
  with check (
    exists (
      select 1 from public.company_memberships cm
      where cm.company_id = notification_events.company_id
        and cm.user_id = auth.uid()
        and cm.status = 'ACTIVE'
        and cm.role in ('owner', 'admin', 'manager', 'supervisor')
    )
  );

alter table public.health_medicals
  add column if not exists status text not null default 'active' check (status in ('active', 'archived')),
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by_user_id uuid,
  add column if not exists superseded_by_id uuid;

alter table public.health_vaccinations
  add column if not exists status text not null default 'active' check (status in ('active', 'archived')),
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by_user_id uuid,
  add column if not exists superseded_by_id uuid;

create index if not exists idx_health_medicals_active_employee
  on public.health_medicals(company_id, employee_id, medical_type, status);

create index if not exists idx_health_vaccinations_active_employee_vaccine
  on public.health_vaccinations(company_id, employee_user_id, lower(vaccine_name), status);

alter table public.hr_performance_reviews
  add column if not exists kpa_rows jsonb not null default '[]'::jsonb;

alter table if exists public.pjo_checklist_templates
  add column if not exists operation_type text,
  add column if not exists category text,
  add column if not exists frequency text check (frequency is null or frequency in ('daily', 'weekly', 'monthly', 'ad_hoc'));

alter table if exists public.pjo_checklist_items
  add column if not exists answer_type text not null default 'yes_no' check (answer_type in ('yes_no', 'text', 'rating')),
  add column if not exists evidence_required boolean not null default false,
  add column if not exists allocated_score numeric;

alter table if exists public.pjo_responses
  add column if not exists answer_text text,
  add column if not exists comment text,
  add column if not exists evidence_file_ids uuid[] not null default '{}',
  add column if not exists allocated_score numeric,
  add column if not exists achieved_score numeric;

alter table if exists public.audit_checklist_templates
  add column if not exists frequency text check (frequency is null or frequency in ('daily', 'weekly', 'monthly', 'ad_hoc'));

alter table if exists public.audit_checklist_items
  add column if not exists answer_type text not null default 'yes_no' check (answer_type in ('yes_no', 'text', 'rating')),
  add column if not exists evidence_required boolean not null default false,
  add column if not exists allocated_score numeric;

alter table if exists public.audit_checklist_responses
  add column if not exists answer_text text,
  add column if not exists comment text,
  add column if not exists evidence_file_ids uuid[] not null default '{}',
  add column if not exists allocated_score numeric,
  add column if not exists achieved_score numeric;

alter table if exists public.inspection_checklist_templates
  add column if not exists frequency text check (frequency is null or frequency in ('daily', 'weekly', 'monthly', 'ad_hoc'));

alter table if exists public.inspection_checklist_items
  add column if not exists answer_type text not null default 'yes_no' check (answer_type in ('yes_no', 'text', 'rating')),
  add column if not exists evidence_required boolean not null default false,
  add column if not exists allocated_score numeric,
  add column if not exists risk_rating text check (risk_rating is null or risk_rating in ('low', 'medium', 'high'));

alter table if exists public.inspection_run_items
  add column if not exists answer_text text,
  add column if not exists comment text,
  add column if not exists evidence_file_ids uuid[] not null default '{}',
  add column if not exists allocated_score numeric,
  add column if not exists achieved_score numeric,
  add column if not exists risk_rating text check (risk_rating is null or risk_rating in ('low', 'medium', 'high'));
