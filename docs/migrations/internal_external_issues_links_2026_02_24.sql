-- Internal & External Issues Assessment links
-- Adds optional links to risk assessments and quality NCRs.

alter table public.quality_internal_external_issues
  add column if not exists linked_risk_assessment_id uuid null references public.risk_assessments(id) on delete set null,
  add column if not exists linked_ncr_id uuid null references public.quality_ncrs(id) on delete set null;

create index if not exists idx_quality_ie_issues_company_risk_assessment
  on public.quality_internal_external_issues(company_id, linked_risk_assessment_id);

create index if not exists idx_quality_ie_issues_company_ncr
  on public.quality_internal_external_issues(company_id, linked_ncr_id);
