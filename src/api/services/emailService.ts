import { insforge } from '../insforge/client';
import { ensureInsforgeSession } from '../insforge/ensureSession';

export interface EmailTemplate {
  type: 'overdue_task' | 'incident_created' | 'approval_request' | 'document_review' | 'training_expiry';
  subject: string;
  htmlBody: string;
}

export interface EmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  from?: string;
}

const emailTemplates: Record<string, EmailTemplate> = {
  overdue_task: {
    type: 'overdue_task',
    subject: 'Task Overdue: {{taskTitle}}',
    htmlBody: `
      <h2>Task Overdue</h2>
      <p>The following task is now overdue:</p>
      <p><strong>{{taskTitle}}</strong></p>
      <p>Due date: {{dueDate}}</p>
      <p><a href="{{link}}">View Task</a></p>
    `
  },
  incident_created: {
    type: 'incident_created',
    subject: 'New Incident: {{incidentTitle}}',
    htmlBody: `
      <h2>New Incident Reported</h2>
      <p><strong>{{incidentTitle}}</strong></p>
      <p>Severity: <strong>{{severity}}</strong></p>
      <p>Category: {{category}}</p>
      <p>Location: {{location}}</p>
      <p><a href="{{link}}">View Incident</a></p>
    `
  },
  approval_request: {
    type: 'approval_request',
    subject: 'Approval Required: {{itemType}}',
    htmlBody: `
      <h2>Approval Required</h2>
      <p>A {{itemType}} has been submitted for your approval:</p>
      <p><strong>{{itemTitle}}</strong></p>
      <p>Submitted by: {{requesterName}}</p>
      <p><a href="{{link}}">Review & Approve</a></p>
    `
  },
  document_review: {
    type: 'document_review',
    subject: 'Document Review Due: {{documentName}}',
    htmlBody: `
      <h2>Document Review Due</h2>
      <p>The following document is due for review:</p>
      <p><strong>{{documentName}}</strong></p>
      <p>Due date: {{dueDate}}</p>
      <p><a href="{{link}}">Review Document</a></p>
    `
  },
  training_expiry: {
    type: 'training_expiry',
    subject: 'Training Expiring Soon: {{trainingName}}',
    htmlBody: `
      <h2>Training Expiring Soon</h2>
      <p>The following training certification will expire soon:</p>
      <p><strong>{{trainingName}}</strong></p>
      <p>Expiry date: {{expiryDate}}</p>
      <p><a href="{{link}}">Renew Training</a></p>
    `
  }
};

/**
 * Send email using InsForge's edge function
 */
export async function sendEmail(payload: EmailPayload): Promise<void> {
  const session = await ensureInsforgeSession();

  const sdkResult = await insforge.functions.invoke('emailSend', { method: 'POST', body: payload });
  if (!sdkResult.error) {
    const data = sdkResult.data as any;
    if (!data || typeof data !== 'object' || data.ok !== false) return;
  }

  const configuredBaseUrl =
    ((import.meta as any)?.env?.VITE_INSFORGE_BASE_URL as string | undefined) ??
    'https://pas375jb.us-west.insforge.app';
  const insforgeBase = configuredBaseUrl.replace(/\/+$/, '');

  const endpoints = [
    `${insforgeBase}/api/functions/emailSend`,
    '/api/functions/emailSend'
  ];
  let lastError = sdkResult.error?.message || 'Email function invocation failed.';

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => null as any);
      if (response.ok && (!data || data.ok !== false)) return;
      lastError = data?.error || `${response.status} ${response.statusText}`;
    } catch (err: any) {
      lastError = err?.message || lastError;
    }
  }

  throw new Error(`Email delivery failed. ${lastError}`);
}

/**
 * Send templated email
 */
export async function sendTemplatedEmail(
  to: string | string[],
  templateType: string,
  variables: Record<string, string>
): Promise<void> {
  const template = emailTemplates[templateType as keyof typeof emailTemplates];
  if (!template) {
    throw new Error(`Unknown email template: ${templateType}`);
  }

  let html = template.htmlBody;
  let subject = template.subject;

  // Replace variables
  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    html = html.replace(regex, value);
    subject = subject.replace(regex, value);
  });

  await sendEmail({
    to,
    subject,
    html
  });
}

/**
 * Send overdue task notification
 */
export async function notifyOverdueTask(
  email: string,
  taskTitle: string,
  dueDate: string,
  link: string
): Promise<void> {
  await sendTemplatedEmail(email, 'overdue_task', {
    taskTitle,
    dueDate,
    link
  });
}

/**
 * Send incident notification
 */
export async function notifyIncidentCreated(
  emails: string[],
  incidentTitle: string,
  severity: string,
  category: string,
  location: string,
  link: string
): Promise<void> {
  await sendTemplatedEmail(emails, 'incident_created', {
    incidentTitle,
    severity,
    category,
    location,
    link
  });
}

/**
 * Send approval request notification
 */
export async function notifyApprovalRequest(
  email: string,
  itemType: string,
  itemTitle: string,
  requesterName: string,
  link: string
): Promise<void> {
  await sendTemplatedEmail(email, 'approval_request', {
    itemType,
    itemTitle,
    requesterName,
    link
  });
}

/**
 * Send document review notification
 */
export async function notifyDocumentReview(
  email: string,
  documentName: string,
  dueDate: string,
  link: string
): Promise<void> {
  await sendTemplatedEmail(email, 'document_review', {
    documentName,
    dueDate,
    link
  });
}

/**
 * Send training expiry notification
 */
export async function notifyTrainingExpiry(
  email: string,
  trainingName: string,
  expiryDate: string,
  link: string
): Promise<void> {
  await sendTemplatedEmail(email, 'training_expiry', {
    trainingName,
    expiryDate,
    link
  });
}

export async function sendOrganizationInviteEmail(input: {
  to: string;
  orgName: string;
  role: string;
  inviterName: string;
  inviterEmail: string;
  inviteToken: string;
  expiresAtIso: string;
  supportEmail?: string;
  appUrl?: string;
}): Promise<void> {
  const appUrl = (input.appUrl ?? (import.meta as any)?.env?.VITE_APP_URL ?? window.location.origin).replace(/\/+$/, '');
  const acceptUrl = `${appUrl}/accept-invite?token=${encodeURIComponent(input.inviteToken)}`;
  const expiryDate = new Date(input.expiresAtIso);
  const expiresText = Number.isNaN(expiryDate.getTime()) ? input.expiresAtIso : expiryDate.toLocaleDateString();
  const daysUntilExpiry = Math.max(1, Math.ceil((expiryDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
  const support = input.supportEmail ?? 'support@safecloudafrica.com';
  const subject = `You've been invited to join ${input.orgName} on SafeCloud Africa`;

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;background:#f4f7f8;padding:24px;color:#12212b;">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #dde5e8;border-radius:12px;overflow:hidden;">
        <div style="padding:20px 24px;background:#0f766e;color:#ffffff;">
          <h1 style="margin:0;font-size:20px;line-height:1.3;">SafeCloud Africa Invitation</h1>
        </div>
        <div style="padding:24px;">
          <p style="margin:0 0 12px 0;">Hello,</p>
          <p style="margin:0 0 14px 0;">
            <strong>${input.inviterName}</strong> (${input.inviterEmail}) invited you to join
            <strong>${input.orgName}</strong> on SafeCloud Africa as a <strong>${input.role}</strong>.
          </p>
          <p style="margin:0 0 22px 0;">
            <a href="${acceptUrl}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">
              Accept Invitation
            </a>
          </p>
          <p style="margin:0 0 10px 0;color:#405562;">This invite expires in ${daysUntilExpiry} day(s) (${expiresText}). If you didn't expect this, ignore this email.</p>
          <p style="margin:0;color:#405562;">Need help? Contact <a href="mailto:${support}">${support}</a>.</p>
        </div>
      </div>
    </div>
  `;

  const text = [
    'SafeCloud Africa Invitation',
    '',
    `${input.inviterName} (${input.inviterEmail}) invited you to join ${input.orgName} on SafeCloud Africa as a ${input.role}.`,
    '',
    `Accept invitation: ${acceptUrl}`,
    `This invite expires in ${daysUntilExpiry} day(s) (${expiresText}). If you didn't expect this, ignore this email.`,
    `Support: ${support}`
  ].join('\n');

  await sendEmail({ to: input.to, subject, html, text });
}
