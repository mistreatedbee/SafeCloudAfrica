# IDSMP Phase Roadmap

## Phase 1 (Now) — Demo-ready foundation

- Demo-stable UI with mock data
- Complete navigation: every module has a page
- Clean page/module structure for easy editing
- Basic “service layer” separation (mock-first, backend-ready)
- Documentation: inventory + gaps + roadmap

## Phase 2 (MVP) — Operational product (checklist)

### Platform foundation
- Auth: login/logout, sessions, password policy, invites
- Multi-tenant: company → site → department
- RBAC enforcement: Admin/Manager/Supervisor/Employee/Auditor (per module)
- Database persistence for all core records
- Storage uploads: documents/versions, certificates, incident evidence
- Notifications: in-app + email + escalation rules + preferences
- Search: basic cross-module search (docs/tasks/incidents)
- Exports: PDF/Excel for reports + audit packs

### Module deliverables
- Users/roles: CRUD + hierarchy + contractor/visitor accounts (basic)
- Tasks & time: time entries, expected vs actual, status automation, basic timeline view
- Planning/KPIs: plans + KPI tracking + feedback + acknowledgments (optional anonymous)
- DMS: metadata CRUD + versioning + approvals + review dates
- Approvals/signatures: approval queue + sign action + timestamping (+ re-auth step)
- Document review scheduler: reminders + overdue escalation
- Risk/hazard: register + scoring + review triggers (permits later)
- Incidents/CAPA: reporting + investigation template + corrective actions + escalation
- Training/competency: matrix + records + expiry reminders + certificate upload
- Audits/inspections: checklists + findings + evidence + CAPA linking
- Legal register: requirements + evidence + compliance status
- PPE: issue/return/next-issue + cost tracking

## Phase 3 (Full system) — Intelligent + automated IDSMP (checklist)

### Compliance scoring engine
- Weighted model + module breakdown (Docs/Training/Risks/Incidents/Audits)
- ISO clause mapping (Annex SL) and drilldowns
- Real-time dashboards + trends + alerts

### Automation & scale
- Auto-create tasks from audits/incidents/overdue reviews
- Escalation chains + SLAs, scheduled compliance checks
- Reporting automation: monthly packs + scheduled email delivery
- Offline mode + sync (mobile-first)
- Observability: logs, metrics, tracing + alerting

### Sellable expansions & commercial
- BBS: observations + reinforcement scoring + unsafe act trends + coaching
- Contractors/visitors: portals + inductions + sign-in + briefings
- Emergency: drills + panic alerts + WhatsApp/SMS integrations
- Template library: industry packs + master file cloning + indexing
- External consultant workflows (limited access)
- Billing: per user/site/module, trials, invoices, upgrades

