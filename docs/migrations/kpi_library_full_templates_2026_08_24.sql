-- KPI Library: full questionnaire templates (2026-08-24)
--
-- kpi_items currently only stores a single title/description/default_importance
-- per row — it cannot hold a reusable multi-line questionnaire template.
-- Add questionnaire_lines (mirrors the assessment form's QuestionnaireInput
-- shape: { kpiItemId, kpiQuestionnaire, importanceRating }[]) and period_type
-- so a template can pre-fill a whole KPI assessment.
--
-- Note: the real assessment questionnaire lines (kpi_assessment_lines) have no
-- "weight" or "target" columns — weighting is derived from importance_rating
-- (see projectWeightingScore in KPIAssessmentCreatePage.tsx), and there is no
-- target field anywhere in the KPI data model. questionnaire_lines therefore
-- matches the real QuestionnaireInput shape, not the weight/target shape
-- described in some ticket drafts, so "Load template" maps 1:1 onto the
-- existing assessment form and kpi_assessment_lines columns without inventing
-- data that has nowhere to persist.
--
-- period_type reuses the same vocabulary as kpi_assessments.period_type. Both
-- gain 'bi_annual' here so a bi-annual template's period lines up with a
-- valid assessment period.
--
-- Idempotent: safe to re-run.

alter table public.kpi_items
  add column if not exists questionnaire_lines jsonb null,
  add column if not exists period_type text null;

comment on column public.kpi_items.questionnaire_lines is
  'Reusable questionnaire lines for this template: [{ kpiItemId, kpiQuestionnaire, importanceRating }]. Same shape as QuestionnaireInput in KPIAssessmentCreatePage.tsx.';
comment on column public.kpi_items.period_type is
  'Default period type to pre-fill when this template is loaded into a new assessment (monthly/quarterly/bi_annual/annual). Null = leave the assessment''s own default.';

alter table public.kpi_items
  drop constraint if exists kpi_items_period_type_check;
alter table public.kpi_items
  add constraint kpi_items_period_type_check
  check (period_type is null or period_type in ('monthly', 'quarterly', 'bi_annual', 'annual'));

alter table public.kpi_assessments
  drop constraint if exists kpi_assessments_period_type_check;
alter table public.kpi_assessments
  add constraint kpi_assessments_period_type_check
  check (period_type in ('monthly', 'quarterly', 'bi_annual', 'annual'));
