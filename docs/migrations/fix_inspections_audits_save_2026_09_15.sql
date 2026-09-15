-- Fix inspection and audit creation failures caused by app/DB schema drift.
-- Apply date: 2026-09-15
--
-- Root causes found:
-- 1. public.inspections was missing site_id/department_id/inspection_method,
--    which createInspection() always sends -> every insert failed.
-- 2. public.audits' status CHECK constraint only allowed
--    ('planned','scheduled','in-progress','completed','reported'), but the
--    app's full audit lifecycle (Audit['status'] in entities.ts) uses
--    'draft','awaiting-documents','ready-for-audit','report-pending',
--    'corrective-actions-open','under-closure-review','archived' too ->
--    every createAudit() insert (status: 'draft') violated the constraint.
-- 3. public.audits was missing document_submission_deadline,
--    lead_auditor_user_id, checklist_template_id, which createAudit()
--    always sends -> the self-heal retry loop silently dropped them,
--    so lead-auditor assignment/date-approval gating/checklist import
--    were being lost on every audit created.

alter table public.inspections
  add column if not exists site_id uuid null references public.sites(id) on delete set null,
  add column if not exists department_id uuid null references public.departments(id) on delete set null,
  add column if not exists inspection_method text null;

alter table public.inspections drop constraint if exists inspections_inspection_method_check;
alter table public.inspections
  add constraint inspections_inspection_method_check
  check (inspection_method is null or inspection_method in ('physical-inspection', 'observation', 'record-review'));

create index if not exists idx_inspections_site on public.inspections(site_id);
create index if not exists idx_inspections_department on public.inspections(department_id);

alter table public.audits drop constraint if exists audits_status_check;
alter table public.audits
  add constraint audits_status_check
  check (
    status in (
      'draft',
      'planned',
      'scheduled',
      'awaiting-documents',
      'ready-for-audit',
      'in-progress',
      'report-pending',
      'completed',
      'corrective-actions-open',
      'under-closure-review',
      'reported',
      'archived'
    )
  );

alter table public.audits
  add column if not exists document_submission_deadline timestamptz null,
  add column if not exists lead_auditor_user_id uuid null,
  add column if not exists checklist_template_id uuid null references public.audit_checklist_templates(id) on delete set null;
