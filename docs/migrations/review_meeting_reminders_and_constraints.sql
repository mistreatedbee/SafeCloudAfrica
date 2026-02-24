-- Review meetings hardening: completion-date rules + reminder event dedupe
-- Safe to run multiple times.

create table if not exists public.review_meeting_reminder_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  meeting_id uuid not null references public.review_meetings(id) on delete cascade,
  meeting_item_id uuid null references public.review_meeting_items(id) on delete cascade,
  reminder_type text not null,
  created_at timestamptz not null default now(),
  unique (company_id, meeting_id, meeting_item_id, reminder_type)
);

create index if not exists idx_review_meeting_reminders_company_time
on public.review_meeting_reminder_events(company_id, created_at desc);

create index if not exists idx_review_meeting_reminders_item
on public.review_meeting_reminder_events(company_id, meeting_item_id, reminder_type);

alter table public.review_meeting_reminder_events enable row level security;

alter table public.review_meeting_items
  drop constraint if exists review_meeting_items_completion_date_required;

alter table public.review_meeting_items
  add constraint review_meeting_items_completion_date_required
  check (
    (status <> 'COMPLETED')
    or completion_date is not null
  );

drop policy if exists review_meeting_reminders_select on public.review_meeting_reminder_events;
create policy review_meeting_reminders_select
on public.review_meeting_reminder_events for select
using (
  public.is_platform_admin()
  or public.is_company_member(company_id)
);

drop policy if exists review_meeting_reminders_write on public.review_meeting_reminder_events;
create policy review_meeting_reminders_write
on public.review_meeting_reminder_events for all
using (
  public.is_platform_admin()
  or public.company_role(company_id) in ('owner','admin','manager','supervisor','consultant')
)
with check (
  public.is_platform_admin()
  or public.company_role(company_id) in ('owner','admin','manager','supervisor','consultant')
);
