-- Fix: email notification lookups silently fail for non-manager users.
--
-- The previous profiles_select_role policy restricted profile reads to managers+.
-- When a regular employee creates an incident, submits for approval, issues PPE,
-- etc., and the code looks up the assignee/approver/recipient email, the DB
-- query returns nothing under that policy, so the email is never sent.
--
-- Any active company member needs to be able to read the contact details
-- (name, email) of other members in the same company so that notification
-- emails can be delivered regardless of the sender's role.

-- Replace the old manager-only SELECT policy with one that allows any
-- active company member to read profiles within their company.
drop policy if exists profiles_select_role on public.user_profiles;
drop policy if exists profiles_select_company_member on public.user_profiles;

create policy profiles_select_company_member on public.user_profiles
  for select
  using (
    public.is_company_member(company_id)
    or public.is_platform_admin()
  );
