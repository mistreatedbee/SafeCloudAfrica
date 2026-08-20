# Safe Cloud Africa (IDSMP) — System Status

**Compiled:** 2026-08-20
**Method:** Direct code inspection, live production database queries (schema, RLS policies, row counts), and hands-on fixes applied and verified this session. This is **not** a full manual click-through of every screen — no browser session was available while compiling this. Where a module was actually fixed and traced end-to-end this session, that's stated explicitly. Everything else is inventoried from code/schema and row-count evidence, with confidence levels called out.

**Live environment:** project `pas375jb` (InsForge), 5 companies, 13 memberships, 204 tables in `public` schema, ~122 API service files, ~199 routes.

---

## 1. How to read this document

Three categories are used throughout:

- ✅ **Verified working** — fixed and traced end-to-end this session (or a prior session), against the live schema, with the fix confirmed applied to production.
- ⚠️ **Present but unverified / at risk** — the UI, API service, and database table all exist and look complete in code, but the table has **zero (or near-zero) rows in production** despite the company having 5 tenants and 13 users. That pattern — complete-looking code, real users, no real data — is exactly what PPE and Training looked like before this session found they were both silently unusable. These have **not** been individually audited; they're flagged because they match the same risk signature.
- ❔ **Not reviewed** — not looked at this session at all; status unknown either way.

---

## 2. ✅ Verified working (fixed this session)

### Authentication / session
**What it does:** Signs users in, keeps them signed in for the life of the 7-day refresh token, proactively refreshes the short-lived (15 min) access token in the background.
**What was broken:** The backend rotates the CSRF token on every `/api/auth/refresh` call, but the app's own refresh logic never captured the new one — so the *second* refresh after login always failed, ending sessions after roughly 15–20 minutes and surfacing "Your session is not available" across the app (most visibly in PPE).
**Status now:** Fixed in `src/api/insforge/sessionState.ts`. Sessions now last the full 7-day refresh-token window.

### HR employee directory access (cross-module)
**What it does:** Every employee picker across the app (PPE, Training, Objectives, Incidents, Legal, KPI, Health, etc.) reads from `hr_employees` via `listHrEmployees`/`searchHrEmployees`/the `HrEmployeeSelect` component.
**What was broken:** The `hr_employees` RLS `SELECT` policy only allowed managers/HR/the employee themself to read the table — so any non-manager opening a page with an employee picker saw an empty dropdown.
**Status now:** Widened to any active company member (matches the existing `sites`/`departments` convention). Write access unchanged.

### Sidebar navigation
**What it does:** Left-hand navigation, including collapsible "Management" group sections (Incidents, HR, Health, Environment, Safety, Legal, Quality, cross-module Management).
**What was broken:** The first click on a not-yet-expanded, not-currently-active group silently did nothing (a default-value mismatch between the toggle handler and the render logic).
**Status now:** Fixed in `src/components/layout/Sidebar.tsx`.

### PPE Management
**What it does end-to-end now:**
- PPE item catalogue (name, category, cost, sizes, supplier)
- Stock intake with initial quantity, reorder level/qty, expiry, per-size tracking, HR-linked "captured by"
- Inventory derived from stored `ppe_stock_movements` (never a manually-edited total)
- Issue PPE to an HR employee (auto-fills job role/department/site) **or** a manually-entered contractor not in HR
- Insufficient-stock blocking with admin override
- Report PPE Issue / Non-compliance, with HR-linked subject employee (manual fallback) and a real Responsible Person selector (linked to `responsible_user_id`)
- Corrective action tracking: status workflow (open → in_progress → awaiting_ppe/training/evidence → under_review → closed), evidence-required-before-review, manager sign-off, append-only progress notes
- Issuing Register and Issue Tracker, with CSV export
**What was broken and fixed:**
- `ppe_stock.size` column existed but PostgREST's schema cache was never reloaded after the migration that added it (applied via raw SQL, not through PostgREST's own migration path) — reloaded via `NOTIFY pgrst, 'reload schema'`.
- `createPpeIssue` silently swallowed any inventory-write failure that wasn't "insufficient stock," leaving a saved issue with no stock effect — now rolls back the issue on failure.
- Stock quantity update + movement-record insert were two separate, non-atomic writes — replaced with `ppe_apply_stock_movement()`, a single Postgres transaction (row-locked).
- Report PPE Issue had no HR integration at all (pure free text) — added HR selectors with manual fallback for both the subject employee and the Responsible Person.
- Added `employee_id`/`issued_to_name` columns and 7 new FK constraints (`ppe_issues`, `ppe_stock`, `ppe_issue_tracker` → `hr_employees`/`ppe_items`/`auth.users`).
- Added a daily reminder cron (`api/cron/responsible-person-reminders.ts`) for overdue/upcoming PPE corrective actions, reusing the existing `notifications`/`notification_events` tables. **Caveat: not live-triggered/verified — see §4.**

### Training & Competency
**What it does end-to-end now:**
- Add Training Record with a real HR employee selector (works for employees with **or** without a platform login), existing-course or new-course flow, completed/expiry dates, certificate upload
- Training Matrix Setup (job descriptions, course catalogue, job-course requirements) — untouched, was already correct
- Training Providers with Name → Contact → Email (`mailto:`) → Website (clickable) display order
- Reports & Costs tab (spend by course/provider/job, outstanding, expiring-soon) with CSV export
**What was broken and fixed:**
- `training_records` only had `user_id` (a platform login reference), no `employee_id`. **Every one of the 12 HR employees in this company has no platform login**, and the Employee selector only showed employees *with* a login by default — so the selector was always empty and **zero training records had ever been created**. Added `employee_id`, made `user_id` nullable, switched the selector to show all HR employees.
- Training Providers had only a single free-text "contact info" field — added dedicated `contact`/`email`/`website` columns with validation.
- Fixed name resolution across the Employee Training list, filters, search, and CSV exports to resolve via `employee_id` first (was assuming every trainee had a `user_profiles` row).

### Safety Objectives
**What it does end-to-end now:**
- Objectives with status (Not Started/In Progress/On Hold/Completed/Achieved/Not Achieved/Closed), editable at any point before completion
- Marking an objective "Not Achieved" now **requires** a reason, committed atomically with the status change
- Full comment/progress-note history (append-only, author + timestamp, never overwritten)
- Review section with corrective action, resources required, HR-linked Responsible Person, start/close dates
**What was broken and fixed:**
- The Notes panel (comment history) crashed immediately on open — `useEffect` was used without being imported. Comment history was already correctly modeled in the database (a separate `module_target_notes` table); it was simply inaccessible.
- "Not Achieved" could previously be saved with no reason at all.

---

## 3. ⚠️ Present but unverified / at risk

These modules have complete-looking pages, service files, and database tables, but **the underlying table has 0 rows in production** (checked via `pg_stat_user_tables`, which is an approximate/lagging count — treat as directional, not exact) despite 5 real companies and 13 real users existing in the system. This is not proof they're broken, but it is the same signature PPE and Training showed before their root causes were found. **None of these have been individually audited this session.**

| Module (page) | Core table(s) | Rows | Notes |
|---|---|---|---|
| Incidents (`IncidentsPage`, `IncidentAnalyticsPage`) | `incidents`, `incident_investigations`, `incident_affected_persons`, `incident_corrective_actions` | 0 | The PHASE2 completion docs describe this as a full rebuild with 13 categories, investigation workflow, evidence uploads — extensive UI exists, but no incident has ever been saved. |
| Risk Assessments (`RisksPage`, `RiskReviewsPage`) | `risk_assessments`, `risks`, `risk_assessment_items`, `risk_assessment_signoffs` | 0 | Large schema (10+ related tables) with no data at all. |
| Quality / NCR (`NCRsPage`, `QualityPage`) | `quality_ncrs` | 0 | |
| Legal Register (`LegalRegisterPage`, `LegalUpdatesPage`) | `legal_requirements`, `legal_updates` | 0 | |
| Audits (`AuditsPage`, `AuditDetailPage`) | `audits`, `audit_questions`, `audit_responses`, `audit_findings` | 0 | |
| KPI / Performance (`HrKpisPage`, `kpi/*`) | `kpi_assessments`, `kpi_findings`, `kpi_items` | 0 | |
| Review Meetings (`ReviewMeetingDetailPage`) | `review_meetings`, `review_meeting_items` | 0 | |
| Environment (`EnvironmentPage`) | `env_water_monitoring`, `env_air_quality`, `environment_aspects`, `env_impact_assessments` | 0 | Every environment sub-table is empty. |
| Health (`health/*`) | `health_medicals`, `health_hygiene_records`, `health_wellness_campaigns` | 0 | |
| Calibration (`CalibrationPage`) | `calibration_records` | 0 | |
| Improvement (`ImprovementPage`, `ImprovementDetailPage`) | `improvement_actions` | 0 | |
| Corrective Actions (cross-module) | `corrective_actions` | 0 | Distinct from PPE's own corrective-action tracking, which does work. |
| Forms (`FormsPage`) | `form_submissions`, `form_templates` | 0 | |
| BBS Programme (sellable feature) | `bbs_observations` | 0 | |
| Contractors & Visitors (sellable feature) | `contractors`, `visitors` | 0 | |
| Template Library (sellable feature) | `template_library_items` | 0 | |
| Emergency Preparedness (sellable feature) | `emergency_drills` | 0 | |
| Billing | `billing_subscriptions`, `billing_invoices`, `billing_plan_catalog` | 0 | Plausibly genuinely unused if no company has an active paid plan yet — less suspicious than the others. |
| Toolbox Talks / Permit to Work / LOTO | `permits_to_work` (1), `loto_records` (2) | 1–2 | Has *some* data — likely functions, but only lightly exercised. |
| Inspections | `inspections` (1), `inspection_runs` (0) | 1 | The inspection itself can apparently be created; **`inspection_runs` (starting an actual checklist run) has 0 rows** — consistent with the `inspection_runs.auditee_user_id` missing-column bug fixed earlier this session for a *different* missing column (`inspection_runs` was missing a column the code needed). Worth re-checking that the fix actually unblocked real usage. |

**Recommended next step for each row above:** repeat the same three-part check that found every bug this session found:
1. Does the create/update payload in the service file match the live table's actual columns? (Schema-cache staleness after any raw-SQL migration is a real, demonstrated risk across this codebase — check with `NOTIFY pgrst, 'reload schema'` if a "column not found in schema cache" error appears despite the column existing.)
2. Does any employee/user picker in the form default to "must have a platform login" when most real employees don't have one?
3. Does the table's RLS `SELECT`/`INSERT` policy actually match the roles the UI expects to use it?

---

## 4. Known specific remaining gaps (already identified, not yet fixed)

1. **PPE corrective-action / Safety Objective reminder cron** — code is written and deployed (`api/cron/responsible-person-reminders.ts`), reusing existing notification infrastructure, but was never actually triggered/observed running (no way to invoke a live Vercel cron from this environment). Depends on `CRON_COMPANY_IDS` and `INSFORGE_SERVICE_ROLE_KEY` being set in Vercel — confirm these are configured, then check the first scheduled run's logs.
2. **Training self-view RLS** — an employee with a login still can't see their own training record via the new `employee_id` link (only via the old `user_id` link). Blocked by the sandbox's classifier as a live policy change; not currently urgent since no employee in this company has a login yet.
3. **"Training Matrix by Role" widget** (a compliance-by-role summary on the Employee Training tab, distinct from the actual Training Matrix Setup screen) is still built entirely on `company_memberships`/`user_profiles` and will show no data for employee-linked (no-login) training records.
4. **`syncTrainingRequirementsForUser`** (auto-assigning required training when a job description is set) is keyed entirely off `user_profiles.job_description_id` — there's no employee-level equivalent, so this auto-sync silently does nothing for any employee without a login.
5. **PPE issue↔ppe_issues insert atomicity** — the issue row and its stock movement are still two separate top-level steps (the stock+movement pair is now atomic via `ppe_apply_stock_movement`, but "create issue" then "call that RPC" is not itself one transaction). Mitigated with a compensating delete on failure, not a true transaction.
6. **PostgREST schema-cache staleness is a systemic risk, not a one-off.** Every migration in `docs/migrations/` that was applied via raw SQL outside a proper migration tool (which appears to be most of them, since `db migrations` isn't supported on this InsForge plan) risks the same "column exists but the REST layer doesn't know it" failure PPE hit. Anyone adding a column going forward should run `NOTIFY pgrst, 'reload schema';` immediately after.

---

## 5. What this document is *not*

- Not a manual QA pass — no browser session was used; findings for §2 come from direct code/schema tracing and live SQL verification, the same method that found the original bugs.
- Not a security review — RLS was checked only for the tables directly touched this session (`hr_employees`, PPE tables, training tables).
- Not exhaustive — §3's table list covers the modules with the clearest zero-data signal; there may be others among the 204 tables not covered here.
- The PHASE2-*.md documents in this repo describe several of the §3 modules as "✅ COMPLETE" / "production-ready." Those claims describe the **frontend form/UI work**, which does appear substantial in the code — but they predate the discovery (this session) that a form looking complete is no guarantee the save path actually works against the live database. Treat those documents' completion claims with the same skepticism this session applied to PPE and Training, until each is actually re-verified.
