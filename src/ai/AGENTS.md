# Module Agent System

Multi-agent AI assistant, built out incrementally: shared infra + orchestrator
+ `hrAgent` (Phase 1), then `safetyAgent` (Phase 2). Remaining module agents
(quality, environment, PPE, NCR/CAPA, etc.) are intentionally deferred until
these are reviewed.

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
| `agentClient.ts` | `askAgent()` / `confirmAgentAction()` -- the only entry points the UI calls. Wraps every call in `withInsforgeSession` so a stale session refreshes before a model call is spent. |
| `agents/orchestratorAgent.ts` | Keyword-based routing to module agents; merges replies when more than one module matches. `hr` and `safety` are wired up so far. |
| `agents/hrAgent.ts` | HR specialist: system prompt, per-capability data-gathering (grounding), and the write-confirmation handlers. |
| `agents/safetyAgent.ts` | Safety specialist (incidents, risk assessments, inspections): same shape as `hrAgent.ts`. |

## Writes are never direct

An agent **never** writes to the database itself. It can only return a
`proposedActions[]` array (drafted content + a `payload`). The UI must show
this to the user and get an explicit confirm click; only then does
`confirmAgentAction()` call the owning agent's handler, which calls an
existing, already-audited service function (e.g. `updateHrRecord`). This is
how `hrAgent`'s one write capability (drafting a performance review manager
comment) is implemented -- see `ACTION_HANDLERS` in `hrAgent.ts`.

## POPIA / role redaction

`AgentContext.redactSensitiveFields` is `true` whenever `role === 'employee'`.
Every data-gathering function in `hrAgent.ts` checks this before returning
any named colleague's leave, performance, or recruitment detail -- an
employee role can only ever see aggregate counts or their own linked record.

## hrAgent capabilities (Phase 1 launch set)

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

## Adding the next module agent

1. Create `src/ai/agents/<module>Agent.ts` following `hrAgent.ts` / `safetyAgent.ts`'s shape: a system-prompt builder, per-capability grounding functions, `run<Module>Agent()`, and (if it needs writes) an `ACTION_HANDLERS` map + `run<Module>Action()`. Every `AgentProposedAction` the agent returns must set `agentId: '<module>'` so `agentClient.ts` can route the confirm click to the right handler.
2. Add the module's id to `AgentId` in `agentTypes.ts`.
3. Add a keyword entry + dispatch case in `orchestratorAgent.ts`.
4. Register the new agent's action-runner function in `ACTION_RUNNERS` in `agentClient.ts`.
