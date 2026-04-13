import type { RiskAssessmentType } from '../api/services/riskAssessmentsService';

export type RiskTableColumnLike = { key: string; label: string; kind?: 'text' | 'date' };

export type RiskTableLayoutItem =
  | { kind: 'data'; col: RiskTableColumnLike }
  | { kind: 'raw_scoring' }
  | { kind: 'residual' };

export function buildRiskTableLayout(type: RiskAssessmentType, columns: RiskTableColumnLike[]): RiskTableLayoutItem[] {
  const showResidual = type !== 'critical' && type !== 'prework';
  const rawAfterKey = type === 'baseline' ? 'risk_type' : type === 'task' ? 'at_risk_person' : null;
  const residualAfterKey = showResidual ? 'existing_controls' : null;

  const items: RiskTableLayoutItem[] = [];
  let insertedRaw = false;
  let insertedResidual = false;

  for (const col of columns) {
    items.push({ kind: 'data', col });

    if (!insertedRaw && rawAfterKey && col.key === rawAfterKey) {
      items.push({ kind: 'raw_scoring' });
      insertedRaw = true;
    }

    if (!insertedResidual && residualAfterKey && col.key === residualAfterKey) {
      items.push({ kind: 'residual' });
      insertedResidual = true;
    }
  }

  if (!insertedRaw) items.push({ kind: 'raw_scoring' });
  if (showResidual && !insertedResidual) items.push({ kind: 'residual' });

  return items;
}

