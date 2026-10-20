-- Several RLS helper functions queried company_memberships / companies
-- internally without SECURITY DEFINER, so they were subject to the very
-- RLS policies that call them -- is_company_member() is used inside
-- company_memberships' own "memberships_select_member" policy, so calling
-- it re-queries company_memberships, re-evaluating the same policy,
-- recursing until Postgres's stack depth limit was hit (error 54001).
-- This surfaced as HTTP 500s on routine queries (e.g. a user's own
-- company_memberships + companies(*) embed) for some members.
--
-- hr_is_hr_manager() and is_platform_admin() already had the correct
-- SECURITY DEFINER fix; this applies the same fix to the rest.
ALTER FUNCTION public.is_company_member(uuid) SECURITY DEFINER SET search_path TO 'public';
ALTER FUNCTION public.company_role(uuid) SECURITY DEFINER SET search_path TO 'public';
ALTER FUNCTION public.is_company_owner_or_admin(uuid) SECURITY DEFINER SET search_path TO 'public';
ALTER FUNCTION public.is_company_consultant_or_admin(uuid) SECURITY DEFINER SET search_path TO 'public';
ALTER FUNCTION public.hr_has_personnel_access(uuid) SECURITY DEFINER SET search_path TO 'public';
