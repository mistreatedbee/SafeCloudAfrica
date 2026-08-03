-- AI Digital Safety Manager: daily executive briefing (roadmap §1 / brief #1).
-- Additive. One row per company per calendar day; regenerating a day
-- overwrites that day's row rather than accumulating duplicates.

create table if not exists public.ai_briefings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  briefing_date date not null,
  stats jsonb not null,
  narrative text not null,
  recommendations jsonb not null default '[]'::jsonb,
  model text not null,
  created_by_user_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, briefing_date)
);

create index if not exists idx_ai_briefings_company_date
  on public.ai_briefings(company_id, briefing_date desc);

alter table public.ai_briefings enable row level security;

drop policy if exists ai_briefings_select on public.ai_briefings;
create policy ai_briefings_select
on public.ai_briefings for select
using (public.is_platform_admin() or public.is_company_member(company_id));

drop policy if exists ai_briefings_write on public.ai_briefings;
create policy ai_briefings_write
on public.ai_briefings for insert
with check (public.is_platform_admin() or public.is_company_member(company_id));

drop policy if exists ai_briefings_update on public.ai_briefings;
create policy ai_briefings_update
on public.ai_briefings for update
using (public.is_platform_admin() or public.is_company_member(company_id))
with check (public.is_platform_admin() or public.is_company_member(company_id));
