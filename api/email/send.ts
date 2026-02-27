import { Resend } from 'resend';

type EmailRequest = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  meta?: Record<string, unknown>;
};

function asArray(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return res.status(500).json({
      ok: false,
      error: 'Email provider not configured. Set RESEND_API_KEY and EMAIL_FROM.'
    });
  }
  const resend = new Resend(apiKey);

  const body = (req.body ?? {}) as EmailRequest;
  const to = asArray((body.to ?? '') as string | string[]).map((entry) => String(entry || '').trim()).filter(Boolean);
  const subject = String(body.subject ?? 'SafeCloud Africa Invite').trim() || 'SafeCloud Africa Invite';
  const html = body.html && body.html.trim().length ? body.html : null;
  const text = body.text && body.text.trim().length ? body.text : null;

  if (to.length === 0) {
    return res.status(400).json({ ok: false, error: 'Invalid payload' });
  }

  try {
    const emailPayload =
      html ? { from, to, subject, html } :
      text ? { from, to, subject, text } :
      { from, to, subject, text: 'Hello' };

    const { error } = await resend.emails.send(emailPayload as any);
    if (error) {
      console.error('EMAIL_SEND_ERROR', error);
      return res.status(500).json({ ok: false, error: String(error.message || error) });
    }

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error('EMAIL_SEND_ERROR', err);
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}
