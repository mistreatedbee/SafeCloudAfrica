-- Document Reviews + Management Review Meetings
-- Run after base schema migrations.

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
create index if not exists idx_review_meeting_items_target on public.review_meeting_items(company_id, target_date);
create index if not exists idx_review_meeting_items_resp on public.review_meeting_items(company_id, responsible_user_id);

create or replace function public.touch_review_meetings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_review_meetings_updated_at on public.review_meetings;
create trigger trg_review_meetings_updated_at
before update on public.review_meetings
for each row execute function public.touch_review_meetings_updated_at();

create or replace function public.touch_review_meeting_items_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_review_meeting_items_updated_at on public.review_meeting_items;
create trigger trg_review_meeting_items_updated_at
before update on public.review_meeting_items
for each row execute function public.touch_review_meeting_items_updated_at();

alter table public.review_meetings enable row level security;
alter table public.review_meeting_items enable row level security;

drop policy if exists review_meetings_select on public.review_meetings;
create policy review_meetings_select
on public.review_meetings for select
using (
  public.is_platform_admin()
  or public.is_company_member(company_id)
);

drop policy if exists review_meetings_write on public.review_meetings;
create policy review_meetings_write
on public.review_meetings for all
using (
  public.is_platform_admin()
  or public.company_role(company_id) in ('owner','admin','manager','supervisor','consultant')
)
with check (
  public.is_platform_admin()
  or public.company_role(company_id) in ('owner','admin','manager','supervisor','consultant')
);

drop policy if exists review_meeting_items_select on public.review_meeting_items;
create policy review_meeting_items_select
on public.review_meeting_items for select
using (
  public.is_platform_admin()
  or public.is_company_member(company_id)
);

drop policy if exists review_meeting_items_write on public.review_meeting_items;
create policy review_meeting_items_write
on public.review_meeting_items for all
using (
  public.is_platform_admin()
  or public.company_role(company_id) in ('owner','admin','manager','supervisor','consultant')
)
with check (
  public.is_platform_admin()
  or public.company_role(company_id) in ('owner','admin','manager','supervisor','consultant')
);
