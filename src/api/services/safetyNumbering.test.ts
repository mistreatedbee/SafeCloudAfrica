import { describe, expect, it } from 'vitest';
import { buildPermitToWorkNumber } from './permitToWorkService';
import { buildLotoRecordNumber } from './lotoService';

describe('safety numbering', () => {
  it('formats permit to work numbers with a day-based sequence', () => {
    expect(buildPermitToWorkNumber(2026, 5, 5, 1)).toBe('PTW-20260505-0001');
    expect(buildPermitToWorkNumber(2026, 5, 5, 12)).toBe('PTW-20260505-0012');
  });

  it('formats loto record numbers with a day-based sequence', () => {
    expect(buildLotoRecordNumber(2026, 5, 5, 1)).toBe('LOTO-20260505-0001');
    expect(buildLotoRecordNumber(2026, 5, 5, 12)).toBe('LOTO-20260505-0012');
  });
});
