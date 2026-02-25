-- Fix owner onboarding RLS denials (403/406) for organisation setup.
-- Apply after phase2-schema.sql and operating_model_roles_licensing.sql.
-- Safe to run multiple times.

-- 1) Ensure owner is treated as management in shared RLS helper functions.
create or replace function public.is_company_manager(p_company_id uuid)
returns boolean
language sql
stable
as $$
  select public.company_role(p_company_id) in ('owner', 'admin', 'manager');
$$;

create or replace function public.is_company_supervisor(p_company_id uuid)
returns boolean
language sql
stable
as $$
  select public.company_role(p_company_id) in ('owner', 'admin', 'manager', 'supervisor');
$$;

create or replace function public.is_company_consultant_or_admin(p_company_id uuid)
returns boolean
language sql
stable
as $$
  select public.company_role(p_company_id) in ('owner', 'admin', 'manager', 'supervisor', 'consultant');
$$;

-- 2) Explicitly align onboarding-critical policies with owner role.
drop policy if exists companies_update_admin on public.companies;
drop policy if exists companies_update_management on public.companies;
create policy companies_update_management
on public.companies for update
using (
  public.company_role(id) in ('owner', 'admin', 'manager')
  or public.is_platform_admin()
)
with check (
  public.company_role(id) in ('owner', 'admin', 'manager')
  or public.is_platform_admin()
);

drop policy if exists invites_select_admin on public.company_invites;
create policy invites_select_admin
on public.company_invites for select
using (
  public.company_role(company_id) in ('owner', 'admin', 'manager')
  or public.is_platform_admin()
  or lower(email) = lower(public.request_user_email())
);

drop policy if exists invites_insert_admin on public.company_invites;
create policy invites_insert_admin
on public.company_invites for insert
with check (
  public.company_role(company_id) in ('owner', 'admin', 'manager')
  or public.is_platform_admin()
);

drop policy if exists invites_update_admin on public.company_invites;
create policy invites_update_admin
on public.company_invites for update
using (
  public.company_role(company_id) in ('owner', 'admin', 'manager')
  or public.is_platform_admin()
  or lower(email) = lower(public.request_user_email())
)
with check (
  public.company_role(company_id) in ('owner', 'admin', 'manager')
  or public.is_platform_admin()
  or (
    lower(email) = lower(public.request_user_email())
    and accepted_user_id = public.request_user_id()
    and accepted_at is not null
  )
);

drop policy if exists sites_insert_manager on public.sites;
create policy sites_insert_manager
on public.sites for insert
with check (
  public.company_role(company_id) in ('owner', 'admin', 'manager')
  or public.is_platform_admin()
);

drop policy if exists sites_update_manager on public.sites;
create policy sites_update_manager
on public.sites for update
using (
  public.company_role(company_id) in ('owner', 'admin', 'manager')
  or public.is_platform_admin()
)
with check (
  public.company_role(company_id) in ('owner', 'admin', 'manager')
  or public.is_platform_admin()
);

drop policy if exists sites_delete_manager on public.sites;
create policy sites_delete_manager
on public.sites for delete
using (
  public.company_role(company_id) in ('owner', 'admin', 'manager')
  or public.is_platform_admin()
);

drop policy if exists departments_insert_manager on public.departments;
create policy departments_insert_manager
on public.departments for insert
with check (
  public.company_role(company_id) in ('owner', 'admin', 'manager')
  or public.is_platform_admin()
);

drop policy if exists departments_update_manager on public.departments;
create policy departments_update_manager
on public.departments for update
using (
  public.company_role(company_id) in ('owner', 'admin', 'manager')
  or public.is_platform_admin()
)
with check (
  public.company_role(company_id) in ('owner', 'admin', 'manager')
  or public.is_platform_admin()
);

drop policy if exists departments_delete_manager on public.departments;
create policy departments_delete_manager
on public.departments for delete
using (
  public.company_role(company_id) in ('owner', 'admin', 'manager')
  or public.is_platform_admin()
);
