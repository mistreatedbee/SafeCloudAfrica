import { Resend } from 'resend';
import { logStructuredLine, recordOperationalEvent, sendAlertWebhook } from '../_observability.js';

const MODULE = 'api.email.shared';

export type EmailRequest = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  meta?: Record<string, unknown>;
};

export type EmailActor = {
  userId: string | null;
  organizationId: string | null;
};

const VERIFIED_DOMAIN_HELP =
  'Email delivery is not configured for the current sender domain. Ask an administrator to verify the sending domain in Resend, then try again.';

function asArray(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

function extractEmailAddress(from: string): string {
  const trimmed = from.trim();
  const match = trimmed.match(/<([^>]+)>/);
  return (match?.[1] ?? trimmed).trim();
}

function looksLikeEmailAddress(value: string): boolean {
  const s = value.trim();
  if (!s) return false;
  if (!s.includes('@')) return false;
  const parts = s.split('@');
  if (parts.length !== 2) return false;
  if (!parts[0] || !parts[1]) return false;
  if (!parts[1].includes('.')) return false;
  return true;
}

export function normalizeEmailProviderError(error: unknown): string {
  const detail = String(error ?? '').trim();
  const lowered = detail.toLowerCase();
  if (!detail) return 'Email delivery failed. Please try again.';

  const isDomainVerificationIssue =
    lowered.includes('domain is not verified') ||
    lowered.includes('verify your domain') ||
    lowered.includes('verified domain') ||
    lowered.includes('sender domain') ||
    lowered.includes('from address') ||
    lowered.includes('from field') ||
    lowered.includes('resend.dev') ||
    (lowered.includes('403') && lowered.includes('domain'));

  if (isDomainVerificationIssue) return VERIFIED_DOMAIN_HELP;

  return detail;
}

export function validateResendConfig(): { ok: true; apiKey: string; from: string } | { ok: false; error: string } {
  const apiKey = process.env.RESEND_API_KEY?.trim() ?? '';
  const from = process.env.EMAIL_FROM?.trim() ?? '';
  if (!apiKey) return { ok: false, error: 'Email provider not configured: missing RESEND_API_KEY.' };
  if (apiKey.length < 10) return { ok: false, error: 'Email provider not configured: RESEND_API_KEY looks invalid.' };
  if (!from) return { ok: false, error: 'Email provider not configured: missing EMAIL_FROM.' };
  const fromEmail = extractEmailAddress(from);
  if (!looksLikeEmailAddress(fromEmail)) {
    return { ok: false, error: 'Email provider not configured: EMAIL_FROM must be a valid email address.' };
  }
  return { ok: true, apiKey, from };
}

export function normalizeEmailPayload(body: EmailRequest): { ok: true; to: string[]; subject: string; html: string | null; text: string | null } | { ok: false; error: string } {
  const to = asArray((body.to ?? '') as string | string[])
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
  if (to.length === 0) return { ok: false, error: 'Invalid payload: missing recipients.' };

  const subject = String(body.subject ?? '').trim();
  if (!subject) return { ok: false, error: 'Invalid payload: missing subject.' };

  const html = body.html && body.html.trim().length ? body.html : null;
  const text = body.text && body.text.trim().length ? body.text : null;

  return { ok: true, to, subject, html, text };
}

export async function sendTransactionalEmail(input: {
  actor: EmailActor;
  body: EmailRequest;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const config = validateResendConfig();
  if (config.ok === false) {
    logStructuredLine({
      module: MODULE,
      level: 'error',
      message: config.error,
      user_id: input.actor.userId,
      organization_id: input.actor.organizationId
    });
    recordOperationalEvent({
      event_type: 'email.failed',
      status: 'failure',
      module: MODULE,
      message: config.error,
      user_id: input.actor.userId,
      organization_id: input.actor.organizationId
    });
    sendAlertWebhook({
      kind: 'email_send',
      module: MODULE,
      message: config.error,
      user_id: input.actor.userId,
      organization_id: input.actor.organizationId
    });
    return { ok: false, error: config.error, status: 500 };
  }

  const payload = normalizeEmailPayload(input.body);
  if (payload.ok === false) {
    logStructuredLine({
      module: MODULE,
      level: 'warn',
      message: payload.error,
      user_id: input.actor.userId,
      organization_id: input.actor.organizationId
    });
    return { ok: false, error: payload.error, status: 400 };
  }

  const resend = new Resend(config.apiKey);
  try {
    const emailPayload =
      payload.html ? { from: config.from, to: payload.to, subject: payload.subject, html: payload.html } :
      payload.text ? { from: config.from, to: payload.to, subject: payload.subject, text: payload.text } :
      { from: config.from, to: payload.to, subject: payload.subject, text: 'Hello' };

    const { error } = await resend.emails.send(emailPayload as any);
    if (error) {
      const msg = String((error as { message?: string }).message || error);
      const publicMsg = normalizeEmailProviderError(msg);
      logStructuredLine({
        module: MODULE,
        level: 'error',
        message: msg,
        user_id: input.actor.userId,
        organization_id: input.actor.organizationId,
        extra: { provider: 'resend' }
      });
      recordOperationalEvent({
        event_type: 'email.failed',
        status: 'failure',
        module: MODULE,
        message: msg,
        user_id: input.actor.userId,
        organization_id: input.actor.organizationId,
        details: { provider: 'resend' }
      });
      sendAlertWebhook({
        kind: 'email_send',
        module: MODULE,
        message: msg,
        user_id: input.actor.userId,
        organization_id: input.actor.organizationId
      });
      return { ok: false, error: publicMsg, status: 502 };
    }

    logStructuredLine({
      module: MODULE,
      level: 'info',
      message: 'Email sent',
      user_id: input.actor.userId,
      organization_id: input.actor.organizationId,
      extra: { toCount: payload.to.length, subject: payload.subject }
    });
    recordOperationalEvent({
      event_type: 'email.sent',
      status: 'success',
      module: MODULE,
      message: 'Email sent',
      user_id: input.actor.userId,
      organization_id: input.actor.organizationId,
      details: { toCount: payload.to.length }
    });
    return { ok: true };
  } catch (err: any) {
    const msg = String(err?.message || err);
    const publicMsg = normalizeEmailProviderError(msg);
    logStructuredLine({
      module: MODULE,
      level: 'error',
      message: msg,
      user_id: input.actor.userId,
      organization_id: input.actor.organizationId
    });
    recordOperationalEvent({
      event_type: 'email.failed',
      status: 'failure',
      module: MODULE,
      message: msg,
      user_id: input.actor.userId,
      organization_id: input.actor.organizationId
    });
    sendAlertWebhook({
      kind: 'email_send',
      module: MODULE,
      message: msg,
      user_id: input.actor.userId,
      organization_id: input.actor.organizationId
    });
    return { ok: false, error: publicMsg, status: 500 };
  }
}

