export const EMAIL_TEMPLATE_KEYS = [
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
  'document_reviews',
  'improvements',
  'approvals',
  'billing_pricing',
  'software_license_expiry'
] as const;

export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

export type EmailTemplateVariables = Record<string, string | number | boolean | null | undefined>;

export type EmailRenderInput = {
  templateKey: EmailTemplateKey;
  variables?: EmailTemplateVariables;
  actionUrl?: string | null;
  actionLabel?: string | null;
};

export type RenderedEmailTemplate = {
  subject: string;
  html: string;
  text: string;
};

type EmailTemplateDefinition = {
  moduleLabel: string;
  subject: string;
  summary: string;
  defaultActionLabel: string;
  defaultRoute: string;
  detailLabels: Array<{ label: string; variable: string }>;
};

const TEMPLATE_DEFINITIONS: Record<EmailTemplateKey, EmailTemplateDefinition> = {
  document_control: {
    moduleLabel: 'Document Control',
    subject: 'Document update: {{title}}',
    summary: '{{title}} has a document control update that needs attention.',
    defaultActionLabel: 'Open document',
    defaultRoute: '/dashboard/documents',
    detailLabels: [
      { label: 'Document', variable: 'title' },
      { label: 'Status', variable: 'status' },
      { label: 'Owner', variable: 'owner' },
      { label: 'Due date', variable: 'dueDate' }
    ]
  },
  incident_reporting: {
    moduleLabel: 'Incident Reporting',
    subject: 'Incident reported: {{title}}',
    summary: 'A new incident has been reported and requires follow-up.',
    defaultActionLabel: 'Open incident',
    defaultRoute: '/dashboard/safety/incidents',
    detailLabels: [
      { label: 'Incident', variable: 'title' },
      { label: 'Severity', variable: 'severity' },
      { label: 'Category', variable: 'category' },
      { label: 'Location', variable: 'location' }
    ]
  },
  ppe_management: {
    moduleLabel: 'PPE Management',
    subject: 'PPE update: {{title}}',
    summary: 'A PPE management item needs attention.',
    defaultActionLabel: 'Open PPE',
    defaultRoute: '/dashboard/safety/ppe',
    detailLabels: [
      { label: 'Item', variable: 'title' },
      { label: 'Status', variable: 'status' },
      { label: 'Employee', variable: 'employee' },
      { label: 'Due date', variable: 'dueDate' }
    ]
  },
  inspections: {
    moduleLabel: 'Inspections',
    subject: 'Inspection update: {{title}}',
    summary: 'An inspection item has been updated.',
    defaultActionLabel: 'Open inspections',
    defaultRoute: '/dashboard/operations/inspections',
    detailLabels: [
      { label: 'Inspection', variable: 'title' },
      { label: 'Status', variable: 'status' },
      { label: 'Inspector', variable: 'owner' },
      { label: 'Due date', variable: 'dueDate' }
    ]
  },
  audits: {
    moduleLabel: 'Audits',
    subject: 'Audit update: {{title}}',
    summary: 'An audit item has been updated.',
    defaultActionLabel: 'Open audits',
    defaultRoute: '/dashboard/operations/audits',
    detailLabels: [
      { label: 'Audit', variable: 'title' },
      { label: 'Status', variable: 'status' },
      { label: 'Lead auditor', variable: 'owner' },
      { label: 'Date', variable: 'dueDate' }
    ]
  },
  quality_customer_complaints: {
    moduleLabel: 'Customer Complaints',
    subject: 'Customer complaint update: {{reference}}',
    summary: 'A customer complaint has been updated and may require management follow-up.',
    defaultActionLabel: 'Open complaints',
    defaultRoute: '/dashboard/quality/complaints',
    detailLabels: [
      { label: 'Reference', variable: 'reference' },
      { label: 'Customer', variable: 'customer' },
      { label: 'Status', variable: 'status' },
      { label: 'Handled by', variable: 'owner' }
    ]
  },
  quality_internal_external_issues: {
    moduleLabel: 'Internal / External Issues',
    subject: 'Quality issue rated {{severity}}: {{reference}}',
    summary: 'An internal or external quality issue has been rated for management attention.',
    defaultActionLabel: 'Open issues',
    defaultRoute: '/dashboard/quality/issues',
    detailLabels: [
      { label: 'Reference', variable: 'reference' },
      { label: 'Nature', variable: 'severity' },
      { label: 'Risk rating', variable: 'riskRating' },
      { label: 'Status', variable: 'status' }
    ]
  },
  environment_eia: {
    moduleLabel: 'Environmental Impact Assessment',
    subject: 'EIA update: {{reference}}',
    summary: 'An Environmental Impact Assessment record needs review or follow-up.',
    defaultActionLabel: 'Open EIA',
    defaultRoute: '/dashboard/environment/eia',
    detailLabels: [
      { label: 'Reference', variable: 'reference' },
      { label: 'Activity', variable: 'title' },
      { label: 'Responsible person', variable: 'owner' },
      { label: 'Review date', variable: 'dueDate' }
    ]
  },
  environment_water_monitoring: {
    moduleLabel: 'Water Monitoring',
    subject: 'Water monitoring {{status}}: {{reference}}',
    summary: 'A water monitoring result has been recorded for environmental review.',
    defaultActionLabel: 'Open water monitoring',
    defaultRoute: '/dashboard/environment/water',
    detailLabels: [
      { label: 'Reference', variable: 'reference' },
      { label: 'Status', variable: 'status' },
      { label: 'Sampling point', variable: 'location' },
      { label: 'Failed parameters', variable: 'findings' }
    ]
  },
  environment_air_quality: {
    moduleLabel: 'Air Quality',
    subject: 'Air quality {{status}}: {{reference}}',
    summary: 'An air quality monitoring result has been recorded for environmental review.',
    defaultActionLabel: 'Open air quality',
    defaultRoute: '/dashboard/environment/air',
    detailLabels: [
      { label: 'Reference', variable: 'reference' },
      { label: 'Status', variable: 'status' },
      { label: 'Location', variable: 'location' },
      { label: 'Exceedances', variable: 'findings' }
    ]
  },
  environment_waste_disposal: {
    moduleLabel: 'Waste Disposal',
    subject: 'Waste disposal update: {{reference}}',
    summary: 'A waste disposal record has been updated.',
    defaultActionLabel: 'Open waste disposal',
    defaultRoute: '/dashboard/environment/waste',
    detailLabels: [
      { label: 'Reference', variable: 'reference' },
      { label: 'Waste type', variable: 'title' },
      { label: 'Status', variable: 'status' },
      { label: 'Site / department', variable: 'location' }
    ]
  },
  health_medicals: {
    moduleLabel: 'Medicals',
    subject: 'Medical update: {{employee}}',
    summary: 'A health medical record needs attention.',
    defaultActionLabel: 'Open medicals',
    defaultRoute: '/dashboard/health/medical',
    detailLabels: [
      { label: 'Employee', variable: 'employee' },
      { label: 'Fitness status', variable: 'status' },
      { label: 'Expiry date', variable: 'dueDate' },
      { label: 'Notes', variable: 'findings' }
    ]
  },
  health_wellness_programme: {
    moduleLabel: 'Wellness Programme',
    subject: 'Wellness programme update: {{title}}',
    summary: 'A wellness programme update is available.',
    defaultActionLabel: 'Open wellness',
    defaultRoute: '/dashboard/health/wellness',
    detailLabels: [
      { label: 'Programme', variable: 'title' },
      { label: 'Status', variable: 'status' },
      { label: 'Owner', variable: 'owner' },
      { label: 'Date', variable: 'dueDate' }
    ]
  },
  hr_updates: {
    moduleLabel: 'HR Updates',
    subject: 'HR update: {{title}}',
    summary: 'An HR update requires attention.',
    defaultActionLabel: 'Open HR',
    defaultRoute: '/dashboard/hr',
    detailLabels: [
      { label: 'Update', variable: 'title' },
      { label: 'Employee', variable: 'employee' },
      { label: 'Status', variable: 'status' },
      { label: 'Due date', variable: 'dueDate' }
    ]
  },
  kpi_updates: {
    moduleLabel: 'KPI Updates',
    subject: 'KPI update: {{title}}',
    summary: 'A KPI item requires review or follow-up.',
    defaultActionLabel: 'Open KPIs',
    defaultRoute: '/dashboard/kpi/findings',
    detailLabels: [
      { label: 'KPI item', variable: 'title' },
      { label: 'Status', variable: 'status' },
      { label: 'Assigned manager', variable: 'owner' },
      { label: 'Due date', variable: 'dueDate' }
    ]
  },
  document_reviews: {
    moduleLabel: 'Document Reviews',
    subject: 'Document review due: {{title}}',
    summary: 'A document is due for review.',
    defaultActionLabel: 'Review document',
    defaultRoute: '/dashboard/management/document-reviews',
    detailLabels: [
      { label: 'Document', variable: 'title' },
      { label: 'Review status', variable: 'status' },
      { label: 'Owner', variable: 'owner' },
      { label: 'Review due', variable: 'dueDate' }
    ]
  },
  improvements: {
    moduleLabel: 'Improvements',
    subject: 'Improvement update: {{reference}}',
    summary: 'An improvement action has been updated.',
    defaultActionLabel: 'Open improvements',
    defaultRoute: '/dashboard/management/improvements',
    detailLabels: [
      { label: 'Reference', variable: 'reference' },
      { label: 'Status', variable: 'status' },
      { label: 'Risk level', variable: 'severity' },
      { label: 'Responsible person', variable: 'owner' }
    ]
  },
  approvals: {
    moduleLabel: 'Approvals',
    subject: 'Approval required: {{title}}',
    summary: 'An item is waiting for your approval.',
    defaultActionLabel: 'Review approval',
    defaultRoute: '/dashboard/management/approvals',
    detailLabels: [
      { label: 'Item', variable: 'title' },
      { label: 'Type', variable: 'itemType' },
      { label: 'Requested by', variable: 'requester' },
      { label: 'Status', variable: 'status' }
    ]
  },
  billing_pricing: {
    moduleLabel: 'Billing and Pricing',
    subject: 'Billing update: {{title}}',
    summary: 'A billing or pricing update is available for your organisation.',
    defaultActionLabel: 'Open billing',
    defaultRoute: '/dashboard/admin/billing-pricing',
    detailLabels: [
      { label: 'Update', variable: 'title' },
      { label: 'Plan', variable: 'plan' },
      { label: 'Amount', variable: 'amount' },
      { label: 'Due date', variable: 'dueDate' }
    ]
  },
  software_license_expiry: {
    moduleLabel: 'Software License Expiry',
    subject: 'Software license expiry: {{title}}',
    summary: 'A software license or subscription is approaching expiry.',
    defaultActionLabel: 'Open license',
    defaultRoute: '/dashboard/admin/license',
    detailLabels: [
      { label: 'License', variable: 'title' },
      { label: 'Status', variable: 'status' },
      { label: 'Expiry date', variable: 'dueDate' },
      { label: 'Days remaining', variable: 'daysRemaining' }
    ]
  }
};

export function getEmailTemplateDefinition(templateKey: EmailTemplateKey): EmailTemplateDefinition {
  const definition = TEMPLATE_DEFINITIONS[templateKey];
  if (!definition) throw new Error(`Unknown email template: ${templateKey}`);
  return definition;
}

export function escapeEmailHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function interpolate(template: string, variables: EmailTemplateVariables): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const value = variables[key];
    if (value === null || typeof value === 'undefined' || value === '') return 'Update';
    return String(value);
  });
}

function buildAbsoluteOrRelativeUrl(route: string, actionUrl?: string | null): string {
  const url = String(actionUrl ?? '').trim();
  return url || route;
}

export function renderEmailTemplate(input: EmailRenderInput): RenderedEmailTemplate {
  const definition = getEmailTemplateDefinition(input.templateKey);
  const variables = input.variables ?? {};
  const subject = interpolate(definition.subject, variables);
  const summary = interpolate(definition.summary, variables);
  const actionUrl = buildAbsoluteOrRelativeUrl(definition.defaultRoute, input.actionUrl);
  const actionLabel = String(input.actionLabel ?? definition.defaultActionLabel);

  const details = definition.detailLabels
    .map((detail) => {
      const raw = variables[detail.variable];
      const value = raw === null || typeof raw === 'undefined' || raw === '' ? null : String(raw);
      return value ? { label: detail.label, value } : null;
    })
    .filter((detail): detail is { label: string; value: string } => !!detail);

  const detailRows = details
    .map(
      (detail) => `
        <tr>
          <td style="padding:8px 0;color:#52606d;width:34%;font-size:14px;">${escapeEmailHtml(detail.label)}</td>
          <td style="padding:8px 0;color:#12212b;font-size:14px;font-weight:600;">${escapeEmailHtml(detail.value)}</td>
        </tr>`
    )
    .join('');

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;background:#f4f7f8;padding:24px;color:#12212b;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dde5e8;border-radius:8px;overflow:hidden;">
        <div style="padding:20px 24px;background:#0f766e;color:#ffffff;">
          <p style="margin:0 0 6px 0;font-size:12px;letter-spacing:.02em;text-transform:uppercase;">${escapeEmailHtml(definition.moduleLabel)}</p>
          <h1 style="margin:0;font-size:20px;line-height:1.3;">${escapeEmailHtml(subject)}</h1>
        </div>
        <div style="padding:24px;">
          <p style="margin:0 0 18px 0;line-height:1.55;color:#1f2933;">${escapeEmailHtml(summary)}</p>
          ${detailRows ? `<table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 22px 0;">${detailRows}</table>` : ''}
          <p style="margin:0 0 18px 0;">
            <a href="${escapeEmailHtml(actionUrl)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:700;">
              ${escapeEmailHtml(actionLabel)}
            </a>
          </p>
          <p style="margin:0;color:#52606d;font-size:12px;line-height:1.5;">
            If the button does not work, open this link: <a href="${escapeEmailHtml(actionUrl)}" style="color:#0f766e;">${escapeEmailHtml(actionUrl)}</a>
          </p>
        </div>
        <div style="padding:14px 24px;background:#f8fafb;border-top:1px solid #e5ecef;color:#667985;font-size:12px;">
          SafeCloud Africa notification. You are receiving this because you are linked to this organisation or workflow.
        </div>
      </div>
    </div>
  `;

  const text = [
    `${definition.moduleLabel}: ${subject}`,
    '',
    summary,
    '',
    ...details.map((detail) => `${detail.label}: ${detail.value}`),
    '',
    `${actionLabel}: ${actionUrl}`,
    '',
    'SafeCloud Africa notification.'
  ]
    .filter((line, index, arr) => line !== '' || arr[index - 1] !== '')
    .join('\n');

  return { subject, html, text };
}
