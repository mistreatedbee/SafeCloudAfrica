# Phase 2 Done — Checklist

Completed items for Phase 2 Production + Operating Model.

---

## Platform foundation

- [x] Pre-work: pull latest, install deps, build local + Vercel
- [x] Organisation onboarding: registration → configuration (tier + modules + payment duration) → provisioning (OrgID, default roles, seat limit)
- [x] First user as Owner for Operating Model tiers; legacy tiers get Admin
- [x] Licensing: Base/Growth/Professional/HR-only tiers with R4000/R6500/R7500/R3000 and 3/6/9/12 month durations
- [x] Seat limit enforced on create/invite (tenantService + DB trigger)
- [x] License usage widget on Dashboard (admin/owner)
- [x] Billing & Pricing page at `/billing` with tiers and durations
- [x] Multi-tenant isolation: company_id and RLS on all tenant tables
- [x] RBAC: owner, admin, manager, supervisor, consultant, employee, auditor; route guards updated
- [x] Super Admin (platform_admins) with own route; no access to private company data unless audited support
- [x] Profile, Settings, Help: routes and dropdown links working; role label includes Organisation Owner

## Routing and layout

- [x] All dashboard routes use `Layout` (sidebar present)
- [x] Incident Analytics: risk level filter and error display fixed; 12-month trend supported
- [x] No wrong redirects (e.g. analytics opening home) from code paths reviewed

## UX

- [x] "Dropdown + manual type" (SelectOrType) used for incident type/subcategory, NCR source, PPE; pattern available for audit/risk/etc.

## Incidents

- [x] Form: Project/Client, category/subcategory (linked), evidence upload, investigation required + fields, risk rating linked to matrix
- [x] Analytics: 12-month trends, category/risk/department breakdowns, error handling

## Audit

- [x] Planning, checklist, pre-audit docs, execution, scoring, sign-off, report generation in place
- [x] Date proposal: validation (≥3 dates) in edge function; full email/DB flow documented for production

## Inspections / checklist

- [x] Data model: inspection_runs, inspection_run_items, sector; NCR/CAPA auto-creation from inspection items
- [x] Workflow and analytics present

## Task manager

- [x] Reminders at 7 days, 3 days, due date; overdue marking; escalation (tasksReminderJob)
- [x] Auto-create tasks from NCR, inspection item, PPE issue, incident, audit finding
- [x] Register fields and exports

## PPE

- [x] Issue tracker with reorder/expiry and cost analytics (ppeService, ppeAnalyticsService)
- [x] Stock balance, reorder alerts, date_ordered in schema

## PJO

- [x] Section 1: employee name, person conducting, reason, dept/site, job observed, date, next observation 3/6/12 months
- [x] Section 2 and NCR link (ncr_id on responses); reporting (PjoAnalyticsPage)

## KPI

- [x] KPI under HR only (`/modules/hr/kpis`); General module uses module_targets only

## Deliverables

- [x] Issues list (this session’s fixes)
- [x] Phase 2 done checklist (this file)
- [x] Phase 3 next checklist
- [x] Seed script extended for SA demo (see scripts/seed-demo.mjs and docs/test-accounts.md)
- [x] Migration: `docs/migrations/operating_model_roles_licensing.sql` for owner role and new license tiers
