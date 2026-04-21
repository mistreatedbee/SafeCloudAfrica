import { describe, expect, it } from 'vitest';
import { columnsForType } from '../pages/risks/riskTemplates';
import { mapTypeToLegacyAssessmentType } from './riskAssessmentLegacy';
import { buildRiskTableLayout } from './riskTableLayout';

function layoutSequence(type: Parameters<typeof buildRiskTableLayout>[0]) {
  return buildRiskTableLayout(type, columnsForType(type)).map((item) => item.kind === 'data' ? item.col.key : item.kind);
}

describe('buildRiskTableLayout', () => {
  it('places baseline S*L after risk type and residual after existing controls', () => {
    expect(layoutSequence('baseline')).toEqual([
      'area_location',
      'activity_process_operation',
      'aspect_hazard_flaw',
      'potential_risk',
      'risk_type',
      'raw_scoring',
      'existing_controls',
      'residual',
      'current_year_nonconformances',
      'additional_controls',
      'responsible_personnel',
      'target_date',
      'completion_date'
    ]);
  });

  it('places task SL, RR, and index after at risk person and residual after existing controls', () => {
    expect(layoutSequence('task')).toEqual([
      'hazard',
      'risk',
      'at_risk_person',
      'raw_scoring',
      'existing_controls',
      'residual',
      'additional_controls',
      'by_who',
      'by_when'
    ]);
  });

  it('places pre-work scoring after risk type without adding a residual block', () => {
    expect(layoutSequence('prework')).toEqual([
      'hazard',
      'risk',
      'risk_type',
      'raw_scoring',
      'quick_rating',
      'control_measures'
    ]);
  });
});

describe('mapTypeToLegacyAssessmentType', () => {
  it('uses legacy-compatible assessment_type values for all risk types', () => {
    expect(mapTypeToLegacyAssessmentType('baseline')).toBe('baseline');
    expect(mapTypeToLegacyAssessmentType('task')).toBe('task-based');
    expect(mapTypeToLegacyAssessmentType('critical')).toBe('critical_task');
    expect(mapTypeToLegacyAssessmentType('prework')).toBe('pre_work');
  });
});
