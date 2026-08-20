-- Fix: cross-module employee pickers return empty lists for non-manager users.
--
-- hr_rls_personnel_and_self_service_2026_03_21.sql tightened hr_employees SELECT to
-- personnel-access roles (owner/admin/manager/supervisor/HR manager) or the row's own
-- user_id/supervisor_user_id. That is correct for the HR module's own screens, but
-- listHrEmployees()/searchHrEmployees() (src/api/services/hrService.ts) are also used
-- application-wide as a plain employee directory picker — e.g. "Responsible employee",
-- "Reviewed by", "Approved by", "Affected person", trainee selectors — in Environment,
-- Quality, Legal, Objectives, KPI, Health, Incidents, Training and PPE screens
-- (see HrEmployeeSelect, PpeIssueModal, PpeStockCreateModal, EnvironmentWastePage,
-- EnvironmentWaterPage, EnvironmentAirPage, EnvironmentEiaPage,
-- EnvironmentRiskOpportunityPage, etc.). For any regular (non-manager) company member
-- opening those pages, the RLS silently returns zero rows instead of erroring, so the
-- employee dropdown appears empty/"unable to pick up employees".
--
-- Fix: restore SELECT access to any active company member (same convention already used
-- for sites/departments — see sites_departments_user_profiles.sql), matching how this
-- table is actually consumed as a directory across modules. INSERT/UPDATE/DELETE remain
-- restricted to personnel-access roles, unchanged.
--
-- Idempotent: safe to re-run.

drop policy if exists hr_employees_select on public.hr_employees;
create policy hr_employees_select on public.hr_employees
for select
using (
  public.is_platform_admin()
  or public.is_company_member(company_id)
);
