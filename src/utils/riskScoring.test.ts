import { describe, expect, it } from 'vitest';
import {
  computeRR,
  computeRawRisk,
  getRiskIndex,
  simpleRatingToSL,
  slToSimpleRating
} from './riskScoring';

describe('riskScoring', () => {
  it('clamps severity and likelihood to the 1-5 range before multiplying', () => {
    expect(computeRR(0, 8)).toBe(5);
    expect(computeRR(7, 4)).toBe(20);
  });

  it('maps score thresholds to low, medium, and high', () => {
    expect(getRiskIndex(5)).toBe('Low');
    expect(getRiskIndex(6)).toBe('Medium');
    expect(getRiskIndex(12)).toBe('Medium');
    expect(getRiskIndex(13)).toBe('High');
  });

  it('returns combined raw risk output for the incident 1-5 x 1-5 model', () => {
    expect(computeRawRisk(3, 3)).toEqual({ rr: 9, riskIndex: 'Medium' });
    expect(computeRawRisk(5, 5)).toEqual({ rr: 25, riskIndex: 'High' });
  });

  it('round-trips the simplified rating helpers', () => {
    const medium = simpleRatingToSL('Medium');
    expect(medium).toEqual({ severity: 3, likelihood: 3 });
    expect(slToSimpleRating(medium.severity, medium.likelihood, 5, 12)).toBe('Medium');
  });
});
