# Module Agent System

Multi-agent AI assistant: shared infra + orchestrator + eleven module
specialist agents (hr, safety, quality, environment, health, legal, kpi,
training, ppe, objectives, contractors).

## Why this calls `insforge.ai` directly instead of an OpenRouter edge function

The original design called for InsForge's Model Gateway (OpenRouter proxied
server-side). Running `npx @insforge/cli ai setup` against this project's
backend returns:

> AI Model Gateway setup is not available on this backend.

So there is no `OPENROUTER_API_KEY` to hand to an edge function. This app
already has a working, shipped alternative: `src/ai/aiClient.ts` (built for
`supportAssistantAiService.ts`) calls `insforge.ai.chat.completions.create()`
directly from client code. The agent system reuses that exact client and
calling convention for consistency with the rest of the codebase. If this
project's InsForge backend is later upgraded to a version with Model Gateway
support, `aiClient.ts` is the only file that needs to change to route through
a server-side edge function instead -- every agent built on top of it is
unaffected.

## Files

| File | Role |
|---|---|
| `agentTypes.ts` | Shared types: `AgentId`, `AgentContext`, `AgentResponse`, `AgentProposedAction`. |
| `agentContext.ts` | `useAgentContext()` hook -- builds `AgentContext` from the signed-in session (company, role, linked HR employee). Never trust a client-supplied companyId/role beyond this. |
| `agentClient.ts` | `askAgent()` / `confirmAgentAction()` -- the only entry points the UI calls. Wraps every call in `withInsforgeSession` so a stale session refreshes before a model call is spent. Routes a confirmed action to the right agent's handler via `ACTION_RUNNERS[action.agentId]`. |
| `agentSupport.ts` | Shared helpers for read-only agents (no `proposedActions`): `parseAgentJsonReply`, `buildFallback`, `countBy`. `hrAgent.ts`/`safetyAgent.ts` parse inline instead since they also handle `proposedActions`. |
| `agents/orchestratorAgent.ts` | Keyword-based routing to module agents; merges replies when more than one module matches. |
| `agents/hrAgent.ts` | HR specialist. Has a write capability (drafts + saves a performance review comment). |
| `agents/safetyAgent.ts` | Safety specialist (incidents, risk assessments, inspections). Has a write capability (drafts + saves incident investigation notes). |
| `agents/qualityAgent.ts` | Quality specialist (NCR/CAPA, customer complaints, internal/external issues register). Read-only. |
| `agents/environmentAgent.ts` | Environment specialist (aspects register, monitoring results). Read-only. |
| `agents/healthAgent.ts` | Occupational health specialist (medicals, restricted duty, hygiene). Read-only, POPIA-gated like hrAgent. |
| `agents/legalAgent.ts` | Legal register specialist (compliance status, overdue items). Read-only. |
| `agents/kpiAgent.ts` | KPI assessment specialist (status, scores). Read-only, role-gated like hrAgent. |
| `agents/trainingAgent.ts` | Training specialist (outstanding/compliance %, expiring soon). Read-only, role-gated. |
| `agents/ppeAgent.ts` | PPE specialist (compliance %, low stock, issue tracker). Read-only. |
| `agents/objectivesAgent.ts` | Objectives & Targets specialist (cross-module `module_targets`). Read-only. |
| `agents/contractorsAgent.ts` | Contractors & Visitors specialist. Read-only. |

## Not wired up (no real backing service yet)

- **Asset Management** (`src/pages/features/AssetManagementPage.tsx`) and
  **Hazardous Chemical Management** (`.../HazardousChemicalManagementPage.tsx`)
  are UI-only "coming soon" pages with no service file or database table
  behind them yet -- there is nothing real to ground an agent's answers in.
  Build `assetsAgent`/`hazchemAgent` once those modules have a real data
  layer.
- **Security** (`securityService.ts`) is platform security *configuration*
  (MFA requirement, password policy, session timeout) rather than a records
  module a conversational query naturally fits -- an admin changes these in
  Settings, they don't "ask about" them the way they ask about leave
  balances or open incidents.

## Writes are never direct

An agent **never** writes to the database itself. It can only return a
`proposedActions[]` array (drafted content + a `payload`), each entry
carrying `agentId: '<module>'`. The UI must show this to the user and get an
explicit confirm click; only then does `confirmAgentAction()` look up
`ACTION_RUNNERS[action.agentId]` and call the owning agent's handler, which
calls an existing, already-audited service function (e.g. `updateHrRecord`,
`updateIncident`) -- never raw database access from agent code. Only
`hrAgent` (performance review comment) and `safetyAgent` (incident
investigation notes) have a write capability so far; every other agent in
this pass is read-only by design (no natural single free-text field to
draft into without more product input on what a "confirm and save" should
target module-by-module).

## POPIA / role redaction

`AgentContext.redactSensitiveFields` is `true` whenever `role === 'employee'`.
`hrAgent.ts`, `healthAgent.ts`, `kpiAgent.ts`, and `trainingAgent.ts` all
check this before returning any named colleague's personal/performance
detail -- an employee role can only ever see aggregate counts or their own
linked record for those modules.

## hrAgent capabilities

- **Leave balance query** -- "What's my leave balance?" / "How many days does Jane have left?" (HR-role only for other employees). Reads `hr_leave_balances`.
- **Performance review draft assistant** -- drafts a `manager_remarks` comment for an employee's latest `hr_performance_reviews` row and proposes saving it (manager/HR-admin only, requires confirm).
- **Document acknowledgement reminder query** -- aggregate view of `hr_ack_documents` / `hr_ack_receipts` completion counts.
- **Recruitment screening helper** -- summarises `hr_applicants` against a `hr_vacancies` row (manager/HR-admin only).
- **Leave pattern alert** -- flags concentration of approved leave around specific weekdays from `hr_leave_requests` (manager/HR-admin only).

## safetyAgent capabilities

- **Open incidents summary** -- counts/breakdown by severity and category of `open`/`investigating` incidents.
- **Risk assessment status** -- counts of assessments pending supervisor approval (`submitted`) and overdue for review (`active` past `next_review_date`).
- **Inspection compliance** -- overdue scheduled inspections and total non-conformance counts.
- **Incident investigation draft assistant** -- drafts a root-cause/investigation note for a matched incident and proposes saving it to `cause_of_incident` (manager/supervisor/HR-admin roles only, requires confirm).
- **Incident pattern alert** -- breakdown of all incidents by category/severity/location to surface recurring hotspots.

COID Act note: the agent may flag that an incident looks COID-reportable (Section 24) from the DATA it's given, but must never claim a report was filed -- that stays a human/administrative action.

## qualityAgent capabilities

- **NCR/CAPA status** -- open count, breakdown by severity, overdue corrective actions.
- **Customer complaints summary** -- count and status breakdown.
- **Internal/external issues register summary** -- count by nature and status.

## environmentAgent capabilities

- **Environmental aspects register** -- count and status breakdown.
- **Monitoring results** -- recent monitoring record count by type (water/air/waste/etc).

NEMA note: the agent may flag an unmanaged aspect or a fail-looking result, but never claims a compliance/regulatory determination.

## healthAgent capabilities

- **Medical exam status** -- fitness-status breakdown, expiring-soon / expired counts (POPIA-gated: an employee role only sees aggregate counts, never named colleagues).
- **Restricted duty query** -- count of active restricted-duty cases (manager/health-role only).
- **Hygiene monitoring query** -- count of hygiene monitoring records.

## legalAgent capabilities

- **Legal register compliance status** -- breakdown by compliance status, overdue items past their target date (manager/admin/consultant roles only).

## kpiAgent capabilities

- **KPI assessment status** -- breakdown by status, average overall score, overdue draft assessments (manager-tier roles only; an employee role is told to ask their manager/HR for their own scores).

## trainingAgent capabilities

- **Outstanding / compliance query** -- compliance %, outstanding count split by not-started vs expired (mirrors the Reports & Costs tab's "outstanding" definition).
- **Expiring soon query** -- training expiring within 60 days (manager-tier roles for named detail; employees are pointed to My Training).

## ppeAgent capabilities

- **PPE compliance %** query.
- **Low stock** query (items at or below reorder level).
- **Issue tracker summary** -- open PPE non-conformance cases by status.

## objectivesAgent capabilities

- **Cross-module target status** -- breakdown by module and status, overdue (past `target_date`, not achieved) targets.

## contractorsAgent capabilities

- **Contractor status** -- breakdown by status, documents status, induction status.
- **Visitor status** -- breakdown by status, pending-briefing count.

## Adding the next module agent

1. Create `src/ai/agents/<module>Agent.ts` following one of the existing agents' shape: a system-prompt builder, per-capability grounding functions (fetch real rows first, never let the model invent facts), `run<Module>Agent()` using `parseAgentJsonReply`/`buildFallback` from `agentSupport.ts` (or the inline proposedActions-parsing variant if it needs writes), and (if it needs writes) an `ACTION_HANDLERS` map + `run<Module>Action()`. Every `AgentProposedAction` the agent returns must set `agentId: '<module>'` so `agentClient.ts` can route the confirm click to the right handler.
2. Add the module's id to `AgentId` in `agentTypes.ts`.
3. Add a keyword entry + dispatch case in `orchestratorAgent.ts`.
4. If it has writes, register the new agent's action-runner function in `ACTION_RUNNERS` in `agentClient.ts`.
