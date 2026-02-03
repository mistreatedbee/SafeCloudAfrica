# What is missing to make this production‑ready

## Phase 2 & Phase 3 (at a glance)

- **Phase 2 checklist**: see `docs/master-todo.md` (MVP delivery list)
- **Phase 3 checklist**: see `docs/master-todo.md` (automation + scoring + scale)

## Critical

- **Real authentication + sessions** (no mock users): login, logout, password policy, session storage
- **Multi-tenant data model** (company/site/department separation + row-level permissions)
- **RBAC enforcement** (Admin/Manager/Supervisor/Employee/Auditor) across all modules
- **Database persistence** for all records (tasks, docs, incidents, risks, audits, training, legal register)
- **File storage** for documents, evidence, certificates, media uploads (plus antivirus/malware scanning)
- **Audit trail** (who changed what, when) for compliance defensibility
- **Input validation + error handling** (API + UI) and consistent API contract versioning
- **Secure approvals/signatures** (re-auth/MFA, timestamping, legal defensibility)
- **Backups + disaster recovery** strategy

## Important

- **Notifications**: in-app + email delivery, escalation rules, user preferences
- **Offline mode + sync** (mobile-first) with conflict resolution
- **Search** across documents/incidents/tasks (full-text + filters)
- **Document versioning + collaborative editing** (real-time editing)
- **Reporting exports** (PDF/Excel) and scheduled report delivery
- **Observability**: logs, metrics, alerting, error reporting
- **Performance**: pagination, caching, large file handling + indexing strategy

## Nice-to-have

- **AI helpers**: assisted risk scoring, predictive trends, automation suggestions
- **WhatsApp/SMS integrations** for escalations/panic alerts
- **Industry template packs** + guided setup wizard per vertical
- **External consultant workflows** (limited access, approvals, evidence review)
- **Billing** (per user/site/module), trials, invoices, plan upgrades

