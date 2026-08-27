import { fetchWithInsforgeAuth } from '../insforge/authenticatedFetch';
import {
  type EmailTemplateKey,
  type EmailTemplateVariables,
  renderEmailTemplate
} from './emailTemplates';
import { resolveEmailVariablesUserNames } from './userDisplayNameService';
import type { UUID } from '../models/core';

export interface EmailTemplate {
  type: 'overdue_task' | 'incident_created' | 'approval_request' | 'document_review' | 'training_expiry' | EmailTemplateKey;
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
  meta?: Record<string, unknown>;
}

const legacyTemplateMap: Record<string, EmailTemplateKey> = {
  overdue_task: 'improvements',
  incident_created: 'incident_reporting',
  approval_request: 'approvals',
  document_review: 'document_reviews',
  training_expiry: 'hr_updates'
};

/**
 * Send email using the canonical Vercel API endpoint.
 */
export async function sendEmail(payload: EmailPayload): Promise<void> {
  const response = await fetchWithInsforgeAuth('/api/email/send', {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0'
    },
    body: JSON.stringify(payload)
  }, 'email:send');
  const data = await response.json().catch(() => null as any);
  if (response.ok && data?.ok !== false) return;
  const message = data?.error || `${response.status} ${response.statusText}`;
  if (response.status === 404) {
    throw new Error('EMAIL_ENDPOINT_NOT_FOUND: /api/email/send is not available.');
  }
  throw new Error(`Email delivery failed. ${message}`);
}

export async function sendTemplatedNotificationEmail(input: {
  to: string | string[];
  templateKey: EmailTemplateKey;
  variables?: EmailTemplateVariables;
  actionUrl?: string | null;
  actionLabel?: string | null;
  meta?: Record<string, unknown>;
  companyId?: UUID;
}): Promise<void> {
  const companyId = input.companyId ?? (input.meta?.companyId as UUID | undefined);
  const variables =
    companyId && input.variables
      ? await resolveEmailVariablesUserNames(companyId, input.variables)
      : input.variables;

  const rendered = renderEmailTemplate({
    templateKey: input.templateKey,
    variables,
    actionUrl: input.actionUrl,
    actionLabel: input.actionLabel
  });

  await sendEmail({
    to: input.to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    meta: {
      ...(input.meta ?? {}),
      templateKey: input.templateKey
    }
  });
}

/**
 * Send templated email
 */
export async function sendTemplatedEmail(
  to: string | string[],
  templateType: string,
  variables: Record<string, string>
): Promise<void> {
  const templateKey = legacyTemplateMap[templateType] ?? templateType;
  if (!templateKey) {
    throw new Error(`Unknown email template: ${templateType}`);
  }

  await sendTemplatedNotificationEmail({
    to,
    templateKey: templateKey as EmailTemplateKey,
    variables: {
      ...variables,
      title: variables.taskTitle ?? variables.incidentTitle ?? variables.itemTitle ?? variables.documentName ?? variables.trainingName,
      reference: variables.itemTitle ?? variables.documentName ?? variables.taskTitle,
      dueDate: variables.dueDate ?? variables.expiryDate,
      severity: variables.severity,
      category: variables.category,
      location: variables.location,
      itemType: variables.itemType,
      requester: variables.requesterName,
      status: variables.status
    },
    actionUrl: variables.link
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
  orgId?: string;
  inviteId?: string;
  supportEmail?: string;
  appUrl?: string;
}): Promise<void> {
  const appUrl = (input.appUrl ?? (import.meta as any)?.env?.VITE_APP_URL ?? window.location.origin).replace(/\/+$/, '');
  const acceptUrl = `${appUrl}/invite/accept?token=${encodeURIComponent(input.inviteToken)}`;
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

  await sendEmail({
    to: input.to,
    subject,
    html,
    text,
    meta: {
      orgId: input.orgId ?? null,
      inviteId: input.inviteId ?? null,
      role: input.role
    }
  });
}
