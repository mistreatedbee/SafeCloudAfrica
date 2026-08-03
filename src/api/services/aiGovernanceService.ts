import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import type { ActivityLog, Company } from '../models/entities';

/**
 * Cross-tenant AI observability for platform admins (roadmap §8: superadmin
 * AI-governance page, extending the existing SuperAdminChatbotLogsPage
 * pattern to cover every AI feature, not just support chat).
 *
 * Reuses activity_logs -- already readable cross-company by platform admins
 * via the existing `activity_select_member` RLS policy (`is_platform_admin()`)
 * -- instead of a new audit table, since every AI generation already writes
 * an `ai.*`-prefixed activity_logs row (see aiDocumentGeneratorService.ts,
 * aiBriefingService.ts).
 */

export function isAiPlatformSchemaMissingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : getErrorMessage(error);
  return /404|not found|does not exist|ai_generated_documents|ai_briefings|ai_actions|document_embeddings|ai_conversations/i.test(message);
}

export type AiUsageSummary = {
  totalAiEvents: number;
  eventsByAction: Array<{ action: string; count: number }>;
  eventsByCompany: Array<{ companyId: string; companyName: string; count: number }>;
  documentsByStatus: Record<string, number>;
  documentsByType: Record<string, number>;
  companiesWithBriefingToday: number;
  totalCompanies: number;
  pendingApprovalActions: number;
  recentEvents: ActivityLog[];
};

function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getAiUsageSummary(): Promise<AiUsageSummary> {
  const [activityResult, companiesResult, docsResult, briefingsResult, actionsResult] = await Promise.all([
    insforge.database
      .from('activity_logs')
      .select('*')
      .ilike('action', 'ai.%')
      .order('created_at', { ascending: false })
      .limit(500),
    insforge.database.from('companies').select('*').limit(500),
    insforge.database.from('ai_generated_documents').select('status,doc_type').limit(2000),
    insforge.database.from('ai_briefings').select('company_id').eq('briefing_date', todayDateKey()),
    insforge.database.from('ai_actions').select('id').eq('status', 'proposed')
  ]);

  for (const result of [activityResult, companiesResult, docsResult, briefingsResult, actionsResult]) {
    if (result.error) throw new Error(getErrorMessage(result.error));
  }

  const events = (activityResult.data ?? []) as ActivityLog[];
  const companies = (companiesResult.data ?? []) as Company[];
  const companyNameById = new Map(companies.map((c) => [c.id, c.name]));

  const eventsByActionMap = new Map<string, number>();
  const eventsByCompanyMap = new Map<string, number>();
  for (const event of events) {
    eventsByActionMap.set(event.action, (eventsByActionMap.get(event.action) ?? 0) + 1);
    eventsByCompanyMap.set(event.company_id, (eventsByCompanyMap.get(event.company_id) ?? 0) + 1);
  }

  const documentsByStatus: Record<string, number> = {};
  const documentsByType: Record<string, number> = {};
  for (const row of (docsResult.data ?? []) as Array<{ status: string; doc_type: string }>) {
    documentsByStatus[row.status] = (documentsByStatus[row.status] ?? 0) + 1;
    documentsByType[row.doc_type] = (documentsByType[row.doc_type] ?? 0) + 1;
  }

  const companiesWithBriefingToday = new Set(
    ((briefingsResult.data ?? []) as Array<{ company_id: string }>).map((r) => r.company_id)
  ).size;

  return {
    totalAiEvents: events.length,
    eventsByAction: Array.from(eventsByActionMap.entries())
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count),
    eventsByCompany: Array.from(eventsByCompanyMap.entries())
      .map(([companyId, count]) => ({ companyId, companyName: companyNameById.get(companyId) ?? companyId.slice(0, 8), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
    documentsByStatus,
    documentsByType,
    companiesWithBriefingToday,
    totalCompanies: companies.length,
    pendingApprovalActions: (actionsResult.data ?? []).length,
    recentEvents: events.slice(0, 50)
  };
}
