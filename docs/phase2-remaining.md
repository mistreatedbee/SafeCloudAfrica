# Safe Cloud Africa — Phase 2 Remaining Work Checklist

This document lists what is **still required to fully complete Phase 2** for Safe Cloud Africa (IDSMP), aligned to:
- **Multi-tenancy** (company isolation)
- **RBAC** (role-based access control)
- **RLS** (database enforcement)
- **Storage** (evidence + certificates + documents)
- **Module completeness** (every page + action works end-to-end)

## Current Phase 2 status (already completed in the app)

These are implemented and wired to live data (no mock placeholders in app pages):
- **Dashboard**: live compliance proxy + risk heatmap + incident trends + overdue actions + expiring training + polling refresh.
- **Legal**: legal register CRUD (create + status update + evidence attach/view/download) + module landing metrics.
- **HR / Users**: workforce metrics + `user_profiles` support + edit profile (dept/site/email/name) + contractors/visitors integration + training compliance count.
- **Security**: activity/audit trail summary + CSV export + RBAC links to Settings/Users.
- **Approvals**: approve/reject workflow with decision modal + refresh.
- **PPE**: add PPE item + issue PPE flows + refresh.
- **Training**: training matrix by role + optional certificate upload + open/download.
- **Health**: medical certificate upload + listing + open/download + stats.
- **Planning & Review**: create plan + add KPI + KPI view per plan.
- **Improvement**: create improvement action + list.
- **Reports**: training export + audits export wired to live tables.

**Important**: The UI is complete, but Phase 2 is not fully “done” until the backend pieces below are deployed and enforced (RLS + storage policies + licensing + invites).

---

## Phase 2 remaining work (must-do)

## 1) Apply database schema + RLS (InsForge Postgres)

### 1.1 Apply the latest schema
- **Apply** `docs/phase2-schema.sql` to your InsForge Postgres.
- Confirm all tables/functions/policies exist and match the current frontend expectations.

### 1.2 RLS verification checklist (multi-tenant isolation)
For each Phase 2 table below, verify:
- **SELECT**: company members can read only their company’s rows
- **INSERT/UPDATE/DELETE**: restricted to management roles where required
- **Bootstrap rules**: new companies/members can complete onboarding without deadlocks

Minimum tables to verify (used by the app now):
- **Core tenant**: `companies`, `company_memberships`, `company_invites`
- **Audit trail**: `activity_logs`
- **General/metrics**: `module_targets`
- **Tasks/CAPA**: `tasks`, `corrective_actions`, `approvals`
- **Docs**: `documents`, `evidence_attachments`
- **Safety**: `incidents`, `risks`
- **Audits**: `inspections`, `audit_findings`
- **Training**: `training_courses`, `training_records`
- **PPE**: `ppe_items`, `ppe_issues`
- **Health**: `medical_certificates`
- **HR**: `user_profiles`, `contractors`, `visitors`
- **Planning/Improvement**: `planning_plans`, `planning_kpis`, `improvement_actions`
- **Environment/Quality** (if enabled): `environment_aspects`, `environment_monitoring`, `quality_ncrs` (names may vary in your schema)

### 1.3 One required RLS improvement already added
- `user_profiles` now includes a management insert policy:
  - `profiles_insert_management` (admins/managers can upsert staff profiles)

---

## 2) Storage buckets + policies (InsForge Storage)

The app now uses storage for documents, evidence, certificates, and logos. Create these buckets and enforce access.

### 2.1 Buckets required by the app
- `sca-documents` (uploaded company documents)
- `sca-templates` (template library files)
- `sca-logos` (company logos)
- `sca-evidence` (legal evidence attachments and other evidence)
- `sca-training-certificates` (training record certificates)
- `sca-medical-certificates` (medical certificates)

### 2.2 Storage policy checklist (required)
For each bucket:
- **Read** allowed only for authenticated users within the same company context
- **Write** restricted to management roles (admin/manager/supervisor/consultant) where appropriate
- **Public access**: OFF for everything except (optionally) `sca-logos` if you want public logo URLs

**Key design rule**: store files under a key prefix that includes `company_id/…` so you can enforce access by path.

---

## 3) Licensing enforcement (Phase 2 business requirement)

Phase 2 requires “real” enforcement, not UI-only.

### 3.1 Decide where licensing lives
Choose one approach:
- **Option A (fast)**: store in `companies.metadata.license`
- **Option B (cleaner)**: create `licenses` table (company_id, plan, seats, modules, starts_at, ends_at, status)

### 3.2 Enforce seat limit (e.g. 4 users)
Implement **hard checks** on:
- Invite creation (don’t allow invites beyond seat limit)
- Membership creation/acceptance

Where to enforce:
- **Server-side**: edge function (recommended)
- **Database-side**: a function + RLS rule (possible but can get complex)

---

## 4) Invite acceptance flow (end-to-end)

Right now invites are created by admins. Phase 2 requires a smooth self-accept flow.

### 4.1 Implement “Accept Invite” (recommended approach)
Add an **edge function** to:
- Validate invite token
- Create `company_memberships` for the signed-in user
- Mark invite accepted

Reason: RLS often blocks the “first insert” for brand-new users without a privileged server pathway.

### 4.2 UI requirement
Add a page like `/accept-invite?token=...` that:
- verifies token
- joins the company
- redirects to `/app`

---

## 5) Security settings: enforce, don’t just store

The app stores some settings in `companies.metadata`, but Phase 2 requires enforcement at the auth layer.

### 5.1 What can be stored per company (OK)
- UI preferences
- notification preferences
- webhook URLs
- email template copy

### 5.2 What must be enforced by InsForge auth (not only UI)
- password policy rules
- MFA rules
- session duration / refresh rules

If InsForge supports org-level policy enforcement, configure it there; otherwise, treat these as “planned” until backend support exists.

---

## 6) Forms system (Phase 2 core feature still outstanding)

Phase 2 requirement: companies can create and use forms in-system.

Deliverables:
- Upload a PDF (store original)
- Manual form builder (no OCR required yet)
- Save as template
- Assign to modules (Safety/HR/Legal)
- Save submissions + attachments

Recommended tables:
- `forms`, `form_versions`, `form_fields`, `form_submissions`, `form_submission_files`

---

## 7) Notifications (real emails + in-app)

Phase 2 should send real alerts for:
- overdue tasks / corrective actions
- approvals pending
- expiring training / medical certificates
- document review due
- critical incidents (NLTI/LTI/Fatality)

Implementation options:
- edge functions + scheduled jobs
- InsForge built-in (if available)

---

## 8) Real-time updates beyond polling (optional Phase 2 upgrade)

Current app behavior is “refresh/poll after actions”. To reach “real-time”:
- subscriptions for incidents/tasks/approvals/activity logs (if InsForge realtime is enabled)
- otherwise keep polling at low intervals on key pages

---

## 9) Production hardening (required before real clients)

- **Disable/lock `/seed-demo`** (env-gated + platform-admin only)
- Centralize error reporting (Sentry or equivalent)
- Confirm Vercel env vars are correctly set:
  - `VITE_INSFORGE_BASE_URL`
  - `VITE_INSFORGE_ANON_KEY`
- Confirm no localhost URLs are referenced in production build
- Add basic rate limiting to edge functions (invites, auth-related)

---

## Acceptance criteria (Phase 2 is “done” when…)

- A brand-new user can:
  - sign up → verify email → sign in → create company → become admin
- Admin can:
  - invite users (blocked when seat limit reached)
  - users can accept invite and immediately see correct tenant data
- Every uploaded file:
  - is stored in the correct bucket
  - is downloadable/openable only by authorized company members
- Every page:
  - has live data
  - actions persist in DB
  - refreshes after actions
- RLS:
  - prevents cross-company data access in all tables

