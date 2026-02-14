-- Migration: Fix RLS policies that used current_setting('tenant.company_id')
-- which causes "unrecognized configuration parameter" when the app does not set it.
-- These policies now use is_company_member(company_id) like the rest of the schema.
-- Run this against your database if the risk assessment (or CAPA/compliance) page errors.

-- Risk assessments
drop policy if exists "risk_assessments_tenant_isolation" on public.risk_assessments;
create policy "risk_assessments_tenant_isolation" on public.risk_assessments
  for all using (public.is_company_member(company_id) or public.is_platform_admin());

-- Risk assessment items
drop policy if exists "risk_assessment_items_isolation" on public.risk_assessment_items;
create policy "risk_assessment_items_isolation" on public.risk_assessment_items
  for all using (
    risk_assessment_id in (
      select id from public.risk_assessments ra
      where public.is_company_member(ra.company_id) or public.is_platform_admin()
    )
  );

-- Corrective actions
drop policy if exists "corrective_actions_tenant_isolation" on public.corrective_actions;
create policy "corrective_actions_tenant_isolation" on public.corrective_actions
  for all using (public.is_company_member(company_id) or public.is_platform_admin());

-- Module content (if table exists)
drop policy if exists "module_content_tenant_isolation" on public.module_content;
create policy "module_content_tenant_isolation" on public.module_content
  for all using (public.is_company_member(company_id) or public.is_platform_admin());

-- Compliance scores (if table exists)
drop policy if exists "compliance_scores_tenant_isolation" on public.compliance_scores;
create policy "compliance_scores_tenant_isolation" on public.compliance_scores
  for all using (public.is_company_member(company_id) or public.is_platform_admin());
