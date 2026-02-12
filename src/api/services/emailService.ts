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
  await ensureInsforgeSession();

  const { data, error } = await insforge.functions.invoke('emailSend', {
    body: payload
  });

  if (error) {
    throw error;
  }

  if (!data || (data as any).ok === false) {
    throw new Error(`Failed to send email: ${(data as any)?.error || (data as any)?.message || 'Unknown error'}`);
  }
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