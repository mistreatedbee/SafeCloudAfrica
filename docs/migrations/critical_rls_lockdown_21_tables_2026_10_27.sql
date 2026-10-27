-- CRITICAL SECURITY FIX (2026-10-27 audit)
--
-- 21 public tables had RLS fully disabled while the `anon` and `authenticated`
-- database roles held full SELECT/INSERT/UPDATE/DELETE grants on all of them.
-- Since this app's serverless proxy (api/insforge-proxy.ts) forwards every
-- /api/database/* call upstream with no authorization logic of its own, RLS is
-- the ONLY access-control layer -- meaning any anonymous visitor using only the
-- public anon key baked into the client bundle could read/write billing
-- invoices, subscriptions, external access grants, HR KPIs, compliance scores,
-- audit sections/invitation tokens, SLA config, template library and visitor
-- QR sessions across every tenant.
--
-- This migration enables RLS and adds policies on all 21 tables, mirroring the
-- access patterns already proven elsewhere in this schema (is_company_member /
-- is_company_consultant_or_admin / is_company_owner_or_admin / is_platform_admin,
-- and the hr_employees self-service pattern for hr_kpis).
--
-- KNOWN FOLLOW-UP NEEDED: audit_invitation_tokens' external-auditee response
-- flow (respondToAuditInvitation in src/api/services/auditsService.ts) looks up
-- and updates a row by token_hash via the normal client SDK, with no company
-- membership -- i.e. it currently relies on exactly the open access this
-- migration removes. Locking this table down to company-staff access (as done
-- here) is correct and necessary, but it will break that external response
-- flow until a dedicated server endpoint (service-role, mirroring
-- server/invites/acceptHandler.ts) is added to validate the token and apply
-- the response server-side. Flagged for a fast-follow, not done here.

-- ---------------------------------------------------------------------------
-- Company-scoped tables: standard "company member can read, consultant/admin
-- can write" pattern (same as contractors / visitors tables).
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'audit_sections',
    'compliance_iso_record_links',
    'compliance_score_run_domains',
    'compliance_score_runs',
    'module_target_reviews',
    'monthly_compliance_reports',
    'risk_assessment_prework_instances',
    'sla_escalation_events',
    'sla_policies',
    'template_library_versions',
    'template_org_copies',
    'visitor_qr_sessions'
  ])
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (is_company_member(company_id) OR is_platform_admin())',
      t || '_select_member', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (is_company_consultant_or_admin(company_id) OR is_platform_admin()) WITH CHECK (is_company_consultant_or_admin(company_id) OR is_platform_admin())',
      t || '_write_management', t
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- audit_invitation_tokens: company-staff visibility/management only.
-- (External-auditee token response flow needs a server-side fix -- see note above.)
-- ---------------------------------------------------------------------------

ALTER TABLE public.audit_invitation_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_invitation_tokens_select_member ON public.audit_invitation_tokens
  FOR SELECT USING (is_company_member(company_id) OR is_platform_admin());

CREATE POLICY audit_invitation_tokens_write_management ON public.audit_invitation_tokens
  FOR ALL USING (is_company_consultant_or_admin(company_id) OR is_platform_admin())
  WITH CHECK (is_company_consultant_or_admin(company_id) OR is_platform_admin());

-- ---------------------------------------------------------------------------
-- external_access_grants: granting external access is an owner/admin action.
-- ---------------------------------------------------------------------------

ALTER TABLE public.external_access_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY external_access_grants_select_member ON public.external_access_grants
  FOR SELECT USING (is_company_member(company_id) OR is_platform_admin());

CREATE POLICY external_access_grants_write_owner_admin ON public.external_access_grants
  FOR ALL USING (is_company_owner_or_admin(company_id) OR is_platform_admin())
  WITH CHECK (is_company_owner_or_admin(company_id) OR is_platform_admin());

-- ---------------------------------------------------------------------------
-- hr_kpis: mirrors hr_employees' self-service pattern -- the employee being
-- assessed, their manager, personnel-access roles, and platform admins.
-- ---------------------------------------------------------------------------

ALTER TABLE public.hr_kpis ENABLE ROW LEVEL SECURITY;

CREATE POLICY hr_kpis_select ON public.hr_kpis
  FOR SELECT USING (
    is_platform_admin()
    OR hr_has_personnel_access(company_id)
    OR employee_user_id = request_user_id()
    OR manager_user_id = request_user_id()
  );

CREATE POLICY hr_kpis_write ON public.hr_kpis
  FOR ALL USING (
    is_platform_admin()
    OR hr_has_personnel_access(company_id)
    OR manager_user_id = request_user_id()
    OR employee_user_id = request_user_id()
  )
  WITH CHECK (
    is_platform_admin()
    OR hr_has_personnel_access(company_id)
    OR manager_user_id = request_user_id()
    OR employee_user_id = request_user_id()
  );

-- ---------------------------------------------------------------------------
-- Billing tables: platform-admin only (mirrors org_licenses). No UI caller
-- currently reads/writes these directly from a company-scoped screen.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'billing_invoices',
    'billing_subscriptions',
    'billing_usage_snapshots'
  ])
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin())',
      t || '_platform_admin_only', t
    );
  END LOOP;
END $$;

-- billing_plan_catalog has no company_id -- it's a global catalog, platform-admin managed.
ALTER TABLE public.billing_plan_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY billing_plan_catalog_platform_admin_only ON public.billing_plan_catalog
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- ---------------------------------------------------------------------------
-- Pure counters/sequences with no company scoping column, mutated exclusively
-- by SECURITY DEFINER functions (next_support_ticket_reference,
-- generate_employee_number) that run with the function owner's privileges and
-- are never called directly by client code. No table-level policy is needed
-- or safe to add here -- enabling RLS with zero policies denies all direct
-- anon/authenticated table access while leaving those functions unaffected.
-- ---------------------------------------------------------------------------

ALTER TABLE public.support_ticket_reference_counter ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_user_sequences ENABLE ROW LEVEL SECURITY;
