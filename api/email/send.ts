import { Resend } from 'resend';
import { resolveRequestActor } from '../_insforge.js';
import { logStructuredLine, recordOperationalEvent, sendAlertWebhook } from '../_observability.js';
import { applyNoStoreHeaders } from '../_response.js';

type EmailRequest = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  meta?: Record<string, unknown>;
};

const MODULE = 'api.email.send';

function asArray(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

export default async function handler(req: any, res: any) {
  applyNoStoreHeaders(res);
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const body = (req.body ?? {}) as EmailRequest;
  const actor = await resolveRequestActor(req, body as Record<string, unknown>);

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    const msg = 'Email provider not configured. Set RESEND_API_KEY and EMAIL_FROM.';
    logStructuredLine({
      module: MODULE,
      level: 'error',
      message: msg,
      user_id: actor.userId,
      organization_id: actor.organizationId
    });
    recordOperationalEvent({
      event_type: 'email.failed',
      status: 'failure',
      module: MODULE,
      message: msg,
      user_id: actor.userId,
      organization_id: actor.organizationId
    });
    sendAlertWebhook({
      kind: 'email_send',
      module: MODULE,
      message: msg,
      user_id: actor.userId,
      organization_id: actor.organizationId
    });
    return res.status(500).json({ ok: false, error: msg });
  }

  const resend = new Resend(apiKey);
  const to = asArray((body.to ?? '') as string | string[]).map((entry) => String(entry || '').trim()).filter(Boolean);
  const subject = String(body.subject ?? 'SafeCloud Africa Invite').trim() || 'SafeCloud Africa Invite';
  const html = body.html && body.html.trim().length ? body.html : null;
  const text = body.text && body.text.trim().length ? body.text : null;

  if (to.length === 0) {
    logStructuredLine({
      module: MODULE,
      level: 'warn',
      message: 'Invalid payload: missing recipients',
      user_id: actor.userId,
      organization_id: actor.organizationId
    });
    return res.status(400).json({ ok: false, error: 'Invalid payload' });
  }

  try {
    const emailPayload =
      html ? { from, to, subject, html } :
      text ? { from, to, subject, text } :
      { from, to, subject, text: 'Hello' };

    const { error } = await resend.emails.send(emailPayload as any);
    if (error) {
      const msg = String((error as { message?: string }).message || error);
      logStructuredLine({
        module: MODULE,
        level: 'error',
        message: msg,
        user_id: actor.userId,
        organization_id: actor.organizationId,
        extra: { provider: 'resend' }
      });
      recordOperationalEvent({
        event_type: 'email.failed',
        status: 'failure',
        module: MODULE,
        message: msg,
        user_id: actor.userId,
        organization_id: actor.organizationId,
        details: { provider: 'resend' }
      });
      sendAlertWebhook({
        kind: 'email_send',
        module: MODULE,
        message: msg,
        user_id: actor.userId,
        organization_id: actor.organizationId
      });
      return res.status(500).json({ ok: false, error: msg });
    }

    logStructuredLine({
      module: MODULE,
      level: 'info',
      message: 'Email sent',
      user_id: actor.userId,
      organization_id: actor.organizationId,
      extra: { toCount: to.length, subject }
    });
    recordOperationalEvent({
      event_type: 'email.sent',
      status: 'success',
      module: MODULE,
      message: 'Email sent',
      user_id: actor.userId,
      organization_id: actor.organizationId,
      details: { toCount: to.length }
    });
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    const msg = String(err?.message || err);
    logStructuredLine({
      module: MODULE,
      level: 'error',
      message: msg,
      user_id: actor.userId,
      organization_id: actor.organizationId
    });
    recordOperationalEvent({
      event_type: 'email.failed',
      status: 'failure',
      module: MODULE,
      message: msg,
      user_id: actor.userId,
      organization_id: actor.organizationId
    });
    sendAlertWebhook({
      kind: 'email_send',
      module: MODULE,
      message: msg,
      user_id: actor.userId,
      organization_id: actor.organizationId
    });
    return res.status(500).json({ ok: false, error: msg });
  }
}
