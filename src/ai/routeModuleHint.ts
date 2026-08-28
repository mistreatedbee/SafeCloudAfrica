/**
 * Maps the current route to a module id + display label, so the floating
 * assistant (a) routes to the right specialist agent by default instead of
 * always guessing 'hr', and (b) can nudge the user with a page-relevant
 * "I can help with this" hint. Longest-prefix match wins so a specific
 * sub-route (e.g. /dashboard/management/ncrs) beats a broader parent
 * (e.g. /dashboard/management).
 */

type RouteModuleRule = { prefix: string; module: string; label: string };

const ROUTE_MODULE_RULES: RouteModuleRule[] = [
  { prefix: '/modules/hr/kpis', module: 'kpi', label: 'KPI Assessments' },
  { prefix: '/dashboard/operations/training', module: 'training', label: 'Training' },
  { prefix: '/dashboard/operations/risks', module: 'safety', label: 'Risk Assessments' },
  { prefix: '/dashboard/operations/inspections', module: 'safety', label: 'Inspections' },
  { prefix: '/dashboard/operations/audits', module: 'safety', label: 'Audits' },
  { prefix: '/dashboard/operations/ppe', module: 'ppe', label: 'PPE' },
  { prefix: '/dashboard/ppe', module: 'ppe', label: 'PPE' },
  { prefix: '/dashboard/incidents', module: 'safety', label: 'Incidents' },
  { prefix: '/dashboard/safety', module: 'safety', label: 'Safety' },
  { prefix: '/dashboard/management/ncrs', module: 'quality', label: 'NCRs' },
  { prefix: '/dashboard/management/capa', module: 'quality', label: 'CAPA' },
  { prefix: '/dashboard/quality', module: 'quality', label: 'Quality' },
  { prefix: '/dashboard/environment', module: 'environment', label: 'Environment' },
  { prefix: '/dashboard/health', module: 'health', label: 'Health' },
  { prefix: '/dashboard/legal', module: 'legal', label: 'Legal' },
  { prefix: '/dashboard/management/objectives-targets', module: 'objectives', label: 'Objectives & Targets' },
  { prefix: '/dashboard/sellable/contractors-visitors', module: 'contractors', label: 'Contractors & Visitors' },
  { prefix: '/dashboard/management/reports', module: 'dashboard', label: 'Reports' },
  { prefix: '/dashboard/hr', module: 'hr', label: 'HR' }
];

export type RouteModuleHint = { module: string; label: string };

export function getModuleHintForPath(pathname: string): RouteModuleHint | null {
  let best: RouteModuleRule | null = null;
  for (const rule of ROUTE_MODULE_RULES) {
    if (pathname.startsWith(rule.prefix) && (!best || rule.prefix.length > best.prefix.length)) {
      best = rule;
    }
  }
  return best ? { module: best.module, label: best.label } : null;
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
