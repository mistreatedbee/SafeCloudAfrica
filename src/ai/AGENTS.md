# Module Agent System

Multi-agent AI assistant: shared infra + orchestrator + thirteen specialist
agents (hr, safety, quality, environment, health, legal, kpi, training, ppe,
objectives, contractors, dashboard, alert).

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
| `agents/dashboardAgent.ts` | Cross-module "big picture" specialist, sourced from `getComplianceDashboardData()` (the same rollup the Compliance Dashboard page uses). Read-only, manager-tier+. |
| `agents/alertAgent.ts` | Cross-module "what needs my attention" specialist, sourced from the same rollup's `overdueActions`/`topRisks`/`aiInsight`. Read-only, manager-tier+, interactive/on-demand only (see note below on why no new cron was added). |
| `routeModuleHint.ts` | Maps the current route to a module id + label. Used both to default `AgentContext.currentModuleHint` to the page the user is actually on (instead of always guessing `hr`) and to drive the floating assistant's page-relevant nudge -- see `HrAgentAssistant.tsx`. |

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

## dashboardAgent capabilities

- **Overall compliance score / RAG status** and per-domain breakdown, trend history, and the pre-computed AI insight (next-month risk flag, top gaps).

## alertAgent capabilities

- **"What needs my attention"** -- prioritised cross-module overdue actions, top risks, and red-status domains, all sourced from the compliance dashboard rollup (no separate aggregation logic).

A proactive **weekly email digest** was in the original spec but was deliberately not built: this codebase already runs `cronDailyComplianceReminders.js` (document review, expiring training/medical, upcoming audits) and `cronOverdueEscalations.js` (overdue CAPA, NCR, missing pre-audit docs) as InsForge Edge Function crons (see `scripts/insforge-functions/README.md`) -- a new weekly digest would overlap heavily with what those two already send daily. If a distinct weekly roll-up email is wanted, scope it as its own ticket (recipients, cadence, subject format) rather than guessing at the shape here.

## Route-aware nudge (HrAgentAssistant.tsx)

The floating button and panel live at `bottom-5/24 right-24` -- its own column immediately left of FloatingSupportChat's `right-5` column, so both bubbles are always visible side by side, never stacked/overlapping.

Two proactive, dismissible nudges (styled distinctly, auto-dismiss after a delay, never block the page):

- **Page nudge**: on landing on a page `routeModuleHint.ts` recognises, a bubble introduces the assistant by that page's **persona** (e.g. "Incidents Agent", "Risk Manager", "HR Agent" -- `STARTER_QUESTION_BY_MODULE` supplies a one-click starter question). Fires on **every navigation** to a recognised page, not gated to once-per-session, per explicit product direction that the assistant needs to stay visibly present rather than easy to miss. If this turns out too frequent in practice, the fix is re-adding a `sessionStorage`/cooldown gate in the page-nudge `useEffect` in `HrAgentAssistant.tsx` -- it was deliberately removed, not forgotten.
- **Error nudge**: whenever `ToastProvider.showError()` fires anywhere in the app, it also calls `emitUserFacingError()` (`src/api/liveData.ts`, same `CustomEvent` pub-sub pattern as `emitBackendUnavailable`/`emitAuthRecovered`). `HrAgentAssistant.tsx` subscribes via `subscribeToUserFacingError` and shows an amber-accented "Looks like something went wrong -- want help?" bubble, rate-limited to one per 45s so a burst of errors doesn't spam multiple nudges. Clicking it opens the chat pre-seeded with a message quoting the error text.

This also fixes `AgentContext.currentModuleHint` to reflect the actual page instead of always defaulting to `'hr'`, which improves orchestrator routing accuracy beyond keyword matching alone.

## Inline in-form drafting (AiDraftButton)

`src/components/ai/AiDraftButton.tsx` is a small reusable "✨ AI draft" trigger, distinct from the floating chat, embedded directly next to a specific form field. It calls one of `agentClient.ts`'s `draft*()` wrappers and hands the returned plain text to the field's own `onChange` setter -- there is no separate confirm-to-write step, because the form's own existing Save button is already that step (the agent only ever suggests text into a field the human then chooses to save or not).

Wired up so far:
- **HrPerformancePage.tsx** -- "Manager remarks" field. Calls `draftPerformanceReviewComment()` (in `hrAgent.ts`), grounded in the selected employee's latest review record. Visible to manager-tier roles only, disabled until an employee is selected.
- **IncidentCreateModal.tsx** -- "Cause of incident" field. Calls `draftIncidentCauseNote()` (in `safetyAgent.ts`), grounded in whatever the user has already typed (title/description/nature/category/severity) since there's no saved incident yet at create time -- the draft is explicitly framed to the model as preliminary and needing verification, and the field carries a "verify before saving" caption. Disabled until some title/description text exists.

Each of the above has a matching `draft*ForEmployee`/`draft*FromDraft` export in its owning agent file (`hrAgent.ts`, `safetyAgent.ts`) that fetches grounding data directly by id/draft-state rather than going through the chat's keyword-intent detection -- the form already knows exactly which record it means, so there's no need to guess from a message.

**Not built in this pass**: extending `AiDraftButton` to every other free-text field across every module's forms. Each additional one is a scoped, low-risk addition once picked (add a `draft*()` export to the owning agent + one `AiDraftButton` in the form), but doing all of them at once risks touching forms without verifying each field/state-shape carefully. Natural next candidates given what each agent already knows how to draft: NCR root cause/corrective action (`qualityAgent`), legal requirement `actions_needed` (`legalAgent`).

## Adding the next module agent

1. Create `src/ai/agents/<module>Agent.ts` following one of the existing agents' shape: a system-prompt builder, per-capability grounding functions (fetch real rows first, never let the model invent facts), `run<Module>Agent()` using `parseAgentJsonReply`/`buildFallback` from `agentSupport.ts` (or the inline proposedActions-parsing variant if it needs writes), and (if it needs writes) an `ACTION_HANDLERS` map + `run<Module>Action()`. Every `AgentProposedAction` the agent returns must set `agentId: '<module>'` so `agentClient.ts` can route the confirm click to the right handler.
2. Add the module's id to `AgentId` in `agentTypes.ts`.
3. Add a keyword entry + dispatch case in `orchestratorAgent.ts`.
4. If it has writes, register the new agent's action-runner function in `ACTION_RUNNERS` in `agentClient.ts`.
