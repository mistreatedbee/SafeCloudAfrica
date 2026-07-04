import { describe, expect, it } from 'vitest';
import { EMAIL_TEMPLATE_KEYS, renderEmailTemplate } from './emailTemplates';

describe('emailTemplates', () => {
  it('defines all requested notification templates', () => {
    expect(EMAIL_TEMPLATE_KEYS).toEqual([
      'document_control',
      'incident_reporting',
      'ppe_management',
      'inspections',
      'audits',
      'quality_customer_complaints',
      'quality_internal_external_issues',
      'environment_eia',
      'environment_water_monitoring',
      'environment_air_quality',
      'environment_waste_disposal',
      'health_medicals',
      'health_wellness_programme',
      'hr_updates',
      'kpi_updates',
      'task_assigned',
      'document_reviews',
      'improvements',
      'approvals',
      'billing_pricing',
      'software_license_expiry'
    ]);
  });

  it('interpolates variables into subject, html, and text fallback', () => {
    const rendered = renderEmailTemplate({
      templateKey: 'environment_water_monitoring',
      variables: {
        reference: 'WM-001',
        status: 'Failed',
        location: 'Borehole 2',
        findings: 'pH outside permit range'
      },
      actionUrl: '/dashboard/environment/water'
    });

    expect(rendered.subject).toBe('Water monitoring Failed: WM-001');
    expect(rendered.html).toContain('WM-001');
    expect(rendered.text).toContain('Sampling point: Borehole 2');
    expect(rendered.text).toContain('Open water monitoring: /dashboard/environment/water');
  });

  it('escapes user-provided html values', () => {
    const rendered = renderEmailTemplate({
      templateKey: 'incident_reporting',
      variables: {
        title: '<script>alert(1)</script>',
        severity: 'high'
      }
    });

    expect(rendered.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(rendered.html).not.toContain('<script>alert(1)</script>');
  });

  it('throws for unknown template keys', () => {
    expect(() =>
      renderEmailTemplate({
        templateKey: 'unknown' as any,
        variables: {}
      })
    ).toThrow('Unknown email template: unknown');
  });
});
