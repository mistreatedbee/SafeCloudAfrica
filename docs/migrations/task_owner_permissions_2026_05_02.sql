-- Task Manager owner permissions
-- Date: 2026-05-02
-- Safe to run multiple times.

-- Keep the legacy helper name because existing policies use it broadly.
-- Intent: organisation owner, management roles, and consultants can manage
-- company-wide task data.
create or replace function public.is_company_consultant_or_admin(p_company_id uuid)
returns boolean
language sql
stable
as $$
  select public.company_role(p_company_id) in ('owner','admin','manager','supervisor','consultant');
$$;

alter table public.tasks enable row level security;

drop policy if exists tasks_select_role on public.tasks;
create policy tasks_select_role
on public.tasks for select
using (
  public.is_company_consultant_or_admin(company_id)
  or public.is_company_auditor(company_id)
  or assignee_user_id = public.request_user_id()
  or public.is_platform_admin()
);

drop policy if exists tasks_insert_admin_consultant on public.tasks;
create policy tasks_insert_admin_consultant
on public.tasks for insert
with check (
  public.is_company_consultant_or_admin(company_id)
  or public.is_platform_admin()
);

drop policy if exists tasks_update_admin_consultant on public.tasks;
create policy tasks_update_admin_consultant
on public.tasks for update
using (
  public.is_company_consultant_or_admin(company_id)
  or public.is_platform_admin()
)
with check (
  public.is_company_consultant_or_admin(company_id)
  or public.is_platform_admin()
);
