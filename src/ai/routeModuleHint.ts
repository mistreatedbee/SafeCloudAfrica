/**
 * Maps the current route to a module id + display label + a page-specific
 * "persona" name, so the floating assistant (a) routes to the right
 * specialist agent by default instead of always guessing 'hr', and (b) can
 * introduce itself by name on pages that share a backend agent but should
 * still feel like a distinct specialist to the user (e.g. Incidents and
 * Risk Assessments both run on safetyAgent, but greet as "Incidents Agent"
 * / "Risk Manager" respectively). Longest-prefix match wins so a specific
 * sub-route (e.g. /dashboard/management/ncrs) beats a broader parent
 * (e.g. /dashboard/management).
 */

type RouteModuleRule = { prefix: string; module: string; label: string; persona: string };

const ROUTE_MODULE_RULES: RouteModuleRule[] = [
  { prefix: '/modules/hr/kpis', module: 'kpi', label: 'KPI Assessments', persona: 'KPI Agent' },
  { prefix: '/dashboard/operations/training', module: 'training', label: 'Training', persona: 'Training Agent' },
  { prefix: '/dashboard/operations/risks', module: 'safety', label: 'Risk Assessments', persona: 'Risk Manager' },
  { prefix: '/dashboard/operations/inspections', module: 'safety', label: 'Inspections', persona: 'Inspections Agent' },
  { prefix: '/dashboard/operations/audits', module: 'safety', label: 'Audits', persona: 'Audit Agent' },
  { prefix: '/dashboard/operations/ppe', module: 'ppe', label: 'PPE', persona: 'PPE Agent' },
  { prefix: '/dashboard/ppe', module: 'ppe', label: 'PPE', persona: 'PPE Agent' },
  { prefix: '/dashboard/incidents', module: 'safety', label: 'Incidents', persona: 'Incidents Agent' },
  { prefix: '/dashboard/safety', module: 'safety', label: 'Safety', persona: 'Safety Agent' },
  { prefix: '/dashboard/management/ncrs', module: 'quality', label: 'NCRs', persona: 'Quality Agent' },
  { prefix: '/dashboard/management/capa', module: 'quality', label: 'CAPA', persona: 'Quality Agent' },
  { prefix: '/dashboard/quality', module: 'quality', label: 'Quality', persona: 'Quality Agent' },
  { prefix: '/dashboard/environment', module: 'environment', label: 'Environment', persona: 'Environment Agent' },
  { prefix: '/dashboard/health', module: 'health', label: 'Health', persona: 'Health Agent' },
  { prefix: '/dashboard/legal', module: 'legal', label: 'Legal', persona: 'Legal Agent' },
  { prefix: '/dashboard/management/objectives-targets', module: 'objectives', label: 'Objectives & Targets', persona: 'Objectives Agent' },
  { prefix: '/dashboard/sellable/contractors-visitors', module: 'contractors', label: 'Contractors & Visitors', persona: 'Contractors Agent' },
  { prefix: '/dashboard/management/reports', module: 'dashboard', label: 'Reports', persona: 'Compliance Assistant' },
  { prefix: '/dashboard/hr', module: 'hr', label: 'HR', persona: 'HR Agent' }
];

export type RouteModuleHint = { module: string; label: string; persona: string };

export function getModuleHintForPath(pathname: string): RouteModuleHint | null {
  let best: RouteModuleRule | null = null;
  for (const rule of ROUTE_MODULE_RULES) {
    if (pathname.startsWith(rule.prefix) && (!best || rule.prefix.length > best.prefix.length)) {
      best = rule;
    }
  }
  return best ? { module: best.module, label: best.label, persona: best.persona } : null;
}

/** One tailored starter question per module, used to seed the chat when the user clicks a nudge. */
export const STARTER_QUESTION_BY_MODULE: Record<string, string> = {
  hr: "What's my leave balance?",
  safety: 'How many open incidents do we have?',
  quality: 'Are there any overdue corrective actions?',
  environment: 'What environmental aspects are active right now?',
  health: "What's our medical exam expiry status?",
  legal: 'Are there any overdue legal requirements?',
  kpi: 'How many KPI assessments are overdue?',
  training: "What's our training compliance percentage?",
  ppe: "What's our PPE compliance percentage?",
  objectives: 'Which objectives/targets are overdue?',
  contractors: 'What is the status of our contractors and visitors?',
  dashboard: "What's our overall compliance score?"
};
