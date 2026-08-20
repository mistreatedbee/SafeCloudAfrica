# Safe Cloud Africa — Project Status Report

**Date:** 20 August 2026

This report tracks the project against the three-phase plan agreed at the start: **Phase 1 (Foundation)**, **Phase 2 (MVP / core operational system)**, and **Phase 3 (full automated system + sellable expansions)**. It shows what's fully delivered, what's built and rolling out, and what's still ahead.

---

## Where the project started

Six months ago, Phase 1 set out to build the foundation: a complete navigation shell with every planned module in place, a clean architecture ready to connect to a real backend, and a demo-stable product to build on. **Phase 1 is fully complete** — every module has a page, the app structure is clean and maintainable, and the platform was built ready for real data from day one.

## Where the project is now

The system is live in production with real companies and real staff using it daily. **Phase 2 (the MVP / core operational system) is largely built and a meaningful portion of it is already live and in daily use.** Phase 3 (automation, compliance scoring, and the commercial/sellable add-ons) has barely started, which has always been the plan — it comes after Phase 2 is fully proven.

---

## Phase 1 — Foundation: ✅ Complete

- Full app navigation and page structure for every planned module
- Company branding, multi-module architecture
- Clean, maintainable codebase ready to connect to a real backend (not a throwaway prototype)

---

## Phase 2 — MVP / Core Operational System

### Platform foundation

| Capability | Status |
|---|---|
| Login, sessions, password policy, staff invites | ✅ Live |
| Multi-tenancy (company → site → department) + licence limits | ✅ Live |
| Role-based access (Admin/Manager/Supervisor/Employee/Auditor) | ✅ Live — fine-grained UI permission gates still being rolled out |
| Secure file storage (documents, evidence, certificates) | ✅ Live |
| Notifications (in-app + email) | ✅ Live — per-user notification preferences still to come |
| Audit trail of key actions | 🔄 Core logging live, full coverage across every action in progress |
| Cross-module search | 🔄 Backend ready, search screen not built yet |
| PDF/Excel exports | 🔄 Available per-module (e.g. CSV exports); scheduled/automated report packs are Phase 3 |

### Modules

**Live and in daily use:**
- **PPE Management** — full catalogue, stock control with automatic reorder alerts, issuing to staff/contractors, non-compliance reporting through to sign-off and close-out, plus automatic daily reminders for overdue items
- **Training & Competency** — training records, training matrix linked to job roles, provider records, cost/expiry reporting
- **Safety Objectives** — goal setting, progress tracking, formal review and close-out
- **Staff/HR directory** — the shared employee list used across every module

**Built and functionally complete, rolling out to live day-to-day use:**
- **Incident Management** — full reporting, investigation, and corrective-action workflow
- **Risk Assessments** — register, scoring, risk heat map
- **Audits & Inspections** — full lifecycle from scheduling through checklists, findings, sign-off, and reporting
- **Legal Register** — legal requirements and compliance tracking
- **Quality / Non-Conformance Reporting**
- **Document Management** — document records, approvals, review scheduling (version history still to come)
- **Approvals & Sign-offs** — approval workflow is built; the extra re-authentication step for legally binding sign-offs is still to be added
- **Tasks & Time tracking** — task assignment and status are built; time-entry tracking and a timeline view are still to come
- **KPIs & Performance Planning** — core records are built; supervisor feedback and acknowledgment flows are still to come
- **Environment, Health & Wellness, Calibration, Improvement Actions, Forms** — built and available, still ramping up to regular day-to-day use

**Next step for this group:** move each of these from "built and available" to "everyday habit" the same way PPE and Training already are — training the team on them, checking they're being used correctly module by module, and tightening anything that's rough around the edges.

---

## Phase 3 — Automation, Compliance Scoring & Commercial Expansion

This phase is much further along than a "not started" checklist would suggest — a lot of it has already been built.

**Built and live:**
- **Compliance scoring engine** — this is fully built: a weighted score per module (Documents, Training, Risks, Incidents, Audits), traffic-light (green/yellow/red) status, trend history month over month, and an AI-generated insight layer that flags predicted deterioration risk and recommends specific actions
- **ISO clause mapping** — records are mapped to ISO clause structure (Annex SL) with a per-clause compliance breakdown, so a score can be traced back to the exact clause it affects
- **Scheduled monthly report automation** — a monthly cron job runs on the 1st of every month, generates the compliance report per company, and emails it out automatically — this is the "scheduled reports + auto-email delivery" item from the original plan, and it's live in production
- **Task escalation automation** — overdue tasks, unaccepted assignments, and tasks with no progress automatically trigger reminders and escalation notifications on a schedule; the same automation pattern also runs for overdue PPE and safety-objective actions
- **AI assistant infrastructure** — a shared AI layer (built on both OpenAI and Anthropic models) is live and already powers the in-app support chat assistant; the same infrastructure is reusable for other AI features across the system
- **Licensing & billing logic** — license tiers, pricing, seat limits, trial expiry, and feature-access gating by plan are all built and enforce automatically; what's not yet built is *self-serve* billing (a customer paying/upgrading without us doing it manually) and live invoicing
- **Consultant role & permissions** — "consultant" is a fully wired role across the permission system (alongside Owner/Admin/Manager/Supervisor/Employee/Auditor), giving external consultants scoped access rather than full admin rights

**Built, but lighter than the original full vision:**
- **BBS, Contractors & Visitors, Emergency Preparedness, Template Library** — each has a real, working page and a working save/record service (not just a mock screen). What's not yet built is the fuller vision from the original plan for each: BBS's reinforcement-scoring and unsafe-act trend engine, a full visitor/induction sign-in portal, panic-alert and WhatsApp/SMS integrations for Emergency, and industry template packs with guided cloning for the Template Library.

**Not yet built:**
- **Offline mode** for field/mobile use with automatic sync when back online
- **Formal system monitoring/alerting** for the technical team (logs/metrics/tracing)
- **WhatsApp/SMS alerting** — placeholder only right now, no live integration

---

## Bottom line

- **Phase 1 (Foundation):** 100% complete.
- **Phase 2 (MVP):** the platform foundation (login, multi-tenancy, storage, notifications) is done and live. Four modules — PPE, Training, Safety Objectives, and the staff directory — are fully live and used daily. The remaining Phase 2 modules (Incidents, Audits, Risk, Legal Register, Quality, Documents, Approvals, Tasks, KPIs, Environment, Health, Calibration, Improvement, Forms) are functionally built and available; the current focus is driving them into the same everyday, proven use as the first four.
- **Phase 3 (Automation, scoring, scale, commercial add-ons):** further along than expected at this stage — the compliance scoring engine, ISO clause mapping, automated monthly reporting, task/PPE/objective escalation automation, the AI assistant layer, licensing/billing enforcement, and consultant-role access are all built and live. What's left is rounding out the sellable add-ons (BBS, Contractors/Visitors, Emergency, Template Library) to their full original scope, self-serve billing, offline mode, and formal system monitoring.

**In short: this is a bigger build than "MVP plus a couple of automation pieces" — most of Phase 3's automation and intelligence layer is already live, not just planned. What remains is finishing the commercial add-on modules, self-serve billing, offline support, and driving the built-but-lighter-use Phase 2 modules into daily use.**
