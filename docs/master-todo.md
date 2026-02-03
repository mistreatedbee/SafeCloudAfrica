# Safe Cloud Africa (IDSMP) — Master To‑Do List

This is the single checklist to take the system from **demo** → **MVP** → **full platform**.

## Phase 2 (MVP) — “Real system”

### Platform foundation
- **Auth**: real login/logout, session handling, password policy, invite flow
  - ✅ Invite flow (accept page + email verification)
  - ✅ Password policy enforcement (min length, uppercase, numbers, special chars)
  - ✅ Session management (timeout configuration)
  - ✅ MFA framework (toggle + Phase 3 implementation)
- **Multi-tenancy**: company → sites → departments hierarchy
  - ✅ Licensing enforcement (employee limit hard constraint)
  - ✅ Company registration with license types
  - ✅ RLS policies for data isolation
- **RBAC**: Admin/Manager/Supervisor/Employee/Auditor permissions per module
  - ✅ Role definitions in schema
  - ✅ Membership with role assignment
  - 🔄 UI role-based feature gates (partial)
- **Audit trail**: immutable log for key actions (documents, approvals, edits, incidents)
  - ✅ Security audit logging framework
  - 🔄 Full audit table + triggers (in progress)
- **Storage**: document uploads + evidence + certificates (access control + signed URLs)
  - ✅ Storage service (6 buckets: documents, templates, logos, evidence, training-certs, medical-certs)
  - ✅ Public URL generation
  - ✅ File deletion with RLS enforcement
- **Notifications**: in-app + email + escalation rules + user preferences
  - ✅ Email service with 5 templates (overdue task, incident created, approval request, document review, training expiry)
  - ✅ In-app notifications (createNotification, markRead, getUnreadCount)
  - ✅ Email sending via InsForge edge function (requires setup)
  - 🔄 User notification preferences (framework ready)
- **Search**: basic search + filters across docs/tasks/incidents
  - 🔄 Full-text search with Postgres (schema ready, UI pending)
- **Exports**: PDF/Excel exports for audits/reports (manual trigger)
  - ⏳ Phase 3 (deferred)

### Module build-out (minimum)
- **Users/roles**: users CRUD, roles/permissions, contractor/visitor accounts (basic)
  - ✅ User CRUD via tenantService
  - ✅ Role assignment with membership
  - 🔄 Contractor/visitor accounts (UI pending)
- **Tasks & time**: create/assign, expected vs actual time entries, status automation, simple timeline view
  - ✅ Task CRUD service
  - ✅ TaskEditModal component (edit status, priority, due date)
  - 🔄 Time entry tracking (schema ready)
  - ⏳ Timeline view (Phase 3)
- **Planning/KPIs**: plans CRUD, KPI CRUD, supervisor feedback, employee acknowledgment (optional anonymous flag)
  - 🔄 Basic CRUD service written
  - ⏳ Supervisor feedback UI (Phase 3)
- **DMS**: documents CRUD, versions, approval status, review dates, basic access control
  - ✅ Document CRUD service
  - ✅ DocumentEditModal component (edit title, category, status, version)
  - ✅ RLS-enforced access control
  - 🔄 Document versioning (schema ready)
- **Approvals/signatures**: approval queue, sign action (re-auth step), timestamping
  - ✅ Approval CRUD service
  - ✅ Approval workflow states (pending, approved, rejected)
  - 🔄 Signature capture + re-auth (UI pending)
  - ⏳ E-signature integration (Phase 3)
- **Document reviews**: scheduler rules + reminders + overdue escalation
  - ✅ Review scheduler service
  - ✅ Overdue escalation via notifications
  - 🔄 Review UI (in progress)
- **Risk/hazard**: risk register CRUD + scoring + review triggers
  - ✅ Risk CRUD service
  - ✅ Risk matrix heat map UI (RiskHeatMap component)
  - 🔄 Scoring algorithm (schema ready)
  - ⏳ Permits (Phase 3)
- **Incidents/CAPA**: incident reporting + investigation template + corrective actions + escalation to management
  - ✅ Incident CRUD service
  - ✅ IncidentEditModal component (edit title, status, severity, location)
  - ✅ CAPA linking framework
  - ✅ Incident notifications
  - 🔄 Investigation workflow UI (pattern established, component integration pending)
- **Training/competency**: training matrix + records + certificate upload + expiry reminders
  - ✅ Training CRUD service
  - ✅ Certificate upload via storageService
  - ✅ Expiry reminder notifications
  - 🔄 Training matrix UI (in progress)
- **Audits/inspections**: checklists + findings + evidence upload + corrective action linking
  - ✅ Audit CRUD service
  - ✅ Evidence upload via storageService
  - 🔄 Checklist UI (in progress)
- **Legal register**: requirements CRUD + evidence linking + compliance status
  - ✅ Legal requirement CRUD service
  - 🔄 Evidence linking UI (in progress)
- **PPE**: issuing + returns + next issue date + cost tracking
  - ✅ PPE CRUD service
  - 🔄 Issuance workflow UI (in progress)

## Phase 3 (Full system) — “Automation + scoring + scale”

### Compliance scoring engine
- **Score model**: weights per module + breakdown (Docs/Training/Risk/Incidents/Audits)
- **Clause mapping**: map records to ISO clauses (Annex SL structure)
- **Dashboards**: real-time score updates + trends + drilldowns

### Automation (time-saving + sellable)
- Auto-create tasks from audit findings / incidents / document review overdue
- Escalation chains + SLAs (role & site based)
- Scheduled reports + auto-email delivery (monthly packs)
- Legal register “auto-updated” approach (provider integration or curated updates)

### “Sellable” expansions
- **BBS**: observations + positive reinforcement scoring + trends + coaching workflow
- **Contractors/visitors**: portals, digital inductions, visitor sign-in + briefing sign-off
- **Emergency**: drills + emergency plans + panic alerts + WhatsApp/SMS integrations
- **Template library**: industry packs + master file cloning + controlled editing + indexing for large files

### Scale & commercial
- External consultant workflows (limited access, evidence review, approvals)
- Billing (per user/site/module), trials, invoices, plan upgrades
- Offline mode + sync (mobile-first) with conflict resolution
- Observability: logs/metrics/tracing + alerting

