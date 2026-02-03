# Safe Cloud Africa (IDSMP) — Phase 2 Scope: Supported vs Deferred

## What is fully supported in Phase 2 (core)
- **Real auth** (InsForge email/password) + session restore
- **Multi-tenancy** (company isolation) with:
  - `companies`
  - `company_memberships` (admin/consultant/employee)
  - **Licence enforcement** (employee limits)
- **Role-based dashboards**
  - **Admin**: company-level visibility
  - **Employee**: only assigned / self-created items
- **Incident management foundation**
  - Real incidents stored in DB
  - Company + module ownership
  - Category + subcategory (from Incident Category source of truth)
  - Attachment hooks (storage buckets) — file UI can be added incrementally
- **Tasks foundation**
  - Real tasks stored in DB
  - Assignment + status + due dates
- **Audit trail (activity logs)**
  - Logs for consultant activity and key admin actions

## Phase 2 “enable incrementally” (supported, but can start minimal)
- **Corrective actions (CAPA)**
  - Draft by consultant
  - Approval by admin
  - Linking to incidents
- **Document control (DMS)**
  - Basic document metadata in DB
  - File storage in buckets (documents/evidence)
- **Forms (manual builder first)**
  - Create template schemas in DB
  - Upload PDFs to storage

## Deferred to Phase 3
- **Compliance scoring engine** (module + company scoring, weighting, heatmaps)
- **AI / OCR PDF → editable form extraction**
- **Automation** (reminders, escalations, scheduled compliance jobs)
- **Advanced reporting** (PDF/monthly reports, auto emails)
- **Offline mode + sync**
- **Billing / payments / self-serve licensing upgrades**
- **Consultant marketplace / external workflow management**

## Blockers to full production readiness (Phase 2)
- **RLS policies must be enabled** for tenant isolation (no RLS = no production)
- **Schema must exist in InsForge** (tables + indexes + triggers)
- **Incident Category document** must be finalised (exact categories/subcategories)
- **Storage buckets + file policies** must be configured (documents/evidence/forms)
- **Invite acceptance security** depends on JWT claims:
  - If email claim is not available, you need an **edge function** for invite acceptance
- **Admin operations requiring service role** (e.g., creating users on behalf of others) should be implemented via **edge functions** (not from anon key)

