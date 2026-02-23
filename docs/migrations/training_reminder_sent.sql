-- Optional: dedupe training expiry/outstanding reminders (one per record per reminder type)
-- Run after training_matrix_job_linked.sql
create table if not exists public.training_reminder_sent (
  id uuid primary key default gen_random_uuid(),
  training_record_id uuid not null references public.training_records(id) on delete cascade,
  reminder_type text not null,
  sent_at timestamptz not null default now(),
  unique (training_record_id, reminder_type)
);
create index if not exists idx_training_reminder_sent_record on public.training_reminder_sent(training_record_id);
-- RLS: allow service role / cron to insert; app can read if needed
alter table public.training_reminder_sent enable row level security;
drop policy if exists training_reminder_sent_select_member on public.training_reminder_sent;
create policy training_reminder_sent_select_member on public.training_reminder_sent for select
  using (public.is_company_member((select company_id from public.training_records where id = training_record_id)) or public.is_platform_admin());
-- Cron uses service role so bypasses RLS; allow insert for management for manual triggers
drop policy if exists training_reminder_sent_insert on public.training_reminder_sent;
create policy training_reminder_sent_insert on public.training_reminder_sent for insert
  with check (true);
