import { beforeAll, describe, expect, it, vi } from 'vitest';

let buildComplianceExcelRows: typeof import('./complianceScoringService').buildComplianceExcelRows;
let calculateComplianceRagStatus: typeof import('./complianceScoringService').calculateComplianceRagStatus;

beforeAll(async () => {
  vi.stubGlobal('__APP_VERSION__', 'test');
  const module = await import('./complianceScoringService');
  buildComplianceExcelRows = module.buildComplianceExcelRows;
  calculateComplianceRagStatus = module.calculateComplianceRagStatus;
});

describe('complianceScoringService', () => {
  it('uses roadmap RAG thresholds', () => {
    expect(calculateComplianceRagStatus(85)).toBe('green');
    expect(calculateComplianceRagStatus(70)).toBe('yellow');
    expect(calculateComplianceRagStatus(69.99)).toBe('red');
  });

  it('builds flat excel-friendly rows from dashboard data', () => {
    const rows = buildComplianceExcelRows({
      overall: {
        scorePercentage: 82.5,
        ragStatus: 'yellow',
        weightedScore: 82.5,
        generatedAt: '2026-04-22T08:00:00.000Z'
      },
      domains: [
        {
          domainKey: 'documents',
          label: 'Documents',
          weight: 20,
          scorePercentage: 90,
          ragStatus: 'green',
          totalCount: 10,
          compliantCount: 9,
          overdueCount: 1,
          attentionCount: 1,
          trendDelta: 2,
          drilldownRecords: []
        }
      ],
      aiInsight: {
        predictedDeteriorationRisk: 44,
        nextMonthRiskFlag: 'medium',
        topGaps: [{ domain: 'incidents', label: 'Incidents', impact: 18 }],
        recommendations: [{ title: 'Improve incidents', reason: 'Gap', action: 'Close incidents' }]
      },
      trendHistory: [{ month: '2026-04', scorePercentage: 82.5, ragStatus: 'yellow' }],
      isoSummary: [
        {
          standard: 'iso45001',
          scorePercentage: 80,
          totalLinks: 5,
          compliantLinks: 4,
          byClause: []
        }
      ],
      topRisks: [{ id: 'risk-1', title: 'Unreviewed high risk', high_risks: 3 }],
      overdueActions: [{ id: 'action-1', title: 'Close CAPA', due_date: '2026-04-01', priority: 'high' }]
    });

    expect(rows[0]).toMatchObject({
      section: 'Overall',
      label: 'Compliance score',
      value: 82.5,
      rag_status: 'yellow'
    });
    expect(rows.some((row) => row.section === 'Domain' && row.label === 'Documents')).toBe(true);
    expect(rows.some((row) => row.section === 'Top risk' && row.label === 'Unreviewed high risk')).toBe(true);
    expect(rows.some((row) => row.section === 'Overdue action' && row.label === 'Close CAPA')).toBe(true);
  });
});
