# Safe Cloud Africa (IDSMP) — What Works End-to-End vs What's Missing

**Compiled:** 2026-08-20
**Sources:** Direct code inspection + live production DB (schema, RLS, row counts) from `SYSTEM_STATUS_2026_08_20.md`, plus `docs/missing-for-production.md` and `docs/phase2-supported-vs-deferred.md`. This is a synthesis, not a new audit — see those files for full detail and caveats.

---

## 1. TL;DR

The platform is a live, multi-tenant SaaS (React + Vite + TypeScript frontend, InsForge/Postgres backend, deployed on Vercel) for ISO 45001/9001/14001 safety, quality, and environment management. **Four modules are verified working end-to-end against production data this session: Auth/session, PPE Management, Training & Competency, and Safety Objectives.** Roughly 18 other modules have complete-looking UI and database schema but **zero rows in the live database** — the same "looks done, never actually saved a record" pattern found and fixed in PPE and Training. Core production-readiness gaps (MFA on approvals, malware scanning, disaster-recovery drills, full observability) are still open regardless of module status.

---

## 2. ✅ Verified working end-to-end (traced against live data)

| Module | What it does |
|---|---|
| **Auth / session** | Email+password login via InsForge, 7-day refresh-token session, background access-token refresh. (Was silently ending sessions after ~15 min — fixed.) |
| **HR employee directory** | Shared employee picker used across PPE, Training, Objectives, Incidents, Legal, KPI, Health, etc. Any active company member can now read it (was manager/HR-only, breaking pickers for everyone else). |
| **Sidebar navigation** | Collapsible module groups — first-click dead zone fixed. |
| **PPE Management** | Item catalogue, stock intake (per-size, expiry, reorder levels), atomic stock-movement ledger, issue-to-employee or manual contractor, insufficient-stock blocking with override, non-compliance reporting with HR-linked subject + responsible person, full corrective-action workflow (open → in_progress → awaiting_evidence → under_review → closed) with append-only notes and manager sign-off, CSV export, daily reminder cron for overdue actions. |
| **Training & Competency** | Add training record against any HR employee (with or without a platform login), training matrix (job descriptions × course catalogue × requirements), providers with structured contact fields, cost/expiry reporting with CSV export, auto-sync of required training on job-description change, self-view for employees. |
| **Safety Objectives** | Status workflow, mandatory reason on "Not Achieved," full append-only comment/progress history, review section with HR-linked responsible person and corrective action. |

Also confirmed live: crons now actually fire (`CRON_SECRET`/`CRON_COMPANY_IDS` were unset in Vercel, silently 401-ing every cron — now set).

---

## 3. ⚠️ Built but unproven — zero production data

These have full pages, service-layer code, and database tables, and the PHASE2 docs describe several as "complete." But as of the last live check, **the core tables have 0 rows** despite 5 real companies and 13 real users — the exact signature PPE and Training showed before their save paths turned out to be broken (stale PostgREST schema cache, employee pickers requiring a platform login almost no one has, non-atomic writes). None of these have been individually re-audited yet.

- **Incidents** — full investigation workflow, 13 categories, evidence uploads (extensive UI, 0 incidents ever saved)
- **Risk Assessments** — 10+ related tables, all empty
- **Quality / NCR**
- **Legal Register / Legal Updates**
- **Audits** (`AuditsPage`, `AuditDetailPage`) — README documents a full multi-stage lifecycle (schedule → date approval → pre-audit docs → checklist → findings → sign-off → report → archive), but no audit has been recorded in production
- **KPI / Performance**
- **Review Meetings**
- **Environment** (water, air, aspects, impact assessments — every sub-table empty)
- **Health** (medicals, hygiene, wellness campaigns)
- **Calibration**
- **Improvement Actions**
- **Corrective Actions** (cross-module — distinct from PPE's own, which does work)
- **Forms** (templates + submissions)
- **BBS Programme, Contractors & Visitors, Template Library, Emergency Preparedness** (all sellable features)
- **Billing** — plausibly just genuinely unused (no company on a paid plan yet), less suspicious than the rest
- **Toolbox Talks / Permit to Work / LOTO** — 1–2 rows only, lightly exercised
- **Inspections** — the inspection record itself has 1 row, but `inspection_runs` (actually running a checklist) has 0 — related to a missing-column bug fixed for a different table; worth re-checking it actually unblocked usage

**To clear each one:** check (1) the create/update payload matches the live table's real columns (raw-SQL migrations here need a manual `NOTIFY pgrst, 'reload schema'` or the API silently 404s on real columns), (2) any employee picker doesn't default to "must have a platform login," (3) RLS `SELECT`/`INSERT` policies actually match the roles the UI expects.

---

## 4. ❌ Missing for production readiness (independent of per-module status)

From `docs/missing-for-production.md`, still open:

**Critical**
- Secure approvals/signatures with re-auth or MFA and legal-grade timestamping
- File antivirus/malware scanning on uploads (documents, evidence, certificates)
- Consistent API contract versioning
- Formal backup + disaster-recovery strategy (not just "InsForge has backups")

**Important**
- Escalation rules + user notification preferences (beyond the current PPE/Objectives reminder cron)
- Offline mode + sync for mobile field use
- Full-text search across documents/incidents/tasks
- Document versioning + real-time collaborative editing
- Scheduled report delivery (beyond CSV export)
- Observability: centralized logs/metrics/alerting, error reporting
- Pagination/caching/indexing strategy at scale (204 tables, currently light load)

**Nice-to-have**
- AI-assisted risk scoring, predictive trends
- WhatsApp/SMS escalation and panic alerts
- Industry template packs + guided setup wizard
- External consultant limited-access workflows
- Self-serve billing (plan upgrades, invoices, trials)

**Phase 3 (explicitly deferred by design, per `docs/phase2-supported-vs-deferred.md`)**
- Compliance scoring engine (module/company weighting, heatmaps)
- AI/OCR PDF → editable form extraction
- Automated escalations/scheduled compliance jobs beyond what exists today
- Consultant marketplace

---

## 5. Known standing risk

Every migration in this codebase is applied as raw SQL by hand — PostgREST's schema cache does **not** auto-refresh, so a column can exist in Postgres and still be invisible to the API until `NOTIFY pgrst, 'reload schema'` runs. This has caused at least one confirmed production outage (PPE) and is documented as a standing process risk in `docs/migrations/README.md`. Treat any "column not found in schema cache" error as this, first.

---

## 6. Bottom line

- **Trust as working today:** Auth, PPE, Training, Safety Objectives, HR employee directory, sidebar nav, crons.
- **Assume unverified until re-checked:** everything in §3 — roughly 18 modules, including flagship features like Incidents, Audits, and Risk Assessments that the PHASE2 docs call "complete."
- **Structurally absent regardless of module state:** MFA on approvals, malware scanning, DR strategy, full observability, offline/mobile sync, compliance scoring, self-serve billing.
