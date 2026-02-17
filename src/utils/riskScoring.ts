/**
 * Risk Assessment scoring: S × L = RR, Risk Index (Low/Medium/High) from configurable thresholds.
 * Shared by API and UI for consistency.
 */

export type RiskIndex = 'Low' | 'Medium' | 'High';

export const DEFAULT_RISK_INDEX_LOW_MAX = 6;
export const DEFAULT_RISK_INDEX_MEDIUM_MAX = 15;

/**
 * Raw Risk Rating: RR = Severity × Likelihood (each 1–5).
 */
export function computeRR(severity: number, likelihood: number): number {
  const s = Math.max(1, Math.min(5, Math.round(severity)));
  const l = Math.max(1, Math.min(5, Math.round(likelihood)));
  return s * l;
}

/**
 * Risk Index from RR using thresholds: RR ≤ lowMax → Low, RR ≤ mediumMax → Medium, else High.
 */
export function getRiskIndex(
  rr: number,
  lowMax: number = DEFAULT_RISK_INDEX_LOW_MAX,
  mediumMax: number = DEFAULT_RISK_INDEX_MEDIUM_MAX
): RiskIndex {
  if (rr <= lowMax) return 'Low';
  if (rr <= mediumMax) return 'Medium';
  return 'High';
}

/**
 * Compute RR and Risk Index in one call (raw risk).
 */
export function computeRawRisk(
  severity: number,
  likelihood: number,
  lowMax: number = DEFAULT_RISK_INDEX_LOW_MAX,
  mediumMax: number = DEFAULT_RISK_INDEX_MEDIUM_MAX
): { rr: number; riskIndex: RiskIndex } {
  const rr = computeRR(severity, likelihood);
  return { rr, riskIndex: getRiskIndex(rr, lowMax, mediumMax) };
}

/**
 * Residual risk (after additional controls). Same logic as raw.
 */
export function computeResidualRisk(
  residualSeverity: number,
  residualLikelihood: number,
  lowMax: number = DEFAULT_RISK_INDEX_LOW_MAX,
  mediumMax: number = DEFAULT_RISK_INDEX_MEDIUM_MAX
): { residualRR: number; residualRiskIndex: RiskIndex } {
  const residualRR = computeRR(residualSeverity, residualLikelihood);
  return {
    residualRR,
    residualRiskIndex: getRiskIndex(residualRR, lowMax, mediumMax)
  };
}

/**
 * Map simple L/M/H (Pre-work dropdown) to approximate S and L for storage (e.g. Low=1,1 Medium=2,2 High=4,4).
 */
export function simpleRatingToSL(rating: RiskIndex): { severity: number; likelihood: number } {
  switch (rating) {
    case 'Low':
      return { severity: 1, likelihood: 1 };
    case 'Medium':
      return { severity: 2, likelihood: 2 };
    case 'High':
      return { severity: 4, likelihood: 4 };
    default:
      return { severity: 2, likelihood: 2 };
  }
}

export function slToSimpleRating(severity: number, likelihood: number, lowMax: number, mediumMax: number): RiskIndex {
  return getRiskIndex(computeRR(severity, likelihood), lowMax, mediumMax);
}
